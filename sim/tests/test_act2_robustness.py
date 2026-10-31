"""`scripts/studies/act2/robustness.py`: the observed-endpoint analysis, a condition of the reading rule (ADR-060 addendum B)."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

from slay2_sim import external

REPO = external.REPO_ROOT
SPEC = importlib.util.spec_from_file_location("act2_robustness", REPO / "scripts" / "studies" / "act2" / "robustness.py")
assert SPEC and SPEC.loader
rob = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rob)

CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"]


def batch(root: Path, arm: str, cls: str, rows: list[tuple[int, str, int, int]]) -> None:
    d = root / f"act2-{arm}-{cls}-a0-veteran-keeprelics-val-n2000"
    d.mkdir(parents=True)
    with (d / "episodes.jsonl").open("w", encoding="utf-8") as fh:
        for seed, outcome, floor, act in rows:
            fh.write(json.dumps({"seed": seed, "outcome": outcome, "floor": floor, "act": act}) + "\n")


def world(tmp_path: Path, monkeypatch) -> Path:
    batches = tmp_path / "experiments" / "batches"
    for c in CLASSES:
        #        seed 1               2                   3 (error after the boss)    4 (error before)        5 (timeout before)     6
        base = [(1, "death", 40, 2), (2, "death", 20, 1), (3, "simulator_error", 36, 2), (4, "simulator_error", 25, 1), (5, "timeout", 31, 1), (6, "win", 51, 2)]
        arm = [(1, "death", 20, 1), (2, "death", 40, 2), (3, "simulator_error", 25, 1), (4, "simulator_error", 33, 2), (5, "death", 40, 2), (6, "win", 51, 2)]
        batch(batches, "s", c, base)
        batch(batches, "lead", c, arm)
    (tmp_path / "experiments" / "act2").mkdir(parents=True)
    (tmp_path / "experiments" / "act2" / "dev-selection.json").write_text(json.dumps({"P": {"advance": False}, "V": {"advance": False}}))
    monkeypatch.chdir(tmp_path)
    return batches


def test_an_error_after_the_boss_is_a_pass_an_error_before_it_drops_the_pair_and_the_endpoint_is_the_act_index(tmp_path, monkeypatch):
    batches = world(tmp_path, monkeypatch)
    out = tmp_path / "out.json"
    assert rob.main(["--batches", str(batches), "--out", str(out)]) == 0
    body = json.loads(out.read_text())
    assert body["kind"] == "act2-robustness" and body["schema"] == 2 and list(body["tests"]) == ["L"]
    per = body["tests"]["L"]["perClass"]["Ironclad"]
    # known endpoints: baseline seeds 1 (pass), 2 (no), 3 (error at act 2: pass), 6 (win); the arm's 1 (no), 2 (pass), 6; seed 4's baseline error at act 1
    # and the arm's error at act 2 (an unknown endpoint on one side drops the pair), seed 5's baseline timeout at act 1: the pairs 3 (arm error at act 1), 4 and 5 drop
    assert per["shared"] == 6 and per["primaryPairs"] == 3                    # completed in both: seeds 1, 2, 6
    assert per["pairs"] == 3 and per["droppedUnknown"] == 3                   # seeds 3, 4, 5 each have an endpoint that is unknown on one side
    assert per["erroredAfterTheBoss"] == {"arm": 1, "baseline": 1}            # the arm's seed 4 error at act 2 and the baseline's seed 3
    assert (per["armOnly"], per["baselineOnly"], per["arm"], per["baseline"]) == (1, 1, 2, 2)
    pooled = body["tests"]["L"]["pooled"]
    assert pooled["pairs"] == 15 and pooled["shared"] == 30 and abs(pooled["primaryExcludedFraction"] - 0.5) < 1e-12
    assert pooled["p"] == 1.0


def test_the_endpoint_is_the_act_index_not_the_floor(tmp_path):
    # an error right after the Act-2 boss fight has floor 31 and act 1: its endpoint is unknown, never a pass; a death on floor 33 with act 1 is a loss
    assert rob.endpoint({"outcome": "simulator_error", "floor": 31, "act": 1}) is None
    assert rob.endpoint({"outcome": "death", "floor": 33, "act": 1}) is False
    assert rob.endpoint({"outcome": "simulator_error", "floor": 33, "act": 2}) is True
    assert rob.endpoint({"outcome": "win", "floor": 51, "act": 2}) is True
    assert rob.endpoint({"outcome": "timeout", "floor": 10, "act": 0}) is None


def test_the_exact_p_is_the_binomial_tail():
    assert rob.mcnemar_exact(0, 0) == 1.0
    assert abs(rob.mcnemar_exact(1, 9) - 22 / 1024) < 1e-15
