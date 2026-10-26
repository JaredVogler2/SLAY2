"""Fixed-shape encoding of the *fair* combat observation and of the legal-action mask.

Input is exactly the dict returned by ``slay2_sim.observation.observe`` (already allow-listed: draw pile as a multiset,
no RNG, no future). ``encode`` is a pure function of that dict, so the neural policy cannot see anything the
observation adapter does not expose (tested in tests/test_rl_features.py with hidden-state perturbations).

Action space (fixed, masked by the legal actions of the current decision):

    PLAY(hand slot s, target t)    id = s * (MAX_ENEMY + 1) + t        t == MAX_ENEMY means "no target"
    POTION(slot p, target t)       id = POTION_BASE + p * (MAX_ENEMY + 1) + t
    END_TURN                       id = END
    CHOOSE(index i)                id = CHOOSE_BASE + i                (pending card selection)
    CONFIRM                        id = CONFIRM
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np

from . import vocab

MAX_HAND = 10
MAX_ENEMY = 7
MAX_POWERS = 10
MAX_PILE = 24
MAX_RELICS = 16
MAX_POTIONS = 5
MAX_CHOICES = 12

N_TARGET_SLOTS = MAX_ENEMY + 1
PLAY_BASE = 0
POTION_BASE = MAX_HAND * N_TARGET_SLOTS
END = POTION_BASE + MAX_POTIONS * N_TARGET_SLOTS
CHOOSE_BASE = END + 1
CONFIRM = CHOOSE_BASE + MAX_CHOICES
N_ACTIONS = CONFIRM + 1

CARD_TYPES = ("ATTACK", "SKILL", "POWER", "STATUS", "CURSE", "QUEST")
TARGET_TYPES = ("NONE", "SELF", "ANY_ENEMY", "ALL_ENEMIES", "RANDOM_ENEMY", "ANY_ALLY", "ALL_ALLIES")
KEYWORDS = ("eternal", "ethereal", "exhaust", "retain", "unplayable")
INTENTS = (
    "ATTACK", "MULTI_ATTACK", "DEFEND", "BUFF", "DEBUFF", "DEBUFF_STRONG", "SLEEP", "SUMMON", "ESCAPE", "UNKNOWN",
    "STATUS_CARD", "STUN", "HEAL", "DEATH_BLOW", "CARD_DEBUFF",
)
PILES = ("hand", "draw", "discard", "exhaust", "deck")

F_HAND = 5 + len(CARD_TYPES) + len(TARGET_TYPES) + 2 + len(KEYWORDS)   # 25
F_ENEMY = 5 + len(INTENTS) + 3                                         # 23
F_PLAYER = 18
F_POTION = 4
F_CHOICE = 3 + len(PILES) + 1                                          # 9

_CT = {n: i for i, n in enumerate(CARD_TYPES)}
_TT = {n: i for i, n in enumerate(TARGET_TYPES)}
_KW = {n: i for i, n in enumerate(KEYWORDS)}
_IN = {n: i for i, n in enumerate(INTENTS)}
_PI = {n: i for i, n in enumerate(PILES)}


def layout() -> dict[str, tuple[tuple[int, ...], Any]]:
    """name -> (shape, dtype) of every array ``encode`` returns (also the rollout-buffer layout)."""
    i32, f32, b = np.int32, np.float32, np.bool_
    return {
        "hand_id": ((MAX_HAND,), i32), "hand_f": ((MAX_HAND, F_HAND), f32), "hand_m": ((MAX_HAND,), b),
        "enemy_id": ((MAX_ENEMY,), i32), "enemy_f": ((MAX_ENEMY, F_ENEMY), f32), "enemy_m": ((MAX_ENEMY,), b),
        "enemy_pw_id": ((MAX_ENEMY, MAX_POWERS), i32), "enemy_pw_amt": ((MAX_ENEMY, MAX_POWERS), f32),
        "player_f": ((F_PLAYER,), f32),
        "player_pw_id": ((MAX_POWERS,), i32), "player_pw_amt": ((MAX_POWERS,), f32),
        "pile_id": ((3, MAX_PILE), i32), "pile_cnt": ((3, MAX_PILE), f32), "pile_up": ((3, MAX_PILE), f32),
        "relic_id": ((MAX_RELICS,), i32),
        "potion_id": ((MAX_POTIONS,), i32), "potion_f": ((MAX_POTIONS, F_POTION), f32), "potion_m": ((MAX_POTIONS,), b),
        "choice_id": ((MAX_CHOICES,), i32), "choice_f": ((MAX_CHOICES, F_CHOICE), f32), "choice_m": ((MAX_CHOICES,), b),
        "prompt_id": ((), i32),
        "mask": ((N_ACTIONS,), b),
    }


def _signed_log(x: float) -> float:
    return math.copysign(math.log1p(abs(x)), x) / 3.0


def _powers(powers: dict[str, int], ids: np.ndarray, amts: np.ndarray) -> None:
    for j, (name, amount) in enumerate(sorted(powers.items())[:MAX_POWERS]):
        ids[j] = vocab.power_index(name)
        amts[j] = _signed_log(amount)


def action_id(a: dict) -> int | None:
    """Fixed-space id of a legal-action dict, or None when it does not fit the layout (it is then simply unavailable)."""
    kind = a["action"]
    if kind == "end_turn":
        return END
    if kind == "confirm_choice":
        return CONFIRM
    if kind == "choose":
        i = a.get("index")
        return CHOOSE_BASE + i if isinstance(i, int) and 0 <= i < MAX_CHOICES else None
    if kind in ("play_card", "use_potion"):
        slot = a.get("hand_index") if kind == "play_card" else a.get("slot_index")
        limit = MAX_HAND if kind == "play_card" else MAX_POTIONS
        base = PLAY_BASE if kind == "play_card" else POTION_BASE
        t = a.get("target_index")
        if t is None:
            t = MAX_ENEMY  # the "no target" column
        elif not (isinstance(t, int) and 0 <= t < MAX_ENEMY):
            return None  # a real enemy beyond the layout must not alias the "no target" column
        if not (isinstance(slot, int) and 0 <= slot < limit):
            return None
        return base + slot * N_TARGET_SLOTS + t
    return None


def action_table(actions: list[dict]) -> dict[int, int]:
    """Fixed-space id -> index into ``actions`` (the first action wins on a collision)."""
    table: dict[int, int] = {}
    for i, a in enumerate(actions):
        aid = action_id(a)
        if aid is not None and aid not in table:
            table[aid] = i
    return table


def empty() -> dict[str, np.ndarray]:
    return {k: np.zeros(shape, dtype=dt) for k, (shape, dt) in layout().items()}


def encode(obs: dict) -> dict[str, np.ndarray]:
    """Encode a COMBAT-phase observation. Pure and deterministic."""
    out = empty()
    c = obs["combat"]
    run = obs["run"]
    pl = c["player"]
    acts = obs["actions"]

    # ---- legal-action bookkeeping the network may use (legality is part of what a player sees)
    playable_slots = {a.get("hand_index") for a in acts if a["action"] == "play_card"}
    potion_slots: dict[int, list] = {}
    for a in acts:
        if a["action"] == "use_potion":
            potion_slots.setdefault(a.get("slot_index"), []).append(a.get("target_index"))
    for aid in action_table(acts):
        out["mask"][aid] = True

    # ---- hand
    for card in c["hand"][:MAX_HAND]:
        s = card["i"]
        if s >= MAX_HAND:
            continue
        out["hand_id"][s] = vocab.card_index(card["id"])
        f = out["hand_f"][s]
        f[0] = 1.0
        f[1] = 0.0 if card["x"] else card["cost"] / 3.0
        f[2] = 1.0 if card["x"] else 0.0
        f[3] = 1.0 if card["upgraded"] else 0.0
        f[4] = 1.0 if s in playable_slots else 0.0
        o = 5
        f[o + _CT.get(card["type"], 1)] = 1.0
        o += len(CARD_TYPES)
        f[o + _TT.get(card["target"], 0)] = 1.0
        o += len(TARGET_TYPES)
        f[o] = card["damage"] / 30.0
        f[o + 1] = card["block"] / 30.0
        o += 2
        for kw in card["keywords"]:
            j = _KW.get(kw)
            if j is not None:
                f[o + j] = 1.0
        out["hand_m"][s] = True

    # ---- enemies
    incoming = 0.0
    alive = 0
    enemy_hp = 0
    for e in c["enemies"][:MAX_ENEMY]:
        i = e["i"]
        if i >= MAX_ENEMY:
            continue
        out["enemy_id"][i] = vocab.monster_index(e["id"])
        f = out["enemy_f"][i]
        f[0] = 1.0 if e["alive"] else 0.0
        f[1] = e["hp"] / 100.0
        f[2] = e["max_hp"] / 100.0
        f[3] = e["hp"] / max(e["max_hp"], 1)
        f[4] = e["block"] / 50.0
        attack = hits = n_att = 0
        for it in e["intents"]:
            j = _IN.get(it["type"], _IN["UNKNOWN"])
            f[5 + j] += 1.0
            if it["type"] in ("ATTACK", "MULTI_ATTACK"):
                attack += it["damage"] * max(1, it["hits"])
                hits += max(1, it["hits"])
                n_att += 1
        o = 5 + len(INTENTS)
        f[o] = attack / 50.0
        f[o + 1] = hits / 10.0
        f[o + 2] = float(n_att)
        _powers(e["powers"], out["enemy_pw_id"][i], out["enemy_pw_amt"][i])
        out["enemy_m"][i] = True
        if e["alive"]:
            alive += 1
            enemy_hp += e["hp"]
            incoming += attack

    # ---- piles (multisets) and relics
    for p, key in enumerate(("draw_pile", "discard_pile", "exhaust_pile")):
        for j, (cid, up, n) in enumerate(c[key][:MAX_PILE]):
            out["pile_id"][p, j] = vocab.card_index(cid)
            out["pile_cnt"][p, j] = float(n)
            out["pile_up"][p, j] = 1.0 if up else 0.0
    for j, name in enumerate(run["relics"][:MAX_RELICS]):
        out["relic_id"][j] = vocab.relic_index(name)

    # ---- potions
    for j, pid in enumerate(run["potions"][:MAX_POTIONS]):
        out["potion_id"][j] = vocab.potion_index(pid)
        f = out["potion_f"][j]
        f[0] = 1.0
        usable = j in potion_slots
        f[1] = 1.0 if usable else 0.0
        targets = [t for t in potion_slots.get(j, []) if t is not None]
        f[2] = 1.0 if targets else 0.0
        f[3] = len(targets) / float(MAX_ENEMY)
        out["potion_m"][j] = True

    # ---- pending card selection
    choose = [a for a in acts if a["action"] == "choose"]
    confirm = next((a for a in acts if a["action"] == "confirm_choice"), None)
    for a in choose:
        i = a.get("index")
        if not (isinstance(i, int) and 0 <= i < MAX_CHOICES):
            continue
        out["choice_id"][i] = vocab.card_index(a.get("card_id") or "")
        f = out["choice_f"][i]
        f[0] = 1.0
        f[1] = (a.get("cost") or 0) / 3.0
        f[2] = 1.0 if a.get("selected") else 0.0
        f[3 + _PI.get(str(a.get("source_pile")), len(PILES) - 1)] = 1.0
        out["choice_m"][i] = True
    prompt = next((a.get("prompt") for a in choose + ([confirm] if confirm else []) if a.get("prompt")), None)
    out["prompt_id"] = np.int32(vocab.prompt_index(prompt) if prompt else 0)

    # ---- player token
    f = out["player_f"]
    f[0] = pl["hp"] / 100.0
    f[1] = pl["max_hp"] / 100.0
    f[2] = pl["hp"] / max(pl["max_hp"], 1)
    f[3] = pl["block"] / 50.0
    f[4] = c["energy"] / 5.0
    f[5] = c["max_energy"] / 5.0
    f[6] = c["stars"] / 5.0
    f[7] = c["turn"] / 20.0
    f[8] = len(c["hand"]) / 10.0
    f[9] = sum(n for *_, n in c["draw_pile"]) / 40.0
    f[10] = sum(n for *_, n in c["discard_pile"]) / 40.0
    f[11] = sum(n for *_, n in c["exhaust_pile"]) / 40.0
    f[12] = len(run["potions"]) / 5.0
    f[13] = alive / float(MAX_ENEMY)
    f[14] = enemy_hp / 200.0
    f[15] = incoming / 50.0
    f[16] = 1.0 if choose else 0.0
    f[17] = (confirm.get("selected_count") or 0) / 5.0 if confirm else 0.0
    _powers(pl["powers"], out["player_pw_id"], out["player_pw_amt"])
    return out


def stack(items: list[dict[str, np.ndarray]]) -> dict[str, np.ndarray]:
    """Batch a list of encoded observations along a new leading axis."""
    return {k: np.stack([it[k] for it in items]) for k in items[0]}
