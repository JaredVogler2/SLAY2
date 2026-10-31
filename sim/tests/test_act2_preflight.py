"""The preflight of the Act-2 study's held-out run (ADR-060 item 9): every check can pass and every check can fail.

A throwaway repository (a bare "remote", a work tree, stub files at the paths the scripts read, a record that quotes the hashes) is built
around the real scripts, and the preflight is run in it: once on a world that satisfies it, then on worlds that break one thing each. No
simulator and no game is involved.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from slay2_sim import external

REPO = external.REPO_ROOT
MARKER = "Frozen choices of ADR-060 (part 2)"
CLASSES = ["Ironclad", "Silent", "Regent", "Necrobinder", "Defect"]


def sh(cmd: str, cwd: Path, env: dict | None = None, check: bool = True) -> subprocess.CompletedProcess:
    full = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t", **(env or {})}
    return subprocess.run(["bash", "-c", cmd], cwd=cwd, env=full, capture_output=True, text=True, check=check)


def listing(work: Path, fn: str) -> list[str]:
    return sh(f'source scripts/studies/act2/common.sh; {fn}', work, env={"OUT": str(work / "artifacts" / "x")}).stdout.split()


def sha_of(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def build_world(tmp: Path, arms=("s", "lead", "p020"), marker: str = MARKER) -> Path:
    """A work tree whose HEAD is a part-2 commit on the remote, with the selection and the value files the record quotes."""
    tmp.mkdir(parents=True, exist_ok=True)
    bare, work = tmp / "origin.git", tmp / "work"
    sh(f"git init -q --bare {bare}", tmp)
    work.mkdir()
    sh("git init -q -b main && git remote add origin " + str(bare), work)
    shutil.copytree(REPO / "scripts" / "studies" / "act2", work / "scripts" / "studies" / "act2")
    for rel in ("sim/stub.txt", "packages/game-data/data/stub.txt", "external/pins.json", "scripts/verify-pooled.py", "experiments/seeds/ironclad-a0-v2.json"):
        p = work / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("stub " + rel + "\n")
    (work / "docs").mkdir()
    (work / "docs" / "DECISIONS.md").write_text("## 2026-10-31 — ADR-060: the study\n\nPart 1 text.\n")
    sh("git add -A && git commit -q -m part1 && git push -q origin main", work)
    # part 2: the ten value files, the selection and the development batches, quoted in the record
    files = listing(work, "shown_files") + listing(work, "act2_files")
    for f in files:
        p = work / f
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps({"kind": "card-values", "file": f, "fitted": False}))
    sel = work / "experiments" / "act2" / "dev-selection.json"
    sel.parent.mkdir(parents=True)
    sel.write_text(json.dumps({"P": {"advance": "p020" in arms, "arm": "p020" if "p020" in arms else None}, "V": {"advance": "v" in arms}}))
    ptags = listing(work, "echo $P_TAGS")
    for c in CLASSES:
        for arm in ["s", "lead", *ptags]:
            d = work / "experiments" / "batches" / sh(f"source scripts/studies/act2/common.sh; dev_id {arm} {c}", work, env={"OUT": str(work / "artifacts" / "x")}).stdout.strip()
            d.mkdir(parents=True)
            (d / "manifest.json").write_text("{}")
    quoted = "\n".join(f"- {f}: `{sha_of(work / f)}`" for f in [*files, "experiments/act2/dev-selection.json"])
    arm_lines = "\n".join(f"ARM_{a}" for a in arms if a not in ("s", "lead"))
    (work / "docs" / "DECISIONS.md").write_text(
        f"## 2026-10-31 — ADR-060: the study\n\nPart 1 text.\n\n**{marker}.**\n{quoted}\n{arm_lines}\n\n## 2026-11-01 — ADR-061: another record\n\nhash `{'f' * 64}`\n"
    )
    sh("git add -A && git commit -q -m part2 && git push -q origin main", work)
    return work


def preflight(work: Path, **env: str) -> subprocess.CompletedProcess:
    return sh("bash scripts/studies/act2/preflight-val.sh", work, env={"OUT": str(work / "artifacts" / "act2"), "PY": "python3", **env}, check=False)


def test_a_world_that_satisfies_the_record_passes(tmp_path):
    work = build_world(tmp_path)
    r = preflight(work)
    assert r.returncode == 0, r.stderr
    assert "preflight-val: ok" in r.stdout and "arms: s lead p020" in r.stdout


@pytest.mark.parametrize("arms,expect", [(("s", "lead"), "arms: s lead"), (("s", "lead", "v"), "arms: s lead v"), (("s", "lead", "p020", "v"), "arms: s lead p020 v")])
def test_the_arms_come_from_the_selection(tmp_path, arms, expect):
    r = preflight(build_world(tmp_path, arms))
    assert r.returncode == 0, r.stderr
    assert expect in r.stdout


def test_a_tracked_file_that_was_edited_stops_it(tmp_path):
    work = build_world(tmp_path)
    (work / "docs" / "DECISIONS.md").write_text((work / "docs" / "DECISIONS.md").read_text() + "\nedited\n")
    r = preflight(work)
    assert r.returncode != 0 and "tracked files are modified" in r.stderr


def test_an_untracked_file_outside_experiments_and_artifacts_stops_it(tmp_path):
    work = build_world(tmp_path)
    (work / "notes.txt").write_text("x")
    assert "untracked files outside" in preflight(work).stderr


def test_a_head_that_is_not_on_the_remote_stops_it(tmp_path):
    work = build_world(tmp_path)
    (work / "docs" / "x.md").write_text("x")
    sh("git add -A && git commit -q -m local", work)
    r = preflight(work)
    assert r.returncode != 0 and "HEAD is not on the remote" in r.stderr


def test_code_or_data_that_changed_after_the_registration_commit_stops_it(tmp_path):
    for path in ("sim/stub.txt", "scripts/studies/act2/common.sh", "experiments/seeds/ironclad-a0-v2.json", "external/pins.json", "experiments/act2/dev-selection.json"):
        work = build_world(tmp_path / path.replace("/", "_"))
        (work / path).write_text((work / path).read_text() + "\n# changed\n")
        sh("git add -A && git commit -q -m changed && git push -q origin main", work)
        r = preflight(work)
        assert r.returncode != 0 and "changed after the registration commit" in r.stderr, path


def test_a_value_file_whose_hash_the_record_does_not_quote_stops_it(tmp_path):
    work = build_world(tmp_path)
    f = work / listing(work, "act2_files")[0]
    f.write_text(f.read_text() + " ")   # a different file from the one the record quotes: also moves the registration check, so move REG
    sh("git add -A && git commit -q -m edit && git push -q origin main", work)
    r = preflight(work, REG=sh("git rev-parse HEAD", work).stdout.strip())
    assert r.returncode != 0 and "does not quote the SHA-256" in r.stderr


def test_an_arm_the_selection_sent_forward_but_the_record_does_not_name_stops_it(tmp_path):
    work = build_world(tmp_path, ("s", "lead", "p020"))
    sel = work / "experiments" / "act2" / "dev-selection.json"
    sel.write_text(json.dumps({"P": {"advance": True, "arm": "p020"}, "V": {"advance": True}}))
    sh("git add -A && git commit -q -m sel && git push -q origin main", work)
    # the selection's hash is no longer the one quoted: that is caught first; quote it and the missing arm is caught
    text = (work / "docs" / "DECISIONS.md").read_text()
    old = [ln for ln in text.splitlines() if "dev-selection.json" in ln][0]
    (work / "docs" / "DECISIONS.md").write_text(text.replace(old, f"- experiments/act2/dev-selection.json: `{sha_of(sel)}`"))
    sh("git add -A && git commit -q -m quote && git push -q origin main", work)
    r = preflight(work, REG=sh("git rev-parse HEAD", work).stdout.strip())
    assert r.returncode != 0 and "does not name the arm v" in r.stderr


def test_a_missing_development_batch_stops_it(tmp_path):
    work = build_world(tmp_path)
    victim = sorted((work / "experiments" / "batches").iterdir())[3]
    shutil.rmtree(victim)
    sh("git add -A && git commit -q -m rm && git push -q origin main", work)
    r = preflight(work, REG=sh("git rev-parse HEAD", work).stdout.strip())
    assert r.returncode != 0 and "development batch" in r.stderr and "is missing" in r.stderr


@pytest.mark.parametrize("path", ["experiments/act2/pooled-act2-L.json", "experiments/act2/pooled-act2-P.json", "experiments/act2/pooled-act2-V.json"])
def test_a_pooled_result_that_exists_stops_it(tmp_path, path):
    work = build_world(tmp_path)
    (work / path).write_text("{}")
    r = preflight(work)
    assert r.returncode != 0 and "the test is run once" in r.stderr


@pytest.mark.parametrize("sub", ["per-class", "determinism"])
def test_per_class_output_or_a_determinism_record_that_exists_stops_it(tmp_path, sub):
    work = build_world(tmp_path)
    d = work / "experiments" / "act2" / sub
    d.mkdir(parents=True)
    (d / "ironclad.json").write_text("{}")
    r = preflight(work)
    assert r.returncode != 0 and "the comparisons are run once" in r.stderr


def test_a_pooled_result_in_the_history_stops_it_even_if_it_was_deleted(tmp_path):
    work = build_world(tmp_path)
    p = work / "experiments" / "act2" / "pooled-act2-L.json"
    p.write_text("{}")
    sh("git add -A && git commit -q -m leak && git rm -q experiments/act2/pooled-act2-L.json && git commit -q -m gone && git push -q origin main", work)
    r = preflight(work, REG=sh("git rev-parse HEAD~2", work).stdout.strip())
    assert r.returncode != 0 and "is in the history" in r.stderr


def test_val_batches_that_exist_stop_it_unless_an_interrupted_run_is_being_resumed(tmp_path):
    work = build_world(tmp_path)
    d = work / "experiments" / "batches" / "act2-s-ironclad-a0-veteran-keeprelics-val-n2000"
    d.mkdir(parents=True)
    (d / "manifest.json").write_text("{}")
    assert "RESUME=1" in preflight(work).stderr
    assert preflight(work, RESUME="1").returncode == 0


def test_a_record_that_never_carries_the_part_two_marker_stops_it(tmp_path):
    work = build_world(tmp_path, marker="Something else")
    r = preflight(work)
    assert r.returncode != 0 and "cannot find the commit that carries ADR-060 part 2" in r.stderr


def test_a_hash_quoted_only_in_a_later_record_does_not_count(tmp_path):
    work = build_world(tmp_path)
    p = work / "docs" / "DECISIONS.md"
    text = p.read_text()
    f = listing(work, "act2_files")[1]
    line = [ln for ln in text.splitlines() if ln.startswith(f"- {f}")][0]
    moved = text.replace(line + "\n", "") + f"\n{line}\n"      # the same hash, now under ADR-061
    p.write_text(moved)
    sh("git add -A && git commit -q -m moved && git push -q origin main", work)
    r = preflight(work, REG=sh("git rev-parse HEAD", work).stdout.strip())
    assert r.returncode != 0 and "does not quote the SHA-256" in r.stderr
