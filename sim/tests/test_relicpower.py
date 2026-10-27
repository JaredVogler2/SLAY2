"""R4 (ADR-051 addendum A): the development pair that asks whether the relic reading could be tested with the website's own pilot.

The batches and the report are committed; nothing here runs the simulator.
"""

from __future__ import annotations

import json

import pytest

from slay2_sim import external, relicpower

ROOT = external.REPO_ROOT


def _manifest(cls: str, arm: str) -> dict:
    return json.loads((ROOT / "experiments" / "batches" / relicpower.batch_id(cls, arm) / "manifest.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("cls", relicpower.CLASSES)
def test_the_arms_differ_in_whether_the_pilot_counts_its_relics_and_in_nothing_else(cls):
    with_relics, without = _manifest(cls, "relics"), _manifest(cls, "norelics")
    assert with_relics["policy"]["name"] == without["policy"]["name"] == "advisor_v1"
    assert with_relics["policy"]["params"].pop("relics") is True
    assert "relics" not in without["policy"]["params"]
    assert with_relics["policy"]["params"] == without["policy"]["params"] == {"engines": 0, "margin": 0.0, "needs": 1, "scalers": 0.7}  # A*
    assert with_relics["config"] == without["config"] and with_relics["config"]["keep_relics"] is True
    assert with_relics["seeds"] == without["seeds"]
    assert with_relics["seeds"]["partition"] == "dev" and with_relics["seeds"]["offset"] == 500 and with_relics["seeds"]["n"] == 500
    for m in (with_relics, without):
        assert m["environment"]["slay2"]["dirty"] is False
    assert with_relics["environment"]["slay2"]["head"] == without["environment"]["slay2"]["head"]


def test_the_wins_are_re_derived_and_each_batch_has_its_sample_audit():
    for cls in relicpower.CLASSES:
        for arm in relicpower.ARMS:
            d = ROOT / "experiments" / "batches" / relicpower.batch_id(cls, arm)
            sample = json.loads((d / "sample-audit.json").read_text(encoding="utf-8"))
            assert sample["verified"] == sample["sample"]["drawn"] == 40 and sample["ledger"]["ok"]
            wins = _manifest(cls, arm)["summary"]["counts"]["win"]
            if wins:
                audit = json.loads((d / "wins-audit.json").read_text(encoding="utf-8"))
                assert audit["wins_in_batch"] == audit["wins_audited"] == audit["wins_verified"] == wins and audit["all_verified"]


def test_the_committed_report_is_what_the_batches_give():
    committed = json.loads((ROOT / "experiments" / "relics" / "dev-pair-power.json").read_text(encoding="utf-8"))
    assert relicpower.build_report() == committed
    assert committed["relic_synergy_table_sha256"].startswith("836676b1dafe")  # the table the pilot read is the one ADR-051 freezes


def test_the_power_grows_with_the_effect_and_is_low_for_a_small_one():
    p = relicpower.power_table({
        "boss_decks": {"pairs": 1000, "deck_differs": 30, "relics_arm_holds_a_tagged_relic": 500, "index_parts_differ_with_relics": 100},
        "past_act1_boss": {"only_relics": 4, "only_norelics": 5},
    })
    powers = [p["by_effect"][k]["power"] for k in ("0.02", "0.05", "0.10")]
    assert powers == sorted(powers) and powers[0] < 0.25 and powers[-1] > 0.5
    assert p["expected_games_that_play_differently"] == 300.0  # 3 % of 10,000 pairs
