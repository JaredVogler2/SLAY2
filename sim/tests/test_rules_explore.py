"""rules_explore: rules_v1 plus randomised card rewards and a deck record at the first boss fight."""

from __future__ import annotations

import pytest

from slay2_sim.policies import make_policy
from slay2_sim.runner import RunConfig, run_episode

SEEDS = (101, 102, 103, 104, 105, 106)


def play(sim, name: str, seed: int, **params):
    policy = make_policy(name, **params)
    return run_episode(RunConfig(), seed, policy, batch_id=f"test-{name}")


def test_without_exploration_it_is_exactly_rules_v1(sim):
    for seed in SEEDS:
        a, b = play(sim, "rules_v1", seed), play(sim, "rules_explore", seed, explore=0.0)
        assert (a.outcome, a.floor, a.steps, a.killed_by, a.hp) == (b.outcome, b.floor, b.steps, b.killed_by, b.hp), seed


def test_exploration_is_reproducible_per_seed_and_actually_random(sim):
    first = [play(sim, "rules_explore", s, explore=1.0) for s in SEEDS]
    second = [play(sim, "rules_explore", s, explore=1.0) for s in SEEDS]
    assert [(r.floor, r.steps, r.extra["random_picks"]) for r in first] == [(r.floor, r.steps, r.extra["random_picks"]) for r in second]
    assert sum(r.extra["random_picks"] for r in first) > 0
    baseline = [play(sim, "rules_v1", s) for s in SEEDS]
    assert [r.steps for r in first] != [r.steps for r in baseline], "full exploration must change at least one run"


def test_the_deck_at_each_boss_fight_is_recorded_from_the_visible_state(sim):
    first_fights = []
    for seed in SEEDS:
        fights = play(sim, "rules_explore", seed, explore=0.5).extra["boss_fights"]
        acts = [f["act"] for f in fights]
        assert acts == sorted(set(acts)), "one record per act, in order"
        if fights:
            assert fights[0]["act"] == 0, "the first boss fight of a run is the Act 1 boss"
            first_fights.append(fights[0])
        for r in fights:
            assert 1 <= len(r["boss"]) <= 3
            assert sum(r["deck"].values()) >= 5 and all(isinstance(n, int) and n > 0 for n in r["deck"].values())
            assert "BURNING_BLOOD" in r["relics"] and r["hp"] <= r["max_hp"]
    assert first_fights, "at least one of the runs reaches the first boss"
    assert all(f["floor"] >= 15 for f in first_fights)


def test_a_replicate_replays_the_game_seed_with_different_picks(sim):
    a = play(sim, "rules_explore", 105, explore=1.0, replicate=0)
    b = play(sim, "rules_explore", 105, explore=1.0, replicate=1)
    c = play(sim, "rules_explore", 105, explore=1.0, replicate=1)
    assert (b.steps, b.floor, b.extra["random_picks"]) == (c.steps, c.floor, c.extra["random_picks"])
    assert (a.steps, a.floor) != (b.steps, b.floor) or a.extra["boss_fights"] != b.extra["boss_fights"]
