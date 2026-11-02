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


def world(tmp: Path, finished: bool = True, **per_arm) -> Path:
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
    out = subprocess.run([sys.executable, "scripts/studies/thresh/part2.py"], cwd=work, capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
    text = out.stdout
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
