"""rules_v2_neow: rules_v2 that takes one of the opening Ancient's three relics at random and logs the offer and the choice."""

from __future__ import annotations

from collections import Counter

from slay2_sim.policies import make_policy
from slay2_sim.runner import RunConfig, run_episode

SEEDS = tuple(range(300, 390))


def opening(sim, seed: int, **params):
    """Play only the opening decision: the Ancient screen is the first thing a run shows."""
    policy = make_policy("rules_v2_neow", **params)
    return run_episode(RunConfig(max_steps=1), seed, policy, batch_id="test-neow")


def test_the_offer_and_the_choice_are_logged_from_what_the_screen_shows(sim):
    for seed in SEEDS[:20]:
        neow = opening(sim, seed, neow_explore=1.0).extra["neow"]
        assert len(neow["positive"]) == 2 and neow["positive"] == sorted(neow["positive"])
        assert neow["cursed"] and neow["cursed"] not in neow["positive"]
        assert neow["taken"] in neow["positive"] + [neow["cursed"]]
        assert neow["kind"] == ("cursed" if neow["taken"] == neow["cursed"] else "positive")
        assert neow["explored"] is True


def test_exploration_takes_each_of_the_three_options_about_a_third_of_the_time(sim):
    kinds = Counter()
    taken = Counter()
    for seed in SEEDS:
        neow = opening(sim, seed, neow_explore=1.0).extra["neow"]
        kinds[neow["kind"]] += 1
        taken[neow["taken"]] += 1
    assert 15 <= kinds["cursed"] <= 45, kinds  # a third of 90, five standard deviations wide
    assert kinds["positive"] == len(SEEDS) - kinds["cursed"]
    assert len(taken) >= 8, "the choice is spread over many relics, not stuck on one"


def test_the_choice_is_reproducible_per_seed_and_does_not_depend_on_the_policy_rng_stream(sim):
    a = [opening(sim, s, neow_explore=1.0).extra["neow"] for s in SEEDS[:15]]
    b = [opening(sim, s, neow_explore=1.0).extra["neow"] for s in SEEDS[:15]]
    assert a == b


def test_without_exploration_it_is_exactly_rules_v2_and_still_logs_the_offer(sim):
    for seed in SEEDS[:6]:
        base = run_episode(RunConfig(), seed, make_policy("rules_v2"), batch_id="test-v2")
        same = run_episode(RunConfig(), seed, make_policy("rules_v2_neow", neow_explore=0.0), batch_id="test-neow0")
        assert (base.outcome, base.floor, base.steps, base.killed_by, base.hp) == (
            same.outcome, same.floor, same.steps, same.killed_by, same.hp,
        ), seed
        assert same.extra["neow"]["explored"] is False and same.extra["neow"]["kind"] == "positive"


def values_file(tmp_path, betas: dict[str, float]):
    import json

    path = tmp_path / "neow-values-test.json"
    path.write_text(json.dumps({"kind": "neow-values", "relics": [{"label": k, "beta": v} for k, v in betas.items()]}), encoding="utf-8")
    return str(path)


def test_the_measured_rule_takes_the_offered_relic_with_the_largest_value(sim, tmp_path):
    betas = {"Arcane Scroll": 2.0, "Fishing Rod": 1.0, "Booming Conch": -1.0, "Cursed Pearl": -2.0, "Silken Tress": 3.0}
    path = values_file(tmp_path, betas)
    seen_rule = Counter()
    for seed in SEEDS:
        policy = make_policy("rules_v2_neow_values", neow_values=path)
        rec = run_episode(RunConfig(max_steps=1), seed, policy, batch_id="test-neow-values")
        neow = rec.extra["neow"]
        offered = neow["positive"] + [neow["cursed"]]
        best = max(betas.get(x, 0.0) for x in offered)
        assert betas.get(neow["taken"], 0.0) == best, (seed, offered, neow["taken"])
        seen_rule["listed-best" if best > 0 else "average-or-worse"] += 1
        assert neow["explored"] is True
    assert seen_rule["listed-best"] > 0 and seen_rule["average-or-worse"] > 0, seen_rule  # both branches were exercised


def test_the_values_file_is_recorded_by_hash_and_a_wrong_hash_is_refused(sim, tmp_path):
    import pytest

    path = values_file(tmp_path, {"Arcane Scroll": 1.0})
    policy = make_policy("rules_v2_neow_values", neow_values=path)
    digest = policy.params["neow_values_sha256"]
    assert len(digest) == 64
    make_policy("rules_v2_neow_values", neow_values=path, neow_values_sha256=digest)  # rebuilds from a manifest's parameters
    with pytest.raises(ValueError):
        make_policy("rules_v2_neow_values", neow_values=path, neow_values_sha256="0" * 64)
    bad = tmp_path / "not-values.json"
    bad.write_text('{"kind": "card-values", "cards": []}', encoding="utf-8")
    with pytest.raises(ValueError):
        make_policy("rules_v2_neow_values", neow_values=str(bad))
