"""rules_v1 - hand-written, fair (observation-only) policy for every phase of a run.

No forward model, no hidden state: it reads the fair observation plus *public* card facts
(slay2_sim.knowledge). It is the "simple heuristic" baseline every learned/search method must beat.
"""

from __future__ import annotations

import re
from collections import defaultdict

from ..knowledge import card_info, static_rating
from . import register
from .base import Policy

# --------------------------------------------------------------------------- helpers


def _by(actions: list[dict], kind: str) -> list[dict]:
    return [a for a in actions if a["action"] == kind]


def _first(actions: list[dict], kind: str) -> int | None:
    for a in actions:
        if a["action"] == kind:
            return a["idx"]
    return None


def _hp_frac(run: dict) -> float:
    return run["hp"] / max(run["max_hp"], 1)


def deck_ids(run: dict) -> list[tuple[str, bool]]:
    out: list[tuple[str, bool]] = []
    for cid, up, n in run["deck"]:
        out.extend([(cid, up)] * n)
    return out


# --------------------------------------------------------------------------- map

NODE_VALUE = {"MONSTER": 1.0, "UNKNOWN": 0.8, "TREASURE": 1.8, "BOSS": 0.0, "ANCIENT": 0.0}


def node_value(kind: str, h: float, gold: int, floor: int) -> float:
    if kind == "ELITE":
        return 2.0 if h >= 0.8 and floor >= 4 else (0.2 if h >= 0.65 else -2.5)
    if kind == "REST_SITE":
        return 1.0 + 3.0 * (1.0 - h)
    if kind == "SHOP":
        return 0.3 + (1.2 if gold >= 150 else 0.5 if gold >= 75 else 0.0)
    if kind == "MONSTER":
        return 1.0 - 0.5 * (1.0 - h)
    return NODE_VALUE.get(kind, 0.5)


def plan_map(obs: dict, actions: list[dict]) -> int:
    mp, run = obs["map"], obs["run"]
    h, gold, floor = _hp_frac(run), run["gold"], run["total_floor"]
    kinds = {(c, r): t for c, r, t in mp["nodes"]}
    kids: dict[tuple, list] = defaultdict(list)
    for sc, sr, dc, dr in mp["edges"]:
        kids[(sc, sr)].append((dc, dr))
    memo: dict[tuple, float] = {}

    def best(n: tuple) -> float:
        if n in memo:
            return memo[n]
        v = node_value(kinds.get(n, "MONSTER"), h, gold, floor)
        nxt = kids.get(n, [])
        memo[n] = v + (max(best(c) for c in nxt) if nxt else 0.0)
        return memo[n]

    moves = _by(actions, "move")
    scored = [(best(tuple(a["coord"])), -a["coord"][0], a["idx"]) for a in moves]
    return max(scored)[2]


# --------------------------------------------------------------------------- events

_NUM = r"(\d+(?:\.\d+)?)"


def score_event_option(label: str, desc: str, run: dict) -> float:
    d = (desc or "").lower()
    lab = (label or "").lower()
    h = _hp_frac(run)
    hp, gold = run["hp"], run["gold"]
    s = 0.0
    for m in re.finditer(r"take " + _NUM + r" damage", d):
        dmg = float(m.group(1))
        s -= dmg * (1.0 if hp - dmg > 0.4 * run["max_hp"] else 3.0)
        if dmg >= hp - 3:
            s -= 100
    for m in re.finditer(r"lose " + _NUM + r" max hp", d):
        s -= float(m.group(1)) * 2.5
    for m in re.finditer(r"\+" + _NUM + r" max hp|gain " + _NUM + r" max hp", d):
        s += float(m.group(1) or m.group(2)) * 2.0
    for m in re.finditer(r"heal " + _NUM + r" hp", d):
        s += min(float(m.group(1)), run["max_hp"] - hp) * 1.0
    for m in re.finditer(r"gain " + _NUM + r" gold", d):
        s += float(m.group(1)) / 12.0
    for m in re.finditer(r"lose " + _NUM + r"g\b|pay gold \((\d+)g\)|\((\d+)g\)", d + " " + lab):
        cost = float(next(g for g in m.groups() if g))
        if cost > gold:
            s -= 100
        s -= cost / 12.0
    if "relic" in d and "curse" not in d:
        s += 12
    elif "relic" in d:
        s += 4
    if "curse" in d:
        s -= 9
    if "upgrade" in d:
        s += 7
    if re.search(r"remove \d* ?cards?|remove 1 card|remove 2 cards", d):
        s += 8
    if "transform" in d:
        s += 3
    if "potion" in d:
        s += 4
    if "enchant" in d:
        s += 4
    if "colorless card" in d or "character card" in d or "pick 1 of" in d or "pick 2 of" in d:
        s += 5
    if "lose a random card" in d:
        s -= 6
    if "fight" in d and h < 0.6:
        s -= 8
    if lab in ("leave", "give up"):
        s += 0.1
    return s


# --------------------------------------------------------------------------- choose-card contexts

_WORST_FIRST = ("remove", "discard", "exhaust", "transform", "sacrifice", "lose")
_BEST_FIRST = ("upgrade", "duplicate", "copy", "enchant", "add", "play", "retain", "cost", "return")


def card_badness(cid: str, up: bool, deck: list[tuple[str, bool]]) -> float:
    info = card_info(cid, up)
    r = static_rating(info)
    if cid.startswith("STRIKE"):
        r -= 0.2
    if cid.startswith("DEFEND") and sum(1 for c, _ in deck if c.startswith("DEFEND")) >= 3:
        r -= 0.1
    return -r  # higher = worse card


def choose_card(actions: list[dict], deck: list[tuple[str, bool]], ctx: str) -> int:
    cands = [a for a in actions if a["action"] == "choose" and not a.get("selected")]
    confirm = _first(actions, "confirm_choice")
    if confirm is not None and (not cands or any(a.get("selected") for a in actions if a["action"] == "choose")):
        return confirm
    if not cands:
        return confirm if confirm is not None else actions[0]["idx"]
    want_worst = any(k in ctx for k in _WORST_FIRST)

    def key(a):
        cid = a.get("card_id", "")
        up = bool(a.get("upgraded", False))
        if want_worst:
            return card_badness(cid, up, deck)
        gain = static_rating(card_info(cid, True)) - static_rating(card_info(cid, False)) if not up else -9
        return gain + 0.05 * static_rating(card_info(cid, up))

    return max(cands, key=key)["idx"]


# --------------------------------------------------------------------------- combat

def _enemy_dmg(e: dict, pl_powers: dict) -> int:
    total = 0.0
    for it in e["intents"]:
        if it["type"] in ("ATTACK", "MULTI_ATTACK"):
            per = it["damage"] + e["powers"].get("STRENGTH", 0)
            if e["powers"].get("WEAK", 0) > 0:
                per *= 0.75
            if pl_powers.get("VULNERABLE", 0) > 0:
                per *= 1.5
            total += max(0, int(per)) * max(1, it["hits"])
    return int(total)


def combat_action(obs: dict, actions: list[dict], deck: list[tuple[str, bool]], ctx_prompt: str = "") -> int:
    c = obs["combat"]
    pl = c["player"]
    enemies = c["enemies"]
    alive = [e for e in enemies if e["alive"]]
    incoming = sum(_enemy_dmg(e, pl["powers"]) for e in alive)
    block_needed = max(0, incoming - pl["block"])
    strength = pl["powers"].get("STRENGTH", 0)
    dex = pl["powers"].get("DEXTERITY", 0)
    weak = pl["powers"].get("WEAK", 0) > 0
    frail = pl["powers"].get("FRAIL", 0) > 0
    danger = pl["hp"] - block_needed < 0.3 * pl["max_hp"]

    # pending card choice inside combat (discard / exhaust / upgrade ...)
    if any(a["action"] in ("choose", "confirm_choice") for a in actions):
        return choose_card(actions, deck, ctx_prompt)

    # emergency potion
    if pl["hp"] - block_needed <= max(6, 0.15 * pl["max_hp"]):
        pots = _by(actions, "use_potion")
        if pots:
            return pots[0]["idx"]

    best_idx, best_score = None, 0.0
    hand = {h["i"]: h for h in c["hand"]}
    for a in _by(actions, "play_card"):
        card = hand.get(a["hand_index"])
        if card is None:
            continue
        info = card_info(card["id"], card["upgraded"])
        cost = max(card["cost"], 0)
        s = 0.0
        t = info["type"]
        dmg = card["damage"]
        if dmg > 0:
            per = dmg + strength
            if weak:
                per *= 0.75
            tgt = a.get("target_index")
            targets = [enemies[tgt]] if tgt is not None and tgt < len(enemies) else alive
            for e in targets:
                eff = per * (1.5 if e["powers"].get("VULNERABLE", 0) > 0 else 1.0)
                pool = e["hp"] + e["block"]
                s += min(eff, pool) * 0.5
                if eff >= pool:
                    s += 5.0 + 0.3 * _enemy_dmg(e, pl["powers"])
        blk = card["block"] + info["vars"].get("block", 0)
        if blk > 0:
            b = blk + dex
            if frail:
                b *= 0.75
            useful = min(b, block_needed)
            s += useful * (1.4 if danger else 0.9) + (b - useful) * 0.05
        v = info["vars"]
        s += v.get("cards", 0) * 1.4 + v.get("energy", 0) * 2.0
        s += v.get("strength", 0) * (3.0 if len(alive) and sum(e["hp"] for e in alive) > 25 else 1.0)
        s += v.get("dexterity", 0) * 2.0
        s += v.get("vulnerable", 0) * 1.5 + v.get("weak", 0) * (1.5 if incoming > 6 else 0.5)
        if t == "POWER":
            s += 1.5
        s -= v.get("hp_loss", 0) * 0.8
        if s <= 0.2:
            continue
        s = s / max(cost, 0.5)
        if s > best_score:
            best_idx, best_score = a["idx"], s
    if best_idx is not None:
        return best_idx
    end = _first(actions, "end_turn")
    return end if end is not None else actions[0]["idx"]


# --------------------------------------------------------------------------- policy


@register
class RulesV1(Policy):
    name = "rules_v1"
    version = "1"

    def __init__(self, **params):
        super().__init__(**params)
        from ..knowledge import warm

        warm()  # fill the public-knowledge cache before any run touches the simulator's global counters

    def reset(self, rng_seed: int) -> None:
        super().reset(rng_seed)
        self.ctx = ""      # what the pending card-selection is for
        self.last_phase = ""

    # ---- non-combat sub-policies
    def _card_reward(self, obs, actions) -> int:
        run = obs["run"]
        picks = _by(actions, "pick_card")
        deck = deck_ids(run)
        if picks:
            size = len(deck)
            thr = 3.2 + 0.09 * max(size - 10, 0)
            counts = defaultdict(int)
            for cid, _ in deck:
                counts[cid] += 1
            best, best_r = None, -99.0
            for a in picks:
                r = static_rating(card_info(a["card_id"], bool(a.get("upgraded"))))
                r -= 1.2 * max(counts[a["card_id"]] - 1, 0)
                if r > best_r:
                    best, best_r = a, r
            if best is not None and best_r >= thr and size < 32:
                return best["idx"]
            skip = _first(actions, "skip")
            if skip is not None:
                return skip
        for kind in ("pick_relic_reward", "pick_potion"):
            if kind == "pick_potion" and len(obs["run"]["potions"]) >= obs["run"]["max_potion_slots"]:
                continue
            i = _first(actions, kind)
            if i is not None:
                return i
        for kind in ("skip_potion", "skip_relic", "skip", "confirm_choice"):
            i = _first(actions, kind)
            if i is not None:
                return i
        return actions[0]["idx"]

    def _shop(self, obs, actions) -> int:
        run = obs["run"]
        gold = run["gold"]
        deck = deck_ids(run)
        rem = _by(actions, "remove_card")
        if rem and rem[0]["price"] <= gold and any(c.startswith(("STRIKE", "DEFEND")) or static_rating(card_info(c, u)) < 1 for c, u in deck):
            self.ctx = "remove"
            return rem[0]["idx"]
        relics = [a for a in _by(actions, "buy_relic") if a["price"] <= gold]
        if relics:
            return max(relics, key=lambda a: -a["price"])["idx"] if gold - min(a["price"] for a in relics) >= 0 else relics[0]["idx"]
        cards = [a for a in _by(actions, "buy_card") if a["price"] <= gold]
        if cards and len(deck) < 30:
            thr = 3.6 + 0.09 * max(len(deck) - 10, 0)
            scored = [(static_rating(card_info(a["card_id"], bool(a.get("upgraded")))) - a["price"] / 90.0, a) for a in cards]
            sc, a = max(scored, key=lambda t: t[0])
            if static_rating(card_info(a["card_id"], bool(a.get("upgraded")))) >= thr:
                return a["idx"]
        pots = [a for a in _by(actions, "buy_potion") if a["price"] <= gold - 40]
        if pots and len(run["potions"]) < run["max_potion_slots"]:
            return pots[0]["idx"]
        leave = _first(actions, "leave_shop")
        return leave if leave is not None else actions[0]["idx"]

    def _rest(self, obs, actions) -> int:
        run = obs["run"]
        h = _hp_frac(run)
        opts = {a["option_id"]: a for a in _by(actions, "rest_option") if a.get("enabled", True)}
        boss_soon = obs["map"] is not None and obs["map"]["visited"] and obs["map"]["visited"][-1][1] >= obs["map"]["rows"] - 3
        want_heal = h < 0.7 or (boss_soon and h < 0.9)
        if want_heal and "HEAL" in opts:
            return opts["HEAL"]["idx"]
        if "SMITH" in opts:
            self.ctx = "upgrade"
            return opts["SMITH"]["idx"]
        if "HEAL" in opts:
            return opts["HEAL"]["idx"]
        return next(iter(opts.values()))["idx"] if opts else actions[0]["idx"]

    def _event(self, obs, actions) -> int:
        run = obs["run"]
        evs = [a for a in _by(actions, "event_choice") if a.get("enabled", True)]
        if not evs:
            return actions[0]["idx"]
        opts = {a["option_id"] for a in evs}
        if {"positive_1", "positive_2", "cursed"} & opts:  # Neow / Ancient style boon screens
            positives = [a for a in evs if a["option_id"].startswith("positive")]
            return (positives or evs)[0]["idx"]
        best = max(evs, key=lambda a: score_event_option(a.get("label", ""), a.get("description", ""), run))
        d = (best.get("description") or "").lower()
        self.ctx = "remove" if "remove" in d else "upgrade" if "upgrade" in d else "transform" if "transform" in d else "add" if "pick" in d else "enchant" if "enchant" in d else ""
        return best["idx"]

    # ---- main entry
    def act(self, obs, actions, fm=None):
        actions = obs["actions"]  # sanitised legal actions (same order as the raw list) carrying "idx"
        phase = obs["phase"]
        run = obs["run"]
        deck = deck_ids(run)
        if phase != "COMBAT" and any(a["action"] in ("choose", "confirm_choice") for a in actions):
            for a in actions:
                if a["action"] == "confirm_choice" and a.get("prompt"):
                    p = a["prompt"].lower()
                    self.ctx = next((k for k in _WORST_FIRST + _BEST_FIRST if k in p), self.ctx)
            return choose_card(actions, deck, self.ctx)
        if phase == "COMBAT":
            return combat_action(obs, actions, deck, self.ctx)
        if phase == "MAP_CHOICE":
            return plan_map(obs, actions)
        if phase == "CARD_REWARD":
            return self._card_reward(obs, actions)
        if phase == "SHOP":
            return self._shop(obs, actions)
        if phase == "REST_SITE":
            return self._rest(obs, actions)
        if phase == "EVENT":
            return self._event(obs, actions)
        if phase == "BOSS_RELIC":
            i = _first(actions, "pick_relic")
            return i if i is not None else actions[0]["idx"]
        if phase == "TREASURE":
            i = _first(actions, "collect")
            return i if i is not None else actions[0]["idx"]
        return actions[0]["idx"]
