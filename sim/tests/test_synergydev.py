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


def selection_files(tmp_path, *, chosen="d2", margin=1.5, phase1=None, phase2=None):
    one = phase1 or {"d1": 0.004, "d2": 0.020, "d3": 0.012, "d4": 0.006}
    two = phase2 or {"m1": 0.010 if margin == 1.5 else -0.004, "m2": 0.011 if margin == 3.0 else -0.01}
    point = lambda d: {"difference": d, "a_rate": 0.5 + d, "b_rate": 0.5, "ci95": [d - 0.01, d + 0.01], "pairs": 4900, "mcnemar_p": 0.2}
    (tmp_path / "selection-phase1.json").write_text(
        json.dumps({"phase": 1, "baseline": "d0", "differences": {a: point(d) for a, d in one.items()}, "chosen": chosen}), encoding="utf-8"
    )
    (tmp_path / "selection-phase2.json").write_text(
        json.dumps({"phase": 2, "baseline": chosen, "differences": {a: point(d) for a, d in two.items()}, "chosen_margin": margin}), encoding="utf-8"
    )


def test_a_star_is_the_chosen_configuration_with_the_chosen_margin(tmp_path):
    selection_files(tmp_path, chosen="d2", margin=1.5)
    assert dev.astar(tmp_path) == {"needs": 1, "scalers": 0.7, "engines": 0.25, "margin": 1.5}
    selection_files(tmp_path, chosen="d2", margin=0.0, phase2={"m1": -0.004, "m2": -0.01})
    assert dev.astar(tmp_path) == {"needs": 1, "scalers": 0.7, "engines": 0.25, "margin": 0.0}


def test_a_star_is_refused_when_a_selection_file_does_not_say_what_the_rule_chooses_from_its_numbers(tmp_path):
    selection_files(tmp_path, chosen="d4")  # the numbers choose d2
    with pytest.raises(ValueError, match="rule chooses d2"):
        dev.astar(tmp_path)
    selection_files(tmp_path, chosen="d2", margin=3.0, phase2={"m1": 0.02, "m2": 0.0})  # the numbers choose margin 1.5
    with pytest.raises(ValueError, match="the rule chooses 1.5 on d2"):
        dev.astar(tmp_path)


def test_the_command_prints_a_star_as_json(tmp_path, capsys):
    selection_files(tmp_path)
    assert dev.main(["--astar", "--dir", str(tmp_path)]) == 0
    assert json.loads(capsys.readouterr().out) == {"needs": 1, "scalers": 0.7, "engines": 0.25, "margin": 1.5}
    with pytest.raises(SystemExit):
        dev.main(["--dir", str(tmp_path)])  # neither a phase nor --astar


def test_the_arms_the_scripts_run_are_the_arms_the_program_chooses_among():
    import re
    from pathlib import Path

    common = (Path(__file__).resolve().parents[2] / "scripts" / "studies" / "synergy" / "common.sh").read_text(encoding="utf-8")
    shell = {arm: json.loads(body) for arm, body in re.findall(r"(d[1-4])\) echo '(\{.*?\})' ;;", common)}
    assert shell == dev.ARM_PARAMS


def test_the_command_prints_an_arms_parameters_as_the_fragment_the_dev_script_takes(capsys):
    assert dev.main(["--fragment", "d2"]) == 0
    assert capsys.readouterr().out.strip() == '"needs":1,"scalers":0.7,"engines":0.25'
    assert json.loads("{" + '"needs":1,"scalers":0.7,"engines":0.25' + "}") == dev.ARM_PARAMS["d2"]
    with pytest.raises(SystemExit):
        dev.main(["--fragment", "d9"])
