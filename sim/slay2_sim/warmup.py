"""A canonical process state for the pinned simulator.

The simulator caches some card lookups lazily (``functools.lru_cache`` in ``sts2_env/cards/factory.py``). The first lookup of
a card that has no hand-written factory builds a reference card, and building a card takes the next number of the global
instance-id counter; unlike its sibling ``_probe_factory`` it does not give the number back. So the *first* time a process
meets such a card, every card created after that point in the game gets an id one higher than it would in any later game of
the same process. Ids are not game state in the rules, but they are keys in the simulator's bookkeeping, and a one-off shift
changes a pile in rare situations (found by the sample audit: Anger's added copy was missing from the discard pile in a
game that was the first in its process to meet a reference-only card, and present in the same game replayed later).

The effect: a game depended on how many games the process had played before it. Playing every cached lookup once, before the
first game and outside any game (``new_run`` resets the counter), makes every game of every process start from the same
state, the one that all but the first games of a process already had. Nothing of the third-party checkout is modified.

``SLAY2_NO_WARMUP=1`` skips it (the determinism test uses that to show it detects the defect).
"""

from __future__ import annotations

import os

_done = False
_report: dict = {}


def warm_simulator() -> dict:
    """Populate the simulator's lazy card caches once per process. Idempotent; the simulator must already be importable."""
    global _done, _report
    if _done:
        return _report
    _done = True
    if os.environ.get("SLAY2_NO_WARMUP") == "1":
        _report = {"warmed": 0, "skipped": "SLAY2_NO_WARMUP=1"}
        return _report
    import sts2_env.cards.base as card_base
    from sts2_env.cards import factory
    from sts2_env.core.enums import CardId

    saved = card_base._next_instance_id
    touched = failed = 0
    for card_id in CardId:
        try:
            factory.card_metadata(card_id)
            factory.card_preview(card_id)
            factory.is_basic_strike_or_defend_card_id(card_id)
            touched += 1
        except Exception:  # noqa: BLE001 - a card the reference does not define cannot be looked up in a game either
            failed += 1
        for upgraded in (False, True):  # met on the first upgrade of a card in a game (upgrade_card -> capture_self_mutating_card_progress)
            try:
                card_base._reference_card_base_values(card_id, upgraded)
            except Exception:  # noqa: BLE001
                pass
    card_base._next_instance_id = saved
    _report = {"warmed": touched, "not_looked_up": failed}
    return _report
