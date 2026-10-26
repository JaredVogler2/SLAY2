"""search_v2 - best-first turn planner with state de-duplication; rules_v1 for every other decision.

search_v1 spent 60 nodes depth-first behind a static card ordering, so it explored one greedy line and a few of its
variations, and it judged each leaf by simulating the enemy turn on yet another clone. search_v2 changes three things:

* every distinct state reachable by playing cards / potions this turn is a node (play orders that reach the same board
  merge), expanded best-first by the node's own value until a node budget is spent;
* a node is valued as "end the turn here" *without* another clone: the enemy's visible intents give the damage that will
  arrive, the block already on the player absorbs it (see ``turn_value``);
* a card that opens a pending choice (discard, exhaust, upgrade ...) is resolved by the same rule rules_v1 uses, so a
  choice never multiplies the branching.

Information is as fair as search_v1: the search runs on ONE fair determinization of the hidden state per turn (draw order
and every RNG stream are replaced by a sample that depends only on the visible state and the policy's private RNG).
"""

from __future__ import annotations

import heapq

from ..clone import clone_manager
from ..observation import observe
from . import register
from .rules import RulesV1, _first, choose_card, deck_ids
from .search import BAD_POWERS, SCALING_POWERS, _amount, _incoming, _signature

LOSS = -1.0e6
WIN = 1.0e4
ENEMY_DEBUFFS = {"VULNERABLE": 1.6, "WEAK": 1.4, "POISON": 0.5, "CONSTRICT": 0.8}


def usable_potions(mgr) -> tuple[int, ...]:
    """Slots of the potions that can still be drunk. ``run_state.player.potions`` keeps a used potion until the fight ends
    (measured: the list is unchanged after ``use_potion``), so counting it would make potions look free to spend."""
    return tuple(sorted({a["slot_index"] for a in mgr.get_available_actions() if a["action"] == "use_potion"}))


def turn_value(mgr, *, enemy_hp_weight: float, potion_value: float, danger_fraction: float) -> float:
    """Value (HP-like units) of ending the player's turn in this state. Not a probability."""
    if mgr.is_over and not mgr.player_won:
        return LOSS
    player = mgr.run_state.player
    if mgr.phase != "COMBAT":  # the fight is won; the run state is synced again, so its potion list is the real one
        return WIN + float(player.current_hp) + potion_value * len([x for x in player.potions if x is not None])
    potions = len(usable_potions(mgr))
    c = mgr.get_combat_state()
    if c is None:
        return LOSS if mgr.is_over else WIN
    p = c.player
    hp = float(p.current_hp)
    incoming = _incoming(c)
    taken = max(0.0, incoming - float(p.block))
    if taken >= hp:  # the visible intents kill the player this turn: rank doomed plans by how little they lose by
        return LOSS / 10.0 + (hp - taken)
    v = hp - taken
    low = danger_fraction * float(p.max_hp)
    if v < low:  # convex: the last HP are worth more than the first
        v -= 1.5 * (low - v)
    for e in c.enemies:
        if not e.is_alive:
            continue
        v -= enemy_hp_weight * (float(e.current_hp) + 0.3 * float(e.block))
        for name, w in ENEMY_DEBUFFS.items():
            v += w * min(max(_amount(e, name), 0), 4)
        v -= 1.0 * max(_amount(e, "STRENGTH"), 0)
    for name, w in SCALING_POWERS.items():
        v += w * max(_amount(p, name), 0)
    for name, w in BAD_POWERS.items():
        v -= w * min(max(_amount(p, name), 0), 5)
    return v + potion_value * potions


def _powers(creature) -> tuple:
    return tuple(sorted((getattr(k, "name", str(k)), int(getattr(v, "amount", v))) for k, v in dict(creature.powers).items()))


def state_key(mgr) -> tuple:
    """What matters for the rest of this turn; boards reached by different play orders collide on purpose."""
    c = mgr.get_combat_state()
    if c is None:
        return ("end", mgr.phase, bool(mgr.is_over))
    p = c.player
    return (
        int(c.energy), int(p.current_hp), int(p.block), _powers(p),
        tuple(sorted((x.card_id.name, bool(x.upgraded), int(x.cost)) for x in c.hand)),
        tuple((int(e.current_hp), int(e.block), _powers(e)) for e in c.enemies),
        usable_potions(mgr), len(c.draw_pile), len(c.discard_pile),
    )


@register
class SearchV2(RulesV1):
    name = "search_v2"
    version = "1"
    needs_forward_model = True

    def __init__(self, nodes: int = 250, enemy_hp_weight: float = 0.55, potion_value: float = 8.0, danger_fraction: float = 0.25, **params):
        super().__init__(nodes=nodes, enemy_hp_weight=enemy_hp_weight, potion_value=potion_value, danger_fraction=danger_fraction, **params)
        self.nodes = int(nodes)
        self.enemy_hp_weight = float(enemy_hp_weight)
        self.potion_value = float(potion_value)
        self.danger_fraction = float(danger_fraction)

    def reset(self, rng_seed: int) -> None:
        super().reset(rng_seed)
        self.plan: list[tuple] = []
        self.plan_turn: tuple | None = None
        self.stat_nodes = 0
        self.stat_searches = 0
        self.stat_exhausted = 0

    def episode_stats(self) -> dict:
        return {"search_nodes": self.stat_nodes, "searches": self.stat_searches, "budget_exhausted": self.stat_exhausted}

    # ---------------------------------------------------------------- search
    def _value(self, mgr) -> float:
        return turn_value(mgr, enemy_hp_weight=self.enemy_hp_weight, potion_value=self.potion_value, danger_fraction=self.danger_fraction)

    def _children(self, mgr) -> list[dict]:
        """One representative per distinct (card, upgrade, target / potion) play; a pending choice yields the rules choice only."""
        acts = mgr.get_available_actions()
        if any(a["action"] in ("choose", "confirm_choice") for a in acts):
            obs = observe(mgr, acts)  # the same sanitised view the real decision uses, so the same rule picks the same card
            return [acts[choose_card(obs["actions"], deck_ids(obs["run"]), self.ctx)]]
        seen, out = set(), []
        for a in acts:
            if a["action"] == "end_turn":
                continue
            key = (a["action"], a.get("card_id"), a.get("upgraded"), a.get("target_index"), a.get("potion_id"), a.get("cost"))
            if key in seen:
                continue
            seen.add(key)
            out.append(a)
        return out

    def _plan_turn(self, fm, seed: int) -> list[dict]:
        root = fm.clone(seed)
        budget = self.nodes
        best_value, best_path = -1.0e18, []
        seen: set = set()
        counter = 0
        heap: list = [(-self._value(root), counter, root, [])]

        def end_action(mgr):
            return next((a for a in mgr.get_available_actions() if a["action"] == "end_turn"), None)

        while heap:
            neg, _, mgr, path = heapq.heappop(heap)
            if mgr.phase != "COMBAT" or mgr.is_over:  # a play ended the fight: the path is complete as it is
                if -neg > best_value:
                    best_value, best_path = -neg, path
                continue
            end = end_action(mgr)
            if end is not None and -neg > best_value:
                best_value, best_path = -neg, path + [end]
            if budget <= 0:
                self.stat_exhausted += 1
                break
            for a in self._children(mgr):
                if budget <= 0:
                    break
                child = clone_manager(mgr)
                budget -= 1
                self.stat_nodes += 1
                child.take_action(a)
                key = state_key(child)
                if key in seen:
                    continue
                seen.add(key)
                counter += 1
                heapq.heappush(heap, (-self._value(child), counter, child, path + [a]))
        return best_path

    # ---------------------------------------------------------------- policy
    def _decide(self, obs, actions, fm=None):
        if obs["phase"] != "COMBAT" or fm is None:
            return super()._decide(obs, actions, fm)
        acts = obs["actions"]
        if any(a["action"] in ("choose", "confirm_choice") for a in acts):
            return choose_card(acts, deck_ids(obs["run"]), self.ctx)
        turn_key = (obs["combat"]["turn"], tuple(e["id"] for e in obs["combat"]["enemies"]))
        if turn_key != self.plan_turn:
            self.plan, self.plan_turn = [], turn_key
        while self.plan:
            sig = self.plan[0]
            match = next((a for a in acts if _signature(a) == sig), None)
            if match is None:
                self.plan = []
                break
            self.plan.pop(0)
            return match["idx"]
        self.stat_searches += 1
        path = self._plan_turn(fm, self.rng.getrandbits(31))
        if not path:
            end = _first(acts, "end_turn")
            return end if end is not None else acts[0]["idx"]
        self.plan = [_signature(a) for a in path]
        first = self.plan.pop(0)
        match = next((a for a in acts if _signature(a) == first), None)
        if match is None:  # should not happen; fall back to the rules
            self.plan = []
            return super()._decide(obs, actions, fm)
        return match["idx"]
