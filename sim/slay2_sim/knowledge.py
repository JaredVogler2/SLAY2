"""Public game knowledge for policies: static card facts read from the simulator's card tables.

This is *rules knowledge* a human player has (a card's cost, damage, block, type, rarity), not run state.
Lookups save/restore the simulator's global card-instance counter so that asking a question can never
change the ids of cards created later in the run (which would make policies perturb the game).
"""

from __future__ import annotations

from functools import lru_cache

UNKNOWN_CARD = {
    "id": "?", "cost": 1, "type": "SKILL", "rarity": "COMMON", "damage": 0, "block": 0, "vars": {},
    "keywords": [], "target": "NONE", "x": False, "star_cost": 0, "known": False,
}


@lru_cache(maxsize=None)
def card_info(card_id: str, upgraded: bool = False) -> dict:
    import sts2_env.cards.base as base
    from sts2_env.cards.factory import create_card
    from sts2_env.core.enums import CardId

    saved = base._next_instance_id
    try:
        c = create_card(CardId[card_id], upgraded)
        return {
            "id": card_id,
            "cost": int(c.cost),
            "type": c.card_type.name,
            "rarity": c.rarity.name,
            "damage": int(c.base_damage or 0),
            "block": int(c.base_block or 0),
            "vars": {str(k): int(v) for k, v in dict(c.effect_vars or {}).items() if isinstance(v, (int, float))},
            "keywords": sorted(str(k) for k in (c.keywords or ())),
            "target": c.target_type.name,
            "x": bool(getattr(c, "has_energy_cost_x", False)),
            "star_cost": int(getattr(c, "star_cost", 0) or 0),
            "known": True,
        }
    except Exception:  # noqa: BLE001 - unknown/unsupported card: callers treat as a filler skill
        return {**UNKNOWN_CARD, "id": card_id}
    finally:
        base._next_instance_id = saved


def warm() -> int:
    """Pre-compute every card (both upgrade states) before any run starts."""
    from sts2_env.core.enums import CardId

    n = 0
    for cid in CardId:
        for up in (False, True):
            card_info(cid.name, up)
            n += 1
    return n


def static_rating(info: dict) -> float:
    """Context-free strength estimate of a card per energy spent (higher is better). Heuristic, not a probability."""
    if not info.get("known", True):
        return 0.0
    cost = info["cost"]
    if cost < 0:  # unplayable (curses, statuses)
        return -6.0
    e = 2.0 if info["x"] else float(max(cost, 1))
    v = info["vars"]
    score = info["damage"] * 0.55 + info["block"] * 0.5 + v.get("block", 0) * 0.5
    score += min(v.get("cards", 0), 3) * 2.2 + min(v.get("energy", 0), 3) * 3.0
    score += v.get("strength", 0) * 4.5 + v.get("dexterity", 0) * 3.5
    score += v.get("vulnerable", 0) * 1.6 + v.get("weak", 0) * 1.4
    score -= v.get("hp_loss", 0) * 0.7
    if info["target"] in ("ALL_ENEMIES",):
        score += info["damage"] * 0.35
    if info["type"] == "POWER":
        score += 2.5
    if "EXHAUST" in {k.upper() for k in info["keywords"]}:
        score -= 1.0
    score /= e
    if cost == 0:
        score += 1.0
    score += {"RARE": 1.2, "UNCOMMON": 0.6}.get(info["rarity"], 0.0)
    return min(score, 12.0)
