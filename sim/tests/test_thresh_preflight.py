"""The two preflights of the threshold study (ADR-062 items 2 and 9): before the first development game and before the first held-out game. Every check can pass
and every check can fail.

A throwaway repository (a bare "remote", a work tree, stub files at the paths the scripts read, a record that quotes the hashes, a real seed manifest) is built
around the real scripts, and the preflight is run in it: once on a world that satisfies it, then on worlds that break one thing each. No simulator and no game
is involved.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from slay2_sim import external
from slay2_sim.manifest import make_seed_manifest, save_json

REPO = external.REPO_ROOT
MARKER1 = "Registration of ADR-062 (part 1, frozen choices)"
MARKER2 = "Frozen choices of ADR-062 (part 2)"
ENV = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
SEEDS = "experiments/seeds/ironclad-a0-v4.json"
SIZES = {"train": 4, "val": 4, "test": 4, "dev": 4, "val2": 4, "dev2": 3000, "val3": 15000}
TAGS = ["t010", "t020", "t030", "t045", "t060", "tnone"]


def sh(cmd: str, cwd: Path, env: dict | None = None, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["bash", "-c", cmd], cwd=cwd, env={**os.environ, **ENV, **(env or {})}, capture_output=True, text=True, check=check)


def common(work: Path, snippet: str) -> list[str]:
    return sh(f"source scripts/studies/thresh/common.sh; {snippet}", work, env={"OUT": str(work / "artifacts" / "x")}).stdout.split("\n")[:-1]


def sha_of(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def head(work: Path) -> str:
    return sh("git rev-parse HEAD", work).stdout.strip()


def new_repo(tmp: Path) -> Path:
    tmp.mkdir(parents=True, exist_ok=True)
    bare, work = tmp / "origin.git", tmp / "work"
    sh(f"git init -q --bare {bare}", tmp)
    work.mkdir()
    sh("git init -q -b main && git remote add origin " + str(bare), work)
    shutil.copytree(REPO / "scripts" / "studies" / "thresh", work / "scripts" / "studies" / "thresh", ignore=shutil.ignore_patterns("__pycache__"))
    for rel in (
        "sim/slay2_sim/stub.txt", "sim/slay2_sim/threshstudy.py", "sim/tests/stub.txt", "packages/game-data/data/stub.txt", "external/pins.json", "scripts/verify-pooled.py",
        "scripts/lib/thresh.mjs", "scripts/lib/pooled.mjs",
    ):
        p = work / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("stub " + rel + "\n")
    files = common(work, "shown_files")
    for f in files:
        p = work / f
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps({"kind": "card-values", "file": f}))
    return work


def push_change(work: Path, rel: str, text: str | None = None) -> None:
    p = work / rel
    p.write_text(text if text is not None else p.read_text() + "\n# changed\n")
    sh("git add -A && git commit -q -m changed && git push -q origin main", work)


# ----------------------------------------------------------------------------------------------------------------------------- the development preflight


def build_dev_world(tmp: Path, marker: str = MARKER1, dev2: int = 3000, val3: int = 15000, quote_seeds: bool = True) -> Path:
    """A work tree whose HEAD is the registration commit (part 1), on the remote, with the value files and the seed manifest the record quotes."""
    work = new_repo(tmp)
    files = common(work, "shown_files")
    save_json(work / SEEDS, make_seed_manifest("ironclad-a0-v4", 20261025, {**SIZES, "dev2": dev2, "val3": val3}))
    (work / "docs").mkdir()
    quoted = "\n".join(f"- {f}: `{sha_of(work / f)}`" for f in [*files, *([SEEDS] if quote_seeds else [])])
    (work / "docs" / "DECISIONS.md").write_text(
        f"## 2026-11-02 — ADR-062: which threshold wins\n\nPart 1 text.\n\n**{marker}.**\n{quoted}\n\n## 2026-11-03 — ADR-063: another record\n\nhash `{'f' * 64}`\n"
    )
    sh("git add -A && git commit -q -m registration && git push -q origin main", work)
    return work


def preflight_dev(work: Path, **env: str) -> subprocess.CompletedProcess:
    # the seed check imports the real harness (the work tree holds stubs where the code is)
    return sh("bash scripts/studies/thresh/preflight-dev.sh", work, env={"OUT": str(work / "artifacts" / "thresh"), "PY": "python3", "PYTHONPATH": str(REPO / "sim"), **env}, check=False)


def test_a_dev_world_that_satisfies_the_record_passes(tmp_path):
    r = preflight_dev(build_dev_world(tmp_path))
    assert r.returncode == 0, r.stderr
    assert "preflight-dev: ok" in r.stdout and "arms: s t010 t020 t030 t045 t060 tnone" in r.stdout and "registration " in r.stdout


def test_a_dev_tracked_file_that_was_edited_stops_it(tmp_path):
    work = build_dev_world(tmp_path)
    (work / "docs" / "DECISIONS.md").write_text((work / "docs" / "DECISIONS.md").read_text() + "\nedited\n")
    r = preflight_dev(work)
    assert r.returncode != 0 and "tracked files are modified" in r.stderr


def test_a_dev_untracked_file_outside_experiments_and_artifacts_stops_it(tmp_path):
    work = build_dev_world(tmp_path)
    (work / "notes.txt").write_text("x")
    assert "untracked files outside" in preflight_dev(work).stderr


def test_a_dev_head_that_is_not_on_the_remote_stops_it(tmp_path):
    work = build_dev_world(tmp_path)
    (work / "docs" / "x.md").write_text("x")
    sh("git add -A && git commit -q -m local", work)
    r = preflight_dev(work)
    assert r.returncode != 0 and "HEAD is not on the remote" in r.stderr


def test_a_dev_shallow_clone_is_refused(tmp_path):
    work = build_dev_world(tmp_path)
    shallow = tmp_path / "shallow"
    sh(f"git clone -q --depth 1 --branch main file://{tmp_path / 'origin.git'} {shallow}", tmp_path)
    r = preflight_dev(shallow)
    assert r.returncode != 0 and "shallow clone" in r.stderr
    assert work.exists()


@pytest.mark.parametrize("path", [
    "sim/slay2_sim/stub.txt", "sim/slay2_sim/threshstudy.py", "packages/game-data/data/stub.txt", "scripts/studies/thresh/common.sh", "scripts/studies/thresh/pool.sh",
    "scripts/studies/thresh/robustness.py", "scripts/studies/thresh/verify_all.py", "scripts/studies/thresh/seeds_played.py", "scripts/studies/thresh/audit.sh",
    "scripts/studies/thresh/verify_batch.py", "scripts/studies/thresh/dev.sh", "scripts/studies/thresh/preflight-val.sh", "experiments/seeds/ironclad-a0-v4.json",
    "external/pins.json", "scripts/verify-pooled.py", "experiments/cardvalue/ironclad-a0-v2.json",
])
def test_code_or_data_that_changed_after_the_registration_commit_stops_the_dev_stage(tmp_path, path):
    work = build_dev_world(tmp_path)
    push_change(work, path)
    r = preflight_dev(work)
    assert r.returncode != 0 and "changed after the registration commit" in r.stderr, path


@pytest.mark.parametrize("path", [
    "sim/tests/stub.txt", "sim/tests/test_anything.py", "scripts/studies/thresh/README.md", "docs/STATUS.md",
    "scripts/lib/thresh.mjs", "scripts/lib/pooled.mjs",   # the reading code is written during the development stage and pinned by part 2, not by part 1
])
def test_what_runs_nothing_in_the_dev_stage_may_change_after_the_registration_commit(tmp_path, path):
    """The tests of the harness, the README of the folder, the documents and the reader (pinned from part 2) are not pinned by part 1."""
    work = build_dev_world(tmp_path)
    (work / path).parent.mkdir(parents=True, exist_ok=True)
    push_change(work, path, ((work / path).read_text() if (work / path).exists() else "") + "\n# changed\n")
    r = preflight_dev(work)
    assert r.returncode == 0, (path, r.stderr)


def test_a_dev_path_the_registration_pins_that_does_not_exist_stops_it(tmp_path):
    """`git diff --quiet` succeeds for a pathspec that matches nothing, so a deleted or misspelt path would pass without this check."""
    work = build_dev_world(tmp_path)
    sh("git rm -q external/pins.json && git commit -q -m gone && git push -q origin main", work)
    r = preflight_dev(work, REG=head(work), ALLOW_REG_OVERRIDE="1")
    assert r.returncode != 0 and "external/pins.json does not exist" in r.stderr


def test_the_dev_registration_commit_cannot_be_named_from_the_environment_unless_a_test_says_so(tmp_path):
    work = build_dev_world(tmp_path)
    push_change(work, "sim/slay2_sim/stub.txt")
    sneaky = preflight_dev(work, REG=head(work))
    assert sneaky.returncode != 0 and "REG is set in the environment; refused" in sneaky.stderr
    allowed = preflight_dev(work, REG=head(work), ALLOW_REG_OVERRIDE="1")
    assert allowed.returncode == 0 and "preflight-dev: ok" in allowed.stdout, allowed.stderr
    assert "NOTICE: the registration commit was named from the environment" in allowed.stderr


def test_a_dev_marker_that_is_only_in_the_history_and_not_at_head_stops_it(tmp_path):
    work = build_dev_world(tmp_path)
    p = work / "docs" / "DECISIONS.md"
    p.write_text(p.read_text().replace(MARKER1, "Something else"))
    sh("git add -A && git commit -q -m reworded && git push -q origin main", work)
    r = preflight_dev(work)
    assert r.returncode != 0 and "does not carry its registration" in r.stderr


def test_a_dev_record_that_never_carries_the_marker_stops_it(tmp_path):
    r = preflight_dev(build_dev_world(tmp_path, marker="Something else"))
    assert r.returncode != 0 and "does not carry its registration" in r.stderr


def test_a_dev_record_that_names_its_registration_twice_stops_it(tmp_path):
    """The first commit that adds the text is taken for the registration, so a second mention (in the design, say) would make the design the registration."""
    work = build_dev_world(tmp_path)
    p = work / "docs" / "DECISIONS.md"
    p.write_text(p.read_text().replace("Part 1 text.", f"Part 1 text, which names the heading '{MARKER1}' too."))
    sh("git add -A && git commit -q -m twice && git push -q origin main", work)
    r = preflight_dev(work)
    assert r.returncode != 0 and "exactly once, it carries it 2 times" in r.stderr


def test_a_dev_record_without_the_adr_stops_it(tmp_path):
    work = build_dev_world(tmp_path)
    p = work / "docs" / "DECISIONS.md"
    p.write_text(p.read_text().replace("ADR-062: which", "ADR-061: which"))
    sh("git add -A && git commit -q -m renamed && git push -q origin main", work)
    r = preflight_dev(work)
    assert r.returncode != 0 and "does not carry ADR-062" in r.stderr


def test_a_dev_value_file_whose_hash_the_record_does_not_quote_stops_it(tmp_path):
    work = build_dev_world(tmp_path)
    f = common(work, "shown_files")[0]
    push_change(work, f, (work / f).read_text() + " ")
    r = preflight_dev(work, REG=head(work), ALLOW_REG_OVERRIDE="1")     # the registration commit moved onto the change, so that the check on the quoted hash is the one that stops it
    assert r.returncode != 0 and "does not quote the SHA-256" in r.stderr and f in r.stderr


def test_a_dev_hash_quoted_only_in_a_later_record_does_not_count(tmp_path):
    work = build_dev_world(tmp_path)
    p = work / "docs" / "DECISIONS.md"
    text = p.read_text()
    f = common(work, "shown_files")[1]
    line = [ln for ln in text.splitlines() if ln.startswith(f"- {f}")][0]
    p.write_text(text.replace(line + "\n", "") + f"\n{line}\n")      # the same hash, now under ADR-063
    sh("git add -A && git commit -q -m moved && git push -q origin main", work)
    r = preflight_dev(work, REG=head(work), ALLOW_REG_OVERRIDE="1")
    assert r.returncode != 0 and "does not quote the SHA-256" in r.stderr


def test_the_dev_seed_file_has_to_be_quoted_and_has_to_be_a_manifest_with_the_two_fresh_partitions(tmp_path):
    r = preflight_dev(build_dev_world(tmp_path / "unquoted", quote_seeds=False))
    assert r.returncode != 0 and "does not quote the SHA-256" in r.stderr and SEEDS in r.stderr
    for name, kw in (("shortdev", {"dev2": 2999}), ("shortval", {"val3": 9999})):
        r = preflight_dev(build_dev_world(tmp_path / name, **kw))
        assert r.returncode != 0 and "not a valid v4 manifest with 3000 dev2 seeds and 15000 val3 seeds" in r.stderr, name
    work = build_dev_world(tmp_path / "tampered")
    body = json.loads((work / SEEDS).read_text())
    body["partitions"]["val3"][0] += 1                           # a changed seed under the same checksum
    (work / SEEDS).write_text(json.dumps(body))
    p = work / "docs" / "DECISIONS.md"
    old = [ln for ln in p.read_text().splitlines() if SEEDS in ln][0]
    p.write_text(p.read_text().replace(old, f"- {SEEDS}: `{sha_of(work / SEEDS)}`"))
    sh("git add -A && git commit -q -m tamper && git push -q origin main", work)
    r = preflight_dev(work, REG=head(work), ALLOW_REG_OVERRIDE="1")
    assert r.returncode != 0 and "not a valid v4 manifest" in r.stderr


@pytest.mark.parametrize("name", ["dev-selection", "pooled-thresh-T1", "pooled-thresh-T2", "pooled-thresh-T3", "robustness-all-pairs", "verification"])
def test_a_result_that_exists_stops_the_dev_stage(tmp_path, name):
    work = build_dev_world(tmp_path)
    (work / "experiments" / "thresh").mkdir(parents=True, exist_ok=True)
    (work / "experiments" / "thresh" / f"{name}.json").write_text("{}")
    r = preflight_dev(work)
    assert r.returncode != 0 and "it is written once" in r.stderr


@pytest.mark.parametrize("sub", ["per-class", "identity"])
def test_output_of_the_comparisons_that_exists_stops_the_dev_stage(tmp_path, sub):
    work = build_dev_world(tmp_path)
    d = work / "experiments" / "thresh" / sub
    d.mkdir(parents=True)
    (d / "ironclad.json").write_text("{}")
    r = preflight_dev(work)
    assert r.returncode != 0 and "the comparisons are run once" in r.stderr


def test_a_result_in_the_history_stops_the_dev_stage_even_if_it_was_deleted(tmp_path):
    work = build_dev_world(tmp_path)
    p = work / "experiments" / "thresh" / "dev-selection.json"
    p.parent.mkdir(parents=True)
    p.write_text("{}")
    sh("git add -A && git commit -q -m leak && git rm -q experiments/thresh/dev-selection.json && git commit -q -m gone && git push -q origin main", work)
    r = preflight_dev(work, REG=sh("git rev-parse HEAD~2", work).stdout.strip(), ALLOW_REG_OVERRIDE="1")
    assert r.returncode != 0 and "is in the history" in r.stderr


def test_thresh_batches_that_exist_stop_the_dev_stage_unless_an_interrupted_stage_is_being_resumed(tmp_path):
    work = build_dev_world(tmp_path)
    d = work / "experiments" / "batches" / "thresh-dev-s-ironclad-a0-veteran-keeprelics-dev2-n3000"
    d.mkdir(parents=True)
    (d / "manifest.json").write_text("{}")
    assert "RESUME=1" in preflight_dev(work).stderr
    assert preflight_dev(work, RESUME="1").returncode == 0


def test_a_batch_on_the_fresh_seeds_under_any_other_name_stops_it_too(tmp_path):
    """The seed of a batch's first episode is looked up, so a run that died before its manifest was written, under any batch id, is found."""
    work = build_dev_world(tmp_path)
    parts = json.loads((work / SEEDS).read_text())["partitions"]
    d = work / "experiments" / "batches" / "my-own-trial"
    d.mkdir(parents=True)
    (d / "episodes.jsonl").write_text(json.dumps({"seed": parts["val3"][7], "outcome": "death"}) + "\n")          # no manifest: it died
    r = preflight_dev(work)
    assert r.returncode != 0 and "already exist" in r.stderr and "my-own-trial" in r.stderr
    assert preflight_dev(work, RESUME="1").returncode == 0                                                         # an interrupted stage is being finished
    zipped = work / "experiments" / "batches" / "another"
    zipped.mkdir()
    with gzip.open(zipped / "episodes.jsonl.gz", "wt", encoding="utf-8") as fh:
        fh.write(json.dumps({"seed": parts["dev2"][0]}) + "\n")
    shutil.rmtree(d)
    r = preflight_dev(work)
    assert r.returncode != 0 and "another" in r.stderr
    other = build_dev_world(tmp_path / "other")
    d = other / "experiments" / "batches" / "old-dev-trial"
    d.mkdir(parents=True)
    (d / "episodes.jsonl").write_text(json.dumps({"seed": parts["dev"][3], "outcome": "death"}) + "\n")
    (d / "manifest.json").write_text(json.dumps({"seeds": {"partition": "dev", "n": 10}}, indent=2))
    assert preflight_dev(other).returncode == 0                          # batches on other partitions are none of its business


def test_the_detector_of_fresh_seed_games_reads_only_the_first_episode_and_survives_junk(tmp_path):
    import importlib.util

    spec = importlib.util.spec_from_file_location("seeds_played", REPO / "scripts" / "studies" / "thresh" / "seeds_played.py")
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    seeds = tmp_path / "seeds.json"
    save_json(seeds, make_seed_manifest("t", 5, {"train": 3, "val": 3, "test": 3, "dev": 3, "val2": 3, "dev2": 5, "val3": 5}))
    parts = json.loads(seeds.read_text())["partitions"]
    batches = tmp_path / "batches"
    for name, content in (("a", json.dumps({"seed": parts["val3"][4]})), ("b", json.dumps({"seed": 12345})), ("c", ""), ("d", "{not json"), ("e", "\n\n" + json.dumps({"seed": parts["dev2"][0]})),
                          ("h", json.dumps({"seed": parts["val2"][0]}))):
        (batches / name).mkdir(parents=True)
        (batches / name / "episodes.jsonl").write_text(content + "\n")
    (batches / "f").mkdir()                       # no episodes at all
    (batches / "g.txt").write_text("a file, not a batch")
    assert mod.played(batches, seeds, ["dev2", "val3"]) == ["a", "e"]
    assert mod.played(batches, seeds, ["val3"]) == ["a"]
    assert mod.played(tmp_path / "nowhere", seeds, ["dev2", "val3"]) == []


# ----------------------------------------------------------------------------------------------------------------------- the held-out (part 2) preflight


def build_val_world(tmp: Path, advance: str | None = None, marker: str = MARKER2, screened_change: bool = False, dev_head: str | None = "auto", between: str | None = None) -> Path:
    """A work tree whose HEAD is a part-2 commit on the remote, with the selection, the development batches and the value files the record quotes.

    Commit A carries the code and the value files (the commit the development stage was played from); commit B is part 2 of the record."""
    work = new_repo(tmp)
    files = common(work, "shown_files")
    save_json(work / SEEDS, make_seed_manifest("ironclad-a0-v4", 20261025, {**SIZES, "dev2": 5, "val3": 5}))
    (work / "docs").mkdir()
    (work / "docs" / "DECISIONS.md").write_text("## 2026-11-02 — ADR-062: the study\n\nPart 1 text.\n")
    sh("git add -A && git commit -q -m dev-commit && git push -q origin main", work)
    dev_commit = head(work)
    if screened_change:
        (work / "sim" / "slay2_sim" / "stub.txt").write_text("the code the arms execute changed after the development stage\n")
    # what may change between the development commit and part 2, and what may not
    if between == "analysis":        # the analysis tool plays no game
        (work / "sim" / "slay2_sim" / "threshstudy.py").write_text("the analysis tool changed\n")
    if between == "script":          # the scripts around the arms (here the verification of a batch)
        c = work / "scripts" / "studies" / "thresh" / "common.sh"
        c.write_text(c.read_text().replace("# The working tree is the commit", "# (a comment added after the development stage)\n# The working tree is the commit", 1))
    if between == "arm":             # the definition of an arm
        c = work / "scripts" / "studies" / "thresh" / "common.sh"
        c.write_text(c.read_text().replace("STUDY_ALPHA=0.05 ", "STUDY_ALPHA=0.10 ", 1))
    sel = work / "experiments" / "thresh" / "dev-selection.json"
    sel.parent.mkdir(parents=True)
    sel.write_text(json.dumps({"designChecksPassed": True, "arms": dict.fromkeys(TAGS, {}), "choice": {"advance": advance is not None, "arm": advance}}))
    table = [ln.split("|") for ln in common(work, "arm_table")][:-1]          # arm | class | policy | params | dev id | val id | shown file
    for arm, c, policy, params, dev_batch, *_ in table:
        if arm == "s" or arm in TAGS:
            d = work / "experiments" / "batches" / dev_batch
            d.mkdir(parents=True)
            (d / "manifest.json").write_text(json.dumps({
                "policy": {"name": policy, "params": json.loads(params)},
                "config": {"ascension": 0, "keep_relics": True, "character": c},
                "seeds": {"partition": "dev2", "n": 3000, "offset": 0},
                "summary": {"episodes": 3000, "completed": 2900, "counts": {"aborted": 0, "harness_error": 0, "policy_error": 0, "invalid_action": 0}},
                "class_start_verified": True, "canonical_process_state": True, "environment": {"slay2": {"head": dev_commit, "dirty": False}},
            }))
    quoted = "\n".join(f"- {f}: `{sha_of(work / f)}`" for f in [*files, SEEDS, "experiments/thresh/dev-selection.json"])
    arm_lines = f"ARM_{advance}" if advance and advance != "t020" else ""
    dev_line = f"DEV_HEAD={dev_commit if dev_head == 'auto' else dev_head}" if dev_head else ""
    (work / "docs" / "DECISIONS.md").write_text(
        f"## 2026-11-02 — ADR-062: the study\n\nPart 1 text.\n\n**{marker}.**\n{dev_line}\n{quoted}\n{arm_lines}\n\n## 2026-11-03 — ADR-063: another record\n\nhash `{'f' * 64}`\n"
    )
    sh("git add -A && git commit -q -m part2 && git push -q origin main", work)
    return work


def preflight_val(work: Path, **env: str) -> subprocess.CompletedProcess:
    return sh("bash scripts/studies/thresh/preflight-val.sh", work, env={"OUT": str(work / "artifacts" / "thresh"), "PY": "python3", "PYTHONPATH": str(REPO / "sim"), **env}, check=False)


def test_a_val_world_that_satisfies_the_record_passes(tmp_path):
    r = preflight_val(build_val_world(tmp_path))
    assert r.returncode == 0, r.stderr
    assert "preflight-val: ok" in r.stdout and "arms: s t020" in r.stdout and "development " in r.stdout


def test_the_arms_come_from_the_selection(tmp_path):
    r = preflight_val(build_val_world(tmp_path / "none"))
    assert r.returncode == 0 and "arms: s t020" in r.stdout and "t030" not in r.stdout
    r = preflight_val(build_val_world(tmp_path / "adv", advance="t030"))
    assert r.returncode == 0 and "arms: s t020 t030" in r.stdout, r.stderr
    r = preflight_val(build_val_world(tmp_path / "same", advance="t020"))      # a selection that advances 0.2 itself is not one the screen can write
    assert r.returncode != 0 and "cannot read the development selection" in r.stderr
    r = preflight_val(build_val_world(tmp_path / "off", advance="t099"))       # nor is one that advances an arm the grid does not have
    assert r.returncode != 0 and "cannot read the development selection" in r.stderr


def test_a_val_tracked_file_that_was_edited_stops_it(tmp_path):
    work = build_val_world(tmp_path)
    (work / "docs" / "DECISIONS.md").write_text((work / "docs" / "DECISIONS.md").read_text() + "\nedited\n")
    r = preflight_val(work)
    assert r.returncode != 0 and "tracked files are modified" in r.stderr


def test_a_val_untracked_file_outside_experiments_and_artifacts_stops_it(tmp_path):
    work = build_val_world(tmp_path)
    (work / "notes.txt").write_text("x")
    assert "untracked files outside" in preflight_val(work).stderr


def test_a_val_head_that_is_not_on_the_remote_stops_it(tmp_path):
    work = build_val_world(tmp_path)
    (work / "docs" / "x.md").write_text("x")
    sh("git add -A && git commit -q -m local", work)
    r = preflight_val(work)
    assert r.returncode != 0 and "HEAD is not on the remote" in r.stderr


def test_a_val_shallow_clone_is_refused(tmp_path):
    work = build_val_world(tmp_path)
    shallow = tmp_path / "shallow"
    sh(f"git clone -q --depth 1 --branch main file://{tmp_path / 'origin.git'} {shallow}", tmp_path)
    r = preflight_val(shallow)
    assert r.returncode != 0 and "shallow clone" in r.stderr
    assert work.exists()


@pytest.mark.parametrize("path", [
    "sim/slay2_sim/stub.txt", "scripts/studies/thresh/common.sh", "experiments/seeds/ironclad-a0-v4.json", "external/pins.json", "experiments/thresh/dev-selection.json",
    "scripts/lib/thresh.mjs", "scripts/lib/pooled.mjs", "scripts/verify-pooled.py", "scripts/studies/thresh/pool.sh",
])
def test_code_or_data_that_changed_after_the_registration_commit_stops_the_held_out_run(tmp_path, path):
    work = build_val_world(tmp_path)
    push_change(work, path)
    r = preflight_val(work)
    assert r.returncode != 0 and "changed after the registration commit" in r.stderr, path


@pytest.mark.parametrize("path", ["sim/tests/stub.txt", "scripts/studies/thresh/README.md", "docs/STATUS.md"])
def test_what_runs_nothing_in_the_held_out_run_may_change_after_the_registration_commit(tmp_path, path):
    work = build_val_world(tmp_path)
    (work / path).parent.mkdir(parents=True, exist_ok=True)
    push_change(work, path, ((work / path).read_text() if (work / path).exists() else "") + "\n# changed\n")
    r = preflight_val(work)
    assert r.returncode == 0, (path, r.stderr)


def test_the_part_two_registration_commit_cannot_be_named_from_the_environment_unless_a_test_says_so(tmp_path):
    work = build_val_world(tmp_path)
    push_change(work, "sim/slay2_sim/stub.txt")
    sneaky = preflight_val(work, REG=head(work))
    assert sneaky.returncode != 0 and "REG is set in the environment; refused" in sneaky.stderr


def test_a_part_two_marker_that_is_only_in_the_history_and_not_at_head_stops_it(tmp_path):
    work = build_val_world(tmp_path)
    p = work / "docs" / "DECISIONS.md"
    p.write_text(p.read_text().replace(MARKER2, "Something else"))
    sh("git add -A && git commit -q -m reworded && git push -q origin main", work)
    r = preflight_val(work)
    assert r.returncode != 0 and "does not carry part 2" in r.stderr


def test_a_record_that_never_carries_the_part_two_marker_stops_it(tmp_path):
    r = preflight_val(build_val_world(tmp_path, marker="Something else"))
    assert r.returncode != 0 and "does not carry part 2" in r.stderr


def test_a_record_that_names_part_two_twice_stops_it(tmp_path):
    work = build_val_world(tmp_path)
    p = work / "docs" / "DECISIONS.md"
    p.write_text(p.read_text().replace("Part 1 text.", f"Part 1 text, which names '{MARKER2}' too."))
    sh("git add -A && git commit -q -m twice && git push -q origin main", work)
    r = preflight_val(work)
    assert r.returncode != 0 and "exactly once, it carries it 2 times" in r.stderr


def test_a_val_file_whose_hash_the_record_does_not_quote_stops_it(tmp_path):
    work = build_val_world(tmp_path)
    f = common(work, "shown_files")[0]
    push_change(work, f, (work / f).read_text() + " ")                    # the file changes; the development commit is moved onto the change,
    p = work / "docs" / "DECISIONS.md"                                    # so that the check which stops it is the one on the quoted hash
    p.write_text(p.read_text().replace(next(ln for ln in p.read_text().splitlines() if ln.startswith("DEV_HEAD=")), f"DEV_HEAD={head(work)}"))
    sh("git add -A && git commit -q -m amend && git push -q origin main", work)
    r = preflight_val(work, REG=head(work), ALLOW_REG_OVERRIDE="1")
    assert r.returncode != 0 and "does not quote the SHA-256" in r.stderr and f in r.stderr


def test_a_val_hash_quoted_only_in_a_later_record_does_not_count(tmp_path):
    work = build_val_world(tmp_path)
    p = work / "docs" / "DECISIONS.md"
    text = p.read_text()
    f = common(work, "shown_files")[1]
    line = [ln for ln in text.splitlines() if ln.startswith(f"- {f}")][0]
    p.write_text(text.replace(line + "\n", "") + f"\n{line}\n")      # the same hash, now under ADR-063
    sh("git add -A && git commit -q -m moved && git push -q origin main", work)
    r = preflight_val(work, REG=head(work), ALLOW_REG_OVERRIDE="1")
    assert r.returncode != 0 and "does not quote the SHA-256" in r.stderr


def test_the_development_commit_must_be_quoted_known_and_the_code_it_screened_unchanged(tmp_path):
    assert "does not quote the commit the development stage was played from" in preflight_val(build_val_world(tmp_path / "a", dev_head=None)).stderr
    assert "is not in this repository" in preflight_val(build_val_world(tmp_path / "b", dev_head="0" * 40)).stderr
    r = preflight_val(build_val_world(tmp_path / "c", screened_change=True))
    assert r.returncode != 0 and "changed between the development commit" in r.stderr and "sim/slay2_sim/stub.txt" in r.stderr


def test_what_may_change_between_the_development_commit_and_part_two_and_what_may_not(tmp_path):
    assert preflight_val(build_val_world(tmp_path / "analysis", between="analysis")).returncode == 0       # the analysis tool plays no game
    r = preflight_val(build_val_world(tmp_path / "script", between="script"))
    assert r.returncode == 0, r.stderr                                                                       # a comment in the scripts around the arms
    r = preflight_val(build_val_world(tmp_path / "arm", between="arm"))
    assert r.returncode != 0 and "the arms are not defined alike" in r.stderr                                # the definition of an arm


def test_a_development_batch_that_is_not_what_the_record_says_stops_it(tmp_path):
    work = build_val_world(tmp_path / "params")
    m = next((work / "experiments" / "batches").glob("thresh-dev-t030-defect-*")) / "manifest.json"
    body = json.loads(m.read_text())
    body["policy"]["params"]["late_threshold"] = 0.2
    m.write_text(json.dumps(body))
    sh("git add -A && git commit -q -m tamper && git push -q origin main", work)
    r = preflight_val(work, REG=head(work), ALLOW_REG_OVERRIDE="1")
    assert r.returncode != 0 and "thresh-dev-t030-defect" in r.stderr and "a development batch is not what ADR-062 says" in r.stderr and "policy parameters" in r.stderr
    other = build_val_world(tmp_path / "head")
    m = next((other / "experiments" / "batches").glob("thresh-dev-s-defect-*")) / "manifest.json"
    body = json.loads(m.read_text())
    body["environment"]["slay2"]["head"] = "b" * 40
    m.write_text(json.dumps(body))
    sh("git add -A && git commit -q -m other-head && git push -q origin main", other)
    r = preflight_val(other, REG=head(other), ALLOW_REG_OVERRIDE="1")
    assert r.returncode != 0 and "thresh-dev-s-defect" in r.stderr and "not from" in r.stderr
    cls = build_val_world(tmp_path / "class")
    m = next((cls / "experiments" / "batches").glob("thresh-dev-t045-ironclad-*")) / "manifest.json"
    body = json.loads(m.read_text())
    body["config"]["character"] = "Silent"
    m.write_text(json.dumps(body))
    sh("git add -A && git commit -q -m other-class && git push -q origin main", cls)
    assert "class Silent" in preflight_val(cls, REG=head(cls), ALLOW_REG_OVERRIDE="1").stderr


def test_the_arms_the_record_names_are_exactly_the_arms_the_selection_sent_forward(tmp_path):
    # an arm the selection did not send forward, named: refused
    work = build_val_world(tmp_path / "extra", advance="t030")
    p = work / "docs" / "DECISIONS.md"
    p.write_text(p.read_text().replace("ARM_t030", "ARM_t030\nARM_t045"))
    sh("git add -A && git commit -q -m extra-arm && git push -q origin main", work)
    r = preflight_val(work, REG=head(work), ALLOW_REG_OVERRIDE="1")
    assert r.returncode != 0 and "names the arms 't030 t045'" in r.stderr
    # an arm that is sent forward and not named: refused
    work = build_val_world(tmp_path / "missing", advance="t030")
    p = work / "docs" / "DECISIONS.md"
    p.write_text(p.read_text().replace("ARM_t030", "nothing"))
    sh("git add -A && git commit -q -m missing-arm && git push -q origin main", work)
    assert "names the arms ''" in preflight_val(work, REG=head(work), ALLOW_REG_OVERRIDE="1").stderr
    # a tag that merely contains the name does not name it
    work = build_val_world(tmp_path / "prefix", advance="t030")
    p = work / "docs" / "DECISIONS.md"
    p.write_text(p.read_text().replace("ARM_t030", "ARM_t0300"))
    sh("git add -A && git commit -q -m prefix && git push -q origin main", work)
    assert "names the arms 't0300'" in preflight_val(work, REG=head(work), ALLOW_REG_OVERRIDE="1").stderr
    # a record that names an arm when the selection advanced nothing: refused
    work = build_val_world(tmp_path / "unasked")
    p = work / "docs" / "DECISIONS.md"
    p.write_text(p.read_text().replace(f"\n\n## 2026-11-03", "\nARM_t030\n\n## 2026-11-03", 1))
    sh("git add -A && git commit -q -m unasked && git push -q origin main", work)
    assert "names the arms 't030'" in preflight_val(work, REG=head(work), ALLOW_REG_OVERRIDE="1").stderr


def test_a_selection_that_does_not_say_the_design_checks_passed_stops_it(tmp_path):
    work = build_val_world(tmp_path)
    sel = work / "experiments" / "thresh" / "dev-selection.json"
    body = json.loads(sel.read_text())
    body["designChecksPassed"] = False
    sel.write_text(json.dumps(body))
    # quote the new hash so that the check on the quoted hash passes and this one is what stops it
    p = work / "docs" / "DECISIONS.md"
    old = [ln for ln in p.read_text().splitlines() if "dev-selection.json" in ln][0]
    p.write_text(p.read_text().replace(old, f"- experiments/thresh/dev-selection.json: `{sha_of(sel)}`"))
    sh("git add -A && git commit -q -m not-passed && git push -q origin main", work)
    r = preflight_val(work, REG=head(work), ALLOW_REG_OVERRIDE="1")
    assert r.returncode != 0 and "does not say that the design checks passed" in r.stderr


def test_a_missing_development_batch_stops_it(tmp_path):
    work = build_val_world(tmp_path)
    shutil.rmtree(sorted((work / "experiments" / "batches").iterdir())[3])
    sh("git add -A && git commit -q -m rm && git push -q origin main", work)
    r = preflight_val(work, REG=head(work), ALLOW_REG_OVERRIDE="1")
    assert r.returncode != 0 and "development batch" in r.stderr and "is missing" in r.stderr


@pytest.mark.parametrize("name", ["pooled-thresh-T1", "pooled-thresh-T2", "pooled-thresh-T3", "robustness-all-pairs", "verification"])
def test_a_result_that_exists_stops_the_held_out_run(tmp_path, name):
    work = build_val_world(tmp_path)
    (work / "experiments" / "thresh" / f"{name}.json").write_text("{}")
    r = preflight_val(work)
    assert r.returncode != 0 and "the test is run once" in r.stderr


@pytest.mark.parametrize("sub", ["per-class", "identity"])
def test_output_of_the_comparisons_that_exists_stops_the_held_out_run(tmp_path, sub):
    work = build_val_world(tmp_path)
    d = work / "experiments" / "thresh" / sub
    d.mkdir(parents=True)
    (d / "ironclad.json").write_text("{}")
    r = preflight_val(work)
    assert r.returncode != 0 and "the comparisons are run once" in r.stderr


def test_a_result_in_the_history_stops_the_held_out_run_even_if_it_was_deleted(tmp_path):
    work = build_val_world(tmp_path)
    p = work / "experiments" / "thresh" / "pooled-thresh-T1.json"
    p.write_text("{}")
    sh("git add -A && git commit -q -m leak && git rm -q experiments/thresh/pooled-thresh-T1.json && git commit -q -m gone && git push -q origin main", work)
    r = preflight_val(work, REG=sh("git rev-parse HEAD~2", work).stdout.strip(), ALLOW_REG_OVERRIDE="1")
    assert r.returncode != 0 and "is in the history" in r.stderr


def test_val_batches_that_exist_stop_the_held_out_run_unless_an_interrupted_run_is_being_resumed(tmp_path):
    work = build_val_world(tmp_path)
    d = work / "experiments" / "batches" / "thresh-val-s-ironclad-a0-veteran-keeprelics-val3-n15000"
    d.mkdir(parents=True)
    (d / "manifest.json").write_text("{}")
    assert "RESUME=1" in preflight_val(work).stderr
    assert preflight_val(work, RESUME="1").returncode == 0


def test_a_batch_on_the_val3_seeds_under_any_other_name_stops_the_held_out_run_too(tmp_path):
    work = build_val_world(tmp_path)
    val3 = json.loads((work / SEEDS).read_text())["partitions"]["val3"]
    d = work / "experiments" / "batches" / "my-own-trial"
    d.mkdir(parents=True)
    (d / "episodes.jsonl").write_text(json.dumps({"seed": val3[2], "outcome": "death"}) + "\n")
    r = preflight_val(work)
    assert r.returncode != 0 and "already exist" in r.stderr and "my-own-trial" in r.stderr
    assert preflight_val(work, RESUME="1").returncode == 0
