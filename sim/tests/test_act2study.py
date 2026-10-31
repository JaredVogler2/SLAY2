"""The Act-2 study's development screen (ADR-060 item 5) and the determinism record: the selection rule on synthetic batches with known answers."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest
from slay2_sim import act2study as st
from slay2_sim import external
from test_compare import make_batch

REPO = external.REPO_ROOT
N = st.DEV_N


def act_of(i: int, extra_to_act3: int = 0, lose_act3: int = 0, act1_break: int = -1) -> int:
    """The act a run of seed i ended in. The baseline: 1 seed in 4 past the Act-2 boss (act 2), 1 in 2 past the Act-1 boss only (act 1), 1 in 4 died in Act 1."""
    base = 2 if i % 4 == 0 else 1 if i % 4 in (1, 2) else 0
    if extra_to_act3 and base == 1 and i % extra_to_act3 == 1:
        return 2                      # one more run past the Act-2 boss, Act 1 untouched
    if lose_act3 and base == 2 and i % lose_act3 == 0:
        return 1
    if i == act1_break:
        return 0 if base else 1       # a pair in which the Act-1 boss went differently: the arms were not identical in Act 1
    return base


def write_dev(root: Path, arm: str, only: frozenset[str] | None = None, **kw) -> None:
    """One development batch per class; ``only`` limits the change to those classes (the others are played exactly as S plays them)."""
    for cls in st.CLASSES:
        rows = [(i, "death", 40, 1.0, act_of(i, **({} if only is not None and cls not in only else kw))) for i in range(N)]
        make_batch(root, st.dev_id(arm, cls), rows, character=cls)


def values(root: Path, fitted: dict[str, bool]) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    for cls, ok in fitted.items():
        (root / f"{cls.lower()}-a0-act2-v1.json").write_text(json.dumps({"fitted": ok}), encoding="utf-8")
    return root


def build(tmp_path: Path, **per_arm) -> Path:
    root = tmp_path / "batches"
    root.mkdir(parents=True)
    write_dev(root, "s")
    spec = {"pall": {}, "p010": {}, "p020": {}, "p035": {}, "p050": {}, "pnone": {}, "lead": {}, **per_arm}
    for arm, kw in spec.items():
        write_dev(root, arm, **kw)
    return root


def test_the_ids_are_the_ones_the_scripts_use():
    out = subprocess.run(
        ["bash", "-c", 'source scripts/studies/act2/common.sh; dev_id p020 Necrobinder; val_id lead Ironclad; echo "$DEV_OFFSET $DEV_N $VAL_N"'],
        cwd=REPO, capture_output=True, text=True, check=True, env={"PATH": "/usr/bin:/bin", "OUT": "/tmp/act2-test"},
    ).stdout.split("\n")
    assert out[0] == st.dev_id("p020", "Necrobinder") and out[1] == st.val_id("lead", "Ironclad")
    assert out[2] == f"{st.DEV_OFFSET} {st.DEV_N} {st.VAL_N}"
    thresholds = subprocess.run(
        ["bash", "-c", 'source scripts/studies/act2/common.sh; for t in $P_TAGS; do echo "$t $(p_threshold $t)"; done'],
        cwd=REPO, capture_output=True, text=True, check=True, env={"PATH": "/usr/bin:/bin", "OUT": "/tmp/act2-test"},
    ).stdout.split("\n")[:-1]
    assert {k: float(v) for k, v in (line.split() for line in thresholds)} == st.P_TAGS


def test_the_eligible_candidate_with_the_largest_gain_goes_forward_and_ties_go_to_the_smaller_threshold(tmp_path):
    # p020, p035 and pall each get one more run in 16 past the Act-2 boss; p050 one in 64; pnone loses runs; p010 is the baseline
    root = build(tmp_path, pall={"extra_to_act3": 16}, p020={"extra_to_act3": 16}, p035={"extra_to_act3": 16}, p050={"extra_to_act3": 64}, pnone={"lose_act3": 8})
    sel = st.select(root, values(tmp_path / "values", dict.fromkeys(st.CLASSES, False)))
    arms = sel["arms"]
    assert arms["p010"]["difference"] == 0 and arms["p010"]["eligible"] is False
    assert arms["pnone"]["difference"] < 0 and arms["pnone"]["eligible"] is False
    assert arms["p050"]["eligible"] is True and 0 < arms["p050"]["difference"] < arms["p020"]["difference"]
    assert arms["p020"]["difference"] == arms["p035"]["difference"] == arms["pall"]["difference"] > 0
    assert sel["P"] == {"advance": True, "arm": "p020", "lateThreshold": 0.2}   # the tie goes to the smaller |threshold|
    assert sel["actOneIdentical"] is True and arms["p020"]["actOneDiffers"] == 0
    assert arms["p020"]["identity"] == {"actZeroPairs": 5 * (N // 4), "actZeroDifferent": 0, "wholeDifferent": 0} and "identity" not in arms["lead"]
    assert sel["V"] == {"advance": False, "anyClassFitted": False} and "v" not in arms   # no class kept fitted values: V is S
    assert sel["L"] == {"advance": True} and arms["lead"]["eligible"] is False


def test_nothing_eligible_means_no_late_rule_goes_to_the_held_out_test(tmp_path):
    root = build(tmp_path, pnone={"lose_act3": 8}, p050={"lose_act3": 4})
    sel = st.select(root, values(tmp_path / "values", dict.fromkeys(st.CLASSES, False)))
    assert sel["P"] == {"advance": False, "arm": None, "lateThreshold": None}
    assert sel["L"]["advance"] is True   # the lead is always tested


def test_eligibility_is_a_higher_share_and_a_p_below_the_screen_level_with_both_boundaries_strict():
    assert st.SCREEN_ALPHA == 0.10
    assert st.eligible({"difference": 0.002, "p": 0.0999}) is True
    assert st.eligible({"difference": 0.002, "p": 0.10}) is False         # at the level is not below it
    assert st.eligible({"difference": 0.0, "p": 0.001}) is False          # not higher
    assert st.eligible({"difference": -0.01, "p": 0.001}) is False        # a significant loss is not a gain
    assert st.eligible({"difference": 1e-9, "p": 0.05}) is True


def test_five_pairs_in_one_direction_pass_the_generous_screen_which_is_what_it_is_for(tmp_path):
    # the exact p of 5 against 0 is 0.0625: the screen (0.10) lets it through, and the held-out test (0.0167) would not
    root = build(tmp_path, p035={"extra_to_act3": 1000})
    sel = st.select(root, values(tmp_path / "values", dict.fromkeys(st.CLASSES, False)))
    row = sel["arms"]["p035"]
    assert (row["armOnly"], row["baselineOnly"]) == (5, 0) and row["p"] == pytest.approx(0.0625) and row["eligible"] is True


def test_the_act_2_values_go_forward_only_if_eligible_and_some_class_kept_its_fit(tmp_path):
    root = build(tmp_path, v={"extra_to_act3": 16, "only": frozenset({"Ironclad"})})
    # the v batches exist (the changed ones are the fitted class's); the rule reads the committed value files for the gate
    sel = st.select(root, values(tmp_path / "v1", {**dict.fromkeys(st.CLASSES, False), "Ironclad": True}))
    assert sel["V"] == {"advance": True, "anyClassFitted": True} and sel["arms"]["v"]["eligible"] is True
    quiet = build(tmp_path / "second", v={})   # V identical to S: nothing to test even though a class kept its fit
    sel = st.select(quiet, values(tmp_path / "v2", {**dict.fromkeys(st.CLASSES, False), "Defect": True}))
    assert sel["V"]["advance"] is False and sel["arms"]["v"]["difference"] == 0 and sel["arms"]["v"]["p"] == 1.0


def test_arms_that_are_not_identical_to_the_baseline_in_act_one_stop_the_study(tmp_path):
    root = build(tmp_path, p010={"act1_break": 5})
    with pytest.raises(st.StudyStop, match=r"p010: 5 pairs differ about the Act-1 boss"):   # the seed is in all five classes
        st.select(root, values(tmp_path / "values", dict.fromkeys(st.CLASSES, False)))
    # the lead differs from S in Act 1 by design: its own row is not part of the check
    ok = build(tmp_path / "ok", lead={"act1_break": 5})
    assert st.select(ok, values(tmp_path / "ok-values", dict.fromkeys(st.CLASSES, False)))["actOneIdentical"] is True


def rewrite(root: Path, arm: str, cls: str, seed: int, **fields) -> None:
    """Change fields of one game of a development batch (the binary outcomes stay as they were)."""
    f = root / st.dev_id(arm, cls) / "episodes.jsonl"
    rows = [json.loads(line) for line in f.read_text().splitlines()]
    for r in rows:
        if r["seed"] == seed:
            r.update(fields)
    f.write_text("\n".join(json.dumps(r) for r in rows) + "\n")


def test_a_game_that_s_ended_in_act_one_must_be_the_same_record_even_if_the_binary_outcome_agrees(tmp_path):
    root = build(tmp_path)
    rewrite(root, "p035", "Regent", 3, floor=9)     # seed 3 ends in Act 1 in S (floor 40 in these synthetic rows; both are 'not past the Act-1 boss')
    with pytest.raises(st.StudyStop, match=r"p035: 1 of \d+ games that S ended in Act 1 differ"):
        st.select(root, values(tmp_path / "values", dict.fromkeys(st.CLASSES, False)))
    # a game S took into Act 2 may differ, and does not stop the study
    ok = build(tmp_path / "ok")
    rewrite(ok, "p035", "Regent", 4, floor=44)
    assert st.select(ok, values(tmp_path / "ok-values", dict.fromkeys(st.CLASSES, False)))["P"]["advance"] is False


def test_a_class_that_kept_its_shown_values_must_play_every_game_of_s_in_the_refit_arm(tmp_path):
    root = build(tmp_path, v={})
    fitted = {**dict.fromkeys(st.CLASSES, False), "Ironclad": True}
    ok = st.select(root, values(tmp_path / "values", fitted))
    assert ok["arms"]["v"]["identity"]["wholeDifferent"] == 0
    rewrite(root, "v", "Silent", 4, floor=44)        # an Act-2 game of an unfitted class that is not S's game
    with pytest.raises(st.StudyStop, match=r"v: 0 of \d+ games that S ended in Act 1 differ, 1 games of a class that kept its shown values differ"):
        st.select(root, values(tmp_path / "values2", fitted))
    # the same change in the fitted class is allowed
    ok2 = build(tmp_path / "ok2", v={})
    rewrite(ok2, "v", "Ironclad", 4, floor=44)
    assert st.select(ok2, values(tmp_path / "ok2-values", fitted))["arms"]["v"]["identity"]["wholeDifferent"] == 0


def test_the_dev_command_stops_without_writing_a_selection_and_the_identity_command_checks_the_held_out_arms(tmp_path, capsys):
    root = build(tmp_path, p010={"act1_break": 5})
    out = tmp_path / "sel.json"
    vals = values(tmp_path / "values", dict.fromkeys(st.CLASSES, False))
    assert st.main(["dev", "--batches", str(root), "--values", str(vals), "--out", str(out)]) == 1
    assert not out.exists() and "STOP:" in capsys.readouterr().err
    # the held-out arms: P (the one the selection names) and V, in val batches
    held = tmp_path / "held"
    held.mkdir()
    for cls in st.CLASSES:
        make_batch(held, st.val_id("s", cls), [(i, "death", 40, 1.0, act_of(i)) for i in range(N)], character=cls)
        make_batch(held, st.val_id("p020", cls), [(i, "death", 40, 1.0, act_of(i, extra_to_act3=16)) for i in range(N)], character=cls)
        make_batch(held, st.val_id("v", cls), [(i, "death", 40, 1.0, act_of(i)) for i in range(N)], character=cls)
    sel = tmp_path / "selection.json"
    sel.write_text(json.dumps({"P": {"advance": True, "arm": "p020"}, "V": {"advance": True}}))
    fitted = values(tmp_path / "fit", {**dict.fromkeys(st.CLASSES, False), "Defect": True})
    for test in ("P", "V"):
        report = tmp_path / f"{test}.json"
        args = [test, "--batches", str(held), "--values", str(fitted), "--selection", str(sel), "--out", str(report)]
        assert st.main(["identity", *args]) == 0
        body = json.loads(report.read_text())
        assert body["kind"] == "act2-identity" and body["actZeroDifferent"] == 0 and body["wholeDifferent"] == 0 and body["actZeroPairs"] > 0
    assert st.main(["identity", "L", "--batches", str(held), "--values", str(fitted), "--selection", str(sel), "--out", str(tmp_path / "L.json")]) == 0
    # a game of an unfitted class that differs: the identity check fails (the study stops)
    f = held / st.val_id("v", "Silent") / "episodes.jsonl"
    rows = [json.loads(line) for line in f.read_text().splitlines()]
    rows[4]["steps"] = 1
    f.write_text("\n".join(json.dumps(r) for r in rows) + "\n")
    assert st.main(["identity", "V", "--batches", str(held), "--values", str(fitted), "--selection", str(sel), "--out", str(tmp_path / "V2.json")]) == 1


def test_the_determinism_record_counts_identical_and_different_episodes_and_ignores_the_wall_clock(tmp_path):
    # the same policy name in both (the batch id differs in real life and is ignored; the policy name is part of an episode record)
    a = make_batch(tmp_path / "one", "act2-s-x", [(1, "death", 20, 1.0, 1), (2, "death", 40, 1.0, 2), (3, "win", 51, 1.0, 2)])
    b = make_batch(tmp_path / "two", "act2-s-x", [(1, "death", 20, 9.9, 1), (2, "death", 41, 1.0, 2), (3, "win", 51, 1.0, 2), (4, "death", 10, 1.0, 0)])
    rec = st.determinism(a, b)
    assert rec["shared"] == 3 and rec["identical"] == 2 and rec["different"] == 1 and rec["differingSeeds"] == [2]
    assert rec["fieldsThatDiffer"] == {"floor": 1} and rec["seedsReplayed"] == 3 and rec["seedsEarlier"] == 4
    out = tmp_path / "d.json"
    assert st.main(["determinism", str(a), str(b), "--out", str(out)]) == 0 and json.loads(out.read_text())["different"] == 1   # a finding, not an error
    assert st.main(["determinism", str(a), str(a)]) == 0


def test_the_screen_writes_a_file_and_prints_the_rule_s_verdict(tmp_path, capsys):
    root = build(tmp_path, p035={"extra_to_act3": 16})
    out = tmp_path / "sel.json"
    assert st.main(["dev", "--batches", str(root), "--values", str(values(tmp_path / "values", dict.fromkeys(st.CLASSES, False))), "--out", str(out)]) == 0
    body = json.loads(out.read_text(encoding="utf-8"))
    assert body["P"]["arm"] == "p035" and body["slice"] == {"partition": "dev", "offset": 1000, "n": 600} and body["role"].startswith("development")
    assert "ELIGIBLE" in capsys.readouterr().out
