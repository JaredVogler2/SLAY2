"""rules_v2: card rewards chosen by measured values (a values file), everything else rules_v1."""

from __future__ import annotations

import hashlib
import json

import pytest

from slay2_sim.policies import make_policy
from slay2_sim.policies.rules2 import MAX_DECK, load_values

from test_policy_fairness import decide, sample_points, twins


def write_values(path, betas: dict[str, float]):
    path.write_text(json.dumps({"kind": "card-values", "cards": [{"id": k, "beta": v} for k, v in betas.items()]}))
    return str(path)


def reward(offered: list[str], deck_size: int = 12):
    deck = [["STRIKE_IRONCLAD", False, deck_size]]
    obs = {"run": {"deck": deck}}
    actions = [{"action": "pick_card", "idx": i, "card_id": c} for i, c in enumerate(offered)]
    actions.append({"action": "skip", "idx": len(offered)})
    return obs, actions


def test_load_values_rejects_other_files_and_hashes_the_file(tmp_path):
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"kind": "something-else", "cards": []}))
    with pytest.raises(ValueError):
        load_values(str(bad))
    good = write_values(tmp_path / "v.json", {"BASH": 0.5})
    betas, rel, digest = load_values(good)
    assert betas == {"BASH": 0.5} and digest == hashlib.sha256((tmp_path / "v.json").read_bytes()).hexdigest()


def test_it_takes_the_best_measured_card_when_it_beats_the_threshold(sim, tmp_path):
    p = make_policy("rules_v2", values=write_values(tmp_path / "v.json", {"ANGER": 0.7, "BASH": 0.2, "HAVOC": -0.3}))
    p.reset(1)
    obs, actions = reward(["BASH", "ANGER", "HAVOC"])
    assert p._card_reward(obs, actions) == 1


def test_it_skips_when_nothing_beats_the_threshold_and_treats_unknown_cards_as_neutral(sim, tmp_path):
    p = make_policy("rules_v2", values=write_values(tmp_path / "v.json", {"HAVOC": -0.3}), threshold=0.0)
    p.reset(1)
    obs, actions = reward(["HAVOC", "SOME_UNMEASURED_CARD"])
    assert p._card_reward(obs, actions) == 2  # skip
    strict = make_policy("rules_v2", values=write_values(tmp_path / "w.json", {"ANGER": 0.1}), threshold=0.3)
    strict.reset(1)
    obs, actions = reward(["ANGER"])
    assert strict._card_reward(obs, actions) == 1


def test_a_full_deck_stops_taking_cards(sim, tmp_path):
    p = make_policy("rules_v2", values=write_values(tmp_path / "v.json", {"ANGER": 2.0}))
    p.reset(1)
    obs, actions = reward(["ANGER"], deck_size=MAX_DECK)
    assert p._card_reward(obs, actions) == 1  # skip: the deck is at the cap


def test_the_values_file_is_recorded_in_the_policy_parameters(sim, tmp_path):
    f = write_values(tmp_path / "v.json", {"ANGER": 0.7})
    p = make_policy("rules_v2", values=f, threshold=0.1)
    d = p.describe()
    assert d["params"]["threshold"] == 0.1 and len(d["params"]["values_sha256"]) == 64


def test_effective_parameters_rebuild_the_same_policy_and_refuse_a_different_values_file(sim, tmp_path):
    f = write_values(tmp_path / "v.json", {"ANGER": 0.7})
    effective = make_policy("rules_v2", values=f, threshold=0.1).describe()["params"]
    again = make_policy("rules_v2", **{**effective, "values": f})  # what the win audit does with a manifest
    assert again.describe()["params"] == effective
    write_values(tmp_path / "v.json", {"ANGER": -0.7})  # the file changed after the batch was run
    with pytest.raises(ValueError, match="was recorded"):
        make_policy("rules_v2", **{**effective, "values": f})


def test_a_batch_manifest_names_the_resolved_policy_parameters(sim, tmp_path):
    from slay2_sim.batch import _effective

    f = write_values(tmp_path / "v.json", {"ANGER": 0.7})
    eff = _effective("rules_v2", {"values": f, "threshold": 0.2})
    assert eff["params"]["values_sha256"] == hashlib.sha256((tmp_path / "v.json").read_bytes()).hexdigest()
    assert eff["params"]["threshold"] == 0.2 and eff["version"] == "1"
    assert "error" in _effective("rules_v2", {"values": str(tmp_path / "missing.json")})  # never hides a finished batch


def test_the_committed_values_file_is_what_adr_031_pre_registered():
    betas, rel, digest = load_values("experiments/cardvalue/ironclad-a0-v1.json")
    assert rel == "experiments/cardvalue/ironclad-a0-v1.json"
    assert digest.startswith("8b3fe2f4d88b87dc"), "ADR-031 names this hash; a new fit is a new file (v2), not an edit"
    assert betas["RAMPAGE"] > 1.0 and len(betas) == 95


def test_round_two_explorer_follows_the_measured_values_unless_it_explores(sim, tmp_path):
    f = write_values(tmp_path / "v.json", {"ANGER": 0.7, "BASH": 0.2})
    obs, actions = reward(["BASH", "ANGER"])
    quiet = make_policy("rules_explore_v2", values=f, explore=0.0)
    quiet.reset(5)
    assert quiet._card_reward(obs, actions) == 1  # the best measured card, exactly as rules_v2
    assert quiet.describe()["params"]["explore"] == 0.0 and len(quiet.describe()["params"]["values_sha256"]) == 64
    wild = make_policy("rules_explore_v2", values=f, explore=1.0)
    wild.reset(5)
    seen = {wild._card_reward(obs, actions) for _ in range(60)}
    assert seen == {0, 1, 2}, "with explore=1 every offered card and skip is picked sometimes"
    assert wild.random_picks == 60


def test_rules_v2_ignores_hidden_state(sim, tmp_path):
    f = write_values(tmp_path / "v.json", {"ANGER": 0.7, "BASH": 0.2, "INFLAME": 0.4})
    pts = []
    for seed in (31, 32, 33):
        pts.extend(sample_points(seed))
    for i, point in enumerate(pts):
        a, b = twins(point, 21000 + i)
        assert decide("rules_v2", a, values=f) == decide("rules_v2", b, values=f), f"point {i} ({point.phase})"
