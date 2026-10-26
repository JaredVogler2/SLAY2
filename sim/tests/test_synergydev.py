"""The selection rule of ADR-050's development stage, applied as written."""

from __future__ import annotations

import json

import pytest

from slay2_sim import synergydev as dev


def diffs(d1=0.0, d2=0.0, d3=0.0, d4=0.0):
    return {"d1": d1, "d2": d2, "d3": d3, "d4": d4}


def test_the_arm_with_the_largest_pooled_difference_is_chosen():
    assert dev.choose_configuration(diffs(0.01, 0.03, 0.02, 0.0)) == "d2"
    assert dev.choose_configuration(diffs(0.01, 0.02, 0.02, 0.05)) == "d4"


def test_arms_within_half_a_point_of_the_best_lose_to_the_lower_numbered_one():
    assert dev.choose_configuration(diffs(0.020, 0.024, 0.0249, 0.0)) == "d1"  # all within 0.5 points of 0.0249
    assert dev.choose_configuration(diffs(0.010, 0.024, 0.0249, 0.0)) == "d2"  # d1 is more than 0.5 points behind
    assert dev.choose_configuration(diffs(0.0, 0.0, 0.0, 0.0051)) == "d4"      # only d4 is within 0.5 points of the best


def test_when_no_arm_is_above_the_index_without_synergy_the_choice_is_d1():
    assert dev.choose_configuration(diffs(-0.01, -0.02, -0.03, -0.04)) == "d1"
    assert dev.choose_configuration(diffs(0.0, 0.0, 0.0, 0.0)) == "d1"


def test_a_skip_margin_is_chosen_only_when_it_beats_taking_what_the_index_ranks_first():
    assert dev.choose_margin({"m1": 0.03, "m2": 0.01}) == 1.5
    assert dev.choose_margin({"m1": 0.01, "m2": 0.04}) == 3.0
    assert dev.choose_margin({"m1": -0.01, "m2": -0.02}) == 0.0
    assert dev.choose_margin({"m1": 0.004, "m2": 0.003}) == 0.0  # within 0.5 points of margin 0: the lower margin
    assert dev.choose_margin({"m1": 0.030, "m2": 0.0349}) == 1.5  # a tie between the two margins goes to the lower


def test_the_pooled_file_is_read_the_way_its_fields_are_named(tmp_path):
    def pooled(a, b, ci):
        return {"reachedAct2": {"a": {"rate": a}, "b": {"rate": b}, "pairedTable": {"mcnemar_p": 0.01}},
                "clusteredDifference": {"ci95": ci}, "bothCompleted": 4990}

    for arm, a in (("d1", 0.50), ("d2", 0.54), ("d3", 0.52), ("d4", 0.47)):
        (tmp_path / f"{arm}-vs-d0-pooled.json").write_text(json.dumps(pooled(a, 0.45, [-0.01, 0.1])))
    out = tmp_path / "selection.json"
    assert dev.main(["--phase", "1", "--dir", str(tmp_path), "--out", str(out)]) == 0
    body = json.loads(out.read_text())
    assert body["chosen"] == "d2" and body["differences"]["d2"]["difference"] == pytest.approx(0.09)
    for arm, a in (("m1", 0.56), ("m2", 0.50)):
        (tmp_path / f"{arm}-vs-d2-pooled.json").write_text(json.dumps(pooled(a, 0.54, [-0.01, 0.1])))
    out2 = tmp_path / "selection2.json"
    assert dev.main(["--phase", "2", "--chosen", "d2", "--dir", str(tmp_path), "--out", str(out2)]) == 0
    assert json.loads(out2.read_text())["chosen_margin"] == 1.5
