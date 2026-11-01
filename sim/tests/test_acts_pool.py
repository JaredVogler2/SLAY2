"""`scripts/studies/acts/pool.sh` end to end on a throwaway repository of synthetic batches (ADR-061 items 4, 6 and 10).

The script refuses to run unless every held-out batch is finished and audited, writes each class's comparison, the four pooled tests at the wins
endpoint with the interval at the level of the tests, the identity checks of the arms that are S in the early acts and the all-pairs analysis, and
runs each of them once.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from slay2_sim import external
from test_compare import make_batch

REPO = external.REPO_ROOT
CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"]
EXACT = {c: c.capitalize() for c in CLASSES}
N = 400
SEEDS_INFO = {"file_sha256": "s" * 64, "partition": "val2"}


def git(work: Path, cmd: str) -> None:
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["bash", "-c", cmd], cwd=work, env=env, capture_output=True, text=True, check=True)


def run(work: Path, *args: str) -> subprocess.CompletedProcess:
    env = {**os.environ, "PY": sys.executable, "OUT": str(work / "artifacts" / "acts"), "PYTHONPATH": ""}
    return subprocess.run(["bash", "scripts/studies/acts/pool.sh", *args], cwd=work, env=env, capture_output=True, text=True)


def record(i: int, arm: str) -> tuple:
    """(outcome, floor, act) of seed ``i`` for an arm. The baseline S: one seed in 25 is won; of the rest, a quarter end in Act 1 (index 0), half in Act 2
    (index 1) and a quarter in Act 3 (index 2). The arms differ from S only in the acts they are pickier in: A3 wins one more seed in 40 of those S ended
    in Act 3; A2 one in 20 of those S ended in Act 2 (it gets them past the Act-2 boss); A1 and the lead win more, and the lead loses some in Act 1."""
    if i % 25 == 0:
        base: tuple = ("win", 51, 2)
    else:
        a = 2 if i % 4 == 0 else 1 if i % 4 in (1, 2) else 0
        base = ("death", 10 + 12 * a + (5 if a == 2 else 0), a)
    if base[0] == "win" or arm == "s":
        return base
    if arm == "a3" and base[2] == 2 and i % 40 == 0:
        return ("win", 51, 2)
    if arm == "a2" and base[2] == 1 and i % 20 == 1:
        return ("win", 51, 2)
    if arm == "a1" and base[2] >= 1 and i % 20 == 5:
        return ("win", 51, 2)
    if arm == "lead":
        if i % 20 == 1 and base[2] == 1:
            return ("death", 14, 0)      # the lead's price at the first boss: a run S took past it ends in Act 1
        if base[2] >= 1 and i % 10 == 2:
            return ("win", 51, 2)
    return base


def build(tmp: Path, audited: bool = True) -> Path:
    work = tmp / "work"
    (work / "sim").mkdir(parents=True)
    for rel in ("scripts/lib/acts.mjs", "scripts/lib/pooled.mjs", "packages/game-data/data/stub.txt", "experiments/cardvalue/stub.txt", "experiments/seeds/stub.txt", "external/pins.json"):
        (work / rel).parent.mkdir(parents=True, exist_ok=True)
        (work / rel).write_text("stub " + rel + "\n")
    shutil.copy(REPO / "scripts" / "verify-pooled.py", work / "scripts" / "verify-pooled.py")    # the real independent verifier: pool.sh runs it
    (work / ".gitignore").write_text("__pycache__/\n*.pyc\n")             # as the repository's own: the interpreter's caches are not untracked files
    (work / "docs").mkdir()
    (work / "docs" / "DECISIONS.md").write_text("## 2026-11-01 — ADR-061: the study\n\nThe registration is headed 'Registration of ADR-061 (frozen choices)'.\n")
    shutil.copytree(REPO / "sim" / "slay2_sim", work / "sim" / "slay2_sim", ignore=shutil.ignore_patterns("__pycache__", "tests"))
    shutil.copytree(REPO / "scripts" / "studies" / "acts", work / "scripts" / "studies" / "acts", ignore=shutil.ignore_patterns("__pycache__"))
    git(work, "git init -q -b main && git add -A && git commit -q -m registration")   # HEAD carries the marker: the code and the reading code are the registration's
    batches = work / "experiments" / "batches"                                         # the batches are new, untracked files, as they are in the worktree that plays them
    batches.mkdir(parents=True)
    for c in CLASSES:
        for arm in ("s", "lead", "a1", "a2", "a3"):
            name = f"acts-{arm}-{c}-a0-veteran-keeprelics-val2-n3000"
            rows = [(i, *record(i, arm)[:1], record(i, arm)[1], 1.0, record(i, arm)[2]) for i in range(N)]
            d = make_batch(batches, name, rows, character=EXACT[c], seeds=SEEDS_INFO)
            m = json.loads((d / "manifest.json").read_text())
            m["summary"] = {"counts": {"win": sum(1 for r in rows if r[1] == "win")}}
            (d / "manifest.json").write_text(json.dumps(m))
            if audited:
                (d / "sample-audit.json").write_text(json.dumps({"all_verified": True, "verified": 40, "sample": {"drawn": 40}, "ledger": {"ok": True}, "batch_content_sha256": "c" * 64}))
                (d / "wins-audit.json").write_text(json.dumps({"all_verified": True, "wins_audited": m["summary"]["counts"]["win"], "wins_in_batch": m["summary"]["counts"]["win"]}))
    return work


def test_it_writes_each_comparison_once_at_the_wins_endpoint_and_the_checks_of_the_design(tmp_path):
    work = build(tmp_path)
    r = run(work)
    assert r.returncode == 0, r.stderr + r.stdout
    assert "POOL_DONE" in r.stdout
    out = work / "experiments" / "acts"
    for t in ("L", "A1", "A2", "A3"):
        body = json.loads((out / f"pooled-acts-{t}.json").read_text())
        cl = body["clusteredDifference"]
        assert cl["endpoint"] == "win" and abs(cl["ciAtLevel"]["level"] - (1 - 0.05 / 4)) < 1e-9
        assert sorted(m["character"] for m in body["members"]) == sorted(EXACT.values())
        assert body["cohort"]["partition"] == "val2" and body["role"] == "held-out"
        assert cl["meanAMinusB"] == (body["wins"]["a"] - body["wins"]["b"]) / body["bothCompleted"]
        for c in CLASSES:
            assert (out / "per-class" / f"{t}-{c}.json").exists()
    a3 = json.loads((out / "pooled-acts-A3.json").read_text())
    extra = sum(1 for i in range(N) if i % 40 == 0 and i % 25 != 0)       # the seeds A3 wins and S does not (S won seeds 0 and 200 itself)
    assert a3["wins"]["pairedTable"]["a_only"] == 5 * extra == 40 and a3["wins"]["pairedTable"]["b_only"] == 0
    for key in ("reachedAct2", "reachedAct3"):                                  # A3 is S until the third act: it agrees with S about both bosses
        assert a3[key]["pairedTable"]["a_only"] == 0 == a3[key]["pairedTable"]["b_only"]
    a2 = json.loads((out / "pooled-acts-A2.json").read_text())
    assert a2["reachedAct2"]["pairedTable"]["a_only"] == 0 == a2["reachedAct2"]["pairedTable"]["b_only"]
    assert a2["reachedAct3"]["pairedTable"]["a_only"] > 0                       # but not about the second boss
    lead = json.loads((out / "pooled-acts-L.json").read_text())
    assert lead["reachedAct2"]["pairedTable"]["b_only"] > 0                     # the lead's price at the first boss
    for t, first in (("A2", 1), ("A3", 2)):
        ident = json.loads((out / "identity" / f"{t}.json").read_text())
        assert ident["kind"] == "acts-identity" and ident["beforeDifferent"] == 0 and ident["firstAct"] == first and ident["beforePairs"] > 0
    assert not (out / "identity" / "L.json").exists() and not (out / "identity" / "A1.json").exists()
    rob = json.loads((out / "robustness-all-pairs.json").read_text())
    assert rob["kind"] == "acts-robustness" and rob["schema"] == 1 and sorted(rob["tests"]) == ["A1", "A2", "A3", "L"]
    assert rob["tests"]["A3"]["pooled"]["primaryExcludedFraction"] == 0 and rob["tests"]["A3"]["pooled"]["pairs"] == 5 * N
    # the records are made from the batches: their content hashes are the manifests' (make_batch writes one hash for all)
    assert set(rob["contentSha256"]) == {f"acts-{a}-{c}-a0-veteran-keeprelics-val2-n3000" for a in ("s", "lead", "a1", "a2", "a3") for c in CLASSES}
    assert all(h == "c" * 64 for h in rob["contentSha256"].values())
    assert set(json.loads((out / "identity" / "A3.json").read_text())["contentSha256"]) == {f"acts-{a}-{c}-a0-veteran-keeprelics-val2-n3000" for a in ("s", "a3") for c in CLASSES}
    # the independent recomputation is a step of the script and its record is written with the results
    ver = json.loads((out / "verification.json").read_text())
    assert ver["kind"] == "acts-verification" and sorted(ver["files"]) == [f"pooled-acts-{t}.json" for t in ("A1", "A2", "A3", "L")]
    import hashlib

    for name, rec in ver["files"].items():
        assert rec["exactProblems"] == [] and rec["exactChecks"] > 60 and rec["bootstrapChecks"] > rec["exactChecks"]
        assert rec["sha256"] == hashlib.sha256((out / name).read_bytes()).hexdigest()
    assert not list((work / "artifacts" / "acts").glob("pool.*"))                  # the scratch directory is gone
    # each test is run once
    again = run(work)
    assert again.returncode != 0 and "each test is run once" in again.stderr


def test_it_refuses_to_start_unless_every_batch_is_audited(tmp_path):
    work = build(tmp_path, audited=False)
    r = run(work)
    assert r.returncode != 0 and "a batch is not finished and audited" in r.stderr
    assert not (work / "experiments" / "acts" / "pooled-acts-L.json").exists()


def test_a_batch_with_wins_needs_its_win_audit(tmp_path):
    work = build(tmp_path)
    (work / "experiments" / "batches" / "acts-lead-defect-a0-veteran-keeprelics-val2-n3000" / "wins-audit.json").unlink()
    r = run(work)
    assert r.returncode != 0 and "wins and no readable win audit" in r.stderr


def test_the_reading_code_must_be_the_registration_s(tmp_path):
    work = build(tmp_path)
    (work / "scripts" / "lib" / "acts.mjs").write_text("changed\n")
    git(work, "git add -A && git commit -q -m 'changed the reader'")
    r = run(work)
    assert r.returncode != 0 and "is not that of the registration commit" in r.stderr and "scripts/lib/acts.mjs" in r.stderr


def test_batches_played_from_two_commits_are_refused(tmp_path):
    work = build(tmp_path)
    m = work / "experiments" / "batches" / "acts-lead-defect-a0-veteran-keeprelics-val2-n3000" / "manifest.json"
    body = json.loads(m.read_text())
    body["environment"] = {"slay2": {"head": "b" * 40}}
    m.write_text(json.dumps(body))
    r = run(work)
    assert r.returncode != 0 and "different commits" in r.stderr


def test_an_arm_that_differs_from_s_in_a_game_s_ended_before_its_act_stops_the_pooling(tmp_path):
    for arm, seed, test in (("a2", 3, "A2"), ("a3", 5, "A3")):     # seed 3 ends in Act 1 in S, seed 5 in Act 2
        work = build(tmp_path / test)
        f = work / "experiments" / "batches" / f"acts-{arm}-ironclad-a0-veteran-keeprelics-val2-n3000" / "episodes.jsonl"
        lines = f.read_text().splitlines()
        row = json.loads(lines[seed])
        assert row["seed"] == seed
        row["floor"] = 12
        lines[seed] = json.dumps(row)
        f.write_text("\n".join(lines) + "\n")
        r = run(work)
        assert r.returncode != 0 and f"the design check of test {test} failed" in r.stderr and "nothing is pooled" in r.stderr, r.stderr
        assert not (work / "experiments" / "acts").exists()                                           # nothing was written where the results go
        scratch = list((work / "artifacts" / "acts").glob("pool.*"))                                   # the cause is kept for the addendum
        assert len(scratch) == 1 and not list(scratch[0].glob("pooled-acts-*.json")) and (scratch[0] / "identity" / f"{test}.json").exists()
    # a2 may differ in a game S ended in Act 2: seed 5 is such a game
    work = build(tmp_path / "ok")
    f = work / "experiments" / "batches" / "acts-a2-ironclad-a0-veteran-keeprelics-val2-n3000" / "episodes.jsonl"
    lines = f.read_text().splitlines()
    row = json.loads(lines[5])
    row["floor"] = 40
    lines[5] = json.dumps(row)
    f.write_text("\n".join(lines) + "\n")
    assert run(work).returncode == 0


def test_an_arm_that_is_s_until_act_three_cannot_differ_about_the_second_boss(tmp_path):
    work = build(tmp_path)
    f = work / "experiments" / "batches" / "acts-a3-defect-a0-veteran-keeprelics-val2-n3000" / "episodes.jsonl"
    lines = f.read_text().splitlines()
    row = json.loads(lines[4])                 # seed 4: S ended it in Act 3 (index 2) with a death; the identity check does not hold it (S's act is not below 2)
    assert row["act"] == 2 and row["outcome"] == "death"
    row["act"] = 1                             # but this arm "died in Act 2": it differs about the Act-2 boss, which an arm that is S until Act 3 cannot do
    lines[4] = json.dumps(row)
    f.write_text("\n".join(lines) + "\n")
    r = run(work)
    assert r.returncode != 0 and "the design check of test A3 failed" in r.stderr and "nothing is pooled" in r.stderr, r.stderr
    assert not (work / "experiments" / "acts").exists()                                               # (c) is read before any test is pooled
    scratch = list((work / "artifacts" / "acts").glob("pool.*"))
    assert len(scratch) == 1 and not list(scratch[0].glob("pooled-acts-*.json"))
    rec = json.loads((scratch[0] / "identity" / "A3.json").read_text())
    assert rec["beforeDifferent"] == 0 and rec["bossDifferent"] == 1


def test_the_working_tree_must_be_the_registration_s_in_everything_the_study_pins(tmp_path):
    for rel, how in (("sim/slay2_sim/compare.py", "uncommitted"), ("scripts/studies/acts/robustness.py", "uncommitted"), ("sim/slay2_sim/stats.py", "committed")):
        work = build(tmp_path / rel.replace("/", "_"))
        (work / rel).write_text((work / rel).read_text() + "\n# changed\n")
        if how == "committed":
            git(work, "git add -A && git commit -q -m 'changed after the registration'")
        r = run(work)
        assert r.returncode != 0, rel
        assert ("tracked files are modified" if how == "uncommitted" else "is not that of the registration commit") in r.stderr and not (work / "experiments" / "acts").exists(), (rel, r.stderr)
    work = build(tmp_path / "untracked")
    (work / "scripts" / "extra.py").write_text("x = 1\n")
    r = run(work)
    assert r.returncode != 0 and "untracked files outside experiments/ and artifacts/" in r.stderr
    # what runs nothing may change: a test of the harness or the README
    work = build(tmp_path / "free")
    (work / "scripts" / "studies" / "acts" / "README.md").write_text("changed\n")
    (work / "sim" / "tests").mkdir(parents=True)
    (work / "sim" / "tests" / "test_new.py").write_text("def test_x(): pass\n")
    git(work, "git add -A && git commit -q -m 'a test and a readme'")
    assert run(work).returncode == 0


def test_a_path_the_study_pins_that_is_missing_stops_the_pooling(tmp_path):
    work = build(tmp_path)
    git(work, "git rm -q external/pins.json && git commit -q -m gone")
    r = run(work)
    assert r.returncode != 0 and "external/pins.json does not exist" in r.stderr


def test_a_crash_after_some_steps_leaves_nothing_that_counts_as_a_first_look(tmp_path):
    """The independent recomputation is the last step: if it fails, nothing is in experiments/acts, so the run-once guards allow the same computation again."""
    work = build(tmp_path)
    wrapper = tmp_path / "pyfail.sh"
    wrapper.write_text('#!/usr/bin/env bash\ncase "$1" in *verify_all.py) echo "stand-in: the recomputation fails" >&2; exit 1 ;; esac\nexec ' + sys.executable + ' "$@"\n')
    wrapper.chmod(0o755)
    env = {**os.environ, "PY": str(wrapper), "OUT": str(work / "artifacts" / "acts"), "PYTHONPATH": ""}
    r = subprocess.run(["bash", "scripts/studies/acts/pool.sh"], cwd=work, env=env, capture_output=True, text=True)
    assert r.returncode != 0 and "independent recomputation" in r.stderr and "nothing is written to experiments/acts" in r.stderr
    assert not (work / "experiments" / "acts").exists()
    again = run(work)                                    # the same computation, now with the real interpreter: it is allowed and it succeeds
    assert again.returncode == 0 and "POOL_DONE" in again.stdout, again.stderr
    assert (work / "experiments" / "acts" / "pooled-acts-L.json").exists()


def test_the_recomputation_disagreeing_about_a_count_stops_the_pooling(tmp_path):
    """verify_all.py on a pooled file whose count is not what the episodes give: exit 1, the problem is in the record."""
    import importlib.util

    work = build(tmp_path)
    assert run(work).returncode == 0
    spec = importlib.util.spec_from_file_location("verify_all", work / "scripts" / "studies" / "acts" / "verify_all.py")
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    pooled = work / "experiments" / "acts" / "pooled-acts-A2.json"
    body = json.loads(pooled.read_text())
    body["wins"]["pairedTable"]["a_only"] += 1
    body["wins"]["pairedTable"]["neither"] -= 1
    altered = tmp_path / "pooled-acts-A2.json"
    altered.write_text(json.dumps(body))
    out = tmp_path / "ver.json"
    cwd = os.getcwd()
    os.chdir(work)
    try:
        assert mod.main([str(altered), "--out", str(out)]) == 1
    finally:
        os.chdir(cwd)
    rec = json.loads(out.read_text())["files"]["pooled-acts-A2.json"]
    assert rec["exactProblems"] and any("pooled wins" in line for line in rec["exactProblems"])
    # an interval shifted by a tenth of its width is a disagreement of the resample: recorded, and it decides nothing
    body = json.loads(pooled.read_text())
    lo, hi = body["clusteredDifference"]["ciAtLevel"]["ci"]
    body["clusteredDifference"]["ciAtLevel"]["ci"] = [lo + 0.2 * (hi - lo), hi + 0.2 * (hi - lo)]
    shifted = tmp_path / "pooled-acts-A3.json"
    shifted.write_text(json.dumps(body))
    os.chdir(work)
    try:
        assert mod.main([str(shifted), "--out", str(tmp_path / "ver2.json")]) == 0
    finally:
        os.chdir(cwd)
    rec = json.loads((tmp_path / "ver2.json").read_text())["files"]["pooled-acts-A3.json"]
    assert rec["exactProblems"] == [] and rec["bootstrapDisagreements"]
