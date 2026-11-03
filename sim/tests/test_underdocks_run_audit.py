"""`scripts/studies/underdocks/run-val.sh` and `audit.sh` end to end, with a stand-in interpreter for the simulator (ADR-064 items 3, 10 and 11).

The stand-in answers `-m slay2_sim run ...` by writing the manifest a finished batch has (and exits 2, as a batch with simulator errors does) and
`-m slay2_sim audit ...` by logging the call; everything else goes to the real interpreter. No game is played. The world is the one the preflight tests
build: a registration commit on a bare "remote".
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import pytest

from slay2_sim import external
from test_underdocks_preflight import build, git

REPO = external.REPO_ROOT
CLASSES = ["Ironclad", "Silent", "Regent", "Necrobinder", "Defect"]
# the registered order: T2 (shown values, rules_v1), T3 (opening-relic rule, baseline), T1 (A*, d0*), classes in the order of the registration within each test
ARM_ORDER = [("rules_v2-shownvals", "rules_v2"), ("rules_v1", "rules_v1"), ("rules_v2_neow_values-keepvals", "rules_v2_neow_values"), ("rules_v2", "rules_v2"),
             ("advisor_v1-astar", "advisor_v1"), ("advisor_v1-d0star", "advisor_v1")]
# the order of the runs: for each test, for each class, its two arms
ORDER = [(arm, pol, cls) for pair in ((0, 1), (2, 3), (4, 5)) for cls in CLASSES for arm, pol in (ARM_ORDER[pair[0]], ARM_ORDER[pair[1]])]
IDS = [f"{arm}-{cls.lower()}-a0-veteran-keeprelics-underdocks-val-n2000" for arm, _, cls in ORDER]

STAND_IN = r'''#!/usr/bin/env bash
# a stand-in for `python -m slay2_sim run|audit`; anything else is the real interpreter
if [ "$1" = -m ] && [ "$2" = slay2_sim ] && [ "$3" = run ]; then
  shift 3
  keep=false
  while [ $# -gt 0 ]; do
    case "$1" in
      --batch-id) id=$2; shift 2 ;; --policy) policy=$2; shift 2 ;; --policy-params) params=$2; shift 2 ;; --character) cls=$2; shift 2 ;;
      --partition) part=$2; shift 2 ;; --n) n=$2; shift 2 ;; --offset) off=$2; shift 2 ;; --act1) act1=$2; shift 2 ;; --ascension) asc=$2; shift 2 ;;
      --out) out=$2; shift 2 ;; --profile) profile=$2; shift 2 ;; --keep-relics) keep=true; shift ;; *) shift ;;
    esac
  done
  echo "run $id | $policy | $params | $cls | act1=$act1 asc=$asc keep=$keep | $part off=$off n=$n | $out" >> "$FAKE_LOG"
  [ "${FAKE_FAIL:-}" != "$id" ] || exit 1
  mkdir -p "$out"
  head=$(git rev-parse HEAD)
  wins=3
  if [ -n "${FAKE_NOWIN:-}" ] && [[ "$id" =~ $FAKE_NOWIN ]]; then wins=0; fi
  exec "${REAL_PY:-python3}" - "$id" "$policy" "$params" "$cls" "$part" "$n" "$off" "$head" "$act1" "$asc" "$keep" "$out" "$wins" "${FAKE_COMPLETED:-}" "$profile" <<'PY'
import json, sys
id_, policy, params, cls, part, n, off, head, act1, asc, keep, out, wins, completed, profile = sys.argv[1:16]
n, off, wins = int(n), int(off), int(wins)
done = int(completed) if completed else n - 40
config = {"ascension": int(asc), "keep_relics": keep == "true", "character": cls, "profile": profile}
if act1 != "overgrowth":
    config["act1"] = act1
json.dump({
    "batch_id": id_, "policy": {"name": policy, "params": json.loads(params)}, "config": config,
    "seeds": {"partition": part, "n": n, **({"offset": off} if off else {})},
    "summary": {"episodes": n, "completed": done, "counts": {"aborted": 0, "harness_error": 0, "policy_error": 0, "invalid_action": 0, "simulator_error": n - done, "win": wins}},
    "class_start_verified": True, "canonical_process_state": True, "environment": {"slay2": {"head": head, "dirty": False}},
}, open(f"{out}/manifest.json", "w"))
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
exec "${REAL_PY:-python3}" "$@"
'''


def world(tmp: Path) -> tuple[Path, Path, dict]:
    work = build(tmp)
    stand_in = tmp / "pystandin.sh"
    stand_in.write_text(STAND_IN)
    stand_in.chmod(0o755)
    log = tmp / "calls.log"
    env = {"PY": str(stand_in), "REAL_PY": sys.executable, "OUT": str(work / "artifacts" / "underdocks"), "PYTHONPATH": str(REPO / "sim"), "FAKE_LOG": str(log)}
    return work, log, env


def run(work: Path, script: str, env: dict, *args: str, **extra: str) -> subprocess.CompletedProcess:
    full = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t", **env, **extra}
    return subprocess.run(["bash", f"scripts/studies/underdocks/{script}", *args], cwd=work, env=full, capture_output=True, text=True)


def calls(log: Path) -> list[str]:
    return log.read_text().splitlines() if log.exists() else []


def batches(work: Path) -> Path:
    return work / "experiments" / "underdocks" / "batches"


def arm_params(cls: str, out: Path) -> list[str]:
    text = subprocess.run(["bash", "-c", f"OUT={out} PY=python3 source scripts/studies/underdocks/common.sh; arm_params {cls}"], cwd=REPO, capture_output=True, text=True, check=True).stdout
    return text.splitlines()


def test_the_run_plays_the_thirty_batches_in_the_registered_order_with_the_registered_arguments(tmp_path):
    work, log, env = world(tmp_path)
    r = run(work, "run-val.sh", env, "2")
    assert r.returncode == 0, r.stderr
    got = calls(log)
    assert [c.split(" | ")[0] for c in got] == [f"run {i}" for i in IDS]
    names = ["advisor_v1-astar", "advisor_v1-d0star", "rules_v2-shownvals", "rules_v1", "rules_v2_neow_values-keepvals", "rules_v2"]
    for call, (arm, policy, cls) in zip(got, ORDER):
        _, pol, params, character, flags, seeds, out = call.split(" | ")
        want_params = arm_params(cls, tmp_path / "scratch")[names.index(arm)]
        assert pol == policy and json.loads(params) == json.loads(want_params) and character == cls, call
        assert flags == "act1=underdocks asc=0 keep=true" and seeds == "val off=0 n=2000", call            # Act 1 in Underdocks, Ascension 0, the relics kept, the 2,000 val seeds
        assert out == f"experiments/underdocks/batches/{arm}-{cls.lower()}-a0-veteran-keeprelics-underdocks-val-n2000"
    done = (work / "artifacts" / "underdocks" / "run-done.txt").read_text().splitlines()
    assert [ln for ln in done if ln.startswith("VAL_")] == ["VAL_T2_DONE", "VAL_T3_DONE", "VAL_T1_DONE", "VAL_DONE"]
    assert all(ln.endswith("_EXIT=2") for ln in done if ln.startswith("RUN_")) and len([ln for ln in done if ln.startswith("RUN_")]) == 30
    assert (work / "artifacts" / "underdocks" / "run-head.txt").read_text().strip() == git(work, "git rev-parse HEAD").stdout.strip()


def test_the_preflight_only_checks_and_plays_nothing(tmp_path):
    work, log, env = world(tmp_path)
    r = run(work, "run-val.sh", env, "2", PREFLIGHT_ONLY="1")
    assert r.returncode == 0 and "preflight-val: ok" in r.stdout and calls(log) == []
    assert not (work / "artifacts" / "underdocks" / "run-head.txt").exists()        # no lock, no recorded commit: nothing started


def test_a_failing_preflight_plays_nothing(tmp_path):
    work, log, env = world(tmp_path)
    (work / "docs" / "DECISIONS.md").write_text((work / "docs" / "DECISIONS.md").read_text() + "\nedited\n")
    r = run(work, "run-val.sh", env, "2")
    assert r.returncode != 0 and "tracked files are modified" in r.stderr and calls(log) == []


def test_a_batch_that_fails_stops_the_run_and_it_is_finished_from_the_same_commit_with_resume(tmp_path):
    work, log, env = world(tmp_path)
    r = run(work, "run-val.sh", env, "2", FAKE_FAIL=IDS[7])
    assert r.returncode != 0 and IDS[7] in r.stderr and "failed with status 1" in r.stderr
    assert [c.split(" | ")[0] for c in calls(log)] == [f"run {i}" for i in IDS[:8]]  # nothing after the batch that failed was started
    refused = run(work, "run-val.sh", env, "2")                                        # without RESUME the preflight refuses: batches of the study exist
    assert refused.returncode != 0 and "RESUME=1" in refused.stderr
    log.write_text("")
    resumed = run(work, "run-val.sh", env, "2", RESUME="1")
    assert resumed.returncode == 0, resumed.stderr
    assert [c.split(" | ")[0] for c in calls(log)] == [f"run {i}" for i in IDS[7:]]  # the seven finished batches are checked and never touched
    assert "VAL_DONE" in (work / "artifacts" / "underdocks" / "run-done.txt").read_text()


def test_a_resumed_run_has_to_start_from_the_commit_the_first_one_did(tmp_path):
    work, log, env = world(tmp_path)
    assert run(work, "run-val.sh", env, "2", FAKE_FAIL=IDS[3]).returncode != 0
    (work / "docs" / "note.md").write_text("a later commit\n")
    git(work, "git add -A && git commit -q -m later && git push -q origin main")
    r = run(work, "run-val.sh", env, "2", RESUME="1")
    assert r.returncode != 0 and "this run started from" in r.stderr


@pytest.mark.parametrize(
    "change,message",
    [
        (lambda m: m["config"].pop("act1"), "Act 1 overgrowth"),
        (lambda m: m["config"].update(character="Ironclad"), "played as Ironclad, not Silent"),
        (lambda m: m["policy"].update(params={"threshold": 0.5}), "policy parameters"),
        (lambda m: m["policy"].update(name="rules_v1"), "policy rules_v1"),
        (lambda m: m["config"].update(keep_relics=False), "relics not kept"),
        (lambda m: m["config"].update(profile="first_run"), "profile first_run"),
        (lambda m: m["summary"].update(completed=1000), "only 1000 of 2000 completed"),
    ],
    ids=["act1", "character", "params", "policy", "relics", "profile", "completed"],
)
def test_a_finished_batch_that_is_not_what_was_asked_for_is_not_accepted_on_a_resume(tmp_path, change, message):
    work, log, env = world(tmp_path)
    assert run(work, "run-val.sh", env, "2", FAKE_FAIL=IDS[5]).returncode != 0
    f = batches(work) / IDS[2] / "manifest.json"
    body = json.loads(f.read_text())
    change(body)
    f.write_text(json.dumps(body))
    log.write_text("")
    r = run(work, "run-val.sh", env, "2", RESUME="1")
    assert r.returncode != 0 and message in r.stderr and IDS[2] in r.stderr, r.stderr
    assert calls(log) == []                                                              # it stopped at the batch, before playing another


def test_a_batch_with_too_many_games_not_completed_stops_the_run_when_it_ends(tmp_path):
    work, log, env = world(tmp_path)
    r = run(work, "run-val.sh", env, "2", FAKE_COMPLETED="1700")
    assert r.returncode != 0 and "only 1700 of 2000 completed" in r.stderr
    assert len(calls(log)) == 1                                                          # the first batch stopped the run


def test_a_tracked_file_changed_during_the_run_stops_it_before_the_next_batch(tmp_path):
    work, log, env = world(tmp_path)
    assert run(work, "run-val.sh", env, "2", FAKE_FAIL=IDS[4]).returncode != 0
    (work / "docs" / "DECISIONS.md").write_text((work / "docs" / "DECISIONS.md").read_text() + "\nedited during the run\n")
    r = run(work, "run-val.sh", env, "2", RESUME="1")
    assert r.returncode != 0 and "tracked files are modified" in r.stderr                 # the preflight of a resumed run reads the tree again
    assert calls(log)[-1].startswith("run " + IDS[4])                                      # (the stand-in's last call is the batch that failed: nothing after it)


def test_two_runs_cannot_hold_the_lock_at_once(tmp_path):
    work, log, env = world(tmp_path)
    lock = work / "artifacts" / "underdocks" / "run.lock"
    lock.parent.mkdir(parents=True, exist_ok=True)
    holder = subprocess.Popen(["flock", "-n", str(lock), "sleep", "30"])
    try:
        for _ in range(100):                                                             # wait (at most five seconds) until the holder has the lock
            if lock.exists():
                break
            time.sleep(0.05)
        time.sleep(0.3)
        r = run(work, "run-val.sh", env, "2")
        assert r.returncode != 0 and "another run holds" in r.stderr and calls(log) == []
    finally:
        holder.kill()
        holder.wait()


# ---- the audits


def finished(tmp_path: Path, **extra: str) -> tuple[Path, Path, dict]:
    work, log, env = world(tmp_path)
    assert run(work, "run-val.sh", env, "2", **extra).returncode == 0
    log.write_text("")
    return work, log, env


def test_the_audit_re_derives_every_win_and_samples_every_batch_and_its_marker_file_carries_exit_codes_only(tmp_path):
    work, log, env = finished(tmp_path, FAKE_NOWIN="-silent-a0-")
    r = run(work, "audit.sh", env)
    assert r.returncode == 0, r.stderr
    got = calls(log)
    silent = {i for i in IDS if "-silent-a0-" in i}
    assert len(silent) == 6                                                              # the six batches of one class had no win
    assert sorted(c[len("audit sample "):] for c in got if c.startswith("audit sample ")) == sorted(IDS)       # a sample of every batch of the thirty
    assert sorted(c[len("audit wins "):] for c in got if c.startswith("audit wins ")) == sorted(set(IDS) - silent)  # every win re-derived: no win audit where there is none
    marker = (work / "artifacts" / "underdocks" / "audit-done.txt").read_text().splitlines()
    assert marker[-1] == "AUDIT_DONE"
    assert all(re.fullmatch(r"(wins|sample) \S+ exit=\d+", ln) for ln in marker[:-1])  # no count of wins in a file that is read while the run waits
    assert len(marker) == 30 + 30 + 1                                                    # a wins line and a sample line for each batch (exit 0 for a batch with no win to audit), then the end marker


@pytest.mark.parametrize("kind", ["wins", "sample"])
def test_an_audit_that_fails_does_not_end_as_done(tmp_path, kind):
    work, log, env = finished(tmp_path)
    r = run(work, "audit.sh", env, FAKE_FAIL_AUDIT=f"{kind}:{IDS[9]}")
    assert r.returncode != 0
    marker = (work / "artifacts" / "underdocks" / "audit-done.txt").read_text().splitlines()
    assert "AUDIT_DONE" not in marker and any(ln.startswith("AUDIT_FAILED=") for ln in marker)
    assert f"{kind} {IDS[9]} exit=1" in marker


def test_the_audit_refuses_a_run_that_is_not_finished(tmp_path):
    work, log, env = world(tmp_path)
    assert run(work, "run-val.sh", env, "2", FAKE_FAIL=IDS[12]).returncode != 0
    log.write_text("")
    r = run(work, "audit.sh", env)
    assert r.returncode != 0 and "the run is not finished" in r.stderr and calls(log) == []
