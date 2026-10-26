"""Terminal-state semantics of the third-party simulator (CLAUDE.md: a completed episode must reach a true
success/death state). An invulnerable player is the only practical way to reach the win path: a random or
scripted policy never wins, so without this test "win" would be an unproven code path.
"""

import pytest

from slay2_sim import gaps
from slay2_sim.observation import observe
from slay2_sim.policies import make_policy
from slay2_sim.runner import RunConfig, new_run, policy_seed_for

SEED = 3
MAX_STEPS = 6000


def play_invulnerable(sim, ascension: int, seed: int = SEED):
    """Run to a terminal state with a 100,000-HP player; return (manager, boss fights per act index)."""
    from sts2_env.core.enums import RoomType

    mgr = new_run(RunConfig(ascension=ascension, profile="veteran"), seed)
    player = mgr.run_state.player
    player.max_hp = player.current_hp = 100_000
    policy = make_policy("rules_v1")
    policy.reset(policy_seed_for(policy.name, seed))
    boss_fights: dict[int, int] = {}
    previous_phase = mgr.phase
    for _ in range(MAX_STEPS):
        if mgr.is_over:
            break
        actions = mgr.get_available_actions()
        idx = policy.act(observe(mgr, actions), actions, None)
        mgr.take_action(actions[idx])
        if mgr.phase == "COMBAT" and previous_phase != "COMBAT" and mgr._current_room_type == RoomType.BOSS:
            act = int(mgr.run_state.current_act_index)
            boss_fights[act] = boss_fights.get(act, 0) + 1
        previous_phase = mgr.phase
    return mgr, boss_fights


@pytest.fixture(scope="module")
def a0(sim):
    return play_invulnerable(sim, ascension=0)


@pytest.fixture(scope="module")
def a10(sim):
    return play_invulnerable(sim, ascension=10)


def test_win_is_declared_only_after_the_final_act_is_cleared(a0):
    mgr, boss_fights = a0
    assert mgr.is_over and mgr.player_won
    assert mgr.phase == mgr.PHASE_RUN_OVER
    assert mgr.run_state.current_act_index == 2, "STS2 has three acts; there is no Act 4"
    assert boss_fights == {0: 1, 1: 1, 2: 1}


def test_a10_second_boss_is_rolled_but_never_reachable(sim, a10):
    """Documents gap G1: the room set holds a distinct second boss, yet the map has no node that leads to it."""
    mgr, _ = a10
    final_set = mgr.run_state.get_act_room_set(2)
    assert mgr.run_state.has_double_boss
    assert final_set.second_boss is not None and final_set.second_boss is not final_set.boss
    assert final_set.boss_encounters_visited == 1, "the second boss was never entered"
    assert getattr(mgr.run_state.map, "second_boss_point", None) is None


@pytest.mark.xfail(strict=True, reason="gap G1: the simulator ends A10 after the first Act-3 boss (game: two boss fights)")
def test_a10_requires_two_final_act_bosses(a10):
    _, boss_fights = a10
    assert boss_fights.get(2) == 2


def test_gap_registry_flags_double_boss_only_from_a10():
    assert "G1-double-boss-not-entered" not in {g["id"] for g in gaps.applicable(9)}
    assert "G1-double-boss-not-entered" in {g["id"] for g in gaps.applicable(10)}
    assert {g["id"] for g in gaps.applicable(0)} >= {"G3-sovereign-blade-crash", "G4-rng-family", "G5-no-live-parity"}
