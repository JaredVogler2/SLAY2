"""search_v1 - determinized turn search for combat; rules_v1 for every other decision.

Per combat turn: build ONE fair determinization of the hidden state (draw-pile order and every RNG stream
replaced by a sample that depends only on the visible state and the policy's private RNG), then run a
node-budgeted DFS over card/potion plays using the *simulator itself* as the forward model (so it understands
every card), scoring the state reached after the enemy turn. The best plan is cached and followed while the
real draws keep matching it; otherwise it re-plans. The search never sees the true future: see
tests/test_clone_and_fairness.py and docs/INFORMATION-FAIRNESS.md.
"""

from __future__ import annotations

from ..clone import clone_manager
from ..knowledge import card_info, static_rating
from . import register
from .rules import RulesV1, _first, choose_card, deck_ids

WIN_BONUS = 300.0
LOSS = -1000.0
SCALING_POWERS = {"STRENGTH": 4.0, "DEXTERITY": 3.0, "FOCUS": 3.0, "ARTIFACT": 1.0, "THORNS": 1.0, "BARRICADE": 6.0, "METALLICIZE": 4.0}
BAD_POWERS = {"VULNERABLE": 1.5, "WEAK": 1.0, "FRAIL": 1.0, "POISON": 0.6, "CONSTRICT": 1.0}


def _amount(creature, name: str) -> int:
    from sts2_env.core.enums import PowerId

    try:
        return int(creature.get_power_amount(PowerId[name]))
    except Exception:  # noqa: BLE001 - power unknown to this build
        return 0


def _incoming(combat) -> int:
    """Damage the visible intents will deal to the player next enemy turn (before block)."""
    p = combat.player
    vul = _amount(p, "VULNERABLE") > 0
    total = 0.0
    for e in combat.enemies:
        if not e.is_alive:
            continue
        ai = combat.enemy_ais.get(e.combat_id)
        if ai is None:
            continue
        for it in ai.current_move.intents:
            if it.is_attack:
                per = it.damage + _amount(e, "STRENGTH")
                if _amount(e, "WEAK") > 0:
                    per *= 0.75
                if vul:
                    per *= 1.5
                total += max(0, int(per)) * max(1, it.hits)
    return int(total)


def evaluate(mgr) -> float:
    """Heuristic value (HP-like units) of the state reached after the enemy turn. Not a probability."""
    if mgr.is_over and not mgr.player_won:
        return LOSS
    if mgr.phase != "COMBAT":  # combat won (rewards / next room)
        return WIN_BONUS + mgr.run_state.player.current_hp + 4.0 * len([x for x in mgr.run_state.player.potions if x is not None])
    c = mgr.get_combat_state()
    if c is None:
        return LOSS if mgr.is_over else WIN_BONUS
    p = c.player
    v = float(p.current_hp)
    for e in c.enemies:
        if e.is_alive:
            v -= 0.55 * e.current_hp + 0.05 * e.block
    v -= 0.3 * max(0, _incoming(c) - 0)  # next-turn threat
    for name, w in SCALING_POWERS.items():
        v += w * max(_amount(p, name), 0)
    for name, w in BAD_POWERS.items():
        v -= w * min(max(_amount(p, name), 0), 5)
    v += 4.0 * len([x for x in mgr.run_state.player.potions if x is not None])
    return v


def _signature(a: dict) -> tuple:
    return (a["action"], a.get("card_id"), a.get("target_index"), a.get("potion_id"), a.get("index"))


@register
class SearchV1(RulesV1):
    name = "search_v1"
    version = "1"
    needs_forward_model = True

    def __init__(self, nodes: int = 60, depth: int = 8, **params):
        super().__init__(nodes=nodes, depth=depth, **params)
        self.nodes = nodes
        self.depth = depth

    def reset(self, rng_seed: int) -> None:
        super().reset(rng_seed)
        self.plan: list[tuple] = []
        self.plan_turn: tuple | None = None
        self.stat_nodes = 0
        self.stat_searches = 0

    def episode_stats(self) -> dict:
        return {"search_nodes": self.stat_nodes, "searches": self.stat_searches}

    # ---------------------------------------------------------------- search
    def _legal(self, mgr) -> list[dict]:
        return mgr.get_available_actions()

    def _candidates(self, acts: list[dict]) -> list[dict]:
        """One representative per (card, upgrade, target) so identical cards are not permuted; end_turn last."""
        seen, out, end = set(), [], None
        for a in acts:
            if a["action"] == "end_turn":
                end = a
                continue
            key = (a["action"], a.get("card_id"), a.get("target_index"), a.get("potion_id"), a.get("index"), a.get("cost"))
            if key in seen:
                continue
            seen.add(key)
            out.append(a)
        out.sort(key=lambda a: -self._prior(a))
        if end is not None:
            out.append(end)
        return out

    def _prior(self, a: dict) -> float:
        if a["action"] == "play_card":
            info = card_info(a["card_id"], False)
            return static_rating(info)
        if a["action"] == "use_potion":
            return 0.5
        return 0.0

    def _search(self, fm, seed: int) -> list[dict]:
        root = fm.clone(seed)
        budget = [self.nodes]
        best = {"value": -1e18, "path": []}

        def end_leaf(mgr, path):
            """Apply end_turn on a clone and score the resulting state."""
            child = clone_manager(mgr)
            acts = child.get_available_actions()
            end = next((a for a in acts if a["action"] == "end_turn"), None)
            if end is None:
                return
            budget[0] -= 1
            self.stat_nodes += 1
            child.take_action(end)
            val = evaluate(child)
            if val > best["value"]:
                best["value"], best["path"] = val, path + [end]

        def dfs(mgr, path, depth):
            end_leaf(mgr, path)
            if depth >= self.depth:
                return
            for a in self._candidates(mgr.get_available_actions()):
                if a["action"] == "end_turn":
                    continue
                if budget[0] <= 0:
                    return
                child = clone_manager(mgr)
                budget[0] -= 1
                self.stat_nodes += 1
                child.take_action(a)
                if child.phase != "COMBAT":  # the play ended the combat (win): score directly
                    val = evaluate(child)
                    if val > best["value"]:
                        best["value"], best["path"] = val, path + [a]
                    continue
                dfs(child, path + [a], depth + 1)

        dfs(root, [], 0)
        return best["path"]

    # ---------------------------------------------------------------- policy
    def _decide(self, obs, actions, fm=None):
        if obs["phase"] != "COMBAT" or fm is None:
            return super()._decide(obs, actions, fm)
        acts = obs["actions"]
        # pending card-selection inside combat: cheap rules (discard worst, pick best, ...)
        if any(a["action"] in ("choose", "confirm_choice") for a in acts):
            return choose_card(acts, deck_ids(obs["run"]), self.ctx)
        # a plan is only valid within the turn (and fight) it was made for
        turn_key = (obs["combat"]["turn"], tuple(e["id"] for e in obs["combat"]["enemies"]))
        if turn_key != self.plan_turn:
            self.plan, self.plan_turn = [], turn_key
        # follow the cached plan while the real hand still contains the planned play
        while self.plan:
            sig = self.plan[0]  # plans store signatures
            match = next((a for a in acts if _signature(a) == sig), None)
            if match is None:
                self.plan = []
                break
            self.plan.pop(0)
            return match["idx"]
        self.stat_searches += 1
        path = self._search(fm, self.rng.getrandbits(31))
        if not path:
            end = _first(acts, "end_turn")
            return end if end is not None else acts[0]["idx"]
        self.plan = [_signature(a) for a in path]
        first = self.plan.pop(0)
        match = next((a for a in acts if _signature(a) == first), None)
        if match is None:  # should not happen; fall back to rules
            self.plan = []
            return super()._decide(obs, actions, fm)
        return match["idx"]
