"""The preflight of the Act-2 study's held-out run (ADR-060 item 9 and addendum B): every check can pass and every check can fail.

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
ENV = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}


def sh(cmd: str, cwd: Path, env: dict | None = None, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["bash", "-c", cmd], cwd=cwd, env={**os.environ, **ENV, **(env or {})}, capture_output=True, text=True, check=check)


def common(work: Path, snippet: str) -> list[str]:
    return sh(f"source scripts/studies/act2/common.sh; {snippet}", work, env={"OUT": str(work / "artifacts" / "x")}).stdout.split("\n")[:-1]


def sha_of(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def head(work: Path) -> str:
    return sh("git rev-parse HEAD", work).stdout.strip()


def build_world(tmp: Path, arms=("s", "lead", "p020"), marker: str = MARKER, screened_change: bool = False, dev_head: str | None = "auto", between: str | None = None) -> Path:
    """A work tree whose HEAD is a part-2 commit on the remote, with the selection, the development batches and the value files the record quotes.

    Commit A carries the code and the value files (the commit the development stage was played from); commit B is part 2 of the record."""
    tmp.mkdir(parents=True, exist_ok=True)
    bare, work = tmp / "origin.git", tmp / "work"
    sh(f"git init -q --bare {bare}", tmp)
    work.mkdir()
    sh("git init -q -b main && git remote add origin " + str(bare), work)
    shutil.copytree(REPO / "scripts" / "studies" / "act2", work / "scripts" / "studies" / "act2")
    for rel in (
        "sim/slay2_sim/stub.txt", "sim/slay2_sim/act2study.py", "sim/tests/stub.txt", "packages/game-data/data/stub.txt", "external/pins.json", "scripts/verify-pooled.py",
        "scripts/lib/act2.mjs", "scripts/lib/pooled.mjs", "experiments/seeds/ironclad-a0-v2.json",
    ):
        p = work / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("stub " + rel + "\n")
    files = common(work, "shown_files; act2_files")
    for f in files:
        p = work / f
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps({"kind": "card-values", "file": f, "fitted": False}))
    (work / "docs").mkdir()
    (work / "docs" / "DECISIONS.md").write_text("## 2026-10-31 — ADR-060: the study\n\nPart 1 text.\n")
    sh("git add -A && git commit -q -m dev-commit && git push -q origin main", work)
    dev_commit = head(work)
    if screened_change:
        (work / "sim" / "slay2_sim" / "stub.txt").write_text("the code the arms execute changed after the development stage\n")
    # what may change between the development commit and part 2, and what may not
    if between == "analysis":        # the analysis tool plays no game
        (work / "sim" / "slay2_sim" / "act2study.py").write_text("the analysis tool changed\n")
    if between == "script":          # the scripts around the arms (here the verification of a batch)
        c = work / "scripts" / "studies" / "act2" / "common.sh"
        c.write_text(c.read_text().replace("# The working tree is the commit", "# (a comment added after the development stage)\n# The working tree is the commit", 1))
    if between == "arm":             # the definition of an arm
        c = work / "scripts" / "studies" / "act2" / "common.sh"
        c.write_text(c.read_text().replace("LEAD_THRESHOLD=0.2 ", "LEAD_THRESHOLD=0.3 ", 1))
    # part 2: the selection, the development batches and the record
    ptags = common(work, "echo $P_TAGS")[0].split()
    dev_arms = ["lead", *ptags]
    sel = work / "experiments" / "act2" / "dev-selection.json"
    sel.parent.mkdir(parents=True)
    sel.write_text(json.dumps({
        "actOneIdentical": True, "arms": dict.fromkeys(dev_arms, {}),
        "P": {"advance": "p020" in arms, "arm": "p020" if "p020" in arms else None}, "V": {"advance": "v" in arms},
    }))
    table = [ln.split("|") for ln in common(work, "arm_table")][:-1]          # arm | class | policy | params | dev id | val id | shown file | act-2 file
    for arm, c, policy, params, dev_batch, *_ in table:
        if arm == "v":
            continue
        d = work / "experiments" / "batches" / dev_batch
        d.mkdir(parents=True)
        (d / "manifest.json").write_text(json.dumps({
            "policy": {"name": policy, "params": json.loads(params)},
            "config": {"ascension": 0, "keep_relics": True, "character": c},
            "seeds": {"partition": "dev", "n": 600, "offset": 1000},
            "summary": {"episodes": 600, "completed": 580, "counts": {"aborted": 0, "harness_error": 0, "policy_error": 0, "invalid_action": 0}},
            "class_start_verified": True, "canonical_process_state": True, "environment": {"slay2": {"head": dev_commit, "dirty": False}},
        }))
    quoted = "\n".join(f"- {f}: `{sha_of(work / f)}`" for f in [*files, "experiments/act2/dev-selection.json"])
    arm_lines = "\n".join(f"ARM_{a}" for a in arms if a not in ("s", "lead"))
    dev_line = f"DEV_HEAD={dev_commit if dev_head == 'auto' else dev_head}" if dev_head else ""
    (work / "docs" / "DECISIONS.md").write_text(
        f"## 2026-10-31 — ADR-060: the study\n\nPart 1 text.\n\n**{marker}.**\n{dev_line}\n{quoted}\n{arm_lines}\n\n## 2026-11-01 — ADR-061: another record\n\nhash `{'f' * 64}`\n"
    )
    sh("git add -A && git commit -q -m part2 && git push -q origin main", work)
    return work


def preflight(work: Path, **env: str) -> subprocess.CompletedProcess:
    return sh("bash scripts/studies/act2/preflight-val.sh", work, env={"OUT": str(work / "artifacts" / "act2"), "PY": "python3", **env}, check=False)


def push_change(work: Path, rel: str, text: str | None = None) -> None:
    p = work / rel
    p.write_text(text if text is not None else p.read_text() + "\n# changed\n")
    sh("git add -A && git commit -q -m changed && git push -q origin main", work)


def test_a_world_that_satisfies_the_record_passes(tmp_path):
    r = preflight(build_world(tmp_path))
    assert r.returncode == 0, r.stderr
    assert "preflight-val: ok" in r.stdout and "arms: s lead p020" in r.stdout and "development " in r.stdout


@pytest.mark.parametrize("arms,expect", [(("s", "lead"), "arms: s lead"), (("s", "lead", "p020", "v"), "arms: s lead p020 v")])
def test_the_arms_come_from_the_selection(tmp_path, arms, expect):
    work = build_world(tmp_path, arms)
    r = preflight(work)
    # V needs development batches of its own in this world only if the selection lists it; the stub lists none, so only the first passes
    assert (r.returncode == 0 and expect in r.stdout) if arms == ("s", "lead") else (r.returncode == 0 and expect in r.stdout) or "development batch" in r.stderr


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


def test_a_shallow_clone_is_refused(tmp_path):
    work = build_world(tmp_path)
    shallow = tmp_path / "shallow"
    sh(f"git clone -q --depth 1 --branch main file://{tmp_path / 'origin.git'} {shallow}", tmp_path)
    r = preflight(shallow)
    assert r.returncode != 0 and "shallow clone" in r.stderr
    assert work.exists()


@pytest.mark.parametrize("path", [
    "sim/slay2_sim/stub.txt", "sim/tests/stub.txt", "scripts/studies/act2/common.sh", "experiments/seeds/ironclad-a0-v2.json", "external/pins.json",
    "experiments/act2/dev-selection.json", "scripts/lib/act2.mjs", "scripts/lib/pooled.mjs", "scripts/verify-pooled.py",
])
def test_code_or_data_that_changed_after_the_registration_commit_stops_it(tmp_path, path):
    work = build_world(tmp_path)
    push_change(work, path)
    r = preflight(work)
    assert r.returncode != 0 and "changed after the registration commit" in r.stderr, path


def test_the_registration_commit_cannot_be_named_from_the_environment_unless_a_test_says_so(tmp_path):
    work = build_world(tmp_path)
    push_change(work, "sim/slay2_sim/stub.txt")
    sneaky = preflight(work, REG=head(work))
    assert sneaky.returncode != 0 and "REG is set in the environment; refused" in sneaky.stderr
    allowed = preflight(work, REG=head(work), ALLOW_REG_OVERRIDE="1")
    assert allowed.returncode != 0 or "preflight-val: ok" in allowed.stdout   # the override exists for tests; it is not silent about what it does


def test_a_marker_that_is_only_in_the_history_and_not_at_head_stops_it(tmp_path):
    work = build_world(tmp_path)
    p = work / "docs" / "DECISIONS.md"
    p.write_text(p.read_text().replace(MARKER, "Something else"))
    sh("git add -A && git commit -q -m reworded && git push -q origin main", work)
    r = preflight(work)
    assert r.returncode != 0 and "does not carry part 2" in r.stderr


def test_a_record_that_never_carries_the_part_two_marker_stops_it(tmp_path):
    r = preflight(build_world(tmp_path, marker="Something else"))
    assert r.returncode != 0 and "does not carry part 2" in r.stderr


def test_a_value_file_whose_hash_the_record_does_not_quote_stops_it(tmp_path):
    work = build_world(tmp_path)
    f = common(work, "act2_files")[0]
    push_change(work, f, (work / f).read_text() + " ")                    # the file changes; the development commit is moved onto the change,
    p = work / "docs" / "DECISIONS.md"                                    # so that the check which stops it is the one on the quoted hash
    p.write_text(p.read_text().replace(next(ln for ln in p.read_text().splitlines() if ln.startswith("DEV_HEAD=")), f"DEV_HEAD={head(work)}"))
    sh("git add -A && git commit -q -m amend && git push -q origin main", work)
    r = preflight(work, REG=head(work), ALLOW_REG_OVERRIDE="1")
    assert r.returncode != 0 and "does not quote the SHA-256" in r.stderr and f in r.stderr


def test_a_hash_quoted_only_in_a_later_record_does_not_count(tmp_path):
    work = build_world(tmp_path)
    p = work / "docs" / "DECISIONS.md"
    text = p.read_text()
    f = common(work, "act2_files")[1]
    line = [ln for ln in text.splitlines() if ln.startswith(f"- {f}")][0]
    p.write_text(text.replace(line + "\n", "") + f"\n{line}\n")      # the same hash, now under ADR-061
    sh("git add -A && git commit -q -m moved && git push -q origin main", work)
    r = preflight(work, REG=head(work), ALLOW_REG_OVERRIDE="1")
    assert r.returncode != 0 and "does not quote the SHA-256" in r.stderr


def test_the_development_commit_must_be_quoted_known_and_the_code_it_screened_unchanged(tmp_path):
    assert "does not quote the commit the development stage was played from" in preflight(build_world(tmp_path / "a", dev_head=None)).stderr
    assert "is not in this repository" in preflight(build_world(tmp_path / "b", dev_head="0" * 40)).stderr
    r = preflight(build_world(tmp_path / "c", screened_change=True))
    assert r.returncode != 0 and "changed between the development commit" in r.stderr and "sim/slay2_sim/stub.txt" in r.stderr


def test_what_may_change_between_the_development_commit_and_part_two_and_what_may_not(tmp_path):
    assert preflight(build_world(tmp_path / "analysis", between="analysis")).returncode == 0       # the analysis tool plays no game
    r = preflight(build_world(tmp_path / "script", between="script"))
    assert r.returncode == 0, r.stderr                                                              # a comment in the scripts around the arms
    r = preflight(build_world(tmp_path / "arm", between="arm"))
    assert r.returncode != 0 and "the arms are not defined alike" in r.stderr                       # the definition of an arm


def test_a_development_batch_that_is_not_what_the_record_says_stops_it(tmp_path):
    work = build_world(tmp_path / "params")
    m = next((work / "experiments" / "batches").glob("act2dev-p035-defect-*")) / "manifest.json"
    body = json.loads(m.read_text())
    body["policy"]["params"]["late_threshold"] = 0.2
    m.write_text(json.dumps(body))
    sh("git add -A && git commit -q -m tamper && git push -q origin main", work)
    r = preflight(work, REG=head(work), ALLOW_REG_OVERRIDE="1")
    assert r.returncode != 0 and "act2dev-p035-defect" in r.stderr and "a development batch is not what ADR-060 says" in r.stderr and "policy parameters" in r.stderr
    other = build_world(tmp_path / "head")
    m = next((other / "experiments" / "batches").glob("act2dev-s-silent-*")) / "manifest.json"
    body = json.loads(m.read_text())
    body["environment"]["slay2"]["head"] = "b" * 40
    m.write_text(json.dumps(body))
    sh("git add -A && git commit -q -m other-head && git push -q origin main", other)
    r = preflight(other, REG=head(other), ALLOW_REG_OVERRIDE="1")
    assert r.returncode != 0 and "act2dev-s-silent" in r.stderr and "not from" in r.stderr
    cls = build_world(tmp_path / "class")
    m = next((cls / "experiments" / "batches").glob("act2dev-lead-regent-*")) / "manifest.json"
    body = json.loads(m.read_text())
    body["config"]["character"] = "Silent"
    m.write_text(json.dumps(body))
    sh("git add -A && git commit -q -m other-class && git push -q origin main", cls)
    assert "class Silent" in preflight(cls, REG=head(cls), ALLOW_REG_OVERRIDE="1").stderr


def test_the_arms_the_record_names_are_exactly_the_arms_the_selection_sent_forward(tmp_path):
    # an arm the selection did not send forward, named: refused
    work = build_world(tmp_path / "extra")
    p = work / "docs" / "DECISIONS.md"
    p.write_text(p.read_text().replace("ARM_p020", "ARM_p020\nARM_v"))
    sh("git add -A && git commit -q -m extra-arm && git push -q origin main", work)
    r = preflight(work, REG=head(work), ALLOW_REG_OVERRIDE="1")
    assert r.returncode != 0 and "names the arms 'p020 v'" in r.stderr
    # an arm that is sent forward and not named: refused
    work = build_world(tmp_path / "missing")
    p = work / "docs" / "DECISIONS.md"
    p.write_text(p.read_text().replace("ARM_p020", "nothing"))
    sh("git add -A && git commit -q -m missing-arm && git push -q origin main", work)
    assert "names the arms ''" in preflight(work, REG=head(work), ALLOW_REG_OVERRIDE="1").stderr
    # a tag that merely contains the name does not name it
    work = build_world(tmp_path / "prefix")
    p = work / "docs" / "DECISIONS.md"
    p.write_text(p.read_text().replace("ARM_p020", "ARM_p0200"))
    sh("git add -A && git commit -q -m prefix && git push -q origin main", work)
    assert "names the arms 'p0200'" in preflight(work, REG=head(work), ALLOW_REG_OVERRIDE="1").stderr


def test_a_selection_that_does_not_say_the_arms_were_identical_in_act_one_stops_it(tmp_path):
    work = build_world(tmp_path)
    sel = work / "experiments" / "act2" / "dev-selection.json"
    body = json.loads(sel.read_text())
    body["actOneIdentical"] = False
    sel.write_text(json.dumps(body))
    # quote the new hash so that the check on the quoted hash passes and this one is what stops it
    p = work / "docs" / "DECISIONS.md"
    old = [ln for ln in p.read_text().splitlines() if "dev-selection.json" in ln][0]
    p.write_text(p.read_text().replace(old, f"- experiments/act2/dev-selection.json: `{sha_of(sel)}`"))
    sh("git add -A && git commit -q -m not-identical && git push -q origin main", work)
    r = preflight(work, REG=head(work), ALLOW_REG_OVERRIDE="1")
    assert r.returncode != 0 and "does not say that the arms were identical to S in Act 1" in r.stderr


def test_a_missing_development_batch_stops_it(tmp_path):
    work = build_world(tmp_path)
    shutil.rmtree(sorted((work / "experiments" / "batches").iterdir())[3])
    sh("git add -A && git commit -q -m rm && git push -q origin main", work)
    r = preflight(work, REG=head(work), ALLOW_REG_OVERRIDE="1")
    assert r.returncode != 0 and "development batch" in r.stderr and "is missing" in r.stderr


@pytest.mark.parametrize("path", ["experiments/act2/pooled-act2-L.json", "experiments/act2/pooled-act2-P.json", "experiments/act2/pooled-act2-V.json", "experiments/act2/robustness-errors.json"])
def test_a_result_that_exists_stops_it(tmp_path, path):
    work = build_world(tmp_path)
    (work / path).write_text("{}")
    r = preflight(work)
    assert r.returncode != 0 and "the test is run once" in r.stderr


@pytest.mark.parametrize("sub", ["per-class", "determinism", "identity"])
def test_output_of_the_comparisons_that_exists_stops_it(tmp_path, sub):
    work = build_world(tmp_path)
    d = work / "experiments" / "act2" / sub
    d.mkdir(parents=True)
    (d / "ironclad.json").write_text("{}")
    r = preflight(work)
    assert r.returncode != 0 and "the comparisons are run once" in r.stderr


def test_a_result_in_the_history_stops_it_even_if_it_was_deleted(tmp_path):
    work = build_world(tmp_path)
    p = work / "experiments" / "act2" / "pooled-act2-L.json"
    p.write_text("{}")
    sh("git add -A && git commit -q -m leak && git rm -q experiments/act2/pooled-act2-L.json && git commit -q -m gone && git push -q origin main", work)
    r = preflight(work, REG=sh("git rev-parse HEAD~2", work).stdout.strip(), ALLOW_REG_OVERRIDE="1")
    assert r.returncode != 0 and "is in the history" in r.stderr


def test_val_batches_that_exist_stop_it_unless_an_interrupted_run_is_being_resumed(tmp_path):
    work = build_world(tmp_path)
    d = work / "experiments" / "batches" / "act2-s-ironclad-a0-veteran-keeprelics-val-n2000"
    d.mkdir(parents=True)
    (d / "manifest.json").write_text("{}")
    assert "RESUME=1" in preflight(work).stderr
    assert preflight(work, RESUME="1").returncode == 0
