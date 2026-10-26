"""Fixed action layout of the neural policy. Pure: needs neither the simulator nor torch, so it also runs in CI."""

from __future__ import annotations

import numpy as np
import pytest

from slay2_sim.rl import features as ft


# ----------------------------------------------------------------- pure layout tests (no simulator, no torch)
def test_action_layout_is_consistent():
    assert ft.PLAY_BASE == 0
    assert ft.POTION_BASE == ft.MAX_HAND * ft.N_TARGET_SLOTS
    assert ft.END == ft.POTION_BASE + ft.MAX_POTIONS * ft.N_TARGET_SLOTS
    assert ft.CHOOSE_BASE == ft.END + 1
    assert ft.CONFIRM == ft.CHOOSE_BASE + ft.MAX_CHOICES
    assert ft.N_ACTIONS == ft.CONFIRM + 1


def test_action_ids_are_unique_and_inside_the_layout():
    acts = [{"action": "end_turn"}, {"action": "confirm_choice"}]
    acts += [{"action": "play_card", "hand_index": s, "target_index": t} for s in range(ft.MAX_HAND) for t in [None, *range(ft.MAX_ENEMY)]]
    acts += [{"action": "use_potion", "slot_index": p, "target_index": t} for p in range(ft.MAX_POTIONS) for t in [None, *range(ft.MAX_ENEMY)]]
    acts += [{"action": "choose", "index": i} for i in range(ft.MAX_CHOICES)]
    ids = [ft.action_id(a) for a in acts]
    assert None not in ids
    assert len(set(ids)) == len(ids) == ft.N_ACTIONS
    assert min(ids) == 0 and max(ids) == ft.N_ACTIONS - 1


@pytest.mark.parametrize(
    "action",
    [
        {"action": "play_card", "hand_index": ft.MAX_HAND, "target_index": None},
        {"action": "play_card", "hand_index": 0, "target_index": ft.MAX_ENEMY},
        {"action": "use_potion", "slot_index": ft.MAX_POTIONS, "target_index": None},
        {"action": "choose", "index": ft.MAX_CHOICES},
        {"action": "choose", "index": -1},
        {"action": "something_new"},
    ],
)
def test_actions_outside_the_layout_are_unavailable_not_misrouted(action):
    assert ft.action_id(action) is None


def test_action_table_maps_ids_to_positions_and_first_wins_on_collision():
    acts = [{"action": "end_turn"}, {"action": "play_card", "hand_index": 2, "target_index": 1}, {"action": "play_card", "hand_index": 2, "target_index": 1}]
    table = ft.action_table(acts)
    assert table[ft.END] == 0
    assert table[2 * ft.N_TARGET_SLOTS + 1] == 1 and len(table) == 2
