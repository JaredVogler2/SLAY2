"""The preflight of the acts study's held-out run (ADR-061 items 2 and 9): every check can pass and every check can fail.

A throwaway repository (a bare "remote", a work tree, stub files at the paths the scripts read, a record that quotes the hashes, a real seed
manifest) is built around the real scripts, and the preflight is run in it: once on a world that satisfies it, then on worlds that break one thing
each. No simulator and no game is involved.
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
from slay2_sim.manifest import make_seed_manifest, save_json

REPO = external.REPO_ROOT
MARKER = "Registration of ADR-061 (frozen choices)"
ENV = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
SEEDS = "experiments/seeds/ironclad-a0-v3.json"


def sh(cmd: str, cwd: Path, env: dict | None = None, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["bash", "-c", cmd], cwd=cwd, env={**os.environ, **ENV, **(env or {})}, capture_output=True, text=True, check=check)


def common(work: Path, snippet: str) -> list[str]:
    return sh(f"source scripts/studies/acts/common.sh; {snippet}", work, env={"OUT": str(work / "artifacts" / "x")}).stdout.split("\n")[:-1]


def sha_of(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def head(work: Path) -> str:
    return sh("git rev-parse HEAD", work).stdout.strip()


def build_world(tmp: Path, marker: str = MARKER, val2: int = 3000, quote_seeds: bool = True) -> Path:
    """A work tree whose HEAD is the registration commit, on the remote, with the value files and the seed manifest the record quotes."""
    tmp.mkdir(parents=True, exist_ok=True)
    bare, work = tmp / "origin.git", tmp / "work"
    sh(f"git init -q --bare {bare}", tmp)
    work.mkdir()
    sh("git init -q -b main && git remote add origin " + str(bare), work)
    shutil.copytree(REPO / "scripts" / "studies" / "acts", work / "scripts" / "studies" / "acts", ignore=shutil.ignore_patterns("__pycache__"))
    for rel in (
        "sim/slay2_sim/stub.txt", "sim/tests/stub.txt", "packages/game-data/data/stub.txt", "external/pins.json", "scripts/verify-pooled.py",
        "scripts/lib/acts.mjs", "scripts/lib/pooled.mjs",
    ):
        p = work / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("stub " + rel + "\n")
    files = common(work, "shown_files")
    for f in files:
        p = work / f
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps({"kind": "card-values", "file": f}))
    save_json(work / SEEDS, make_seed_manifest("ironclad-a0-v3", 20261025, {"train": 4, "val": 4, "test": 4, "dev": 4, "val2": val2}))
    (work / "docs").mkdir()
    quoted = "\n".join(f"- {f}: `{sha_of(work / f)}`" for f in [*files, *([SEEDS] if quote_seeds else [])])
    (work / "docs" / "DECISIONS.md").write_text(
        f"## 2026-11-01 — ADR-061: which acts carry the effect\n\nPart 1 text.\n\n**{marker}.**\n{quoted}\n\n## 2026-11-02 — ADR-062: another record\n\nhash `{'f' * 64}`\n"
    )
    sh("git add -A && git commit -q -m registration && git push -q origin main", work)
    return work


def preflight(work: Path, **env: str) -> subprocess.CompletedProcess:
    # the seed check imports the real harness (the work tree holds stubs where the code is)
    return sh("bash scripts/studies/acts/preflight-val.sh", work, env={"OUT": str(work / "artifacts" / "acts"), "PY": "python3", "PYTHONPATH": str(REPO / "sim"), **env}, check=False)


def push_change(work: Path, rel: str, text: str | None = None) -> None:
    p = work / rel
    p.write_text(text if text is not None else p.read_text() + "\n# changed\n")
    sh("git add -A && git commit -q -m changed && git push -q origin main", work)


def test_a_world_that_satisfies_the_record_passes(tmp_path):
    r = preflight(build_world(tmp_path))
    assert r.returncode == 0, r.stderr
    assert "preflight-val: ok" in r.stdout and "arms: s lead a1 a2 a3" in r.stdout and "registration " in r.stdout


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
    "sim/slay2_sim/stub.txt", "packages/game-data/data/stub.txt", "scripts/studies/acts/common.sh", "scripts/studies/acts/pool.sh", "scripts/studies/acts/robustness.py",
    "scripts/studies/acts/verify_all.py", "scripts/studies/acts/val2_played.py", "scripts/studies/acts/audit.sh", "scripts/studies/acts/verify_batch.py",
    "experiments/seeds/ironclad-a0-v3.json", "external/pins.json", "scripts/lib/acts.mjs", "scripts/lib/pooled.mjs", "scripts/verify-pooled.py",
    "experiments/cardvalue/ironclad-a0-v2.json",
])
def test_code_or_data_that_changed_after_the_registration_commit_stops_it(tmp_path, path):
    work = build_world(tmp_path)
    push_change(work, path)
    r = preflight(work)
    assert r.returncode != 0 and "changed after the registration commit" in r.stderr, path


@pytest.mark.parametrize("path", ["sim/tests/stub.txt", "sim/tests/test_anything.py", "scripts/studies/acts/README.md", "docs/STATUS.md"])
def test_what_runs_nothing_may_change_after_the_registration_commit(tmp_path, path):
    """The tests of the harness, the README of the folder and the documents are not pinned: a test added after the registration forces no new registration."""
    work = build_world(tmp_path)
    (work / path).parent.mkdir(parents=True, exist_ok=True)
    push_change(work, path, ((work / path).read_text() if (work / path).exists() else "") + "\n# changed\n")
    r = preflight(work)
    assert r.returncode == 0, (path, r.stderr)


def test_a_path_the_registration_pins_that_does_not_exist_stops_it(tmp_path):
    """`git diff --quiet` succeeds for a pathspec that matches nothing, so a deleted or misspelt path would pass without this check."""
    work = build_world(tmp_path)
    sh("git rm -q external/pins.json && git commit -q -m gone && git push -q origin main", work)
    r = preflight(work, REG=head(work), ALLOW_REG_OVERRIDE="1")
    assert r.returncode != 0 and "external/pins.json does not exist" in r.stderr


def test_the_registration_commit_cannot_be_named_from_the_environment_unless_a_test_says_so(tmp_path):
    work = build_world(tmp_path)
    push_change(work, "sim/slay2_sim/stub.txt")
    sneaky = preflight(work, REG=head(work))
    assert sneaky.returncode != 0 and "REG is set in the environment; refused" in sneaky.stderr
    allowed = preflight(work, REG=head(work), ALLOW_REG_OVERRIDE="1")
    # the override exists for tests; it is not silent about what it does
    assert allowed.returncode == 0 and "preflight-val: ok" in allowed.stdout, allowed.stderr
    assert "NOTICE: the registration commit was named from the environment" in allowed.stderr


def test_a_marker_that_is_only_in_the_history_and_not_at_head_stops_it(tmp_path):
    work = build_world(tmp_path)
    p = work / "docs" / "DECISIONS.md"
    p.write_text(p.read_text().replace(MARKER, "Something else"))
    sh("git add -A && git commit -q -m reworded && git push -q origin main", work)
    r = preflight(work)
    assert r.returncode != 0 and "does not carry its registration" in r.stderr


def test_a_record_that_never_carries_the_marker_stops_it(tmp_path):
    r = preflight(build_world(tmp_path, marker="Something else"))
    assert r.returncode != 0 and "does not carry its registration" in r.stderr


def test_a_record_that_names_its_registration_twice_stops_it(tmp_path):
    """The first commit that adds the text is taken for the registration, so a second mention (in the design, say) would make the design the registration."""
    work = build_world(tmp_path)
    p = work / "docs" / "DECISIONS.md"
    p.write_text(p.read_text().replace("Part 1 text.", f"Part 1 text, which names the heading '{MARKER}' too."))
    sh("git add -A && git commit -q -m twice && git push -q origin main", work)
    r = preflight(work)
    assert r.returncode != 0 and "exactly once, it carries it 2 times" in r.stderr


def test_a_record_without_the_adr_stops_it(tmp_path):
    work = build_world(tmp_path)
    p = work / "docs" / "DECISIONS.md"
    p.write_text(p.read_text().replace("ADR-061: which", "ADR-060: which"))
    sh("git add -A && git commit -q -m renamed && git push -q origin main", work)
    r = preflight(work)
    assert r.returncode != 0 and "does not carry ADR-061" in r.stderr


def test_a_value_file_whose_hash_the_record_does_not_quote_stops_it(tmp_path):
    work = build_world(tmp_path)
    f = common(work, "shown_files")[0]
    push_change(work, f, (work / f).read_text() + " ")
    r = preflight(work, REG=head(work), ALLOW_REG_OVERRIDE="1")     # the registration commit moved onto the change, so that the check on the quoted hash is the one that stops it
    assert r.returncode != 0 and "does not quote the SHA-256" in r.stderr and f in r.stderr


def test_a_hash_quoted_only_in_a_later_record_does_not_count(tmp_path):
    work = build_world(tmp_path)
    p = work / "docs" / "DECISIONS.md"
    text = p.read_text()
    f = common(work, "shown_files")[1]
    line = [ln for ln in text.splitlines() if ln.startswith(f"- {f}")][0]
    p.write_text(text.replace(line + "\n", "") + f"\n{line}\n")      # the same hash, now under ADR-062
    sh("git add -A && git commit -q -m moved && git push -q origin main", work)
    r = preflight(work, REG=head(work), ALLOW_REG_OVERRIDE="1")
    assert r.returncode != 0 and "does not quote the SHA-256" in r.stderr


def test_the_seed_file_has_to_be_quoted_and_has_to_be_a_manifest_with_the_val2_seeds(tmp_path):
    r = preflight(build_world(tmp_path / "unquoted", quote_seeds=False))
    assert r.returncode != 0 and "does not quote the SHA-256" in r.stderr and SEEDS in r.stderr
    r = preflight(build_world(tmp_path / "short", val2=2999))
    assert r.returncode != 0 and "not a valid v3 manifest with 3,000 val2 seeds" in r.stderr
    work = build_world(tmp_path / "tampered")
    body = json.loads((work / SEEDS).read_text())
    body["partitions"]["val2"][0] += 1                           # a changed seed under the same checksum
    (work / SEEDS).write_text(json.dumps(body))
    p = work / "docs" / "DECISIONS.md"
    old = [ln for ln in p.read_text().splitlines() if SEEDS in ln][0]
    p.write_text(p.read_text().replace(old, f"- {SEEDS}: `{sha_of(work / SEEDS)}`"))
    sh("git add -A && git commit -q -m tamper && git push -q origin main", work)
    r = preflight(work, REG=head(work), ALLOW_REG_OVERRIDE="1")
    assert r.returncode != 0 and "not a valid v3 manifest" in r.stderr


@pytest.mark.parametrize("path", [f"experiments/acts/pooled-acts-{t}.json" for t in ("L", "A1", "A2", "A3")] + ["experiments/acts/robustness-all-pairs.json"])
def test_a_result_that_exists_stops_it(tmp_path, path):
    work = build_world(tmp_path)
    (work / path).parent.mkdir(parents=True, exist_ok=True)
    (work / path).write_text("{}")
    r = preflight(work)
    assert r.returncode != 0 and "the test is run once" in r.stderr


@pytest.mark.parametrize("sub", ["per-class", "identity"])
def test_output_of_the_comparisons_that_exists_stops_it(tmp_path, sub):
    work = build_world(tmp_path)
    d = work / "experiments" / "acts" / sub
    d.mkdir(parents=True)
    (d / "ironclad.json").write_text("{}")
    r = preflight(work)
    assert r.returncode != 0 and "the comparisons are run once" in r.stderr


def test_a_result_in_the_history_stops_it_even_if_it_was_deleted(tmp_path):
    work = build_world(tmp_path)
    p = work / "experiments" / "acts" / "pooled-acts-L.json"
    p.parent.mkdir(parents=True)
    p.write_text("{}")
    sh("git add -A && git commit -q -m leak && git rm -q experiments/acts/pooled-acts-L.json && git commit -q -m gone && git push -q origin main", work)
    r = preflight(work, REG=sh("git rev-parse HEAD~2", work).stdout.strip(), ALLOW_REG_OVERRIDE="1")
    assert r.returncode != 0 and "is in the history" in r.stderr


def test_val2_batches_that_exist_stop_it_unless_an_interrupted_run_is_being_resumed(tmp_path):
    work = build_world(tmp_path)
    d = work / "experiments" / "batches" / "acts-s-ironclad-a0-veteran-keeprelics-val2-n3000"
    d.mkdir(parents=True)
    (d / "manifest.json").write_text("{}")
    assert "RESUME=1" in preflight(work).stderr
    assert preflight(work, RESUME="1").returncode == 0


def test_a_batch_on_the_val2_seeds_under_any_other_name_stops_it_too(tmp_path):
    """The seed of a batch's first episode is looked up, so a run that died before its manifest was written, under any batch id, is found."""
    import gzip

    work = build_world(tmp_path)
    val2 = json.loads((work / SEEDS).read_text())["partitions"]["val2"]
    dev = json.loads((work / SEEDS).read_text())["partitions"]["dev"]
    d = work / "experiments" / "batches" / "my-own-trial"
    d.mkdir(parents=True)
    (d / "episodes.jsonl").write_text(json.dumps({"seed": val2[7], "outcome": "death"}) + "\n")          # no manifest: it died
    r = preflight(work)
    assert r.returncode != 0 and "batches on the val2 seeds already exist" in r.stderr and "my-own-trial" in r.stderr
    assert preflight(work, RESUME="1").returncode == 0                                                      # an interrupted run is being finished
    zipped = work / "experiments" / "batches" / "another"
    zipped.mkdir()
    with gzip.open(zipped / "episodes.jsonl.gz", "wt", encoding="utf-8") as fh:
        fh.write(json.dumps({"seed": val2[0]}) + "\n")
    shutil.rmtree(d)
    r = preflight(work)
    assert r.returncode != 0 and "another" in r.stderr
    other = build_world(tmp_path / "other")
    d = other / "experiments" / "batches" / "dev-trial"
    d.mkdir(parents=True)
    (d / "episodes.jsonl").write_text(json.dumps({"seed": dev[3], "outcome": "death"}) + "\n")
    (d / "manifest.json").write_text(json.dumps({"seeds": {"partition": "dev", "n": 10}}, indent=2))
    assert preflight(other).returncode == 0                          # batches on other partitions are none of its business


def test_the_detector_of_val2_games_reads_only_the_first_episode_and_survives_junk(tmp_path):
    import importlib.util

    spec = importlib.util.spec_from_file_location("val2_played", REPO / "scripts" / "studies" / "acts" / "val2_played.py")
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    seeds = tmp_path / "seeds.json"
    save_json(seeds, make_seed_manifest("t", 5, {"train": 3, "val": 3, "test": 3, "dev": 3, "val2": 5}))
    val2 = json.loads(seeds.read_text())["partitions"]["val2"]
    batches = tmp_path / "batches"
    for name, content in (("a", json.dumps({"seed": val2[4]})), ("b", json.dumps({"seed": 12345})), ("c", ""), ("d", "{not json"), ("e", "\n\n" + json.dumps({"seed": val2[0]}))):
        (batches / name).mkdir(parents=True)
        (batches / name / "episodes.jsonl").write_text(content + "\n")
    (batches / "f").mkdir()                       # no episodes at all
    (batches / "g.txt").write_text("a file, not a batch")
    assert mod.played(batches, seeds) == ["a", "e"]
    assert mod.played(tmp_path / "nowhere", seeds) == []
