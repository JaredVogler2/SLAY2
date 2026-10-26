"""Fair, allow-listed observation of a simulator run (docs/INFORMATION-FAIRNESS.md).

A policy sees *only* what this module returns. We read explicit attributes; unknown fields are never
passed through. In particular this module never exposes: seeds or RNG state, the draw-pile **order**
(only its multiset), un-shown rewards, the second A10 boss, or the resolved type of "?" rooms before entry.

The legal-action dicts produced by ``RunManager.get_available_actions()`` are UI-level (ids, costs, targets)
and are copied through a primitive-only sanitiser.
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from typing import Any

PRIMS = (str, int, float, bool, type(None))


def _name(x: Any) -> str:
    return getattr(x, "name", None) or str(x)


def _powers(creature) -> dict[str, int]:
    return {_name(pid): int(inst.amount) for pid, inst in sorted(creature.powers.items(), key=lambda kv: _name(kv[0]))}


def _card_key(card) -> tuple:
    return (_name(card.card_id), bool(card.upgraded), tuple(sorted(str(k) for k in (card.enchantments or {}))))


def multiset(cards) -> list[list]:
    """Order-free view of a pile: ``[[card_id, upgraded, count], ...]`` sorted by id."""
    counts = Counter(_card_key(c) for c in cards)
    return [[k[0], k[1], n] for k, n in sorted(counts.items())]


def _hand_card(i: int, c) -> dict:
    return {
        "i": i,
        "id": _name(c.card_id),
        "cost": int(c.cost),
        "star_cost": int(getattr(c, "star_cost", 0) or 0),
        "x": bool(getattr(c, "has_energy_cost_x", False)),
        "upgraded": bool(c.upgraded),
        "type": _name(c.card_type),
        "target": _name(c.target_type),
        "damage": int(c.base_damage or 0),
        "block": int(c.base_block or 0),
        "keywords": sorted(str(k) for k in (c.keywords or ())),
    }


def _enemy(i: int, e, ai) -> dict:
    intents = []
    if ai is not None and e.is_alive:
        for it in ai.current_move.intents:
            intents.append({"type": _name(it.intent_type), "damage": int(it.damage), "hits": int(it.hits)})
    return {
        "i": i,
        "id": str(e.monster_id),
        "alive": bool(e.is_alive),
        "hp": int(e.current_hp),
        "max_hp": int(e.max_hp),
        "block": int(e.block),
        "powers": _powers(e),
        "intents": intents,
    }


def _combat_view(c) -> dict:
    p = c.player
    return {
        "turn": int(c.round_number),
        "energy": int(c.energy),
        "max_energy": int(c.max_energy),
        "stars": int(c.stars),
        "player": {"hp": int(p.current_hp), "max_hp": int(p.max_hp), "block": int(p.block), "powers": _powers(p)},
        "hand": [_hand_card(i, card) for i, card in enumerate(c.hand)],
        "draw_pile": multiset(c.draw_pile),      # multiset only: order is hidden information
        "discard_pile": multiset(c.discard_pile),
        "exhaust_pile": multiset(c.exhaust_pile),
        "enemies": [_enemy(i, e, c.enemy_ais.get(e.combat_id)) for i, e in enumerate(c.enemies)],
    }


def _map_view(rs) -> dict | None:
    act_map = rs.map
    if act_map is None:
        return None
    nodes, edges = [], []
    for (col, row), pt in sorted(act_map._grid.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        nodes.append([col, row, _name(pt.point_type)])
        for ch in pt.children:
            edges.append([col, row, ch.coord.col, ch.coord.row])
    boss = act_map.boss_point
    visited = [[c.col, c.row] for c in rs.visited_map_coords]
    return {
        "nodes": nodes,
        "edges": edges,
        "boss": [boss.coord.col, boss.coord.row] if boss is not None else None,
        "visited": visited,
        "rows": int(act_map.map_length),
    }


def sanitize_action(idx: int, a: dict) -> dict:
    """Copy a legal-action dict keeping primitives only (tuples become lists)."""
    out: dict[str, Any] = {"idx": idx}
    for k, v in a.items():
        if isinstance(v, PRIMS):
            out[k] = v
        elif isinstance(v, (tuple, list)) and all(isinstance(x, PRIMS) for x in v):
            out[k] = list(v)
        elif isinstance(v, dict) and all(isinstance(x, PRIMS) for x in v.values()):
            out[k] = dict(v)
        else:
            out[k] = _name(v)
    return out


def observe(mgr, actions: list[dict] | None = None) -> dict:
    """Return the fair observation for the manager's current decision point."""
    rs = mgr.run_state
    p = rs.player
    acts = mgr.get_available_actions() if actions is None else actions
    obs: dict[str, Any] = {
        "phase": mgr.phase,
        "run": {
            "character": str(p.character_id),
            "ascension": int(rs.ascension_level),
            "act": int(rs.current_act_index),
            "act_floor": int(rs.act_floor),
            "total_floor": int(rs.total_floor),
            "hp": int(p.current_hp),
            "max_hp": int(p.max_hp),
            "gold": int(p.gold),
            "potions": [str(x.potion_id) for x in p.potions if x is not None],
            "max_potion_slots": int(p.max_potion_slots),
            "relics": [str(r) for r in p.relics],
            "deck": multiset(p.deck),
        },
        "map": _map_view(rs),
        "actions": [sanitize_action(i, a) for i, a in enumerate(acts)],
    }
    if mgr.phase == "COMBAT":
        c = mgr.get_combat_state()
        if c is not None:
            obs["combat"] = _combat_view(c)
    return obs


def obs_hash(obs: dict) -> str:
    """Stable 16-hex digest of the observation (including legal actions) for traces."""
    blob = json.dumps(obs, sort_keys=True, separators=(",", ":"), default=str).encode()
    return hashlib.sha256(blob).hexdigest()[:16]
