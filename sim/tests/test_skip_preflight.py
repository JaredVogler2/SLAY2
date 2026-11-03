"""`scripts/studies/skip/preflight-val.sh` (through `run-val.sh <leg> 4` with PREFLIGHT_ONLY=1) on throwaway repositories (ADR-065 item 3).

The preflight stands between the registration and the first held-out game of a leg: it refuses unless the working tree is the commit that registered the check, that commit
is on the remote, the code and data the arms read are those of the registration commit, the price the page charges is the price registered and the arm charges it, the
tests of the Python port pass, the precondition passed, every baseline of the leg is the batch the record names, finished and audited and replayed by this commit, nothing of
the leg's results exists or is in the history and no batch of the leg is there; and, for the Underdocks leg, ADR-064 has been pooled. Each test builds a small repository that
passes all of this and breaks one thing. The real scripts, the real analysis package and the real `quality.ts` are copied in (they are small); the two test files of the port are
replaced by stubs, because the real ones are run by the files that hold them.

The replay of a baseline (the 40-game sample audit, into a copy of the batch) needs the game and 2,000 real games per baseline, which a throwaway cannot have: `PY` is a stand-in
interpreter that answers exactly `-m slay2_sim audit sample` (it logs the call, looks at the copy it was given, rewrites the audit file in the copy as the real one does, and exits
as the test wants) and hands everything else to the real interpreter, so that every other line of the script runs for real. One test at the end runs the real audit on a copy of a
small real batch, to show that the mechanism the script relies on (replay a copy, leave the batch alone) works with the real command.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from slay2_sim import external

REPO = external.REPO_ROOT
CLASSES = ["Ironclad", "Silent", "Regent", "Necrobinder", "Defect"]
HEAD = "## 2026-11-02 — ADR-065: the advisor charges for a slot (index v2), so that it recommends skipping when nothing earns its place"
PASSING = "def test_stub():\n    assert True\n"
FAILING = "def test_stub():\n    assert False\n"
S0_PARAMS = {"engines": 0, "margin": 0.0, "needs": 1, "scalers": 0.7}
S1_PARAMS_LINE = '''S1_PARAMS='{"engines":0,"margin":0.0,"needs":1,"scalers":0.7,"size":1.0,"size_from":20}\''''
ADR064_POOLED = ["pooled-ud-t1-synergy-astar-vs-d0star", "pooled-ud-t2-values-shown-vs-rules_v1", "pooled-ud-t3-neow-keep-v1-vs-rules_v2", "robustness-all-pairs"]

STAND_IN = r'''#!/usr/bin/env bash
# a stand-in for the replay of a baseline (`python -m slay2_sim audit sample --batch DIR --limit N`); anything else is the real interpreter
if [ "$1" = -m ] && [ "$2" = slay2_sim ] && [ "$3" = audit ] && [ "$4" = sample ]; then
  shift 4
  while [ $# -gt 0 ]; do case "$1" in --batch) d=$2; shift 2 ;; --limit) lim=$2; shift 2 ;; *) shift ;; esac; done
  echo "audit sample $(basename "$d") | limit=$lim | files=$(ls "$d" | tr '\n' ',')" >> "$FAKE_LOG"
  echo "ledger: 2000 records for 2000 requested seeds, complete and consistent; outcomes {'death': 1987, 'win': 3}"       # what the real one prints (the counts)
  echo '{"rewritten": "by the replay"}' > "$d/sample-audit.json"           # the real audit writes its report next to the batch it is given: here, in the copy
  if [ -n "${FAKE_REPLAY_FAIL_CLASS:-}" ] && grep -q "\"character\": \"$FAKE_REPLAY_FAIL_CLASS\"" "$d/manifest.json"; then exit 1; fi
  exit "${FAKE_REPLAY_EXIT:-0}"
fi
exec "${REAL_PY:-python3}" "$@"
'''


def git(work: Path, cmd: str, check: bool = True) -> subprocess.CompletedProcess:
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    return subprocess.run(["bash", "-c", cmd], cwd=work, env=env, capture_output=True, text=True, check=check)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def stand_in_of(work: Path) -> Path:
    path = work.parent / "pystandin.sh"
    if not path.exists():
        path.write_text(STAND_IN)
        path.chmod(0o755)
    return path


def run_env(work: Path, **env: str) -> dict:
    return {**os.environ, "PY": str(stand_in_of(work)), "REAL_PY": sys.executable, "FAKE_LOG": str(work.parent / "calls.log"), "OUT": str(work / "artifacts" / "skip"),
            "PYTHONPATH": "", "PREFLIGHT_ONLY": "1", **env}


def preflight(work: Path, leg: str = "og", **env: str) -> subprocess.CompletedProcess:
    return subprocess.run(["bash", "scripts/studies/skip/run-val.sh", leg, "4"], cwd=work, env=run_env(work, **env), capture_output=True, text=True)


def calls(work: Path) -> list[str]:
    log = work.parent / "calls.log"
    return log.read_text().splitlines() if log.exists() else []


def s0_dir(work: Path, leg: str, cls: str) -> Path:
    tail = "-underdocks" if leg == "ud" else ""
    return work / "experiments" / ("underdocks" if leg == "ud" else "") / "batches" / f"advisor_v1-astar-{cls.lower()}-a0-veteran-keeprelics{tail}-val-n2000"


def write_baseline(work: Path, leg: str, cls: str) -> None:
    d = s0_dir(work, leg, cls)
    d.mkdir(parents=True)
    (d / "manifest.json").write_text(json.dumps({
        "batch_id": d.name, "content_sha256": "c" * 64, "policy": {"name": "advisor_v1", "params": dict(S0_PARAMS)},
        "config": {"character": cls, "ascension": 0, "profile": "veteran", "keep_relics": True, **({"act1": "underdocks"} if leg == "ud" else {})},
        "seeds": {"partition": "val", "n": 2000}, "class_start_verified": True, "canonical_process_state": True, "environment": {"slay2": {"head": "a" * 40, "dirty": False}},
        "summary": {"episodes": 2000, "completed": 1990, "counts": {"win": 3, "death": 1987, "timeout": 10, "simulator_error": 0, "aborted": 0, "harness_error": 0,
                                                                     "policy_error": 0, "invalid_action": 0}},
    }))
    (d / "sample-audit.json").write_text(json.dumps({"all_verified": True, "verified": 40, "sample": {"drawn": 40}, "ledger": {"ok": True}, "batch_content_sha256": "c" * 64}))
    (d / "episodes.jsonl").write_text("{}\n")


def build(tmp: Path, *, with_adr: bool = True, passed: bool = True, precondition: bool = True, ts: tuple[str, str] = ("20", "1"), port: tuple[str, str] = ("20", "1.0"),
          s1_params_line: str | None = None, port_test: str = PASSING, pilot_test: str = PASSING, baselines: bool = True, adr064: bool = True) -> Path:
    """A repository at the registration commit, pushed to a bare remote, from which the preflight passes in both legs. The baselines and the pooled files of ADR-064
    are new files under experiments/ (as in the worktree that plays them); everything else is committed."""
    work, remote = tmp / "work", tmp / "remote.git"
    shutil.copytree(REPO / "scripts" / "studies" / "skip", work / "scripts" / "studies" / "skip", ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copytree(REPO / "sim" / "slay2_sim", work / "sim" / "slay2_sim", ignore=shutil.ignore_patterns("__pycache__", "tests"))
    (work / "sim" / "tests").mkdir()
    (work / "sim" / "tests" / "test_advisor_port.py").write_text(port_test)
    (work / "sim" / "tests" / "test_advisor_v1.py").write_text(pilot_test)
    (work / "packages" / "decision" / "src").mkdir(parents=True)
    quality = (REPO / "packages" / "decision" / "src" / "quality.ts").read_text(encoding="utf-8")
    assert "export const SIZE_FROM = 20;" in quality and "export const SIZE_PRICE = 1;" in quality
    (work / "packages" / "decision" / "src" / "quality.ts").write_text(
        quality.replace("export const SIZE_FROM = 20;", f"export const SIZE_FROM = {ts[0]};").replace("export const SIZE_PRICE = 1;", f"export const SIZE_PRICE = {ts[1]};"), encoding="utf-8")
    advisor = work / "sim" / "slay2_sim" / "advisor.py"
    text = advisor.read_text(encoding="utf-8")
    assert "\nSIZE_FROM = 20\nSIZE_PRICE = 1.0\n" in text
    advisor.write_text(text.replace("\nSIZE_FROM = 20\nSIZE_PRICE = 1.0\n", f"\nSIZE_FROM = {port[0]}\nSIZE_PRICE = {port[1]}\n"), encoding="utf-8")
    if s1_params_line is not None:
        common = work / "scripts" / "studies" / "skip" / "common.sh"
        assert S1_PARAMS_LINE in common.read_text()
        common.write_text(common.read_text().replace(S1_PARAMS_LINE, s1_params_line))
    for rel in ("packages/game-data/data/stub.json", "experiments/seeds/stub.txt", "external/pins.json"):
        (work / rel).parent.mkdir(parents=True, exist_ok=True)
        (work / rel).write_text("stub " + rel + "\n")
    if precondition:
        (work / "experiments" / "skip").mkdir(parents=True, exist_ok=True)
        (work / "experiments" / "skip" / "precondition.json").write_text(json.dumps({"passed": passed}))
    (work / ".gitignore").write_text("__pycache__/\n*.pyc\nartifacts/\n")                  # logs are never part of a commit of the throwaway (a run rewrites them)
    (work / "docs").mkdir()
    (work / "docs" / "DECISIONS.md").write_text(("## earlier record\n\ntext\n\n" + HEAD + "\n\nThe design.\n\n## later record\n\ntext\n") if with_adr else "## earlier record\n")
    git(work, "git init -q -b main && git add -A && git commit -q -m registration")
    git(work, f"git init -q --bare {remote} && git remote add origin {remote} && git push -q origin main")
    if baselines:
        for leg in ("og", "ud"):
            for cls in CLASSES:
                write_baseline(work, leg, cls)
    if adr064:
        (work / "experiments" / "underdocks").mkdir(parents=True, exist_ok=True)
        for name in ADR064_POOLED:
            (work / "experiments" / "underdocks" / f"{name}.json").write_text("{}")
    return work


@pytest.fixture(scope="module")
def world(tmp_path_factory) -> Path:
    return build(tmp_path_factory.mktemp("skippre"))


@pytest.fixture
def work(world: Path, tmp_path: Path) -> Path:
    dest = tmp_path / "work"
    shutil.copytree(world, dest, symlinks=True)
    shutil.copytree(world.parent / "remote.git", tmp_path / "remote.git", symlinks=True)
    git(dest, f"git remote set-url origin {tmp_path / 'remote.git'}")
    return dest


def commit(work: Path, message: str = "change", push: bool = True) -> None:
    git(work, f"git add -A && git commit -q -m '{message}'" + (" && git push -q origin main" if push else ""))


def tracked_edit(work: Path, rel: str, text: str = "\n# a change after the registration\n") -> None:
    p = work / rel
    p.write_text(p.read_text() + text)


# ---- it passes
@pytest.mark.parametrize("leg", ["og", "ud"])
def test_it_passes_at_the_registration_commit_when_it_is_on_the_remote_and_replays_a_copy_of_each_baseline_of_the_leg(work, leg):
    before = {c: sha(s0_dir(work, leg, c) / "sample-audit.json") for c in CLASSES}
    r = preflight(work, leg)
    assert r.returncode == 0, r.stderr + r.stdout
    assert f"preflight-val: ok (leg {leg}," in r.stdout and "registration" in r.stdout
    got = calls(work)
    assert len(got) == 5 and all(c.startswith("audit sample replay.") and " | limit=40 | " in c for c in got)           # one replay per class, 40 games, in a copy
    assert all(c.endswith("files=audit.log,episodes.jsonl,manifest.json,sample-audit.json,") for c in got)             # of the whole batch (and the log the script keeps in it)
    assert {c: sha(s0_dir(work, leg, c) / "sample-audit.json") for c in CLASSES} == before                              # the baselines are not touched
    assert not list((work / "artifacts" / "skip").glob("replay.*"))                                                      # and the copies are gone
    assert git(work, "git status --porcelain --untracked-files=no").stdout == ""
    assert not (work / "experiments" / "skip" / "batches").exists()                                                     # the preflight alone plays nothing


def test_the_replay_stops_it_when_this_commit_does_not_replay_a_baseline_and_leaves_the_copy_and_its_log_for_the_reader(work):
    r = preflight(work, "og", FAKE_REPLAY_FAIL_CLASS="Regent")
    assert r.returncode != 0 and "this commit does not replay 40 games of the baseline" in r.stderr and "advisor_v1-astar-regent-a0-" in r.stderr
    assert len(calls(work)) == 3                                                                                         # Ironclad, Silent, then Regent: it stopped there
    left = list((work / "artifacts" / "skip").glob("replay.*"))
    assert len(left) == 1 and (left[0] / "audit.log").exists() and str(left[0]) in r.stderr
    assert sha(s0_dir(work, "og", "Regent") / "sample-audit.json") == sha(s0_dir(work, "og", "Silent") / "sample-audit.json")  # the baseline itself is as it was


def test_an_unknown_leg_is_a_usage_error(work):
    for leg in ("", "xx"):
        r = subprocess.run(["bash", "scripts/studies/skip/run-val.sh", leg, "4"], cwd=work, env=run_env(work), capture_output=True, text=True)
        assert r.returncode == 2 and "usage" in r.stderr and calls(work) == []


# ---- the working tree and the remote
def test_a_modified_tracked_file_stops_it(work):
    tracked_edit(work, "docs/DECISIONS.md", "\nan edit\n")
    r = preflight(work)
    assert r.returncode != 0 and "tracked files are modified" in r.stderr and calls(work) == []


def test_an_untracked_file_outside_the_results_stops_it_and_one_inside_them_does_not(work):
    (work / "experiments" / "skip" / "notes.txt").write_text("fine")
    (work / "artifacts").mkdir(exist_ok=True)
    (work / "artifacts" / "scratch.txt").write_text("fine")
    assert preflight(work).returncode == 0
    (work / "scratch.py").write_text("print(1)\n")
    r = preflight(work)
    assert r.returncode != 0 and "untracked files outside experiments/" in r.stderr


def test_a_head_that_is_not_on_the_remote_stops_it(work):
    (work / "docs" / "note.md").write_text("a later commit that was not pushed\n")
    commit(work, push=False)
    r = preflight(work)
    assert r.returncode != 0 and "HEAD is not on the remote" in r.stderr


def test_a_remote_that_cannot_be_reached_stops_it(work):
    git(work, "git remote set-url origin /nonexistent/remote.git")
    r = preflight(work)
    assert r.returncode != 0 and "cannot reach the remote" in r.stderr


def test_a_record_without_the_check_stops_it(tmp_path):
    work = build(tmp_path, with_adr=False)
    r = preflight(work)
    assert r.returncode != 0 and "does not carry ADR-065" in r.stderr


# ---- the code and data the arms read
@pytest.mark.parametrize(
    "path",
    ["sim/slay2_sim/runner.py", "sim/tests/test_advisor_v1.py", "scripts/studies/skip/common.sh", "scripts/studies/skip/reading.py", "packages/decision/src/quality.ts",
     "packages/game-data/data/stub.json", "experiments/seeds/stub.txt", "external/pins.json"],
)
def test_code_or_data_the_arms_read_that_changed_after_the_registration_commit_stops_it_even_when_pushed(work, path):
    tracked_edit(work, path, "\n# a change after the registration\n")
    commit(work)
    r = preflight(work)
    assert r.returncode != 0 and "changed after the registration commit" in r.stderr and path in r.stderr, r.stderr
    assert calls(work) == []


def test_a_change_outside_what_the_arms_read_does_not_stop_it(work):
    tracked_edit(work, "docs/DECISIONS.md", "\n## an addendum\n\nafter the registration\n")
    (work / "apps").mkdir()
    (work / "apps" / "page.tsx").write_text("export {}\n")
    (work / "experiments" / "skip" / "fingerprint.json").write_text("{}\n")
    commit(work)
    assert preflight(work).returncode == 0


def test_the_registration_commit_can_be_named_when_an_addendum_has_moved_it(work):
    tracked_edit(work, "sim/slay2_sim/runner.py")
    commit(work)
    assert preflight(work).returncode != 0
    reg = git(work, "git rev-parse HEAD").stdout.strip()
    assert preflight(work, REG=reg).returncode == 0                                                                      # REG=<sha> names the commit the code is held to


@pytest.mark.parametrize("ts", [("30", "1"), ("20", "0.6"), ("30", "0.6")], ids=["page-from-30", "page-price-0.6", "page-version-1"])
def test_a_page_that_does_not_charge_one_point_from_the_20th_card_stops_it(tmp_path, ts):
    work = build(tmp_path, ts=ts)
    r = preflight(work)
    assert r.returncode != 0 and "the page's price of a slot is not the 1.0 from the 20th card" in r.stderr and calls(work) == []


@pytest.mark.parametrize("port", [("30", "1.0"), ("20", "0.6")], ids=["port-from-30", "port-price-0.6"])
def test_a_port_that_does_not_charge_it_either_stops_it(tmp_path, port):
    work = build(tmp_path, port=port)
    r = preflight(work)
    assert r.returncode != 0 and "the page's price of a slot is not the 1.0 from the 20th card" in r.stderr


@pytest.mark.parametrize(
    "line",
    ["S1_PARAMS='{\"engines\":0,\"margin\":0.0,\"needs\":1,\"scalers\":0.7}'",
     "S1_PARAMS='{\"engines\":0,\"margin\":0.0,\"needs\":1,\"scalers\":0.7,\"size\":0.6,\"size_from\":20}'",
     "S1_PARAMS='{\"engines\":0,\"margin\":0.0,\"needs\":1,\"scalers\":0.7,\"size\":1.0,\"size_from\":30}'"],
    ids=["no-price", "version-1-price", "from-30"],
)
def test_an_arm_that_does_not_name_the_price_the_page_charges_stops_it(tmp_path, line):
    work = build(tmp_path, s1_params_line=line)
    r = preflight(work)
    assert r.returncode != 0 and "S1_PARAMS does not name the page's price" in r.stderr and calls(work) == []


@pytest.mark.parametrize("which", ["port", "pilot"])
def test_the_tests_of_the_port_and_of_the_pilot_have_to_pass(tmp_path, which):
    work = build(tmp_path, port_test=FAILING if which == "port" else PASSING, pilot_test=FAILING if which == "pilot" else PASSING)
    r = preflight(work)
    assert r.returncode != 0 and "the Python port of the index does not reproduce the golden cases" in r.stderr and "preflight-port.log" in r.stderr
    assert "1 failed" in (work / "artifacts" / "skip" / "preflight-port.log").read_text() and calls(work) == []


# ---- the precondition
def test_a_precondition_that_is_missing_uncommitted_or_failed_stops_it(tmp_path):
    pre = "experiments/skip/precondition.json"
    work = build(tmp_path / "a")
    git(work, f"git rm -q {pre} && git commit -q -m x && git push -q origin main")
    assert "precondition.json is missing" in preflight(work).stderr
    (work / pre).parent.mkdir(parents=True, exist_ok=True)
    (work / pre).write_text(json.dumps({"passed": True}))                                # present, not committed
    assert "the precondition report is not committed" in preflight(work).stderr
    failed = build(tmp_path / "b", passed=False)
    r = preflight(failed)
    assert r.returncode != 0 and "the precondition did not pass" in r.stderr and calls(failed) == []


# ---- the baselines
@pytest.mark.parametrize("leg", ["og", "ud"])
def test_a_baseline_that_is_missing_stops_it(work, leg):
    shutil.rmtree(s0_dir(work, leg, "Necrobinder"))
    r = preflight(work, leg)
    assert r.returncode != 0 and "is not the batch ADR-065 names" in r.stderr and "no readable manifest" in r.stderr and "necrobinder" in r.stderr


def amend(work: Path, leg: str, cls: str, change) -> None:
    f = s0_dir(work, leg, cls) / "manifest.json"
    m = json.loads(f.read_text())
    change(m)
    f.write_text(json.dumps(m))


@pytest.mark.parametrize(
    "leg,change,message",
    [
        ("og", lambda m: m["policy"].update(name="rules_v1"), "policy rules_v1"),
        ("og", lambda m: m["policy"].update(params={**S0_PARAMS, "size": 1.0, "size_from": 20}), "the baseline names a price"),                  # the arm that charges, as the baseline
        ("ud", lambda m: m["policy"]["params"].update(scalers=0.5), "policy parameters"),
        ("og", lambda m: m["config"].update(character="Ironclad"), "played as Ironclad, not Regent"),                                          # another class's batch
        ("ud", lambda m: m["config"].pop("act1"), "Act 1 overgrowth, not underdocks"),                                                         # the Overgrowth batch for the Underdocks leg
        ("og", lambda m: m["config"].update(act1="underdocks"), "Act 1 underdocks, not overgrowth"),
        ("og", lambda m: m["config"].update(keep_relics=False), "relics not kept"),
        ("ud", lambda m: m["config"].update(ascension=9), "Ascension 9"),
        ("og", lambda m: m["seeds"].update(partition="dev"), ": seeds"),
        ("ud", lambda m: m["summary"].update(completed=1500), "only 1500 of 2000 completed"),
        ("og", lambda m: m["summary"]["counts"].update(policy_error=1), "abort, a harness error, a policy error or an invalid action"),
        ("ud", lambda m: m.update(class_start_verified=False), "class start or canonical process state"),
    ],
    ids=["policy", "baseline-names-a-price", "other-parameters", "other-class", "overgrowth-batch-in-ud", "underdocks-batch-in-og", "relics", "ascension", "partition",
         "few-completed", "policy-error", "class-start"],
)
def test_a_baseline_that_is_not_the_batch_the_record_names_stops_it_before_it_is_replayed(work, leg, change, message):
    amend(work, leg, "Regent", change)
    r = preflight(work, leg)
    assert r.returncode != 0 and "is not the batch ADR-065 names" in r.stderr and message in r.stderr and "advisor_v1-astar-regent-a0-" in r.stderr, r.stderr
    assert len(calls(work)) == 2                                                                                         # Ironclad and Silent were replayed; Regent's was not


@pytest.mark.parametrize("leg", ["og", "ud"])
@pytest.mark.parametrize(
    "audit",
    [None, {"verified": 39, "sample": {"drawn": 39}}, {"verified": 38}, {"all_verified": False}, {"sample": {"drawn": 20}, "verified": 20}],
    ids=["missing", "39-games", "one-not-verified", "not-all-verified", "20-games"],
)
def test_a_baseline_without_a_passing_sample_audit_stops_it(work, leg, audit):
    f = s0_dir(work, leg, "Silent") / "sample-audit.json"
    if audit is None:
        f.unlink()
    else:
        f.write_text(json.dumps({**json.loads(f.read_text()), **audit}))
    r = preflight(work, leg)
    assert r.returncode != 0 and "has no passing sample audit" in r.stderr and "advisor_v1-astar-silent-a0-" in r.stderr
    assert len(calls(work)) == 1                                                                                         # Ironclad's baseline was replayed; Silent's was not


# ---- each check is run once
@pytest.mark.parametrize("leg", ["og", "ud"])
def test_a_pooled_result_that_exists_or_was_ever_committed_stops_it(work, leg):
    f = work / "experiments" / "skip" / f"pooled-slot-{leg}.json"
    f.write_text("{}")
    r = preflight(work, leg)
    assert r.returncode != 0 and "exists: the check is run once" in r.stderr
    commit(work)
    git(work, f"git rm -q {f.relative_to(work)} && git commit -q -m remove && git push -q origin main")
    r = preflight(work, leg)
    assert r.returncode != 0 and "is in the history: the check is run once" in r.stderr


@pytest.mark.parametrize("leg", ["og", "ud"])
def test_output_of_the_comparisons_that_exists_or_was_ever_committed_stops_it(work, leg):
    d = work / "experiments" / "skip" / "per-class"
    d.mkdir()
    (d / f"slot-{leg}-ironclad.json").write_text("{}")
    r = preflight(work, leg)
    assert r.returncode != 0 and "per-class holds output of this leg" in r.stderr
    commit(work)
    git(work, "git rm -rq experiments/skip/per-class && git commit -q -m remove && git push -q origin main")
    r = preflight(work, leg)
    assert r.returncode != 0 and f"slot-{leg}-*.json is in the history" in r.stderr


def test_the_results_of_the_other_leg_do_not_stop_a_leg(work):
    """The two legs are read at different times: the results of the first, committed, are not an obstacle to the second."""
    out = work / "experiments" / "skip"
    (out / "per-class").mkdir()
    (out / "per-class" / "slot-og-ironclad.json").write_text("{}")
    (out / "pooled-slot-og.json").write_text("{}")
    commit(work)
    git(work, "git rm -rq experiments/skip/per-class experiments/skip/pooled-slot-og.json && git commit -q -m remove && git push -q origin main")   # (the history keeps them)
    (out / "per-class").mkdir()
    (out / "per-class" / "slot-og-silent.json").write_text("{}")
    (out / "pooled-slot-og.json").write_text("{}")
    r = preflight(work, "ud")
    assert r.returncode == 0, r.stderr
    assert preflight(work, "og").returncode != 0


def s1_dir(work: Path, leg: str, cls: str) -> Path:
    tail = "-underdocks" if leg == "ud" else ""
    return work / "experiments" / "skip" / "batches" / f"advisor_v1-slot-{cls.lower()}-a0-veteran-keeprelics{tail}-val-n2000"


@pytest.mark.parametrize("leg", ["og", "ud"])
def test_batches_of_the_leg_that_already_exist_stop_it_unless_an_interrupted_run_is_being_finished(work, leg):
    d = s1_dir(work, leg, "Ironclad")
    d.mkdir(parents=True)
    (d / "manifest.json").write_text("{}")
    r = preflight(work, leg)
    assert r.returncode != 0 and "batches of the val arm already exist" in r.stderr and "RESUME=1" in r.stderr
    assert preflight(work, leg, RESUME="1").returncode == 0


@pytest.mark.parametrize("leg,other", [("og", "ud"), ("ud", "og")])
def test_batches_of_the_other_leg_are_not_batches_of_this_one(work, leg, other):
    d = s1_dir(work, other, "Defect")
    d.mkdir(parents=True)
    (d / "manifest.json").write_text("{}")
    assert preflight(work, leg).returncode == 0


# ---- the order of the two studies: the Underdocks baseline is ADR-064's
@pytest.mark.parametrize("name", ADR064_POOLED)
def test_the_underdocks_leg_is_refused_until_the_three_pooled_tests_of_adr_064_exist(work, name):
    (work / "experiments" / "underdocks" / f"{name}.json").unlink()
    r = preflight(work, "ud")
    assert r.returncode != 0 and "ADR-064 has not been pooled yet: its tests are read before this leg's baseline is" in r.stderr and f"{name}.json is missing" in r.stderr
    assert calls(work) == [] and not (work / "artifacts" / "skip" / "preflight-port.log").exists()                    # nothing was run, no baseline was replayed
    (work / "experiments" / "underdocks" / f"{name}.json").write_text("{}")
    assert preflight(work, "ud").returncode == 0


def test_the_underdocks_leg_is_refused_before_anything_of_its_baseline_is_opened(work):
    """Whatever else is wrong with the leg, the first thing it is told is the order: no manifest, no replay and no log of the baseline is touched before ADR-064 is pooled."""
    for f in (work / "experiments" / "underdocks").glob("pooled-ud-*.json"):
        f.unlink()
    shutil.rmtree(s0_dir(work, "ud", "Ironclad"))
    amend(work, "ud", "Silent", lambda m: m["policy"].update(name="rules_v1"))
    (s0_dir(work, "ud", "Regent") / "sample-audit.json").unlink()
    r = preflight(work, "ud", FAKE_REPLAY_EXIT="1")
    assert r.returncode != 0 and "ADR-064 has not been pooled yet" in r.stderr and "baseline" not in r.stderr.replace("this leg's baseline is", "")
    assert calls(work) == [] and not list((work / "artifacts" / "skip").glob("replay.*"))


def test_the_underdocks_leg_is_refused_when_only_a_directory_or_nothing_of_adr_064_exists(work):
    shutil.rmtree(work / "experiments" / "underdocks")
    r = preflight(work, "ud")
    assert r.returncode != 0 and "ADR-064 has not been pooled yet" in r.stderr


def test_the_overgrowth_leg_does_not_wait_for_adr_064(work):
    for f in (work / "experiments" / "underdocks").glob("pooled-ud-*.json"):
        f.unlink()
    r = preflight(work, "og")
    assert r.returncode == 0, r.stderr
    assert len(calls(work)) == 5


# ---- the mechanism the replay relies on, with the real command
def test_the_replay_of_a_copy_of_a_real_batch_by_the_real_audit_leaves_the_batch_and_its_audit_alone(sim, tmp_path):
    """The preflight copies a baseline (`cp -r BATCH/. COPY/`) and runs `audit sample` on the copy. Here the real command, on a copy of a small real batch that has already
    been audited, passes and rewrites only the copy's report."""
    from test_sample_audit import make_batch as real_mini_batch
    from slay2_sim.winaudit import audit_sample

    batch = real_mini_batch(tmp_path / "src", n=2)
    assert audit_sample(batch, n=40)["all_verified"]
    before = {p.name: sha(p) for p in batch.iterdir()}
    copy = tmp_path / "replay"
    copy.mkdir()
    subprocess.run(["cp", "-r", f"{batch}/.", str(copy)], check=True)
    (copy / "sample-audit.json").write_text("{}")                                       # whatever the copy held before, the audit writes its own report
    r = subprocess.run([sys.executable, "-m", "slay2_sim", "audit", "sample", "--batch", str(copy), "--limit", "40"], env={**os.environ, "PYTHONPATH": str(REPO / "sim")},
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    assert json.loads((copy / "sample-audit.json").read_text())["all_verified"] is True
    assert {p.name: sha(p) for p in batch.iterdir()} == before
