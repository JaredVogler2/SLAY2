"""`scripts/studies/skip/run-val.sh` and `audit.sh` end to end, with a stand-in interpreter for the simulator (ADR-065 items 3 and 4).

The stand-in answers `-m slay2_sim run ...` by writing the manifest a finished batch has (and exits 2, as a batch with simulator errors does), and by logging every argument
the registration fixes, and `-m slay2_sim audit ...` by logging the call; everything else goes to the real interpreter. No game is played. The world is the one the preflight
tests build: a registration commit on a bare "remote", with the baselines of both legs and the pooled tests of ADR-064 in place. The preflight of each run replays the five
baselines of the leg (the stand-in logs those calls too, as `audit sample replay.*`; they are not the audits of the arm that is played here).
"""

from __future__ import annotations

import fcntl
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from test_skip_preflight import ADR064_POOLED, build, git

CLASSES = ["Ironclad", "Silent", "Regent", "Necrobinder", "Defect"]
LEGS = ["og", "ud"]
S1_PARAMS = {"engines": 0, "margin": 0.0, "needs": 1, "scalers": 0.7, "size": 1.0, "size_from": 20}
S0_PARAMS = {"engines": 0, "margin": 0.0, "needs": 1, "scalers": 0.7}
ACT1 = {"og": "overgrowth", "ud": "underdocks"}
IDS = {leg: [f"advisor_v1-slot-{c.lower()}-a0-veteran-keeprelics{'-underdocks' if leg == 'ud' else ''}-val-n2000" for c in CLASSES] for leg in LEGS}

STAND_IN = r'''#!/usr/bin/env bash
# a stand-in for `python -m slay2_sim run|audit`; anything else is the real interpreter
if [ "$1" = -m ] && [ "$2" = slay2_sim ] && [ "$3" = run ]; then
  shift 3
  keep=false
  while [ $# -gt 0 ]; do
    case "$1" in
      --batch-id) id=$2; shift 2 ;; --policy) policy=$2; shift 2 ;; --policy-params) params=$2; shift 2 ;; --character) cls=$2; shift 2 ;;
      --partition) part=$2; shift 2 ;; --n) n=$2; shift 2 ;; --offset) off=$2; shift 2 ;; --act1) act1=$2; shift 2 ;; --ascension) asc=$2; shift 2 ;;
      --profile) profile=$2; shift 2 ;; --seeds) seeds=$2; shift 2 ;; --workers) workers=$2; shift 2 ;; --trace) trace=$2; shift 2 ;;
      --out) out=$2; shift 2 ;; --keep-relics) keep=true; shift ;; *) shift ;;
    esac
  done
  echo "run $id | $policy | $params | $cls | act1=$act1 asc=$asc keep=$keep profile=$profile | $part off=$off n=$n | seeds=$seeds workers=$workers trace=$trace | $out" >> "$FAKE_LOG"
  [ "${FAKE_FAIL:-}" != "$id" ] || exit 1
  mkdir -p "$out"
  head=$(git rev-parse HEAD)
  wins=3
  if [ -n "${FAKE_NOWIN:-}" ] && [[ "$id" =~ $FAKE_NOWIN ]]; then wins=0; fi
  [ "${FAKE_DIRTY_AFTER:-}" != "$id" ] || echo "edited while the run goes on" >> docs/DECISIONS.md
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
  case " ${FAKE_FAIL_AUDIT:-} " in *" $kind:$(basename "$d") "*) exit 1 ;; esac      # FAKE_FAIL_AUDIT: a list of kind:batch
  exit 0
fi
exec "${REAL_PY:-python3}" "$@"
'''


@pytest.fixture(scope="module")
def world(tmp_path_factory) -> Path:
    return build(tmp_path_factory.mktemp("skiprun"))


@pytest.fixture
def work(world: Path, tmp_path: Path) -> Path:
    dest = tmp_path / "work"
    shutil.copytree(world, dest, symlinks=True)
    shutil.copytree(world.parent / "remote.git", tmp_path / "remote.git", symlinks=True)
    git(dest, f"git remote set-url origin {tmp_path / 'remote.git'}")
    stand_in = tmp_path / "pystandin.sh"
    stand_in.write_text(STAND_IN)
    stand_in.chmod(0o755)
    return dest


def run(work: Path, script: str, *args: str, **extra: str) -> subprocess.CompletedProcess:
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t",
           "PY": str(work.parent / "pystandin.sh"), "REAL_PY": sys.executable, "FAKE_LOG": str(work.parent / "calls.log"), "OUT": str(work / "artifacts" / "skip"),
           "PYTHONPATH": "", **extra}
    return subprocess.run(["bash", f"scripts/studies/skip/{script}", *args], cwd=work, env=env, capture_output=True, text=True)


def calls(work: Path) -> list[str]:
    log = work.parent / "calls.log"
    return log.read_text().splitlines() if log.exists() else []


def runs(work: Path) -> list[str]:
    """The batches the run asked the simulator to play, in order."""
    return [c for c in calls(work) if c.startswith("run ")]


def replays(work: Path) -> list[str]:
    return [c for c in calls(work) if c.startswith("audit sample replay.")]


def audits(work: Path) -> list[str]:
    """The audits of the arm played here (not the replays of the baselines that the preflight makes)."""
    return [c for c in calls(work) if c.startswith("audit ") and not c.startswith("audit sample replay.")]


def reset(work: Path) -> None:
    (work.parent / "calls.log").write_text("")


def out_dir(work: Path) -> Path:
    return work / "artifacts" / "skip"


def batches(work: Path) -> Path:
    return work / "experiments" / "skip" / "batches"


def amend(work: Path, id_: str, change) -> None:
    f = batches(work) / id_ / "manifest.json"
    body = json.loads(f.read_text())
    change(body)
    f.write_text(json.dumps(body))


# ---- the run
@pytest.mark.parametrize("leg", LEGS)
def test_the_run_plays_the_five_batches_of_the_leg_in_class_order_with_the_registered_arguments(work, leg):
    r = run(work, "run-val.sh", leg, "2")
    assert r.returncode == 0, r.stderr
    got = runs(work)
    assert [c.split(" | ")[0] for c in got] == [f"run {i}" for i in IDS[leg]]
    assert len(replays(work)) == 5 and calls(work)[:5] == replays(work)                                  # the baselines were replayed first, then the arm was played
    for call, cls, id_ in zip(got, CLASSES, IDS[leg]):
        _, policy, params, character, flags, seeds, files, out = call.split(" | ")
        assert policy == "advisor_v1" and json.loads(params) == S1_PARAMS and character == cls, call
        assert flags == f"act1={ACT1[leg]} asc=0 keep=true profile=veteran", call                       # the leg's Act 1, Ascension 0, the relics kept, veteran
        assert seeds == "val off=0 n=2000", call                                                         # the 2,000 val seeds, from the first
        assert files == "seeds=experiments/seeds/ironclad-a0-v2.json workers=2 trace=0", call
        assert out == f"experiments/skip/batches/{id_}", call
    done = (out_dir(work) / "run-done.txt").read_text().splitlines()
    assert [ln for ln in done if ln.startswith("RUN_")] == [f"RUN_{i}_EXIT=2" for i in IDS[leg]]
    assert [ln for ln in done if not ln.startswith("RUN_")] == [f"VAL_{leg}_DONE"]
    assert (out_dir(work) / f"run-head-{leg}.txt").read_text().strip() == git(work, "git rev-parse HEAD").stdout.strip()
    other = "ud" if leg == "og" else "og"
    assert not (out_dir(work) / f"run-head-{other}.txt").exists() and not any((batches(work) / i).exists() for i in IDS[other])
    for i in IDS[leg]:
        assert json.loads((batches(work) / i / "manifest.json").read_text())["policy"]["params"] == S1_PARAMS


@pytest.mark.parametrize("leg", LEGS)
def test_the_preflight_only_checks_and_plays_nothing(work, leg):
    r = run(work, "run-val.sh", leg, "2", PREFLIGHT_ONLY="1")
    assert r.returncode == 0 and "preflight-val: ok" in r.stdout and runs(work) == []
    assert not (out_dir(work) / f"run-head-{leg}.txt").exists() and not (out_dir(work) / "run.lock").exists()          # no lock, no recorded commit: nothing started
    assert not (work / "experiments" / "skip" / "batches").exists()


def test_a_failing_preflight_plays_nothing(work):
    (work / "docs" / "DECISIONS.md").write_text((work / "docs" / "DECISIONS.md").read_text() + "\nedited\n")
    r = run(work, "run-val.sh", "og", "2")
    assert r.returncode != 0 and "tracked files are modified" in r.stderr and calls(work) == []


def test_the_underdocks_run_does_not_start_before_adr_064_is_pooled(work):
    (work / "experiments" / "underdocks" / f"{ADR064_POOLED[2]}.json").unlink()
    r = run(work, "run-val.sh", "ud", "2")
    assert r.returncode != 0 and "ADR-064 has not been pooled yet" in r.stderr and calls(work) == []
    assert not (out_dir(work) / "run-head-ud.txt").exists() and not (work / "experiments" / "skip" / "batches").exists()
    assert run(work, "run-val.sh", "og", "2").returncode == 0                                            # the Overgrowth leg does not wait for it


@pytest.mark.parametrize("leg", LEGS)
def test_a_batch_that_fails_stops_the_run_and_it_is_finished_from_the_same_commit_with_resume(work, leg):
    r = run(work, "run-val.sh", leg, "2", FAKE_FAIL=IDS[leg][2])
    assert r.returncode != 0 and IDS[leg][2] in r.stderr and "failed with status 1" in r.stderr
    assert [c.split(" | ")[0] for c in runs(work)] == [f"run {i}" for i in IDS[leg][:3]]                  # nothing after the batch that failed was started
    assert f"VAL_{leg}_DONE" not in (out_dir(work) / "run-done.txt").read_text()
    refused = run(work, "run-val.sh", leg, "2")                                                          # without RESUME the preflight refuses: batches of the leg exist
    assert refused.returncode != 0 and "RESUME=1" in refused.stderr
    reset(work)
    resumed = run(work, "run-val.sh", leg, "2", RESUME="1")
    assert resumed.returncode == 0, resumed.stderr
    assert [c.split(" | ")[0] for c in runs(work)] == [f"run {i}" for i in IDS[leg][2:]]                # the two finished batches are checked and never touched
    assert f"VAL_{leg}_DONE" in (out_dir(work) / "run-done.txt").read_text()


@pytest.mark.parametrize("leg", LEGS)
def test_a_resumed_run_has_to_start_from_the_commit_the_first_one_did(work, leg):
    assert run(work, "run-val.sh", leg, "2", FAKE_FAIL=IDS[leg][1]).returncode != 0
    (work / "docs" / "note.md").write_text("a later commit\n")
    git(work, "git add -A && git commit -q -m later && git push -q origin main")
    reset(work)
    r = run(work, "run-val.sh", leg, "2", RESUME="1")
    assert r.returncode != 0 and "this leg started from" in r.stderr and runs(work) == []


def test_each_leg_keeps_the_commit_it_started_from(work):
    assert run(work, "run-val.sh", "og", "2").returncode == 0
    (work / "docs" / "note.md").write_text("a later commit, between the two legs\n")
    git(work, "git add -A && git commit -q -m later && git push -q origin main")
    assert run(work, "run-val.sh", "ud", "2").returncode == 0
    heads = {leg: (out_dir(work) / f"run-head-{leg}.txt").read_text().strip() for leg in LEGS}
    assert heads["og"] != heads["ud"] and heads["ud"] == git(work, "git rev-parse HEAD").stdout.strip()


@pytest.mark.parametrize(
    "leg,change,message",
    [
        ("og", lambda m: m["config"].update(act1="underdocks"), "Act 1 underdocks, not overgrowth"),
        ("ud", lambda m: m["config"].pop("act1"), "Act 1 overgrowth, not underdocks"),
        ("og", lambda m: m["policy"].update(params=dict(S0_PARAMS)), "price None from None"),                            # the baseline's parameters: no price
        ("ud", lambda m: m["policy"]["params"].update(size=0.6), "price 0.6 from 20"),
        ("ud", lambda m: m["policy"]["params"].update(scalers=0.5), "policy parameters"),
        ("og", lambda m: m["config"].update(character="Ironclad"), "played as Ironclad, not Silent"),
        ("ud", lambda m: m["config"].update(character="Regent"), "played as Regent, not Silent"),
        ("og", lambda m: m["summary"].update(completed=1000), "only 1000 of 2000 completed"),
        ("ud", lambda m: m["summary"].update(completed=1799), "only 1799 of 2000 completed"),
        ("og", lambda m: m["policy"].update(name="rules_v1"), "policy rules_v1"),
        ("ud", lambda m: m["config"].update(keep_relics=False), "relics not kept"),
    ],
    ids=["act1-og", "act1-ud", "price-dropped", "price-0.6", "params", "character-og", "character-ud", "completed-og", "completed-ud", "policy", "relics"],
)
def test_a_finished_batch_that_is_not_what_was_asked_for_is_not_accepted_on_a_resume(work, leg, change, message):
    assert run(work, "run-val.sh", leg, "2", FAKE_FAIL=IDS[leg][3]).returncode != 0
    amend(work, IDS[leg][1], change)                                                                      # Silent's batch, finished before the failure
    reset(work)
    r = run(work, "run-val.sh", leg, "2", RESUME="1")
    assert r.returncode != 0 and message in r.stderr and IDS[leg][1] in r.stderr, r.stderr
    assert runs(work) == []                                                                               # it stopped at the batch, before playing another


@pytest.mark.parametrize("leg", LEGS)
def test_a_batch_with_too_many_games_not_completed_stops_the_run_when_it_ends(work, leg):
    r = run(work, "run-val.sh", leg, "2", FAKE_COMPLETED="1700")
    assert r.returncode != 0 and "only 1700 of 2000 completed" in r.stderr
    assert len(runs(work)) == 1                                                                           # the first batch stopped the run


def test_a_tracked_file_changed_while_the_run_goes_on_stops_it_before_the_next_batch(work):
    r = run(work, "run-val.sh", "og", "2", FAKE_DIRTY_AFTER=IDS["og"][1])
    assert r.returncode != 0 and "guard_tree: tracked files are modified" in r.stderr
    assert [c.split(" | ")[0] for c in runs(work)] == [f"run {i}" for i in IDS["og"][:2]]                # the batch that changed it was the last to be played
    assert "VAL_og_DONE" not in (out_dir(work) / "run-done.txt").read_text()


def test_a_tracked_file_changed_between_a_failure_and_the_resume_stops_it_in_the_preflight(work):
    assert run(work, "run-val.sh", "og", "2", FAKE_FAIL=IDS["og"][4]).returncode != 0
    (work / "docs" / "DECISIONS.md").write_text((work / "docs" / "DECISIONS.md").read_text() + "\nedited during the run\n")
    reset(work)
    r = run(work, "run-val.sh", "og", "2", RESUME="1")
    assert r.returncode != 0 and "tracked files are modified" in r.stderr and calls(work) == []


def test_two_runs_cannot_hold_the_lock_at_once(work):
    lock = out_dir(work) / "run.lock"
    lock.parent.mkdir(parents=True, exist_ok=True)
    with open(lock, "w") as held:                                                                         # this process is the other run: it holds the lock the script takes
        fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
        r = run(work, "run-val.sh", "og", "2")
        assert r.returncode != 0 and "another run holds" in r.stderr and runs(work) == []
        assert not (out_dir(work) / "run-head-og.txt").exists()                                           # and it did not record a start
    assert run(work, "run-val.sh", "og", "2").returncode == 0                                              # once the lock is free the same run goes through


# ---- the audits
def finished(work: Path, leg: str, **extra: str) -> None:
    assert run(work, "run-val.sh", leg, "2", **extra).returncode == 0
    reset(work)


@pytest.mark.parametrize("leg", LEGS)
def test_the_audit_re_derives_every_win_and_samples_every_batch_and_its_marker_file_carries_exit_codes_only(work, leg):
    finished(work, leg, FAKE_NOWIN="-silent-a0-")
    r = run(work, "audit.sh", leg)
    assert r.returncode == 0, r.stderr
    got = audits(work)
    silent = {i for i in IDS[leg] if "-silent-a0-" in i}
    assert len(silent) == 1                                                                               # the batch of one class had no win
    assert sorted(c[len("audit sample "):] for c in got if c.startswith("audit sample ")) == sorted(IDS[leg])                  # a sample of every batch of the leg
    assert sorted(c[len("audit wins "):] for c in got if c.startswith("audit wins ")) == sorted(set(IDS[leg]) - silent)         # every win re-derived: no win audit where there is none
    marker = (out_dir(work) / f"audit-done-{leg}.txt").read_text().splitlines()
    assert marker[-1] == "AUDIT_DONE"
    assert all(re.fullmatch(r"(wins|sample) \S+ exit=\d+", ln) for ln in marker[:-1])                    # no count of wins in a file that is read while the run waits
    assert sorted(ln for ln in marker[:-1]) == sorted([f"wins {i} exit=0" for i in IDS[leg]] + [f"sample {i} exit=0" for i in IDS[leg]])   # a line of each kind for every batch
    assert not (out_dir(work) / f"audit-done-{'ud' if leg == 'og' else 'og'}.txt").exists()                # the other leg's marker is its own


@pytest.mark.parametrize("kind", ["wins", "sample"])
@pytest.mark.parametrize("leg", LEGS)
def test_an_audit_that_fails_does_not_end_as_done(work, leg, kind):
    finished(work, leg)
    r = run(work, "audit.sh", leg, FAKE_FAIL_AUDIT=f"{kind}:{IDS[leg][3]}")
    assert r.returncode != 0
    marker = (out_dir(work) / f"audit-done-{leg}.txt").read_text().splitlines()
    assert "AUDIT_DONE" not in marker and "AUDIT_FAILED=1" in marker
    assert f"{kind} {IDS[leg][3]} exit=1" in marker
    assert len([ln for ln in audits(work) if ln.startswith("audit sample ")]) == 5                         # the others were audited all the same


def test_every_audit_that_fails_is_counted(work):
    finished(work, "og")
    r = run(work, "audit.sh", "og", FAKE_FAIL_AUDIT=f"sample:{IDS['og'][0]} wins:{IDS['og'][1]} sample:{IDS['og'][1]}")
    marker = (out_dir(work) / "audit-done-og.txt").read_text().splitlines()
    assert r.returncode != 0 and "AUDIT_FAILED=3" in marker and "AUDIT_DONE" not in marker


@pytest.mark.parametrize("leg", LEGS)
def test_the_audit_refuses_a_leg_that_is_not_finished(work, leg):
    assert run(work, "run-val.sh", leg, "2", FAKE_FAIL=IDS[leg][3]).returncode != 0
    reset(work)
    r = run(work, "audit.sh", leg)
    assert r.returncode != 0 and "the leg is not finished" in r.stderr and calls(work) == []
    assert not (out_dir(work) / f"audit-done-{leg}.txt").exists()


def test_the_audit_of_a_leg_that_was_never_run_is_refused_and_an_unknown_leg_is_a_usage_error(work):
    r = run(work, "audit.sh", "ud")
    assert r.returncode != 0 and "has no manifest" in r.stderr
    for leg in ("", "xx"):
        r = run(work, "audit.sh", leg)
        assert r.returncode == 2 and "usage" in r.stderr
