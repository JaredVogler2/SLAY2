"""The small tools of the threshold study (ADR-062): what a finished batch has to be, the all-pairs analysis, and that the places which name the arms agree.

`common.sh` (what the scripts play), `threshstudy.py` (what the analysis reads), `robustness.py`, `part2.py` and `seeds_played.py` each carry the names of the
batches, the classes, the partitions and the thresholds; a disagreement between any two of them would make a script read or play something else than the record
says. The test builds each arm from the shell's own definition and checks it against the others.
"""

from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from slay2_sim import external
from slay2_sim import threshstudy as ts
from slay2_sim.policies import make_policy

REPO = external.REPO_ROOT
SCRIPTS = REPO / "scripts" / "studies" / "thresh"


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


vb = load("thresh_verify_batch", SCRIPTS / "verify_batch.py")
rob = load("thresh_robustness", SCRIPTS / "robustness.py")
part2 = load("thresh_part2", SCRIPTS / "part2.py")
played = load("thresh_seeds_played", SCRIPTS / "seeds_played.py")
power = load("thresh_power_tables", SCRIPTS / "power.py")


def shell(tmp: Path, snippet: str) -> list[str]:
    r = subprocess.run(
        ["bash", "-c", f"source scripts/studies/thresh/common.sh; {snippet}"], cwd=REPO, env={**os.environ, "OUT": str(tmp / "out")}, capture_output=True, text=True, check=True
    )
    return r.stdout.split("\n")[:-1]


def one(tmp: Path, snippet: str) -> str:
    out = shell(tmp, snippet)
    assert len(out) == 1, out
    return out[0]


# ---- the arms are defined alike everywhere -------------------------------------------------------------------------------------------------------


def test_the_shell_and_the_analysis_define_the_same_arms(tmp_path):
    assert one(tmp_path, 'echo "$GRID_TAGS"').split() == list(ts.GRID)
    assert one(tmp_path, 'echo "$CLASSES"').split() == list(ts.CLASSES)
    assert one(tmp_path, 'echo "$REPLICATION_TAG"') == ts.REPLICATION_TAG
    assert (one(tmp_path, 'echo "$DEV_PARTITION"'), int(one(tmp_path, 'echo "$DEV_N"'))) == (ts.DEV_PARTITION, ts.DEV_N)
    assert (one(tmp_path, 'echo "$VAL_PARTITION"'), int(one(tmp_path, 'echo "$VAL_N"'))) == (ts.VAL_PARTITION, ts.VAL_N)
    assert one(tmp_path, 'echo "$SEEDS"') == ts.SEEDS_FILE and float(one(tmp_path, 'echo "$STUDY_ALPHA"')) == ts.STUDY_ALPHA
    for tag, threshold in ts.GRID.items():
        assert float(one(tmp_path, f"tag_threshold {tag}")) == threshold
        assert one(tmp_path, f"arm_policy {tag}") == "rules_v2_late"
    assert one(tmp_path, "arm_policy s") == "rules_v2"
    assert subprocess.run(["bash", "-c", "source scripts/studies/thresh/common.sh; tag_threshold t099"], cwd=REPO, env={**os.environ, "OUT": str(tmp_path / "out")}, capture_output=True).returncode != 0
    for arm in ["s", *ts.GRID]:
        for cls in ts.CLASSES:
            assert one(tmp_path, f"dev_id {arm} {cls}") == ts.dev_id(arm, cls)
            assert one(tmp_path, f"val_id {arm} {cls}") == ts.val_id(arm, cls)


def test_the_arm_table_has_every_arm_for_every_class_and_the_study_s_constants(tmp_path):
    table = [ln.split("|") for ln in shell(tmp_path, "arm_table")]
    rows, last = table[:-1], table[-1]
    assert [(r[0], r[1]) for r in rows] == [(arm, cls) for arm in ["s", *ts.GRID] for cls in ts.CLASSES]
    assert last == [ts.SEEDS_FILE, ts.DEV_PARTITION, str(ts.DEV_N), ts.VAL_PARTITION, str(ts.VAL_N), " ".join(ts.GRID), ts.REPLICATION_TAG, "0.05"]
    for arm, cls, policy, params, dev, val, shown in rows:
        assert (dev, val) == (ts.dev_id(arm, cls), ts.val_id(arm, cls)) and shown == one(tmp_path, f"shown_values {cls}")
        p = json.loads(params)
        assert p["threshold"] == 0.0 and p["values"] == shown
        if arm == "s":
            assert policy == "rules_v2" and set(p) == {"threshold", "values"}
        else:
            assert policy == "rules_v2_late" and p["late_threshold"] == ts.GRID[arm] and p["late_acts"] == [ts.FIRST_ACT] and set(p) == {"threshold", "values", "late_threshold", "late_acts"}


def test_the_values_an_arm_reads_are_the_ones_the_site_shows(tmp_path):
    sets = json.loads((REPO / "experiments" / "cardvalue" / "site-sets.json").read_text(encoding="utf-8"))["sets"]
    for cls in ts.CLASSES:
        shown = one(tmp_path, f"shown_values {cls}")
        assert (REPO / shown).exists()
        site = [e["file"] for e in sets if e["file"].startswith(f"{cls.lower()}-a0-")]
        assert [f"experiments/cardvalue/{f}" for f in site] == [shown], (cls, site, shown)
        assert power.SHOWN[cls] == shown                      # the power tables read the file the arms read
    assert power.GRID == ts.GRID and tuple(power.SHOWN) == ts.CLASSES and power.SEEDS_PER_CLASS_HELD_OUT == ts.VAL_N and power.SEEDS_PER_CLASS_DEV == ts.DEV_N
    assert sorted(shell(tmp_path, "shown_files")) == sorted(one(tmp_path, f"shown_values {c}") for c in ts.CLASSES)


@pytest.mark.parametrize("tag", ["s", *ts.GRID])
@pytest.mark.parametrize("cls", ts.CLASSES)
def test_every_arm_builds_the_policy_it_names_with_the_threshold_it_names(sim, tmp_path, tag, cls):
    policy, params = one(tmp_path, f"arm_policy {tag}"), json.loads(one(tmp_path, f"arm_params {tag} {cls}"))
    built = make_policy(policy, **params)
    assert built.name == policy
    if tag == "s":
        assert built.threshold == 0.0
    else:
        assert built.late_acts == (ts.FIRST_ACT,) and built.late_threshold == ts.GRID[tag] and built.threshold == 0.0
        assert built.late_beta is None                       # the late rule reads the same shown values as every other act: only the threshold differs
    assert built.values_character == cls                      # the shown values were measured for the class that plays them


def test_the_other_scripts_name_the_batches_and_the_tests_as_the_analysis_does():
    assert rob.CLASSES == ts.CLASSES and rob.VAL_N == ts.VAL_N and rob.REPLICATION_ARM == ts.REPLICATION_TAG and rob.STUDY_ALPHA == ts.STUDY_ALPHA
    assert part2.CLASSES == [c.lower() for c in ts.CLASSES] and part2.REPLICATION_TAG == ts.REPLICATION_TAG
    for arm in ["s", *ts.GRID]:
        for cls in ts.CLASSES:
            assert rob.batch_id(arm, cls) == ts.val_id(arm, cls)
    for sel in (
        {"choice": {"advance": False, "arm": None}},
        {"choice": {"advance": True, "arm": "t030"}},
        {"choice": {"advance": True, "arm": "tnone"}},
    ):
        assert rob.tests_of(sel) == {t["key"]: (t["arm"], t["baseline"]) for t in ts.tests_of(sel)}
    assert played.DEFAULT_SEEDS == ts.SEEDS_FILE and played.DEFAULT_PARTITIONS == [ts.DEV_PARTITION, ts.VAL_PARTITION]


def test_every_path_the_registration_pins_exists_in_the_repository_except_the_reader_not_yet_written(tmp_path):
    pinned = shell(tmp_path, 'printf "%s\\n" "${PINNED_PATHS[@]}"')
    assert "sim" in pinned and "scripts/studies/thresh" in pinned and "scripts/verify-pooled.py" in pinned and ":(exclude)sim/tests" in pinned
    for p in pinned:
        if not p.startswith(":("):
            assert (REPO / p).exists(), p
    screened = shell(tmp_path, 'printf "%s\\n" "${SCREENED_PATHS[@]}"')
    assert ":(exclude)sim/slay2_sim/threshstudy.py" in screened and "sim/slay2_sim" in screened and not any(p.startswith("scripts/") for p in screened)
    reading = shell(tmp_path, 'printf "%s\\n" "${READING_PATHS[@]}"')
    assert reading == ["scripts/lib/thresh.mjs", "scripts/lib/pooled.mjs"] and (REPO / "scripts/lib/pooled.mjs").exists()


# ---- verify_batch.py -----------------------------------------------------------------------------------------------------------------------------

PARAMS = {"threshold": 0.0, "values": "experiments/cardvalue/ironclad-a0-v2.json", "late_threshold": 0.3, "late_acts": [1]}
HEAD = "a" * 40
GOOD = {
    "policy": {"name": "rules_v2_late", "params": PARAMS},
    "config": {
        "ascension": 0, "keep_relics": True, "character": "Ironclad", "profile": "veteran", "max_steps": 20000, "wall_seconds": 900.0,
        "max_turns_per_combat": 80, "stall_limit": 200, "start_with_neow": True,
    },
    "seeds": {"partition": "dev2", "n": 3000, "sealed_partition_used": False},
    "summary": {"episodes": 3000, "completed": 2950, "counts": {"aborted": 0, "harness_error": 0, "policy_error": 0, "invalid_action": 0, "simulator_error": 40, "timeout": 10}},
    "class_start_verified": True, "canonical_process_state": True, "environment": {"slay2": {"head": HEAD, "dirty": False}},
}


def write(tmp: Path, body: dict) -> str:
    d = tmp / "batch"
    d.mkdir(exist_ok=True)
    (d / "manifest.json").write_text(json.dumps(body))
    return str(d)


def check(d: str, **over) -> list[str]:
    a = {"policy": "rules_v2_late", "params": json.dumps(PARAMS), "cls": "Ironclad", "part": "dev2", "n": 3000, "off": 0, "head": HEAD, "seeds_file": "", **over}
    return vb.problems(d, a["policy"], a["params"], a["cls"], a["part"], a["n"], a["off"], a["head"], a["seeds_file"])


def mutated(path: list[str], value) -> dict:
    body = copy.deepcopy(GOOD)
    node = body
    for k in path[:-1]:
        node = node[k]
    if value is KeyError:
        del node[path[-1]]
    else:
        node[path[-1]] = value
    return body


def test_a_batch_that_is_what_was_asked_for_passes(tmp_path):
    assert check(write(tmp_path, GOOD)) == []
    assert check(write(tmp_path, GOOD), head="") == []          # no commit asked for: the commit is not checked


@pytest.mark.parametrize("path,value,message", [
    (["policy", "name"], "rules_v2", "policy rules_v2"),
    (["policy", "params"], {**PARAMS, "late_threshold": 0.2}, "policy parameters"),
    (["policy", "params"], {**PARAMS, "late_acts": [2]}, "policy parameters"),
    (["policy", "params"], {**PARAMS, "values": "experiments/cardvalue/defect-a0-keep-v1.json"}, "policy parameters"),
    (["config", "character"], "Silent", "class Silent"),
    (["config", "ascension"], 9, "Ascension 9"),
    (["config", "keep_relics"], False, "relics not kept"),
    (["config", "keep_relics"], KeyError, "relics not kept"),
    (["config", "profile"], "first_run", "profile first_run"),
    (["config", "profile"], KeyError, "profile None"),
    (["config", "ancient_heal"], True, "a harness variant"),
    (["config", "game_hp"], True, "a harness variant"),
    (["config", "max_steps"], 5000, "max_steps 5000 is not 20000"),
    (["config", "wall_seconds"], 60.0, "wall_seconds 60.0 is not 900.0"),
    (["config", "max_turns_per_combat"], 40, "max_turns_per_combat 40 is not 80"),
    (["config", "stall_limit"], KeyError, "stall_limit None is not 200"),
    (["config", "start_with_neow"], False, "the opening Ancient was not played"),
    (["seeds", "sealed_partition_used"], True, "the sealed partition was used"),
    (["seeds", "sealed_partition_used"], KeyError, "the sealed partition was used or the manifest does not say"),
    (["seeds", "partition"], "val3", "seeds"),
    (["seeds", "n"], 1000, "seeds"),
    (["seeds", "offset"], 1000, "seeds"),
    (["summary", "episodes"], 2999, "seeds"),
    (["summary", "counts", "policy_error"], 1, "1 games ended in an abort"),
    (["summary", "counts", "harness_error"], 2, "2 games ended in an abort"),
    (["summary", "completed"], 2699, "only 2699 of 3000 completed"),
    (["class_start_verified"], False, "class start or canonical process state not recorded"),
    (["canonical_process_state"], KeyError, "class start or canonical process state not recorded"),
    (["environment", "slay2", "dirty"], True, "uncommitted changes"),
    (["environment", "slay2", "head"], "b" * 40, "not from aaaaaaaaaaaa"),
])
def test_each_way_a_batch_can_be_something_else_is_found(tmp_path, path, value, message):
    found = check(write(tmp_path, mutated(path, value)))
    assert found and message in found[0], found


def test_the_seed_file_has_to_be_the_one_named_by_its_path_and_its_hash(tmp_path, monkeypatch):
    seeds = tmp_path / "seeds.json"
    seeds.write_text('{"a": 1}')
    sha = hashlib.sha256(seeds.read_bytes()).hexdigest()
    good = mutated(["seeds"], {**GOOD["seeds"], "file": str(seeds), "file_sha256": sha})
    assert check(write(tmp_path, good), seeds_file=str(seeds)) == []
    for body in (mutated(["seeds"], {**GOOD["seeds"], "file": "elsewhere.json", "file_sha256": sha}), mutated(["seeds"], {**GOOD["seeds"], "file": str(seeds), "file_sha256": "0" * 64}),
                 mutated(["seeds"], {**GOOD["seeds"]})):
        found = check(write(tmp_path, body), seeds_file=str(seeds))
        assert found and "the seed file is not" in found[0]
    assert "the seed file is not" in check(write(tmp_path, good), seeds_file=str(tmp_path / "missing.json"))[0]
    assert check(write(tmp_path, GOOD)) == []                                         # not asked for: not checked


def test_ninety_percent_completed_is_enough_and_a_missing_or_unreadable_manifest_is_a_problem(tmp_path):
    assert check(write(tmp_path, mutated(["summary", "completed"], 2700))) == []
    assert "no readable manifest" in check(str(tmp_path / "nothing"))[0]
    d = tmp_path / "torn"
    d.mkdir()
    (d / "manifest.json").write_text("{")
    assert "no readable manifest" in check(str(d))[0]
    assert "not a finished batch's" in check(write(tmp_path, {"policy": {"name": "rules_v2_late"}}))[0]


def test_the_command_line_checks_one_batch_or_many_and_exits_with_the_problems(tmp_path):
    (tmp_path / "x").mkdir()
    (tmp_path / "y").mkdir()
    good = write(tmp_path / "x", GOOD)
    script = str(SCRIPTS / "verify_batch.py")
    env = {"STUDY_HEAD_EXPECTED": HEAD, "PATH": "/usr/bin:/bin"}
    one_batch = [sys.executable, script, good, "rules_v2_late", json.dumps(PARAMS), "Ironclad", "dev2", "3000", "0"]
    assert subprocess.run(one_batch, env=env, capture_output=True, text=True).returncode == 0
    wrong = subprocess.run([*one_batch[:5], "Silent", *one_batch[6:]], env=env, capture_output=True, text=True)
    assert wrong.returncode == 1 and "class Ironclad" in wrong.stderr
    other = write(tmp_path / "y", mutated(["config", "character"], "Defect"))
    lines = "\n".join(["\t".join([d, "rules_v2_late", json.dumps(PARAMS), "Ironclad", "dev2", "3000", "0"]) for d in (good, other)]) + "\n"
    many = subprocess.run([sys.executable, script, "--many"], input=lines, env=env, capture_output=True, text=True)
    assert many.returncode == 1 and many.stderr.count("verify_batch:") == 1 and "class Defect" in many.stderr


# ---- robustness.py -------------------------------------------------------------------------------------------------------------------------------


def batch(root: Path, arm: str, cls: str, rows: list[tuple[int, str, int, int]]) -> None:
    d = root / ts.val_id(arm, cls)
    d.mkdir(parents=True)
    (d / "manifest.json").write_text(json.dumps({"content_sha256": f"{arm}-{cls}"}))
    with (d / "episodes.jsonl").open("w", encoding="utf-8") as fh:
        for seed, outcome, floor, act in rows:
            fh.write(json.dumps({"seed": seed, "outcome": outcome, "floor": floor, "act": act}) + "\n")


def world(tmp_path: Path, advance: str | None = "t030") -> tuple[Path, Path]:
    batches = tmp_path / "experiments" / "batches"
    #        seed 1: both win     2: only the baseline   3: arm wins, baseline errored   4: arm errored, baseline wins   5: both errored   6: both die
    base = [(1, "win", 51, 2), (2, "win", 51, 2), (3, "simulator_error", 36, 2), (4, "win", 51, 2), (5, "timeout", 31, 1), (6, "death", 20, 1)]
    arm = [(1, "win", 51, 2), (2, "death", 40, 2), (3, "win", 51, 2), (4, "simulator_error", 25, 1), (5, "simulator_error", 25, 1), (6, "death", 20, 1)]
    for c in ts.CLASSES:
        for a in ("s", "t020", *([advance] if advance else [])):
            batch(batches, a, c, base if a == "s" else arm)
    selection = tmp_path / "dev-selection.json"
    selection.write_text(json.dumps({"choice": {"advance": advance is not None, "arm": advance}}))
    return batches, selection


def test_a_game_that_did_not_end_in_a_win_is_not_a_win_and_no_pair_is_dropped(tmp_path):
    batches, selection = world(tmp_path)
    out = tmp_path / "out.json"
    assert rob.main(["--batches", str(batches), "--selection", str(selection), "--out", str(out)]) == 0
    body = json.loads(out.read_text())
    assert body["kind"] == "thresh-robustness" and body["schema"] == 1 and sorted(body["tests"]) == ["T1", "T2", "T3"] and abs(body["level"] - 0.05 / 3) < 1e-12
    per = body["tests"]["T1"]["perClass"]["Ironclad"]
    # the primary test keeps the pairs both arms completed: seeds 1, 2, 6; the all-pairs analysis keeps all six
    assert per["shared"] == 6 and per["primaryPairs"] == 3 and per["pairs"] == 6
    # wins: baseline 1, 2, 4; arm 1, 3: only-arm = seed 3, only-baseline = seeds 2 and 4
    assert (per["arm"], per["baseline"], per["armOnly"], per["baselineOnly"]) == (2, 3, 1, 2)
    assert per["notCompleted"] == {"arm": 2, "baseline": 2}
    pooled = body["tests"]["T2"]["pooled"]
    assert pooled["pairs"] == 12 and pooled["shared"] == 12 and pooled["primaryPairs"] == 6 and abs(pooled["primaryExcludedFraction"] - 0.5) < 1e-12
    assert (pooled["armOnly"], pooled["baselineOnly"]) == (2, 4) and abs(pooled["p"] - rob.mcnemar_exact(2, 4)) < 1e-15
    assert abs(pooled["difference"] - (4 - 6) / 12) < 1e-12 and pooled["notCompleted"] == {"arm": 4, "baseline": 4}
    t3 = body["tests"]["T3"]                                   # the choice against 0.2: the two arms played alike here, so no pair differs
    assert t3["arm"] == "t030" and t3["baseline"] == "t020" and (t3["pooled"]["armOnly"], t3["pooled"]["baselineOnly"]) == (0, 0) and t3["pooled"]["p"] == 1.0
    assert set(body["contentSha256"]) == {ts.val_id(a, c) for a in ("s", "t020", "t030") for c in ts.CLASSES}
    assert body["contentSha256"][ts.val_id("t020", "Defect")] == "t020-Defect"


def test_without_an_advance_the_analysis_covers_the_replication_only_at_the_whole_level(tmp_path):
    batches, selection = world(tmp_path, advance=None)
    out = tmp_path / "out.json"
    assert rob.main(["--batches", str(batches), "--selection", str(selection), "--out", str(out)]) == 0
    body = json.loads(out.read_text())
    assert sorted(body["tests"]) == ["T1"] and body["level"] == 0.05 and set(body["contentSha256"]) == {ts.val_id(a, c) for a in ("s", "t020") for c in ts.CLASSES}


def test_only_a_win_is_a_win_and_only_a_win_or_a_death_is_completed():
    assert rob.won({"outcome": "win"}) and not rob.won({"outcome": "death"}) and not rob.won({"outcome": "timeout"}) and not rob.won({"outcome": "simulator_error"})
    assert rob.completed({"outcome": "win"}) and rob.completed({"outcome": "death"}) and not rob.completed({"outcome": "timeout"}) and not rob.completed({"outcome": "simulator_error"})


def test_the_exact_p_is_the_binomial_tail():
    assert rob.mcnemar_exact(0, 0) == 1.0
    assert abs(rob.mcnemar_exact(1, 9) - 22 / 1024) < 1e-15
    assert rob.mcnemar_exact(7, 7) == 1.0
