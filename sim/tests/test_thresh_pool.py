"""`scripts/studies/thresh/pool.sh` end to end on a throwaway repository of synthetic batches (ADR-062 items 4, 5 and 10).

The script refuses to run unless every held-out batch is finished and audited, writes each class's comparison, the pooled tests at the wins endpoint with the
interval at the level of the tests the screen leaves (T1 alone at 0.05; T1, T2 and T3 at 0.05 / 3), the identity checks of the arms that are S until the first
card reward of Act 2 and the all-pairs analysis, and runs each of them once.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from slay2_sim import external
from test_compare import make_batch

REPO = external.REPO_ROOT
CLASSES = ["ironclad", "defect"]
EXACT = {c: c.capitalize() for c in CLASSES}
N = 400
SEEDS_INFO = {"file_sha256": "s" * 64, "partition": "val3"}


def val_id(arm: str, cls: str) -> str:
    return f"thresh-val-{arm}-{cls}-a0-veteran-keeprelics-val3-n10000"


def git(work: Path, cmd: str) -> None:
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["bash", "-c", cmd], cwd=work, env=env, capture_output=True, text=True, check=True)


def run(work: Path, *args: str) -> subprocess.CompletedProcess:
    env = {**os.environ, "PY": sys.executable, "OUT": str(work / "artifacts" / "thresh"), "PYTHONPATH": ""}
    return subprocess.run(["bash", "scripts/studies/thresh/pool.sh", *args], cwd=work, env=env, capture_output=True, text=True)


def record(i: int, arm: str) -> tuple:
    """(outcome, floor, act) of seed ``i`` for an arm. The baseline S wins one seed in 25; of the rest, a quarter end in Act 1 (index 0), half in Act 2 (index 1) and
    a quarter in Act 3 (index 2). The arms are S until the first card reward of Act 2, so they agree with S about every game S ended in Act 1 and about the Act-1 boss;
    they differ in the games S took further: 0.2 wins one more seed in 20 of those S ended in Act 2, 0.3 two in 20, and 0.3 loses one of every four of S's wins."""
    if i % 25 == 0:
        base: tuple = ("win", 51, 2)
    else:
        a = 2 if i % 4 == 0 else 1 if i % 4 in (1, 2) else 0
        base = ("death", 10 + 12 * a + (5 if a == 2 else 0), a)
    if arm == "s":
        return base
    if base[0] == "win":
        return ("death", 40, 2) if arm == "t030" and i % 100 == 0 else base
    if base[2] == 1 and ((arm == "t020" and i % 20 == 1) or (arm == "t030" and i % 20 in (1, 5))):
        return ("win", 51, 2)
    return base


def selection(advance: str | None) -> dict:
    return {"designChecksPassed": True, "arms": {}, "choice": {"advance": advance is not None, "arm": advance}}


def build(tmp: Path, advance: str | None = "t030", audited: bool = True) -> Path:
    work = tmp / "work"
    (work / "sim").mkdir(parents=True)
    for rel in ("scripts/lib/thresh.mjs", "scripts/lib/pooled.mjs", "packages/game-data/data/stub.txt", "experiments/cardvalue/stub.txt", "experiments/seeds/stub.txt", "external/pins.json"):
        (work / rel).parent.mkdir(parents=True, exist_ok=True)
        (work / rel).write_text("stub " + rel + "\n")
    shutil.copy(REPO / "scripts" / "verify-pooled.py", work / "scripts" / "verify-pooled.py")    # the real independent verifier: pool.sh runs it
    (work / ".gitignore").write_text("__pycache__/\n*.pyc\n")             # as the repository's own: the interpreter's caches are not untracked files
    (work / "docs").mkdir()
    (work / "docs" / "DECISIONS.md").write_text("## 2026-11-02 — ADR-062: the study\n\nThe frozen choices are headed 'Frozen choices of ADR-062 (part 2)'.\n")
    (work / "experiments" / "thresh").mkdir(parents=True)
    (work / "experiments" / "thresh" / "dev-selection.json").write_text(json.dumps(selection(advance)))
    shutil.copytree(REPO / "sim" / "slay2_sim", work / "sim" / "slay2_sim", ignore=shutil.ignore_patterns("__pycache__", "tests"))
    shutil.copytree(REPO / "scripts" / "studies" / "thresh", work / "scripts" / "studies" / "thresh", ignore=shutil.ignore_patterns("__pycache__"))
    git(work, "git init -q -b main && git add -A && git commit -q -m registration")   # HEAD carries the marker: the code, the selection and the reader are the registration's
    batches = work / "experiments" / "batches"                                         # the batches are new, untracked files, as they are in the worktree that plays them
    batches.mkdir(parents=True)
    arms = ["s", "t020", *([advance] if advance else [])]
    for c in CLASSES:
        for arm in arms:
            rows = [(i, record(i, arm)[0], record(i, arm)[1], 1.0, record(i, arm)[2]) for i in range(N)]
            d = make_batch(batches, val_id(arm, c), rows, character=EXACT[c], seeds=SEEDS_INFO)
            m = json.loads((d / "manifest.json").read_text())
            m["summary"] = {"counts": {"win": sum(1 for r in rows if r[1] == "win")}}
            m["environment"] = {"slay2": {"head": "a" * 40}}
            (d / "manifest.json").write_text(json.dumps(m))
            if audited:
                (d / "sample-audit.json").write_text(json.dumps({"all_verified": True, "verified": 40, "sample": {"drawn": 40}, "ledger": {"ok": True}, "batch_content_sha256": "c" * 64}))
                (d / "wins-audit.json").write_text(json.dumps({"all_verified": True, "wins_audited": m["summary"]["counts"]["win"], "wins_in_batch": m["summary"]["counts"]["win"]}))
    return work


def expected(arm: str, base: str) -> tuple[int, int, int, int]:
    """(arm only, baseline only, arm wins, baseline wins) over both classes, from the generator alone."""
    a_only = b_only = wa = wb = 0
    for _ in CLASSES:
        for i in range(N):
            x, y = record(i, arm)[0] == "win", record(i, base)[0] == "win"
            a_only += x and not y
            b_only += y and not x
            wa += x
            wb += y
    return a_only, b_only, wa, wb


def test_it_writes_each_comparison_once_at_the_wins_endpoint_and_the_checks_of_the_design(tmp_path):
    work = build(tmp_path)
    r = run(work)
    assert r.returncode == 0, r.stderr + r.stdout
    assert "POOL_DONE" in r.stdout
    out = work / "experiments" / "thresh"
    for t, (arm, base) in {"T1": ("t020", "s"), "T2": ("t030", "s"), "T3": ("t030", "t020")}.items():
        body = json.loads((out / f"pooled-thresh-{t}.json").read_text())
        cl = body["clusteredDifference"]
        assert cl["endpoint"] == "win" and abs(cl["ciAtLevel"]["level"] - (1 - 0.05 / 3)) < 1e-9
        assert sorted(m["character"] for m in body["members"]) == sorted(EXACT.values())
        assert body["cohort"]["partition"] == "val3" and body["role"] == "held-out"
        assert cl["meanAMinusB"] == (body["wins"]["a"] - body["wins"]["b"]) / body["bothCompleted"]
        a_only, b_only, wa, wb = expected(arm, base)
        assert body["wins"]["pairedTable"]["a_only"] == a_only and body["wins"]["pairedTable"]["b_only"] == b_only, t
        assert (body["wins"]["a"], body["wins"]["b"]) == (wa, wb) and body["bothCompleted"] == 2 * N
        for c in CLASSES:
            assert (out / "per-class" / f"{t}-{c}.json").exists()
    t1 = json.loads((out / "pooled-thresh-T1.json").read_text())
    assert t1["wins"]["pairedTable"]["b_only"] == 0 and t1["wins"]["pairedTable"]["a_only"] == 2 * (N // 20)
    for key in ("reachedAct2",):                                                  # the arms are S until Act 2: they agree with S about the Act-1 boss
        assert t1[key]["pairedTable"]["a_only"] == 0 == t1[key]["pairedTable"]["b_only"]
    for arm in ("t020", "t030"):
        ident = json.loads((out / "identity" / f"{arm}.json").read_text())
        assert ident["kind"] == "thresh-identity" and ident["stage"] == "val" and ident["beforeDifferent"] == 0 and ident["bossDifferent"] == 0
        assert ident["firstAct"] == 1 and ident["beforePairs"] == sum(1 for _ in CLASSES for i in range(N) if record(i, "s")[2] == 0) == 192   # S ended 96 seeds a class in Act 1
        assert set(ident["batches"]) == {val_id(a, c) for a in ("s", arm) for c in CLASSES}
    assert not (out / "identity" / "s.json").exists()
    rob = json.loads((out / "robustness-all-pairs.json").read_text())
    assert rob["kind"] == "thresh-robustness" and rob["schema"] == 1 and sorted(rob["tests"]) == ["T1", "T2", "T3"] and abs(rob["level"] - 0.05 / 3) < 1e-12
    assert rob["tests"]["T3"]["arm"] == "t030" and rob["tests"]["T3"]["baseline"] == "t020"
    assert rob["tests"]["T2"]["pooled"]["primaryExcludedFraction"] == 0 and rob["tests"]["T2"]["pooled"]["pairs"] == 2 * N
    # the records are made from the batches: their content hashes are the manifests' (make_batch writes one hash for all)
    assert set(rob["contentSha256"]) == {val_id(a, c) for a in ("s", "t020", "t030") for c in CLASSES}
    assert all(h == "c" * 64 for h in rob["contentSha256"].values())
    # the independent recomputation is a step of the script and its record is written with the results
    ver = json.loads((out / "verification.json").read_text())
    assert ver["kind"] == "thresh-verification" and sorted(ver["files"]) == [f"pooled-thresh-{t}.json" for t in ("T1", "T2", "T3")]
    for name, rec in ver["files"].items():
        assert rec["exactProblems"] == [] and rec["exactChecks"] > 50 and rec["bootstrapChecks"] > rec["exactChecks"]
        assert rec["sha256"] == hashlib.sha256((out / name).read_bytes()).hexdigest()
    assert not list((work / "artifacts" / "thresh").glob("pool.*"))                # the scratch directory is gone
    again = run(work)                                                               # each test is run once
    assert again.returncode != 0 and "each test is run once" in again.stderr


def test_without_an_advance_only_the_replication_is_pooled_at_the_whole_level(tmp_path):
    work = build(tmp_path, advance=None)
    r = run(work)
    assert r.returncode == 0, r.stderr + r.stdout
    out = work / "experiments" / "thresh"
    assert sorted(p.name for p in out.glob("pooled-thresh-*.json")) == ["pooled-thresh-T1.json"]
    body = json.loads((out / "pooled-thresh-T1.json").read_text())
    assert abs(body["clusteredDifference"]["ciAtLevel"]["level"] - 0.95) < 1e-12
    assert sorted(p.name for p in (out / "identity").glob("*.json")) == ["t020.json"]
    rob = json.loads((out / "robustness-all-pairs.json").read_text())
    assert sorted(rob["tests"]) == ["T1"] and rob["level"] == 0.05
    assert sorted(json.loads((out / "verification.json").read_text())["files"]) == ["pooled-thresh-T1.json"]


def test_it_refuses_to_start_unless_every_batch_is_audited(tmp_path):
    work = build(tmp_path, audited=False)
    r = run(work)
    assert r.returncode != 0 and "a batch is not finished and audited" in r.stderr
    assert not (work / "experiments" / "thresh" / "pooled-thresh-T1.json").exists()


def test_a_batch_with_wins_needs_its_win_audit(tmp_path):
    work = build(tmp_path)
    (work / "experiments" / "batches" / val_id("t030", "defect") / "wins-audit.json").unlink()
    r = run(work)
    assert r.returncode != 0 and "wins and no readable win audit" in r.stderr


def test_a_sample_audit_of_another_batch_or_under_forty_games_does_not_count(tmp_path):
    work = build(tmp_path / "other")
    p = work / "experiments" / "batches" / val_id("s", "ironclad") / "sample-audit.json"
    p.write_text(json.dumps({**json.loads(p.read_text()), "batch_content_sha256": "d" * 64}))
    r = run(work)
    assert r.returncode != 0 and "the sample audit does not pass" in r.stderr
    work = build(tmp_path / "small")
    p = work / "experiments" / "batches" / val_id("t020", "defect") / "sample-audit.json"
    p.write_text(json.dumps({**json.loads(p.read_text()), "verified": 39, "sample": {"drawn": 39}}))
    assert "the sample audit does not pass" in run(work).stderr


def test_a_win_audit_that_did_not_cover_every_win_does_not_count(tmp_path):
    work = build(tmp_path)
    p = work / "experiments" / "batches" / val_id("s", "defect") / "wins-audit.json"
    body = json.loads(p.read_text())
    body["wins_audited"] -= 1
    p.write_text(json.dumps(body))
    r = run(work)
    assert r.returncode != 0 and "not every win is re-derived" in r.stderr


def test_the_reading_code_must_be_the_registration_s(tmp_path):
    work = build(tmp_path)
    (work / "scripts" / "lib" / "thresh.mjs").write_text("changed\n")
    git(work, "git add -A && git commit -q -m 'changed the reader'")
    r = run(work)
    assert r.returncode != 0 and "is not that of the registration commit" in r.stderr and "scripts/lib/thresh.mjs" in r.stderr


def test_the_selection_must_be_the_one_the_registration_carries(tmp_path):
    work = build(tmp_path)
    (work / "experiments" / "thresh" / "dev-selection.json").write_text(json.dumps(selection(None)))
    git(work, "git add -A && git commit -q -m 'another selection'")
    r = run(work)
    assert r.returncode != 0 and "the development selection is not the one the registration commit" in r.stderr


def test_batches_played_from_two_commits_are_refused(tmp_path):
    work = build(tmp_path)
    m = work / "experiments" / "batches" / val_id("t020", "defect") / "manifest.json"
    body = json.loads(m.read_text())
    body["environment"] = {"slay2": {"head": "b" * 40}}
    m.write_text(json.dumps(body))
    r = run(work)
    assert r.returncode != 0 and "the batches were played from 2 different commits" in r.stderr and not (work / "experiments" / "thresh" / "pooled-thresh-T1.json").exists()


@pytest.mark.parametrize("arm,seed", [("t020", 3), ("t030", 7)])
def test_an_arm_that_differs_from_s_in_a_game_s_ended_in_act_1_stops_the_pooling(tmp_path, arm, seed):
    work = build(tmp_path)
    f = work / "experiments" / "batches" / val_id(arm, "ironclad") / "episodes.jsonl"
    lines = f.read_text().splitlines()
    row = json.loads(lines[seed])
    assert row["seed"] == seed and row["act"] == 0               # S ended seeds 3, 7, 11 ... in Act 1
    row["floor"] = 12
    lines[seed] = json.dumps(row)
    f.write_text("\n".join(lines) + "\n")
    r = run(work)
    assert r.returncode != 0 and f"the design check of arm {arm} failed" in r.stderr and "nothing is pooled" in r.stderr, r.stderr
    assert not (work / "experiments" / "thresh").joinpath("pooled-thresh-T1.json").exists()          # nothing was written where the results go
    scratch = list((work / "artifacts" / "thresh").glob("pool.*"))                                      # the cause is kept for the addendum
    assert len(scratch) == 1 and not list(scratch[0].glob("pooled-thresh-*.json")) and (scratch[0] / "identity" / f"{arm}.json").exists()
    assert json.loads((scratch[0] / "identity" / f"{arm}.json").read_text())["beforeDifferent"] == 1


def test_an_arm_that_differs_from_s_about_the_act_1_boss_stops_the_pooling(tmp_path):
    work = build(tmp_path)
    f = work / "experiments" / "batches" / val_id("t030", "defect") / "episodes.jsonl"
    lines = f.read_text().splitlines()
    row = json.loads(lines[6])                    # seed 6: S took it past the Act-1 boss and it ended in Act 2 (index 1), and so does this arm; here it "died at the first boss"
    assert row["seed"] == 6 and row["act"] == 1
    row["act"], row["floor"] = 0, 16
    lines[6] = json.dumps(row)
    f.write_text("\n".join(lines) + "\n")
    r = run(work)
    assert r.returncode != 0 and "the design check of arm t030 failed" in r.stderr and "nothing is pooled" in r.stderr, r.stderr
    scratch = list((work / "artifacts" / "thresh").glob("pool.*"))
    assert len(scratch) == 1 and not list(scratch[0].glob("pooled-thresh-*.json"))
    rec = json.loads((scratch[0] / "identity" / "t030.json").read_text())
    assert rec["beforeDifferent"] == 0 and rec["bossDifferent"] == 1


def test_an_arm_may_differ_from_s_in_a_game_s_took_past_the_first_boss(tmp_path):
    work = build(tmp_path)
    f = work / "experiments" / "batches" / val_id("t020", "ironclad") / "episodes.jsonl"
    lines = f.read_text().splitlines()
    row = json.loads(lines[5])                    # a game S ended in Act 2: the arm may end it on another floor of Act 2
    assert row["act"] == 1
    row["floor"] = 22
    lines[5] = json.dumps(row)
    f.write_text("\n".join(lines) + "\n")
    assert run(work).returncode == 0


def test_the_working_tree_must_be_the_registration_s_in_everything_the_study_pins(tmp_path):
    for rel, how in (("sim/slay2_sim/compare.py", "uncommitted"), ("scripts/studies/thresh/robustness.py", "uncommitted"), ("sim/slay2_sim/stats.py", "committed")):
        work = build(tmp_path / rel.replace("/", "_"))
        (work / rel).write_text((work / rel).read_text() + "\n# changed\n")
        if how == "committed":
            git(work, "git add -A && git commit -q -m 'changed after the registration'")
        r = run(work)
        assert r.returncode != 0, rel
        assert ("tracked files are modified" if how == "uncommitted" else "is not that of the registration commit") in r.stderr and not (work / "experiments" / "thresh" / "pooled-thresh-T1.json").exists(), (rel, r.stderr)
    work = build(tmp_path / "untracked")
    (work / "scripts" / "extra.py").write_text("x = 1\n")
    r = run(work)
    assert r.returncode != 0 and "untracked files outside experiments/ and artifacts/" in r.stderr
    # what runs nothing may change: a test of the harness or the README
    work = build(tmp_path / "free")
    (work / "scripts" / "studies" / "thresh" / "README.md").write_text("changed\n")
    (work / "sim" / "tests").mkdir(parents=True)
    (work / "sim" / "tests" / "test_new.py").write_text("def test_x(): pass\n")
    git(work, "git add -A && git commit -q -m 'a test and a readme'")
    assert run(work).returncode == 0


def test_a_path_the_study_pins_that_is_missing_stops_the_pooling(tmp_path):
    work = build(tmp_path)
    git(work, "git rm -q external/pins.json && git commit -q -m gone")
    r = run(work)
    assert r.returncode != 0 and "external/pins.json does not exist" in r.stderr


def test_a_result_that_already_exists_or_was_in_the_history_stops_the_pooling(tmp_path):
    work = build(tmp_path / "exists")
    (work / "experiments" / "thresh" / "pooled-thresh-T2.json").write_text("{}")
    r = run(work)
    assert r.returncode != 0 and "pooled-thresh-T2.json exists: each test is run once" in r.stderr
    work = build(tmp_path / "history")
    (work / "experiments" / "thresh" / "pooled-thresh-T1.json").write_text("{}")
    git(work, "git add -A && git commit -q -m 'a first look' && git rm -q experiments/thresh/pooled-thresh-T1.json && git commit -q -m 'removed it'")
    r = run(work)
    assert r.returncode != 0 and "experiments/thresh/pooled-thresh-T1.json is in the history: each test is run once" in r.stderr
    work = build(tmp_path / "per-class")
    (work / "experiments" / "thresh" / "per-class").mkdir()
    (work / "experiments" / "thresh" / "per-class" / "T1-ironclad.json").write_text("{}")
    r = run(work)
    assert r.returncode != 0 and "the comparisons are run once" in r.stderr


def test_a_crash_after_some_steps_leaves_nothing_that_counts_as_a_first_look(tmp_path):
    """The independent recomputation is the last step: if it fails, nothing is in experiments/thresh, so the run-once guards allow the same computation again."""
    work = build(tmp_path)
    wrapper = tmp_path / "pyfail.sh"
    wrapper.write_text('#!/usr/bin/env bash\ncase "$1" in *verify_all.py) echo "stand-in: the recomputation fails" >&2; exit 1 ;; esac\nexec ' + sys.executable + ' "$@"\n')
    wrapper.chmod(0o755)
    env = {**os.environ, "PY": str(wrapper), "OUT": str(work / "artifacts" / "thresh"), "PYTHONPATH": ""}
    r = subprocess.run(["bash", "scripts/studies/thresh/pool.sh"], cwd=work, env=env, capture_output=True, text=True)
    assert r.returncode != 0 and "independent recomputation" in r.stderr and "nothing is written to experiments/thresh" in r.stderr
    assert not (work / "experiments" / "thresh" / "pooled-thresh-T1.json").exists() and not (work / "experiments" / "thresh" / "per-class").exists()
    again = run(work)                                    # the same computation, now with the real interpreter: it is allowed and it succeeds
    assert again.returncode == 0 and "POOL_DONE" in again.stdout, again.stderr
    assert (work / "experiments" / "thresh" / "pooled-thresh-T1.json").exists()


def test_the_recomputation_disagreeing_about_a_count_stops_the_pooling(tmp_path):
    """verify_all.py on a pooled file whose count is not what the episodes give: exit 1, the problem is in the record."""
    work = build(tmp_path)
    assert run(work).returncode == 0
    spec = importlib.util.spec_from_file_location("thresh_verify_all", work / "scripts" / "studies" / "thresh" / "verify_all.py")
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    pooled = work / "experiments" / "thresh" / "pooled-thresh-T2.json"
    body = json.loads(pooled.read_text())
    body["wins"]["pairedTable"]["a_only"] += 1
    body["wins"]["pairedTable"]["neither"] -= 1
    altered = tmp_path / "pooled-thresh-T2.json"
    altered.write_text(json.dumps(body))
    out = tmp_path / "ver.json"
    cwd = os.getcwd()
    os.chdir(work)
    try:
        assert mod.main([str(altered), "--out", str(out)]) == 1
    finally:
        os.chdir(cwd)
    rec = json.loads(out.read_text())["files"]["pooled-thresh-T2.json"]
    assert rec["exactProblems"] and any("pooled wins" in line for line in rec["exactProblems"])
    # an interval shifted by a fifth of its width is a disagreement of the resample: recorded, and it decides nothing
    body = json.loads(pooled.read_text())
    lo, hi = body["clusteredDifference"]["ciAtLevel"]["ci"]
    body["clusteredDifference"]["ciAtLevel"]["ci"] = [lo + 0.2 * (hi - lo), hi + 0.2 * (hi - lo)]
    shifted = tmp_path / "pooled-thresh-T3.json"
    shifted.write_text(json.dumps(body))
    os.chdir(work)
    try:
        assert mod.main([str(shifted), "--out", str(tmp_path / "ver2.json")]) == 0
    finally:
        os.chdir(cwd)
    rec = json.loads((tmp_path / "ver2.json").read_text())["files"]["pooled-thresh-T3.json"]
    assert rec["exactProblems"] == [] and rec["bootstrapDisagreements"]
