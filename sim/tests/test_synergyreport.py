"""The arm profile of stage B2: the card-screen counters and the deck parts it reports are the ones the games hold."""

from __future__ import annotations

import json

import numpy as np
import pytest

from slay2_sim import synergyreport as report
from slay2_sim.synergystudy import deck_features

PLAIN = {"STRIKE_IRONCLAD": 5, "DEFEND_IRONCLAD": 4, "BASH": 1}
WAITING = {"STRIKE_IRONCLAD": 5, "DEFEND_IRONCLAD": 4, "FEEL_NO_PAIN_CARD": 1}  # a payoff of Exhaust with nothing to feed it
FED = {"STRIKE_IRONCLAD": 5, "DEFEND_IRONCLAD": 4, "FEEL_NO_PAIN_CARD": 1, "BURNING_PACT": 1}


def episode(seed, deck=None, outcome="death", offers=4, skipped=0, floor=10):
    extra: dict = {"advisor": {"offers": offers, "taken": offers - skipped, "skipped": skipped, "unscored": 0}}
    if deck is not None:
        extra["boss_fights"] = [{"act": 0, "boss": ["BOSS"], "hp": 40, "max_hp": 80, "potions": 1, "relics": ["BURNING_BLOOD"], "floor": 16, "deck": deck}]
    return {"seed": seed, "outcome": outcome, "floor": floor, "extra": extra}


def test_a_game_row_holds_the_counters_and_the_parts_of_the_deck_it_brought_to_the_boss():
    rows = report.game_rows([episode(1, WAITING, offers=5, skipped=2), episode(2, None, offers=3)], "ironclad")
    assert [r["seed"] for r in rows] == [1, 2]
    assert (rows[0]["offers"], rows[0]["taken"], rows[0]["skipped"]) == (5, 3, 2)
    expected = deck_features(WAITING, "ironclad")
    assert rows[0]["boss"]["unmet"] == pytest.approx(expected["unmet"])
    assert rows[0]["boss"]["unmet"] < 0
    assert rows[0]["boss"]["deck_size"] == sum(WAITING.values())
    assert rows[1]["boss"] is None  # a game that never reached the boss has no deck to read


def test_a_game_that_did_not_finish_is_left_out():
    rows = report.game_rows([episode(1, PLAIN), episode(2, PLAIN, outcome="simulator_error"), episode(3, PLAIN, outcome="timeout")], "ironclad")
    assert [r["seed"] for r in rows] == [1]


def test_upgrades_fold_into_the_card_and_the_simulators_card_suffix_is_read_as_the_catalog_card():
    a = report.game_rows([episode(1, {"FEEL_NO_PAIN_CARD+": 1, "STRIKE_IRONCLAD": 5})], "ironclad")[0]["boss"]
    b = report.game_rows([episode(1, {"FEEL_NO_PAIN_CARD": 1, "STRIKE_IRONCLAD": 5})], "ironclad")[0]["boss"]
    assert a == b


def test_a_mean_has_an_interval_that_resamples_seeds_and_covers_the_mean():
    rng = np.random.default_rng(0)
    values = np.random.default_rng(1).normal(2.0, 1.0, size=300)
    out = report.bootstrap(values, np.arange(300), rng)
    assert out["n"] == 300 and out["mean"] == pytest.approx(values.mean())
    assert out["ci95"][0] < out["mean"] < out["ci95"][1]
    assert out["ci95"][1] - out["ci95"][0] < 0.5
    assert report.bootstrap(np.array([]), np.array([]), rng) == {"n": 0, "mean": None, "ci95": None}


def test_rows_that_share_a_seed_are_resampled_together_so_duplicating_every_row_does_not_narrow_the_interval():
    rng = np.random.default_rng(0)
    values = np.random.default_rng(2).normal(0.0, 1.0, size=200)
    alone = report.bootstrap(values, np.arange(200), np.random.default_rng(0))
    doubled = report.bootstrap(np.repeat(values, 2), np.repeat(np.arange(200), 2), np.random.default_rng(0))
    assert (doubled["ci95"][1] - doubled["ci95"][0]) > 0.9 * (alone["ci95"][1] - alone["ci95"][0])
    assert report.bootstrap(values, np.zeros(200, dtype=int), rng)["ci95"][0] == pytest.approx(values.mean())  # one seed: nothing to resample


def test_a_skip_rate_is_skips_over_offers():
    rows = [("ironclad", {"seed": i, "offers": 4, "taken": 3, "skipped": 1, "boss": None}) for i in range(100)]
    out = report.summarise(rows, np.random.default_rng(0))
    assert out["skipped"] == 100 and out["offers"] == 400
    assert out["skip_rate"]["value"] == pytest.approx(0.25)
    assert out["skip_rate"]["ci95"][0] == pytest.approx(0.25) and out["skip_rate"]["ci95"][1] == pytest.approx(0.25)
    assert out["boss_decks"] == 0 and out["at_boss"]["unmet"]["mean"] is None


def test_the_difference_between_two_arms_is_paired_by_class_and_seed_over_games_with_a_deck_in_both():
    a = {"ironclad": report.game_rows([episode(1, FED), episode(2, FED), episode(3, None)], "ironclad")}
    b = {"ironclad": report.game_rows([episode(1, WAITING), episode(2, None), episode(3, WAITING)], "ironclad")}
    out = report.paired_differences(a, b, np.random.default_rng(0))
    assert out["pooled"]["pairs"] == 1  # only seed 1 brought a deck to the boss in both arms
    expected = deck_features(FED, "ironclad")["unmet"] - deck_features(WAITING, "ironclad")["unmet"]
    assert out["pooled"]["measures"]["unmet"]["mean"] == pytest.approx(expected)
    assert expected > 0  # feeding the payoff holds back less
    assert out["pooled"]["measures"]["deck_size"]["mean"] == pytest.approx(sum(FED.values()) - sum(WAITING.values()))


def _batch(root, name, character, episodes):
    folder = root / name
    folder.mkdir(parents=True)
    (folder / "episodes.jsonl").write_text("\n".join(json.dumps(e) for e in episodes) + "\n", encoding="utf-8")
    (folder / "manifest.json").write_text(
        json.dumps({"batch_id": name, "config": {"character": character}, "episodes_gz": {"sha256": "0" * 64}, "policy": {"name": "advisor_v1"}}), encoding="utf-8"
    )


def test_the_command_reads_five_classes_per_arm_and_writes_what_it_found(tmp_path, capsys):
    exact = {"ironclad": "Ironclad", "silent": "Silent", "regent": "Regent", "necrobinder": "Necrobinder", "defect": "Defect"}
    decks = {"ironclad": WAITING, "silent": {"STRIKE_SILENT": 5, "DEFEND_SILENT": 5}, "regent": {"STRIKE_REGENT": 5, "DEFEND_REGENT": 5},
             "necrobinder": {"STRIKE_NECROBINDER": 5, "DEFEND_NECROBINDER": 5}, "defect": {"STRIKE_DEFECT": 5, "DEFEND_DEFECT": 5}}
    for arm, skips in (("one", 1), ("two", 0)):
        for c, label in exact.items():
            _batch(tmp_path, f"{arm}-{c}", label, [episode(s, decks[c], skipped=skips) for s in range(1, 4)])
    out = tmp_path / "profile.json"
    status = report.main(["--arm", "one", str(tmp_path / "one-{class}"), "--arm", "two", str(tmp_path / "two-{class}"), "--diff", "one", "two", "--out", str(out)])
    assert status == 0
    body = json.loads(out.read_text(encoding="utf-8"))
    assert body["kind"] == "arm-profile" and set(body["arms"]) == {"one", "two"}
    assert set(body["arms"]["one"]["classes"]) == set(exact)
    assert body["arms"]["one"]["pooled"]["games"] == 15 and body["arms"]["one"]["pooled"]["skipped"] == 15
    assert body["arms"]["two"]["pooled"]["skipped"] == 0
    assert body["differences"]["one-vs-two"]["pooled"]["pairs"] == 15
    assert body["arms"]["one"]["batches"]["ironclad"]["batch_id"] == "one-ironclad"
    printed = capsys.readouterr().out
    assert "one: 15 games" in printed and "one-vs-two" in printed


def test_a_batch_played_as_another_class_is_refused(tmp_path):
    for c in report.CLASSES:
        _batch(tmp_path, f"x-{c}", "Ironclad", [episode(1, PLAIN)])  # every folder claims to be Ironclad
    with pytest.raises(ValueError, match="not as silent"):
        report.read_arm(str(tmp_path / "x-{class}"))
