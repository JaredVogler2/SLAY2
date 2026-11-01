"""`scripts/studies/acts/run-val.sh` and `audit.sh` end to end, with a stand-in interpreter for the simulator (ADR-061 items 6, 9 and 10).

The stand-in answers `-m slay2_sim run ...` by writing the manifest a finished batch has (and exits 2, as a batch with simulator errors does) and
`-m slay2_sim audit ...` by writing the audit file; everything else goes to the real interpreter. No game is played. The world is the one the
preflight tests build: a registration commit on a bare "remote".
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import pytest

from slay2_sim import external
from test_acts_preflight import build_world, head, sh

REPO = external.REPO_ROOT
CLASSES = ["Ironclad", "Silent", "Regent", "Necrobinder", "Defect"]
ARMS = ["s", "lead", "a1", "a2", "a3"]
IDS = [f"acts-{a}-{c.lower()}-a0-veteran-keeprelics-val2-n3000" for a in ARMS for c in CLASSES]

STAND_IN = r'''#!/usr/bin/env bash
# a stand-in for `python -m slay2_sim run|audit`; anything else is the real interpreter
if [ "$1" = -m ] && [ "$2" = slay2_sim ] && [ "$3" = run ]; then
  shift 3
  while [ $# -gt 0 ]; do
    case "$1" in
      --batch-id) id=$2; shift 2 ;; --policy) policy=$2; shift 2 ;; --policy-params) params=$2; shift 2 ;; --character) cls=$2; shift 2 ;;
      --partition) part=$2; shift 2 ;; --n) n=$2; shift 2 ;; --offset) off=$2; shift 2 ;; *) shift ;;
    esac
  done
  echo "run $id" >> "$FAKE_LOG"
  [ "${FAKE_FAIL:-}" != "$id" ] || exit 1
  mkdir -p "experiments/batches/$id"
  head=$(git rev-parse HEAD)
  exec python3 - "$id" "$policy" "$params" "$cls" "$part" "$n" "$off" "$head" "${FAKE_COMPLETED:-}" <<'PY'
import json, sys
id_, policy, params, cls, part, n, off, head, completed = sys.argv[1:10]
n, off = int(n), int(off)
done = int(completed) if completed else n - 40
json.dump({
    "batch_id": id_, "policy": {"name": policy, "params": json.loads(params)},
    "config": {"ascension": 0, "keep_relics": True, "character": cls},
    "seeds": {"partition": part, "n": n, **({"offset": off} if off else {})},
    "summary": {"episodes": n, "completed": done, "counts": {"aborted": 0, "harness_error": 0, "policy_error": 0, "invalid_action": 0, "simulator_error": n - done, "win": 3}},
    "class_start_verified": True, "canonical_process_state": True, "environment": {"slay2": {"head": head, "dirty": False}},
}, open(f"experiments/batches/{id_}/manifest.json", "w"))
sys.exit(2)
PY
fi
if [ "$1" = -m ] && [ "$2" = slay2_sim ] && [ "$3" = audit ]; then
  kind=$4; shift 4
  while [ $# -gt 0 ]; do case "$1" in --batch) d=$2; shift 2 ;; *) shift ;; esac; done
  echo "audit $kind $(basename "$d")" >> "$FAKE_LOG"
  [ "${FAKE_FAIL_AUDIT:-}" != "$kind:$(basename "$d")" ] || exit 1
  exit 0
fi
exec python3 "$@"
'''


def world(tmp: Path) -> tuple[Path, Path, dict]:
    work = build_world(tmp)
    stand_in = tmp / "pystandin.sh"
    stand_in.write_text(STAND_IN)
    stand_in.chmod(0o755)
    log = tmp / "calls.log"
    env = {"PY": str(stand_in), "OUT": str(work / "artifacts" / "acts"), "PYTHONPATH": str(REPO / "sim"), "FAKE_LOG": str(log)}
    return work, log, env


def run(work: Path, script: str, env: dict, *args: str, **extra: str) -> subprocess.CompletedProcess:
    full = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t", **env, **extra}
    return subprocess.run(["bash", f"scripts/studies/acts/{script}", *args], cwd=work, env=full, capture_output=True, text=True)


def calls(log: Path) -> list[str]:
    return log.read_text().splitlines() if log.exists() else []


def test_the_run_plays_the_arms_in_the_registered_order_and_checks_each_batch(tmp_path):
    work, log, env = world(tmp_path)
    r = run(work, "run-val.sh", env, "2")
    assert r.returncode == 0, r.stderr
    assert calls(log) == [f"run {i}" for i in IDS]                              # S first, then the lead, then A1, A2, A3; the classes in the registered order
    done = (work / "artifacts" / "acts" / "run-done.txt").read_text().splitlines()
    assert [ln for ln in done if ln.startswith("VAL_")] == [f"VAL_{a}_DONE" for a in ARMS] + ["VAL_DONE"]
    assert (work / "artifacts" / "acts" / "run-head.txt").read_text().strip() == head(work)
    m = json.loads((work / "experiments" / "batches" / IDS[0] / "manifest.json").read_text())
    assert m["policy"]["name"] == "rules_v2" and m["policy"]["params"]["threshold"] == 0.0 and m["seeds"] == {"partition": "val2", "n": 3000}
    a3 = json.loads((work / "experiments" / "batches" / "acts-a3-defect-a0-veteran-keeprelics-val2-n3000" / "manifest.json").read_text())
    assert a3["policy"]["name"] == "rules_v2_late" and a3["policy"]["params"]["late_acts"] == [2] and a3["policy"]["params"]["late_threshold"] == 0.2


def test_the_preflight_only_checks_and_plays_nothing(tmp_path):
    work, log, env = world(tmp_path)
    r = run(work, "run-val.sh", env, "2", PREFLIGHT_ONLY="1")
    assert r.returncode == 0 and "preflight-val: ok" in r.stdout and calls(log) == []
    assert not (work / "artifacts" / "acts" / "run-head.txt").exists()          # no lock, no recorded commit: nothing started


def test_a_failing_preflight_plays_nothing(tmp_path):
    work, log, env = world(tmp_path)
    (work / "docs" / "DECISIONS.md").write_text((work / "docs" / "DECISIONS.md").read_text() + "\nedited\n")
    r = run(work, "run-val.sh", env, "2")
    assert r.returncode != 0 and "tracked files are modified" in r.stderr and calls(log) == []


def test_a_batch_that_fails_stops_the_run_and_it_is_finished_from_the_same_commit_with_resume(tmp_path):
    work, log, env = world(tmp_path)
    r = run(work, "run-val.sh", env, "2", FAKE_FAIL=IDS[7])
    assert r.returncode != 0 and IDS[7] in r.stderr and "failed with status 1" in r.stderr
    assert calls(log) == [f"run {i}" for i in IDS[:8]]                          # nothing after the batch that failed was started
    # without RESUME the preflight refuses: batches on the val2 seeds exist
    refused = run(work, "run-val.sh", env, "2")
    assert refused.returncode != 0 and "RESUME=1" in refused.stderr
    log.write_text("")
    resumed = run(work, "run-val.sh", env, "2", RESUME="1")
    assert resumed.returncode == 0, resumed.stderr
    assert calls(log) == [f"run {i}" for i in IDS[7:]]                          # the seven finished batches are checked and never touched
    assert "VAL_DONE" in (work / "artifacts" / "acts" / "run-done.txt").read_text()


def test_a_resumed_run_has_to_start_from_the_commit_the_first_one_did(tmp_path):
    work, log, env = world(tmp_path)
    assert run(work, "run-val.sh", env, "2", FAKE_FAIL=IDS[3]).returncode != 0
    (work / "docs" / "note.md").write_text("a later commit\n")
    sh("git add -A && git commit -q -m later && git push -q origin main", work)
    r = run(work, "run-val.sh", env, "2", RESUME="1")
    assert r.returncode != 0 and "this run started from" in r.stderr


def test_a_finished_batch_that_is_not_what_was_asked_for_is_not_accepted_on_a_resume(tmp_path):
    work, log, env = world(tmp_path)
    assert run(work, "run-val.sh", env, "2", FAKE_FAIL=IDS[5]).returncode != 0
    m = work / "experiments" / "batches" / IDS[2] / "manifest.json"
    body = json.loads(m.read_text())
    body["policy"]["params"]["late_threshold"] = 0.35
    body["policy"]["params"]["late_acts"] = [2]
    m.write_text(json.dumps(body))
    r = run(work, "run-val.sh", env, "2", RESUME="1")
    assert r.returncode != 0 and IDS[2] in r.stderr and "policy parameters" in r.stderr


def test_a_batch_that_completed_under_ninety_percent_stops_the_run(tmp_path):
    work, log, env = world(tmp_path)
    r = run(work, "run-val.sh", env, "2", FAKE_COMPLETED="2600")
    assert r.returncode != 0 and "only 2600 of 3000 completed" in r.stderr
    assert calls(log) == [f"run {IDS[0]}"]


# ---- audit.sh ----------------------------------------------------------------------------------------------------------------------------------

def finished(work: Path, wins: int = 3) -> None:
    for i in IDS:
        d = work / "experiments" / "batches" / i
        d.mkdir(parents=True, exist_ok=True)
        (d / "manifest.json").write_text(json.dumps({"summary": {"counts": {"win": 0 if i.startswith("acts-a1-silent") else wins}}}))


@pytest.mark.parametrize("jobs", ["1", "4"])
def test_every_batch_gets_its_sample_and_every_batch_with_wins_gets_its_wins_audited(tmp_path, jobs):
    work, log, env = world(tmp_path)
    finished(work)
    r = run(work, "audit.sh", env, AUDIT_JOBS=jobs)
    assert r.returncode == 0, r.stderr
    got = sorted(calls(log))
    want = sorted([f"audit sample {i}" for i in IDS] + [f"audit wins {i}" for i in IDS if not i.startswith("acts-a1-silent")])
    assert got == want                                  # no win audit for the batch with no win; the same calls whatever the number of jobs
    assert (work / "artifacts" / "acts" / "audit-done.txt").read_text().splitlines()[-1] == "AUDIT_DONE"


@pytest.mark.parametrize("failing", ["wins:acts-lead-regent-a0-veteran-keeprelics-val2-n3000", "sample:acts-a3-defect-a0-veteran-keeprelics-val2-n3000"])
def test_a_failed_audit_never_ends_as_audit_done(tmp_path, failing):
    work, log, env = world(tmp_path)
    finished(work)
    r = run(work, "audit.sh", env, AUDIT_JOBS="4", FAKE_FAIL_AUDIT=failing)
    assert r.returncode != 0
    lines = (work / "artifacts" / "acts" / "audit-done.txt").read_text().splitlines()
    assert "AUDIT_DONE" not in lines and lines[-1].startswith("AUDIT_FAILED")
    assert any(ln.endswith("exit=1") for ln in lines)


def test_audit_refuses_while_a_batch_has_no_manifest(tmp_path):
    work, log, env = world(tmp_path)
    finished(work)
    (work / "experiments" / "batches" / IDS[10] / "manifest.json").unlink()
    r = run(work, "audit.sh", env)
    assert r.returncode != 0 and IDS[10] in r.stderr and "the run is not finished" in r.stderr and calls(log) == []
    assert run(work, "audit.sh", env, "val").returncode == 2                         # only the val2 partition is audited here
