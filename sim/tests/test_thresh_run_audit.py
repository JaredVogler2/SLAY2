"""`scripts/studies/thresh/dev.sh`, `run-val.sh` and `audit.sh` end to end, with a stand-in interpreter for the simulator (ADR-062 items 3, 9 and 10).

The stand-in answers `-m slay2_sim run ...` by writing the manifest a finished batch has (and exits 2, as a batch with simulator errors does) and
`-m slay2_sim audit ...` by writing nothing and logging the call; everything else goes to the real interpreter. No game is played. The worlds are the ones
the preflight tests build: a registration commit (part 1) or a part-2 commit on a bare "remote".
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import pytest

from slay2_sim import external
from test_thresh_preflight import TAGS, build_dev_world, build_val_world, head, sh

REPO = external.REPO_ROOT
CLASSES = ["Ironclad", "Defect"]
DEV_ARMS = ["s", *TAGS]
DEV_IDS = [f"thresh-dev-{a}-{c.lower()}-a0-veteran-keeprelics-dev2-n3000" for a in DEV_ARMS for c in CLASSES]


def val_ids(arms: list[str]) -> list[str]:
    return [f"thresh-val-{a}-{c.lower()}-a0-veteran-keeprelics-val3-n15000" for a in arms for c in CLASSES]


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


def stand_in(tmp: Path, work: Path) -> tuple[Path, dict]:
    path = tmp / "pystandin.sh"
    path.write_text(STAND_IN)
    path.chmod(0o755)
    log = tmp / "calls.log"
    return log, {"PY": str(path), "OUT": str(work / "artifacts" / "thresh"), "PYTHONPATH": str(REPO / "sim"), "FAKE_LOG": str(log)}


def dev_world(tmp: Path) -> tuple[Path, Path, dict]:
    work = build_dev_world(tmp)
    log, env = stand_in(tmp, work)
    return work, log, env


def val_world(tmp: Path, advance: str | None = None) -> tuple[Path, Path, dict]:
    work = build_val_world(tmp, advance=advance)
    log, env = stand_in(tmp, work)
    return work, log, env


def run(work: Path, script: str, env: dict, *args: str, **extra: str) -> subprocess.CompletedProcess:
    full = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t", **env, **extra}
    return subprocess.run(["bash", f"scripts/studies/thresh/{script}", *args], cwd=work, env=full, capture_output=True, text=True)


def calls(log: Path) -> list[str]:
    return log.read_text().splitlines() if log.exists() else []


def manifest(work: Path, ident: str) -> dict:
    return json.loads((work / "experiments" / "batches" / ident / "manifest.json").read_text())


# ---- dev.sh --------------------------------------------------------------------------------------------------------------------------------------


def test_the_development_stage_plays_s_first_then_the_thresholds_in_order_and_checks_each_batch(tmp_path):
    work, log, env = dev_world(tmp_path)
    r = run(work, "dev.sh", env, "2")
    assert r.returncode == 0, r.stderr
    assert calls(log) == [f"run {i}" for i in DEV_IDS]                           # S first, then the thresholds in the registered order; Ironclad before Defect
    done = (work / "artifacts" / "thresh" / "run-done.txt").read_text().splitlines()
    assert [ln for ln in done if ln.startswith("DEV_")] == [f"DEV_{a}_DONE" for a in DEV_ARMS] + ["DEV_DONE"]
    assert (work / "artifacts" / "thresh" / "dev-head.txt").read_text().strip() == head(work)
    s = manifest(work, DEV_IDS[0])
    assert s["policy"]["name"] == "rules_v2" and s["policy"]["params"] == {"threshold": 0.0, "values": "experiments/cardvalue/ironclad-a0-v2.json"}
    assert s["seeds"] == {"partition": "dev2", "n": 3000}
    d = manifest(work, "thresh-dev-s-defect-a0-veteran-keeprelics-dev2-n3000")
    assert d["policy"]["params"]["values"] == "experiments/cardvalue/defect-a0-keep-v1.json" and d["config"]["character"] == "Defect"
    for tag, threshold in {"t010": 0.1, "t020": 0.2, "t030": 0.3, "t045": 0.45, "t060": 0.6, "tnone": 100.0}.items():
        m = manifest(work, f"thresh-dev-{tag}-ironclad-a0-veteran-keeprelics-dev2-n3000")
        assert m["policy"]["name"] == "rules_v2_late" and m["policy"]["params"]["late_acts"] == [1]
        assert m["policy"]["params"]["late_threshold"] == threshold and m["policy"]["params"]["threshold"] == 0.0


def test_the_development_preflight_only_checks_and_plays_nothing(tmp_path):
    work, log, env = dev_world(tmp_path)
    r = run(work, "dev.sh", env, "2", PREFLIGHT_ONLY="1")
    assert r.returncode == 0 and "preflight-dev: ok" in r.stdout and calls(log) == []
    assert not (work / "artifacts" / "thresh" / "dev-head.txt").exists()         # no lock, no recorded commit: nothing started


def test_a_failing_development_preflight_plays_nothing(tmp_path):
    work, log, env = dev_world(tmp_path)
    (work / "docs" / "DECISIONS.md").write_text((work / "docs" / "DECISIONS.md").read_text() + "\nedited\n")
    r = run(work, "dev.sh", env, "2")
    assert r.returncode != 0 and "tracked files are modified" in r.stderr and calls(log) == []


def test_a_development_batch_that_fails_stops_the_stage_and_it_is_finished_from_the_same_commit_with_resume(tmp_path):
    work, log, env = dev_world(tmp_path)
    r = run(work, "dev.sh", env, "2", FAKE_FAIL=DEV_IDS[7])
    assert r.returncode != 0 and DEV_IDS[7] in r.stderr and "failed with status 1" in r.stderr
    assert calls(log) == [f"run {i}" for i in DEV_IDS[:8]]                       # nothing after the batch that failed was started
    refused = run(work, "dev.sh", env, "2")                                      # without RESUME the preflight refuses: batches on the fresh seeds exist
    assert refused.returncode != 0 and "RESUME=1" in refused.stderr
    log.write_text("")
    resumed = run(work, "dev.sh", env, "2", RESUME="1")
    assert resumed.returncode == 0, resumed.stderr
    assert calls(log) == [f"run {i}" for i in DEV_IDS[7:]]                       # the seven finished batches are checked and never touched
    assert "DEV_DONE" in (work / "artifacts" / "thresh" / "run-done.txt").read_text()


def test_a_resumed_development_stage_has_to_start_from_the_commit_the_first_one_did(tmp_path):
    work, log, env = dev_world(tmp_path)
    assert run(work, "dev.sh", env, "2", FAKE_FAIL=DEV_IDS[3]).returncode != 0
    (work / "docs" / "note.md").write_text("a later commit\n")
    sh("git add -A && git commit -q -m later && git push -q origin main", work)
    r = run(work, "dev.sh", env, "2", RESUME="1")
    assert r.returncode != 0 and "this stage started from" in r.stderr


def test_a_finished_development_batch_that_is_not_what_was_asked_for_is_not_accepted_on_a_resume(tmp_path):
    work, log, env = dev_world(tmp_path)
    assert run(work, "dev.sh", env, "2", FAKE_FAIL=DEV_IDS[5]).returncode != 0
    m = work / "experiments" / "batches" / DEV_IDS[2] / "manifest.json"          # a t010 batch whose threshold is another one's
    body = json.loads(m.read_text())
    body["policy"]["params"]["late_threshold"] = 0.35
    m.write_text(json.dumps(body))
    r = run(work, "dev.sh", env, "2", RESUME="1")
    assert r.returncode != 0 and DEV_IDS[2] in r.stderr and "policy parameters" in r.stderr


def test_a_development_batch_that_completed_under_ninety_percent_stops_the_stage(tmp_path):
    work, log, env = dev_world(tmp_path)
    r = run(work, "dev.sh", env, "2", FAKE_COMPLETED="2600")
    assert r.returncode != 0 and "only 2600 of 3000 completed" in r.stderr
    assert calls(log) == [f"run {DEV_IDS[0]}"]


def test_a_tracked_file_that_changes_between_two_batches_stops_the_stage(tmp_path):
    """The stage takes hours: guard_tree refuses to start a batch from a tree that is no longer the commit the stage began from."""
    work, log, env = dev_world(tmp_path)
    wrapper = tmp_path / "edit-after-first.sh"
    wrapper.write_text(
        '#!/usr/bin/env bash\n'
        f'"{env["PY"]}" "$@"; rc=$?\n'
        'if [ "$3" = run ] && [ ! -e "$FAKE_EDITED" ]; then echo "edited" >> docs/DECISIONS.md; touch "$FAKE_EDITED"; fi\n'
        'exit $rc\n'
    )
    wrapper.chmod(0o755)
    r = run(work, "dev.sh", {**env, "PY": str(wrapper)}, "2", FAKE_EDITED=str(tmp_path / "edited"))
    assert r.returncode != 0 and "guard_tree: tracked files are modified" in r.stderr
    assert calls(log) == [f"run {DEV_IDS[0]}"]                                    # the second batch was never started


# ---- run-val.sh ----------------------------------------------------------------------------------------------------------------------------------


def test_the_held_out_run_plays_the_arms_in_the_registered_order_and_checks_each_batch(tmp_path):
    work, log, env = val_world(tmp_path, advance="t030")
    r = run(work, "run-val.sh", env, "2")
    assert r.returncode == 0, r.stderr
    ids = val_ids(["s", "t020", "t030"])
    assert calls(log) == [f"run {i}" for i in ids]                                # S first, then 0.2, then the screen's choice; the classes in the registered order
    done = (work / "artifacts" / "thresh" / "run-done.txt").read_text().splitlines()
    assert [ln for ln in done if ln.startswith("VAL_")] == ["VAL_s_DONE", "VAL_t020_DONE", "VAL_t030_DONE", "VAL_DONE"]
    assert (work / "artifacts" / "thresh" / "run-head.txt").read_text().strip() == head(work)
    s = manifest(work, ids[0])
    assert s["policy"]["name"] == "rules_v2" and s["policy"]["params"]["threshold"] == 0.0 and s["seeds"] == {"partition": "val3", "n": 15000}
    t = manifest(work, "thresh-val-t030-defect-a0-veteran-keeprelics-val3-n15000")
    assert t["policy"]["name"] == "rules_v2_late" and t["policy"]["params"]["late_acts"] == [1] and t["policy"]["params"]["late_threshold"] == 0.3
    assert t["policy"]["params"]["values"] == "experiments/cardvalue/defect-a0-keep-v1.json"


def test_without_an_advance_the_held_out_run_plays_s_and_0_2_only(tmp_path):
    work, log, env = val_world(tmp_path)
    r = run(work, "run-val.sh", env, "2")
    assert r.returncode == 0, r.stderr
    assert calls(log) == [f"run {i}" for i in val_ids(["s", "t020"])]
    assert "VAL_t030_DONE" not in (work / "artifacts" / "thresh" / "run-done.txt").read_text()


def test_the_held_out_preflight_only_checks_and_plays_nothing(tmp_path):
    work, log, env = val_world(tmp_path, advance="t030")
    r = run(work, "run-val.sh", env, "2", PREFLIGHT_ONLY="1")
    assert r.returncode == 0 and "preflight-val: ok" in r.stdout and calls(log) == []
    assert not (work / "artifacts" / "thresh" / "run-head.txt").exists()


def test_a_failing_held_out_preflight_plays_nothing(tmp_path):
    work, log, env = val_world(tmp_path)
    (work / "docs" / "DECISIONS.md").write_text((work / "docs" / "DECISIONS.md").read_text() + "\nedited\n")
    r = run(work, "run-val.sh", env, "2")
    assert r.returncode != 0 and "tracked files are modified" in r.stderr and calls(log) == []


def test_a_held_out_batch_that_fails_stops_the_run_and_it_is_finished_from_the_same_commit_with_resume(tmp_path):
    work, log, env = val_world(tmp_path, advance="t030")
    ids = val_ids(["s", "t020", "t030"])
    r = run(work, "run-val.sh", env, "2", FAKE_FAIL=ids[3])
    assert r.returncode != 0 and ids[3] in r.stderr and "failed with status 1" in r.stderr
    assert calls(log) == [f"run {i}" for i in ids[:4]]                            # nothing after the batch that failed was started
    refused = run(work, "run-val.sh", env, "2")
    assert refused.returncode != 0 and "RESUME=1" in refused.stderr
    log.write_text("")
    resumed = run(work, "run-val.sh", env, "2", RESUME="1")
    assert resumed.returncode == 0, resumed.stderr
    assert calls(log) == [f"run {i}" for i in ids[3:]]                            # the three finished batches are checked and never touched
    assert "VAL_DONE" in (work / "artifacts" / "thresh" / "run-done.txt").read_text()


def test_a_resumed_held_out_run_has_to_start_from_the_commit_the_first_one_did(tmp_path):
    work, log, env = val_world(tmp_path)
    ids = val_ids(["s", "t020"])
    assert run(work, "run-val.sh", env, "2", FAKE_FAIL=ids[2]).returncode != 0
    (work / "docs" / "note.md").write_text("a later commit\n")
    sh("git add -A && git commit -q -m later && git push -q origin main", work)
    r = run(work, "run-val.sh", env, "2", RESUME="1")
    assert r.returncode != 0 and "this run started from" in r.stderr


def test_a_finished_held_out_batch_that_is_not_what_was_asked_for_is_not_accepted_on_a_resume(tmp_path):
    work, log, env = val_world(tmp_path, advance="t030")
    ids = val_ids(["s", "t020", "t030"])
    assert run(work, "run-val.sh", env, "2", FAKE_FAIL=ids[4]).returncode != 0
    m = work / "experiments" / "batches" / ids[2] / "manifest.json"               # the 0.2 batch of Ironclad, now with the other arm's threshold
    body = json.loads(m.read_text())
    body["policy"]["params"]["late_threshold"] = 0.3
    m.write_text(json.dumps(body))
    r = run(work, "run-val.sh", env, "2", RESUME="1")
    assert r.returncode != 0 and ids[2] in r.stderr and "policy parameters" in r.stderr


def test_a_held_out_batch_that_completed_under_ninety_percent_stops_the_run(tmp_path):
    work, log, env = val_world(tmp_path)
    r = run(work, "run-val.sh", env, "2", FAKE_COMPLETED="12600")
    assert r.returncode != 0 and "only 12600 of 15000 completed" in r.stderr
    assert calls(log) == [f"run {val_ids(['s'])[0]}"]


# ---- audit.sh ------------------------------------------------------------------------------------------------------------------------------------


def finished(work: Path, ids: list[str], no_wins: str | None = None, wins: int = 3) -> None:
    for i in ids:
        d = work / "experiments" / "batches" / i
        d.mkdir(parents=True, exist_ok=True)
        (d / "manifest.json").write_text(json.dumps({"summary": {"counts": {"win": 0 if no_wins and i.startswith(no_wins) else wins}}}))


@pytest.mark.parametrize("jobs", ["1", "4"])
def test_every_development_batch_gets_its_sample_and_every_batch_with_wins_gets_its_wins_audited(tmp_path, jobs):
    work, log, env = dev_world(tmp_path)
    finished(work, DEV_IDS, no_wins="thresh-dev-t045-defect")
    r = run(work, "audit.sh", env, "dev", AUDIT_JOBS=jobs)
    assert r.returncode == 0, r.stderr
    want = sorted([f"audit sample {i}" for i in DEV_IDS] + [f"audit wins {i}" for i in DEV_IDS if not i.startswith("thresh-dev-t045-defect")])
    assert sorted(calls(log)) == want                                             # no win audit for the batch with no win; the same calls whatever the number of jobs
    assert (work / "artifacts" / "thresh" / "audit-dev-done.txt").read_text().splitlines()[-1] == "AUDIT_DONE"


@pytest.mark.parametrize("advance,arms", [(None, ["s", "t020"]), ("t030", ["s", "t020", "t030"])])
def test_the_held_out_audit_covers_exactly_the_arms_the_selection_sent_forward(tmp_path, advance, arms):
    work, log, env = val_world(tmp_path, advance=advance)
    ids = val_ids(arms)
    finished(work, ids)
    r = run(work, "audit.sh", env, "val", AUDIT_JOBS="2")
    assert r.returncode == 0, r.stderr
    assert sorted(calls(log)) == sorted([f"audit sample {i}" for i in ids] + [f"audit wins {i}" for i in ids])
    assert (work / "artifacts" / "thresh" / "audit-val-done.txt").read_text().splitlines()[-1] == "AUDIT_DONE"


@pytest.mark.parametrize("failing", ["wins:thresh-dev-t020-defect-a0-veteran-keeprelics-dev2-n3000", "sample:thresh-dev-s-ironclad-a0-veteran-keeprelics-dev2-n3000"])
def test_a_failed_audit_never_ends_as_audit_done(tmp_path, failing):
    work, log, env = dev_world(tmp_path)
    finished(work, DEV_IDS)
    r = run(work, "audit.sh", env, "dev", AUDIT_JOBS="4", FAKE_FAIL_AUDIT=failing)
    assert r.returncode != 0
    lines = (work / "artifacts" / "thresh" / "audit-dev-done.txt").read_text().splitlines()
    assert "AUDIT_DONE" not in lines and lines[-1].startswith("AUDIT_FAILED")
    assert any(ln.endswith("exit=1") for ln in lines)


def test_the_audit_refuses_while_a_batch_has_no_manifest(tmp_path):
    work, log, env = dev_world(tmp_path)
    finished(work, DEV_IDS)
    (work / "experiments" / "batches" / DEV_IDS[10] / "manifest.json").unlink()
    r = run(work, "audit.sh", env, "dev")
    assert r.returncode != 0 and DEV_IDS[10] in r.stderr and "the dev stage is not finished" in r.stderr and calls(log) == []
    assert run(work, "audit.sh", env, "somewhere-else").returncode == 2             # only the two stages are audited here
    assert run(work, "audit.sh", env).returncode == 2


def test_the_held_out_audit_cannot_start_without_the_development_selection(tmp_path):
    work, log, env = val_world(tmp_path)
    finished(work, val_ids(["s", "t020"]))
    sh("git rm -q experiments/thresh/dev-selection.json", work)
    r = run(work, "audit.sh", env, "val")
    assert r.returncode != 0 and "cannot read the development selection" in r.stderr and calls(log) == []
