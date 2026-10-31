"""`scripts/studies/act2/verify_batch.py`: what a finished batch has to be before the run goes on or the preflight lets it through (ADR-060 addendum B)."""

from __future__ import annotations

import copy
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

from slay2_sim import external

REPO = external.REPO_ROOT
SPEC = importlib.util.spec_from_file_location("act2_verify_batch", REPO / "scripts" / "studies" / "act2" / "verify_batch.py")
assert SPEC and SPEC.loader
vb = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(vb)

PARAMS = {"threshold": 0.0, "values": "experiments/cardvalue/ironclad-a0-v2.json", "late_threshold": 0.35}
HEAD = "a" * 40
GOOD = {
    "policy": {"name": "rules_v2_late", "params": PARAMS},
    "config": {"ascension": 0, "keep_relics": True, "character": "Ironclad"},
    "seeds": {"partition": "val", "n": 2000},
    "summary": {"episodes": 2000, "completed": 1950, "counts": {"aborted": 0, "harness_error": 0, "policy_error": 0, "invalid_action": 0, "simulator_error": 40, "timeout": 10}},
    "class_start_verified": True, "canonical_process_state": True, "environment": {"slay2": {"head": HEAD, "dirty": False}},
}


def write(tmp: Path, body: dict) -> str:
    d = tmp / "batch"
    d.mkdir(exist_ok=True)
    (d / "manifest.json").write_text(json.dumps(body))
    return str(d)


def check(d: str, **over) -> list[str]:
    a = {"policy": "rules_v2_late", "params": json.dumps(PARAMS), "cls": "Ironclad", "part": "val", "n": 2000, "off": 0, "head": HEAD, **over}
    return vb.problems(d, a["policy"], a["params"], a["cls"], a["part"], a["n"], a["off"], a["head"])


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
    (["policy", "params"], {**PARAMS, "values": "experiments/cardvalue/silent-a0-keep-v1.json"}, "policy parameters"),
    (["config", "character"], "Silent", "class Silent"),
    (["config", "ascension"], 9, "Ascension 9"),
    (["config", "keep_relics"], False, "relics not kept"),
    (["config", "keep_relics"], KeyError, "relics not kept"),
    (["seeds", "partition"], "dev", "seeds"),
    (["seeds", "n"], 1000, "seeds"),
    (["seeds", "offset"], 1000, "seeds"),
    (["summary", "episodes"], 1999, "seeds"),
    (["summary", "counts", "policy_error"], 1, "1 games ended in an abort"),
    (["summary", "counts", "harness_error"], 2, "2 games ended in an abort"),
    (["summary", "completed"], 1799, "only 1799 of 2000 completed"),
    (["class_start_verified"], False, "class start or canonical process state not recorded"),
    (["canonical_process_state"], KeyError, "class start or canonical process state not recorded"),
    (["environment", "slay2", "dirty"], True, "uncommitted changes"),
    (["environment", "slay2", "head"], "b" * 40, "not from aaaaaaaaaaaa"),
])
def test_each_way_a_batch_can_be_something_else_is_found(tmp_path, path, value, message):
    found = check(write(tmp_path, mutated(path, value)))
    assert found and message in found[0], found


def test_ninety_percent_completed_is_enough_and_a_missing_or_unreadable_manifest_is_a_problem(tmp_path):
    assert check(write(tmp_path, mutated(["summary", "completed"], 1800))) == []
    assert "no readable manifest" in check(str(tmp_path / "nothing"))[0]
    d = tmp_path / "torn"
    d.mkdir()
    (d / "manifest.json").write_text("{")
    assert "no readable manifest" in check(str(d))[0]
    assert "not a finished batch's" in check(write(tmp_path, {"policy": {"name": "rules_v2_late"}}))[0]


def test_the_command_line_checks_one_batch_or_many_and_exits_with_the_problems(tmp_path):
    good = write(tmp_path / "x" if (tmp_path / "x").mkdir() is None else tmp_path, GOOD)
    script = str(REPO / "scripts" / "studies" / "act2" / "verify_batch.py")
    env = {"STUDY_HEAD_EXPECTED": HEAD, "PATH": "/usr/bin:/bin"}
    one = [sys.executable, script, good, "rules_v2_late", json.dumps(PARAMS), "Ironclad", "val", "2000", "0"]
    assert subprocess.run(one, env=env, capture_output=True, text=True).returncode == 0
    wrong = subprocess.run([*one[:5], "Silent", *one[6:]], env=env, capture_output=True, text=True)
    assert wrong.returncode == 1 and "class Ironclad" in wrong.stderr
    other = write(tmp_path / "y" if (tmp_path / "y").mkdir() is None else tmp_path, mutated(["config", "character"], "Defect"))
    lines = "\n".join(["\t".join([d, "rules_v2_late", json.dumps(PARAMS), "Ironclad", "val", "2000", "0"]) for d in (good, other)]) + "\n"
    many = subprocess.run([sys.executable, script, "--many"], input=lines, env=env, capture_output=True, text=True)
    assert many.returncode == 1 and many.stderr.count("verify_batch:") == 1 and "class Defect" in many.stderr
