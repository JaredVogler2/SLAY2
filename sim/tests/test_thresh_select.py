"""`scripts/studies/thresh/select-dev.sh` (the screen is read once) and `part2.py` (the numbers of part 2 of the record come from the files, not from a hand).

A throwaway repository holds the real scripts and the real analysis code and the synthetic development batches of `test_threshstudy`; no game is played.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from slay2_sim import external
from slay2_sim import threshstudy as ts
from test_threshstudy import build as build_batches

REPO = external.REPO_ROOT


def git(work: Path, cmd: str) -> subprocess.CompletedProcess:
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    return subprocess.run(["bash", "-c", cmd], cwd=work, env=env, capture_output=True, text=True, check=True)


def world(tmp: Path, finished: bool = True, audited: bool = True, **per_arm) -> Path:
    work = tmp / "work"
    (work / "sim").mkdir(parents=True)
    shutil.copytree(REPO / "sim" / "slay2_sim", work / "sim" / "slay2_sim", ignore=shutil.ignore_patterns("__pycache__", "tests"))
    shutil.copytree(REPO / "scripts" / "studies" / "thresh", work / "scripts" / "studies" / "thresh", ignore=shutil.ignore_patterns("__pycache__"))
    (work / ".gitignore").write_text("__pycache__/\n*.pyc\nartifacts/\nexperiments/batches/\n")
    git(work, "git init -q -b main && git add -A && git commit -q -m start")
    build_batches(work / "experiments" / "_", **per_arm)            # writes experiments/_/batches/...
    shutil.move(str(work / "experiments" / "_" / "batches"), str(work / "experiments" / "batches"))
    shutil.rmtree(work / "experiments" / "_")
    (work / "artifacts" / "thresh").mkdir(parents=True)
    for d in sorted((work / "experiments" / "batches").iterdir()):               # every batch finished and audited, as audit.sh leaves it
        m = json.loads((d / "manifest.json").read_text())
        wins = 3
        m["summary"] = {"counts": {"win": wins}}
        m["environment"] = {"slay2": {"head": "a" * 40}}
        (d / "manifest.json").write_text(json.dumps(m))
        if audited:
            (d / "sample-audit.json").write_text(json.dumps({"all_verified": True, "verified": 40, "sample": {"drawn": 40}, "ledger": {"ok": True}, "batch_content_sha256": m["content_sha256"]}))
            (d / "wins-audit.json").write_text(json.dumps({"all_verified": True, "wins_audited": wins, "wins_in_batch": wins}))
    if finished:
        (work / "artifacts" / "thresh" / "run-done.txt").write_text("DEV_s_DONE\nDEV_DONE\n")
    return work


def run(work: Path) -> subprocess.CompletedProcess:
    env = {**os.environ, "PY": sys.executable, "OUT": str(work / "artifacts" / "thresh"), "PYTHONPATH": ""}
    return subprocess.run(["bash", "scripts/studies/thresh/select-dev.sh"], cwd=work, env=env, capture_output=True, text=True)


def test_the_screen_is_applied_once_to_the_finished_stage_and_the_file_is_hashed(tmp_path):
    work = world(tmp_path, t020={"gain": 2}, t030={"gain": 4})
    r = run(work)
    assert r.returncode == 0, r.stderr
    path = work / "experiments" / "thresh" / "dev-selection.json"
    sel = json.loads(path.read_text())
    assert sel["kind"] == "thresh-dev-selection" and sel["choice"]["advance"] is True and sel["choice"]["arm"] == "t030" and sel["designChecksPassed"] is True
    assert hashlib.sha256(path.read_bytes()).hexdigest() in r.stdout                  # part 2 of the record quotes it
    again = run(work)
    assert again.returncode != 0 and "the screen is read once" in again.stderr


def test_an_unfinished_stage_is_not_screened(tmp_path):
    work = world(tmp_path, finished=False)
    r = run(work)
    assert r.returncode != 0 and "the development stage is not finished" in r.stderr
    assert not (work / "experiments" / "thresh" / "dev-selection.json").exists()
    (work / "artifacts" / "thresh" / "run-done.txt").write_text("DEV_s_DONE\n")        # S done, the rest not
    assert "the development stage is not finished" in run(work).stderr


def test_a_stage_whose_batches_are_not_audited_is_not_screened(tmp_path):
    """The audit is read from each batch's own audit files (made from its content), not from a marker file that audit.sh leaves."""
    work = world(tmp_path / "none", audited=False, t020={"gain": 1})
    r = run(work)
    assert r.returncode != 0 and "no readable sample audit" in r.stderr and "the development batches are not finished and audited" in r.stderr
    assert not (work / "experiments" / "thresh" / "dev-selection.json").exists()
    batches = work / "experiments" / "batches"
    one = batches / "thresh-dev-t030-defect-a0-veteran-keeprelics-dev2-n3000"
    ok = world(tmp_path / "ok", t020={"gain": 1})
    assert run(ok).returncode == 0                                                    # (the marker file of audit.sh is not needed)
    for what, change, message in (
        ("a sample audit of 39 games", lambda d: (d / "sample-audit.json").write_text(json.dumps({**json.loads((d / "sample-audit.json").read_text()), "verified": 39, "sample": {"drawn": 39}})), "the sample audit does not pass"),
        ("a sample audit of other content", lambda d: (d / "sample-audit.json").write_text(json.dumps({**json.loads((d / "sample-audit.json").read_text()), "batch_content_sha256": "d" * 64})), "the sample audit does not pass"),
        ("a win that was not re-derived", lambda d: (d / "wins-audit.json").write_text(json.dumps({"all_verified": True, "wins_audited": 2, "wins_in_batch": 3})), "not every win is re-derived"),
        ("no win audit", lambda d: (d / "wins-audit.json").unlink(), "3 wins and no readable win audit"),
        ("another commit", lambda d: (d / "manifest.json").write_text(json.dumps({**json.loads((d / "manifest.json").read_text()), "environment": {"slay2": {"head": "b" * 40}}})), "different commits"),
    ):
        w = world(tmp_path / what.replace(" ", "-"), t020={"gain": 1})
        change(w / "experiments" / "batches" / one.name)
        r = run(w)
        assert r.returncode != 0 and message in r.stderr, (what, r.stderr)
        assert not (w / "experiments" / "thresh" / "dev-selection.json").exists()


def test_a_selection_that_was_ever_in_the_history_is_not_written_again(tmp_path):
    work = world(tmp_path, t020={"gain": 1})
    (work / "experiments" / "thresh").mkdir(parents=True)
    (work / "experiments" / "thresh" / "dev-selection.json").write_text("{}")
    git(work, "git add -A && git commit -q -m 'a first look' && git rm -q experiments/thresh/dev-selection.json && git commit -q -m 'removed it'")
    r = run(work)
    assert r.returncode != 0 and "is in the history: the screen is read once" in r.stderr


def test_a_design_check_that_fails_stops_the_screen_and_writes_nothing(tmp_path):
    work = world(tmp_path, t030={"gain": 2, "break_act0": True})
    r = run(work)
    assert r.returncode != 0 and "the selection failed" in r.stderr and "STOP: the design's own check failed" in r.stderr
    assert not (work / "experiments" / "thresh" / "dev-selection.json").exists()


def test_part_2_numbers_are_printed_from_the_files(tmp_path):
    work = world(tmp_path, t020={"gain": 2}, t030={"gain": 4})
    assert run(work).returncode == 0
    for c, f in (("ironclad", "ironclad-a0-v2.json"), ("defect", "defect-a0-keep-v1.json")):     # the files the site shows, as site-sets.json names them
        (work / "experiments" / "cardvalue").mkdir(parents=True, exist_ok=True)
        (work / "experiments" / "cardvalue" / f).write_text(json.dumps({"kind": "card-values", "character": c}))
    (work / "experiments" / "cardvalue" / "site-sets.json").write_text(json.dumps({"sets": [{"file": "ironclad-a0-v2.json"}, {"file": "defect-a0-keep-v1.json"}]}))
    (work / "experiments" / "seeds").mkdir(parents=True)
    (work / "experiments" / "seeds" / "ironclad-a0-v4.json").write_text("{}")
    for arm in ["s", *ts.GRID]:                                                               # the counts the development batches carry
        for c in ts.CLASSES:
            m = work / "experiments" / "batches" / ts.dev_id(arm, c) / "manifest.json"
            body = json.loads(m.read_text())
            body["summary"] = {"completed": 64, "counts": {"win": 8, "simulator_error": 0, "timeout": 0}}
            m.write_text(json.dumps(body))
    (work / "experiments" / "acts" / "per-class").mkdir(parents=True)                         # the committed result of ADR-061 the power tables are computed from
    for c in ("ironclad", "defect"):
        shutil.copy(REPO / "experiments" / "acts" / "per-class" / f"A2-{c}.json", work / "experiments" / "acts" / "per-class" / f"A2-{c}.json")
    missing = subprocess.run([sys.executable, "scripts/studies/thresh/part2.py"], cwd=work, capture_output=True, text=True)
    assert missing.returncode != 0 and "dev-head.txt does not hold the commit" in missing.stderr           # no record of where the stage was played from
    sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=work, capture_output=True, text=True, check=True).stdout.strip()
    head_file = work / "artifacts" / "thresh" / "dev-head.txt"
    head_file.write_text("0" * 40 + "\n")
    unknown = subprocess.run([sys.executable, "scripts/studies/thresh/part2.py"], cwd=work, capture_output=True, text=True)
    assert unknown.returncode != 0 and "is not in this repository" in unknown.stderr
    head_file.write_text(sha + "\n")
    out = subprocess.run([sys.executable, "scripts/studies/thresh/part2.py"], cwd=work, capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
    text = out.stdout
    assert f"DEV_HEAD={sha}" in text
    assert "### What the held-out tests can see of the choice" in text and "- T3, the choice against 0.2:" in text and "net wins for 80 %:" in text and "- T2, the choice against S:" in text
    assert "### The development screen as it came out" in text and "best: {" in text and '"arm": "t030"' in text
    for tag in ts.GRID:
        assert f"- {tag} (threshold {ts.GRID[tag]})" in text
    assert "head-to-head of the best against 0.2: 4 / 0 discordant" in text
    assert "Ironclad 64/8/0/0; Defect 64/8/0/0" in text
    sha = hashlib.sha256((work / "experiments" / "cardvalue" / "ironclad-a0-v2.json").read_bytes()).hexdigest()
    assert f"`experiments/cardvalue/ironclad-a0-v2.json`: `{sha}`" in text
    sel = hashlib.sha256((work / "experiments" / "thresh" / "dev-selection.json").read_bytes()).hexdigest()
    assert f"`experiments/thresh/dev-selection.json`: `{sel}`" in text
    assert text.rstrip().endswith("ARM_t030")                                                  # the arm part 2 has to name
