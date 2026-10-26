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


def test_rules_v2_ignores_hidden_state(sim, tmp_path):
    f = write_values(tmp_path / "v.json", {"ANGER": 0.7, "BASH": 0.2, "INFLAME": 0.4})
    pts = []
    for seed in (31, 32, 33):
        pts.extend(sample_points(seed))
    for i, point in enumerate(pts):
        a, b = twins(point, 21000 + i)
        assert decide("rules_v2", a, values=f) == decide("rules_v2", b, values=f), f"point {i} ({point.phase})"
