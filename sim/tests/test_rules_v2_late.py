"""rules_v2_late: rules_v2 whose card-reward rule can differ in the acts named (ADR-060: Act 2; ADR-061: each act on its own, the acts counted from 0)."""

from __future__ import annotations

import json

import pytest
from slay2_sim.clone import clone_manager
from slay2_sim.observation import obs_hash, observe
from slay2_sim.policies import make_policy
from slay2_sim.policies.rules2 import MAX_DECK
from slay2_sim.runner import RunConfig, new_run
from test_policy_fairness import POLICY_SEED, decide, twins

SHOWN = "experiments/cardvalue/ironclad-a0-v2.json"


def write_values(path, betas: dict[str, float], character: str | None = None):
    body = {"kind": "card-values", "cards": [{"id": k, "beta": v} for k, v in betas.items()]}
    if character:
        body["character"] = character
    path.write_text(json.dumps(body))
    return str(path)


def reward(offered: list[str], *, act: int, deck_size: int = 12, character: str | None = None):
    run: dict = {"deck": [["STRIKE_IRONCLAD", False, deck_size]], "act": act, "potions": [], "max_potion_slots": 3}
    if character:
        run["character"] = character
    actions = [{"action": "pick_card", "idx": i, "card_id": c} for i, c in enumerate(offered)]
    actions.append({"action": "skip", "idx": len(offered)})
    return {"run": run}, actions


def late(tmp_path, **params):
    p = make_policy("rules_v2_late", values=write_values(tmp_path / "v.json", {"ANGER": 0.7, "BASH": 0.2, "HAVOC": -0.3}), **params)
    p.reset(1)
    return p


@pytest.mark.parametrize("late_acts", [[0], [1], [2], [0, 2], [1, 2], [0, 1, 2]])
def test_the_late_rule_applies_in_the_acts_named_and_nowhere_else(sim, tmp_path, late_acts):
    p = late(tmp_path, late_threshold=0.5, late_acts=late_acts)
    for act in (0, 1, 2):
        obs, actions = reward(["BASH", "ANGER"], act=act)
        assert p._card_reward(obs, actions) == 1, (late_acts, act)  # ANGER, 0.7, is above both thresholds
        obs, actions = reward(["BASH"], act=act)
        # BASH, 0.2, is above the policy's own threshold (0: taken) and below the late one (0.5: skipped)
        assert p._card_reward(obs, actions) == (1 if act in late_acts else 0), (late_acts, act)


def test_without_late_acts_the_late_rule_is_the_second_act_as_in_adr_060(sim, tmp_path):
    p = late(tmp_path, late_threshold=0.5)
    assert p.late_acts == (1,)
    for act, expected in ((0, 0), (1, 1), (2, 0)):
        obs, actions = reward(["BASH"], act=act)
        assert p._card_reward(obs, actions) == expected, act


@pytest.mark.parametrize("act", [0, 1, 2])
def test_a_late_threshold_of_plus_or_minus_one_hundred_is_never_or_always(sim, tmp_path, act):
    never = late(tmp_path, late_threshold=100.0, late_acts=[act])
    always = late(tmp_path, late_threshold=-100.0, late_acts=[act])
    obs, actions = reward(["ANGER", "BASH"], act=act)
    assert never._card_reward(obs, actions) == 2  # skip
    obs, actions = reward(["HAVOC"], act=act)
    assert always._card_reward(obs, actions) == 0  # the best card on offer is taken although its value is negative
    obs, actions = reward(["ANGER"], act=act, deck_size=MAX_DECK)
    assert always._card_reward(obs, actions) == 1  # a full deck stops taking cards in the late act too
    obs, actions = reward(["HAVOC"], act=(act + 1) % 3)
    assert always._card_reward(obs, actions) == 1  # and the late rule does not leak into another act


def test_without_late_parameters_it_is_rules_v2_exactly(sim, tmp_path):
    f = write_values(tmp_path / "v.json", {"ANGER": 0.7, "BASH": 0.2, "HAVOC": -0.3, "CLEAVE": 0.05})
    plain, base = make_policy("rules_v2_late", values=f, threshold=0.1), make_policy("rules_v2", values=f, threshold=0.1)
    plain.reset(1)
    base.reset(1)
    for offered in (["BASH", "ANGER"], ["CLEAVE"], ["HAVOC", "BASH"], ["UNKNOWN_CARD"], []):
        for act in (0, 1, 2):
            for size in (8, MAX_DECK):
                obs, actions = reward(offered, act=act, deck_size=size)
                assert plain._card_reward(obs, actions) == base._card_reward(obs, actions), (offered, act, size)
    assert plain.late_threshold == 0.1 and plain.late_beta is None


@pytest.mark.parametrize("late_acts", [None, [0], [2], [0, 2]])
def test_a_late_values_file_replaces_the_table_in_the_late_acts_only(sim, tmp_path, late_acts):
    f = write_values(tmp_path / "act1.json", {"ANGER": 0.7, "BASH": 0.2})
    g = write_values(tmp_path / "act2.json", {"ANGER": -0.4, "BASH": 0.3})
    p = make_policy("rules_v2_late", values=f, late_values=g, **({} if late_acts is None else {"late_acts": late_acts}))
    p.reset(1)
    for act in (0, 1, 2):
        obs, actions = reward(["ANGER", "BASH"], act=act)
        # ANGER by the policy's own table, BASH by the late one (the default late act is the second)
        assert p._card_reward(obs, actions) == (1 if act in (late_acts or [1]) else 0), (late_acts, act)


def test_the_late_parameters_are_recorded_and_rebuild_the_same_policy(sim, tmp_path):
    f = write_values(tmp_path / "act1.json", {"ANGER": 0.7})
    g = write_values(tmp_path / "act2.json", {"ANGER": 0.4})
    eff = make_policy("rules_v2_late", values=f, late_values=g, late_threshold=0.2).describe()["params"]
    assert eff["late_acts"] == [1] and eff["late_threshold"] == 0.2 and len(eff["late_values_sha256"]) == 64
    again = make_policy("rules_v2_late", **{**eff, "values": f, "late_values": g})  # what the win audit does with a manifest
    assert again.describe()["params"] == eff
    # without late parameters the effective parameters still say what the late rule is: the policy's own
    plain = make_policy("rules_v2_late", values=f, threshold=0.3).describe()["params"]
    assert plain["late_threshold"] == 0.3 and "late_values" not in plain and plain["late_acts"] == [1]
    write_values(tmp_path / "act2.json", {"ANGER": -0.4})  # the file changed after the batch was run
    with pytest.raises(ValueError, match="was recorded"):
        make_policy("rules_v2_late", **{**eff, "values": f, "late_values": g})
    with pytest.raises(ValueError, match="without late_values"):
        make_policy("rules_v2_late", values=f, late_values_sha256="0" * 64)


@pytest.mark.parametrize("acts", [[0], [2], [0, 2], [0, 1, 2]])
def test_the_acts_named_are_recorded_and_rebuild_the_same_policy(sim, tmp_path, acts):
    f = write_values(tmp_path / "act1.json", {"ANGER": 0.7})
    eff = make_policy("rules_v2_late", values=f, late_threshold=0.2, late_acts=acts).describe()["params"]
    assert eff["late_acts"] == acts and eff["late_threshold"] == 0.2
    again = make_policy("rules_v2_late", **{**eff, "values": f})  # what the win audit does with a manifest
    assert again.describe()["params"] == eff and again.late_acts == tuple(acts)


def test_values_for_another_class_are_refused_in_the_late_act(sim, tmp_path):
    f = write_values(tmp_path / "ironclad.json", {"ANGER": 0.7}, character="Ironclad")
    g = write_values(tmp_path / "silent.json", {"BACKFLIP": 0.3}, character="Silent")
    p = make_policy("rules_v2_late", values=f, late_values=g)
    p.reset(1)
    obs, actions = reward(["ANGER"], act=1, character="Ironclad")
    with pytest.raises(ValueError, match="measured for Silent"):
        p._card_reward(obs, actions)
    obs, actions = reward(["ANGER"], act=0, character="Ironclad")
    assert p._card_reward(obs, actions) == 0  # the Act-1 table is Ironclad's, and Act 1 never reads the other file


def test_bad_late_acts_are_refused(sim, tmp_path):
    f = write_values(tmp_path / "v.json", {"ANGER": 0.7})
    for bad in ([], [3], [-1]):
        with pytest.raises(ValueError, match="late_acts"):
            make_policy("rules_v2_late", values=f, late_acts=bad)
    assert make_policy("rules_v2_late", values=f, late_acts=[2, 1, 1]).late_acts == (1, 2)


def play(seed: int, steps: int = 6000, stop_at_reward_act: int | None = None, **params):
    """One run of rules_v2_late from the start: the (observation hash, action, phase, act, is a card reward) of every decision. With
    ``stop_at_reward_act`` it stops at the first card reward the run is offered in that act (the acts counted from 0)."""
    mgr = new_run(RunConfig(keep_relics=True), seed)
    policy = make_policy("rules_v2_late", values=SHOWN, **params)
    policy.reset(POLICY_SEED)
    rows = []
    for _ in range(steps):
        if mgr.is_over:
            break
        actions = mgr.get_available_actions()
        obs = observe(mgr, actions)
        idx = policy.act(obs, actions, None)
        rows.append((obs_hash(obs), idx, obs["phase"], obs["run"]["act"], any(a.get("action") == "pick_card" for a in obs["actions"])))
        if stop_at_reward_act is not None and obs["phase"] == "CARD_REWARD" and obs["run"]["act"] == stop_at_reward_act and rows[-1][4]:
            return mgr, rows
        mgr.take_action(actions[idx])
    return mgr, rows


# Seeds on which a run is offered a card in the act (the simulator is deterministic: found by playing the runs, then pinned). Few runs get to a card
# reward of the third act, so those seeds are the ones that did.
SEEDS_BY_ACT = {0: (845573669, 123456789, 7), 1: (845573669, 123456789, 7, 99), 2: (2, 6, 9)}


@pytest.mark.parametrize("act", [0, 1, 2])
def test_two_arms_that_differ_in_the_late_rule_play_the_same_game_up_to_the_first_card_reward_of_the_act(sim, act):
    """The pairing claim of ADR-060 and ADR-061: arms identical before an act differ for the first time at a card reward of that act."""
    checked = 0
    for seed in SEEDS_BY_ACT[act]:
        _, never = play(seed, late_threshold=100.0, late_acts=[act])
        _, always = play(seed, late_threshold=-100.0, late_acts=[act])
        _, base = play(seed)
        first = next((i for i, (a, b) in enumerate(zip(never, always)) if a[:2] != b[:2]), None)
        if first is None:
            continue  # this run never reached a card reward of the act on which the two rules disagree
        checked += 1
        assert never[first][2] == "CARD_REWARD" and never[first][3] == act and never[first][4], (act, seed, never[first])
        # and nothing before it differs from the plain policy either: every act before it is rules_v2's
        assert never[:first] == always[:first] == base[:first], (act, seed)
    assert checked >= 2, f"too few runs reached a card reward of act {act} on which the two rules disagree"


@pytest.mark.parametrize("act", [0, 1, 2])
def test_the_late_rule_ignores_hidden_state_at_a_card_reward_of_the_act(sim, act):
    reached = 0
    for seed in SEEDS_BY_ACT[act] + ((31337, 2718) if act < 2 else ()):
        mgr, rows = play(seed, stop_at_reward_act=act)
        if not rows or rows[-1][2] != "CARD_REWARD" or rows[-1][3] != act:
            continue
        reached += 1
        a, b = twins(clone_manager(mgr), 4000 + seed % 1000)
        for params in ({"late_threshold": 0.2}, {"late_threshold": 100.0}, {"late_values": SHOWN, "late_threshold": 0.0}):
            assert decide("rules_v2_late", a, late_acts=[act], **params) == decide("rules_v2_late", b, late_acts=[act], **params), (act, seed, params)
    assert reached >= 2, f"too few runs reached a card reward of act {act}"


def test_the_late_pilot_shares_the_private_random_stream_of_rules_v2_and_no_other_policy_changed():
    import hashlib

    from slay2_sim.runner import policy_seed_for

    def old(name: str, seed: int) -> int:
        return int.from_bytes(hashlib.sha256(f"slay2-policy:{name}:{seed}".encode()).digest()[:8], "big")

    for seed in (0, 1, 845573669):
        assert policy_seed_for("rules_v2_late", seed) == policy_seed_for("rules_v2", seed) == old("rules_v2", seed)
        for name in ("random_legal", "rules_v1", "rules_v2", "rules_v3", "rules_explore", "rules_v2_neow", "search_v3", "advisor_v1"):
            assert policy_seed_for(name, seed) == old(name, seed), name   # every other name is hashed as itself: no earlier batch moves


def test_with_the_same_card_rule_the_late_pilot_plays_the_very_game_rules_v2_plays(sim):
    """Whole episodes through the runner: the records agree in everything but the policy's name and the wall clock."""
    from slay2_sim.runner import run_episode

    cfg = RunConfig(keep_relics=True)
    for seed in (845573669, 123456789, 7, 99, 31337):
        a = run_episode(cfg, seed, make_policy("rules_v2", values=SHOWN, threshold=0.0), batch_id="x")
        b = run_episode(cfg, seed, make_policy("rules_v2_late", values=SHOWN, threshold=0.0, late_threshold=0.0), batch_id="x")
        ra, rb = a.to_dict() if hasattr(a, "to_dict") else a.__dict__, b.to_dict() if hasattr(b, "to_dict") else b.__dict__
        ignore = {"policy", "wall_seconds"}
        assert {k: v for k, v in ra.items() if k not in ignore} == {k: v for k, v in rb.items() if k not in ignore}, seed


def test_the_three_acts_together_play_the_very_game_the_lead_plays(sim):
    """ADR-061's arms for one act each and the lead (rules_v2 at 0.2 in every act) are one family: the late rule in all three acts at 0.2 is the lead."""
    from slay2_sim.runner import run_episode

    cfg = RunConfig(keep_relics=True)
    for seed in (845573669, 123456789, 7):
        a = run_episode(cfg, seed, make_policy("rules_v2", values=SHOWN, threshold=0.2), batch_id="x")
        b = run_episode(cfg, seed, make_policy("rules_v2_late", values=SHOWN, threshold=0.0, late_threshold=0.2, late_acts=[0, 1, 2]), batch_id="x")
        ra, rb = a.to_dict() if hasattr(a, "to_dict") else a.__dict__, b.to_dict() if hasattr(b, "to_dict") else b.__dict__
        ignore = {"policy", "wall_seconds"}
        assert {k: v for k, v in ra.items() if k not in ignore} == {k: v for k, v in rb.items() if k not in ignore}, seed
