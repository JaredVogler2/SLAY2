"""`scripts/studies/underdocks/preflight-val.sh` on throwaway repositories (ADR-064 items 3 and 10).

The preflight stands between the registration and the first held-out game: it refuses unless the working tree is the commit that registered the study, that commit
is on the remote, every file an arm reads is the file whose hash the record quotes, the harness tests pass, the precondition passed, nothing of the study's results
exists or is in the history, the Overgrowth twins exist and no batch of the study is there. Each test builds a small repository that passes all of this and breaks one
thing. The real value files, the real card table and the real analysis package are copied in (they are small); the harness tests are replaced by a stub, because
they need the game's source, which the throwaway has not got (the real ones are run by the test file that holds them).
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
CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"]
HEAD = "## 2026-11-02 — ADR-064: do the three results that hold in Act 1's Overgrowth hold in its other version, Underdocks?"
TABLE_SHA = "bd0b8a9fd4f96fd974e318c4d1e71efd4dda0e9359f61b73410f24baace7f49a"
VALUE_FILES = [f"experiments/cardvalue/{n}" for n in (
    "ironclad-a0-v1.json", "ironclad-a0-v2.json", "silent-a0-v1.json", "silent-a0-keep-v1.json", "regent-a0-v1.json", "regent-a0-keep-v1.json",
    "necrobinder-a0-v1.json", "necrobinder-a0-keep-v1.json", "defect-a0-v1.json", "defect-a0-keep-v1.json")]
NEOW = "experiments/neow/neow-values-keep-v1.json"
TWINS = ["advisor_v1-astar", "advisor_v1-d0star", "rules_v2-shownvals", "rules_v1", "rules_v2_neow_values-keepvals", "rules_v2"]
PASSING_HARNESS = "def test_fingerprint_stub():\n    assert True\n"
FAILING_HARNESS = "def test_fingerprint_stub():\n    assert False\n"


def git(work: Path, cmd: str, check: bool = True) -> subprocess.CompletedProcess:
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    return subprocess.run(["bash", "-c", cmd], cwd=work, env=env, capture_output=True, text=True, check=check)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def preflight(work: Path, **env: str) -> subprocess.CompletedProcess:
    e = {**os.environ, "PY": sys.executable, "OUT": str(work / "artifacts" / "underdocks"), "PYTHONPATH": "", "PREFLIGHT_ONLY": "1", **env}
    return subprocess.run(["bash", "scripts/studies/underdocks/run-val.sh", "4"], cwd=work, env=e, capture_output=True, text=True)


def build(tmp: Path, *, harness: str = PASSING_HARNESS, default_values: str | None = None, quote: bool = True, with_adr: bool = True, passed: bool = True,
          twins: bool = True) -> Path:
    """A repository at the registration commit, pushed to a bare remote, from which the preflight passes."""
    work, remote = tmp / "work", tmp / "remote.git"
    for rel in ("scripts/studies/underdocks", "experiments/neow"):
        (work / rel).parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(REPO / "scripts" / "studies" / "underdocks", work / "scripts" / "studies" / "underdocks", ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copytree(REPO / "sim" / "slay2_sim", work / "sim" / "slay2_sim", ignore=shutil.ignore_patterns("__pycache__", "tests"))
    (work / "sim" / "tests").mkdir()
    (work / "sim" / "tests" / "test_underdocks.py").write_text(harness)
    (work / "experiments" / "cardvalue").mkdir(parents=True)
    for f in VALUE_FILES + ["experiments/cardvalue/site-sets.json", NEOW, "packages/game-data/data/synergy.sts2-main-0.107.1.json"]:
        (work / f).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(REPO / f, work / f)
    if default_values is not None:
        rules2 = work / "sim" / "slay2_sim" / "policies" / "rules2.py"
        rules2.write_text(rules2.read_text().replace('DEFAULT_VALUES = "experiments/cardvalue/ironclad-a0-v1.json"', f'DEFAULT_VALUES = "{default_values}"'))
    for rel in ("experiments/seeds/stub.txt", "external/pins.json"):
        (work / rel).parent.mkdir(parents=True, exist_ok=True)
        (work / rel).write_text("stub " + rel + "\n")
    (work / "experiments" / "underdocks").mkdir(parents=True, exist_ok=True)
    (work / "experiments" / "underdocks" / "precondition.json").write_text(json.dumps({"passed": passed}))
    if twins:
        for cls in CLASSES:
            for arm in TWINS:
                d = work / "experiments" / "batches" / f"{arm}-{cls}-a0-veteran-keeprelics-val-n2000"
                d.mkdir(parents=True)
                (d / "manifest.json").write_text("{}")
    (work / ".gitignore").write_text("__pycache__/\n*.pyc\n")
    (work / "docs").mkdir()
    hashes = [sha(work / f) for f in VALUE_FILES] + [sha(work / NEOW), TABLE_SHA]
    quoted = ("\n".join(hashes) if quote else "no hashes") + "\n"
    (work / "docs" / "DECISIONS.md").write_text(("## earlier record\n\ntext\n\n" + HEAD + "\n\nThe design.\n" + quoted + "\n## later record\n\ntext\n") if with_adr else "## earlier record\n")
    git(work, "git init -q -b main && git add -A && git commit -q -m registration")
    git(work, f"git init -q --bare {remote} && git remote add origin {remote} && git push -q origin main")
    return work


@pytest.fixture(scope="module")
def world(tmp_path_factory) -> Path:
    return build(tmp_path_factory.mktemp("udpre"))


@pytest.fixture
def work(world: Path, tmp_path: Path) -> Path:
    dest = tmp_path / "work"
    shutil.copytree(world, dest, symlinks=True)
    shutil.copytree(world.parent / "remote.git", tmp_path / "remote.git", symlinks=True)
    git(dest, f"git remote set-url origin {tmp_path / 'remote.git'}")
    return dest


def commit(work: Path, message: str = "change", push: bool = True) -> None:
    git(work, f"git add -A && git commit -q -m '{message}'" + (" && git push -q origin main" if push else ""))


def test_it_passes_at_the_registration_commit_when_it_is_on_the_remote(work):
    r = preflight(work)
    assert r.returncode == 0, r.stderr + r.stdout
    assert "preflight-val: ok" in r.stdout and "registration" in r.stdout
    assert not (work / "experiments" / "underdocks" / "batches").exists()           # the preflight alone plays nothing


def test_a_modified_tracked_file_stops_it(work):
    (work / "docs" / "DECISIONS.md").write_text((work / "docs" / "DECISIONS.md").read_text() + "\nan edit\n")
    r = preflight(work)
    assert r.returncode != 0 and "tracked files are modified" in r.stderr


def test_an_untracked_file_outside_the_results_stops_it_and_one_inside_them_does_not(work):
    (work / "experiments" / "underdocks" / "notes.txt").write_text("fine")
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


def test_a_record_without_the_study_stops_it(tmp_path):
    work = build(tmp_path, with_adr=False)
    r = preflight(work)
    assert r.returncode != 0 and "does not carry ADR-064" in r.stderr


@pytest.mark.parametrize(
    "path,edit",
    [
        ("sim/slay2_sim/runner.py", lambda p: p.write_text(p.read_text() + "\n# a change after the registration\n")),
        ("sim/tests/test_underdocks.py", lambda p: p.write_text(p.read_text() + "\n# a change after the registration\n")),
        ("scripts/studies/underdocks/common.sh", lambda p: p.write_text(p.read_text() + "\n# a change after the registration\n")),
        ("experiments/cardvalue/silent-a0-keep-v1.json", lambda p: p.write_text(p.read_text() + " ")),
        ("experiments/neow/neow-values-keep-v1.json", lambda p: p.write_text(p.read_text() + " ")),
        ("packages/game-data/data/synergy.sts2-main-0.107.1.json", lambda p: p.write_text(p.read_text() + " ")),
        ("experiments/seeds/stub.txt", lambda p: p.write_text("another seed file\n")),
        ("external/pins.json", lambda p: p.write_text("another pin\n")),
    ],
)
def test_code_or_data_the_arms_read_that_changed_after_the_registration_commit_stops_it_even_when_pushed(work, path, edit):
    edit(work / path)
    commit(work)
    r = preflight(work)
    assert r.returncode != 0 and "changed after the registration commit" in r.stderr and path in r.stderr, r.stderr


def test_a_change_outside_what_the_arms_read_does_not_stop_it(work):
    (work / "docs" / "DECISIONS.md").write_text((work / "docs" / "DECISIONS.md").read_text() + "\n## an addendum\n\nafter the registration\n")
    (work / "apps").mkdir()
    (work / "apps" / "page.tsx").write_text("export {}\n")
    commit(work)
    assert preflight(work).returncode == 0


def test_a_file_an_arm_reads_whose_hash_the_record_does_not_quote_stops_it(tmp_path):
    work = build(tmp_path, quote=False)
    r = preflight(work)
    assert r.returncode != 0 and "does not quote the SHA-256" in r.stderr


def test_a_hash_that_only_a_later_record_quotes_does_not_count(tmp_path):
    work = build(tmp_path, quote=False)
    d = work / "docs" / "DECISIONS.md"
    hashes = [sha(work / f) for f in VALUE_FILES] + [sha(work / NEOW), TABLE_SHA]
    d.write_text(d.read_text() + "\n## 2026-11-03 — ADR-066: another record\n\n" + "\n".join(hashes) + "\n")
    commit(work)
    r = preflight(work)
    assert r.returncode != 0 and "does not quote the SHA-256" in r.stderr


def test_the_harness_tests_have_to_pass(tmp_path):
    work = build(tmp_path, harness=FAILING_HARNESS)
    r = preflight(work)
    assert r.returncode != 0 and "harness tests of the Underdocks variant do not pass" in r.stderr


def test_the_default_card_values_of_the_baseline_have_to_be_the_file_the_record_names(tmp_path):
    work = build(tmp_path, default_values="experiments/cardvalue/ironclad-a0-v2.json")
    r = preflight(work)
    assert r.returncode != 0 and "default card values" in r.stderr


def test_a_precondition_that_is_missing_uncommitted_or_failed_stops_it(tmp_path):
    pre = "experiments/underdocks/precondition.json"
    work = build(tmp_path / "a")
    git(work, f"git rm -q {pre} && git commit -q -m x && git push -q origin main")
    assert "precondition.json is missing" in preflight(work).stderr
    (work / pre).parent.mkdir(parents=True, exist_ok=True)
    (work / pre).write_text(json.dumps({"passed": True}))                          # present, not committed
    assert "the precondition report is not committed" in preflight(work).stderr
    failed = build(tmp_path / "b", passed=False)
    r = preflight(failed)
    assert r.returncode != 0 and "the precondition did not pass" in r.stderr


@pytest.mark.parametrize(
    "name", ["pooled-ud-t1-synergy-astar-vs-d0star", "pooled-ud-t2-values-shown-vs-rules_v1", "pooled-ud-t3-neow-keep-v1-vs-rules_v2", "robustness-all-pairs"]
)
def test_a_pooled_result_that_exists_or_was_ever_committed_stops_it(work, name):
    f = work / "experiments" / "underdocks" / f"{name}.json"
    f.write_text("{}")
    r = preflight(work)
    assert r.returncode != 0 and "exists: the test is run once" in r.stderr
    commit(work)
    git(work, f"git rm -q {f.relative_to(work)} && git commit -q -m remove && git push -q origin main")
    r = preflight(work)
    assert r.returncode != 0 and "is in the history: the test is run once" in r.stderr


def test_output_of_the_comparisons_that_exists_or_was_ever_committed_stops_it(work):
    d = work / "experiments" / "underdocks" / "per-class"
    d.mkdir()
    (d / "ud-t1-ironclad.json").write_text("{}")
    r = preflight(work)
    assert r.returncode != 0 and "per-class holds output" in r.stderr
    commit(work)
    git(work, "git rm -rq experiments/underdocks/per-class && git commit -q -m remove && git push -q origin main")
    r = preflight(work)
    assert r.returncode != 0 and "per-class is in the history" in r.stderr


def test_the_overgrowth_batches_the_results_are_set_beside_have_to_exist(tmp_path):
    work = build(tmp_path, twins=False)
    r = preflight(work)
    assert r.returncode != 0 and "the Overgrowth side of the comparison" in r.stderr


def test_batches_of_the_study_that_already_exist_stop_it_unless_an_interrupted_run_is_being_finished(work):
    d = work / "experiments" / "underdocks" / "batches" / "rules_v1-ironclad-a0-veteran-keeprelics-underdocks-val-n2000"
    d.mkdir(parents=True)
    (d / "manifest.json").write_text("{}")
    r = preflight(work)
    assert r.returncode != 0 and "batches of the val arms already exist" in r.stderr
    assert preflight(work, RESUME="1").returncode == 0
