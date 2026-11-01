"""`scripts/studies/acts/robustness.py`: the all-pairs analysis, a condition of the reading rule (ADR-061 item 4)."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

from slay2_sim import external

REPO = external.REPO_ROOT
SPEC = importlib.util.spec_from_file_location("acts_robustness", REPO / "scripts" / "studies" / "acts" / "robustness.py")
assert SPEC and SPEC.loader
rob = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rob)

CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"]


def batch(root: Path, arm: str, cls: str, rows: list[tuple[int, str, int, int]]) -> None:
    d = root / f"acts-{arm}-{cls}-a0-veteran-keeprelics-val2-n3000"
    d.mkdir(parents=True)
    with (d / "episodes.jsonl").open("w", encoding="utf-8") as fh:
        for seed, outcome, floor, act in rows:
            fh.write(json.dumps({"seed": seed, "outcome": outcome, "floor": floor, "act": act}) + "\n")


def world(tmp_path: Path) -> Path:
    batches = tmp_path / "experiments" / "batches"
    for c in CLASSES:
        #        seed 1: both win     2: only the baseline   3: arm wins, baseline errored   4: arm errored, baseline wins   5: both errored   6: both die
        base = [(1, "win", 51, 2), (2, "win", 51, 2), (3, "simulator_error", 36, 2), (4, "win", 51, 2), (5, "timeout", 31, 1), (6, "death", 20, 1)]
        arm = [(1, "win", 51, 2), (2, "death", 40, 2), (3, "win", 51, 2), (4, "simulator_error", 25, 1), (5, "simulator_error", 25, 1), (6, "death", 20, 1)]
        for a in ("s", "lead", "a1", "a2", "a3"):
            batch(batches, a, c, base if a == "s" else arm)
    return batches


def test_a_game_that_did_not_end_in_a_win_is_not_a_win_and_no_pair_is_dropped(tmp_path):
    batches = world(tmp_path)
    out = tmp_path / "out.json"
    assert rob.main(["--batches", str(batches), "--out", str(out)]) == 0
    body = json.loads(out.read_text())
    assert body["kind"] == "acts-robustness" and body["schema"] == 1 and sorted(body["tests"]) == ["A1", "A2", "A3", "L"]
    per = body["tests"]["L"]["perClass"]["Ironclad"]
    # the primary test keeps the pairs both arms completed: seeds 1, 2, 6; the all-pairs analysis keeps all six
    assert per["shared"] == 6 and per["primaryPairs"] == 3 and per["pairs"] == 6
    # wins: baseline 1, 2, 4; arm 1, 3: only-arm = seed 3, only-baseline = seeds 2 and 4
    assert (per["arm"], per["baseline"], per["armOnly"], per["baselineOnly"]) == (2, 3, 1, 2)
    assert per["notCompleted"] == {"arm": 2, "baseline": 2}
    pooled = body["tests"]["A3"]["pooled"]
    assert pooled["pairs"] == 30 and pooled["shared"] == 30 and pooled["primaryPairs"] == 15 and abs(pooled["primaryExcludedFraction"] - 0.5) < 1e-12
    assert (pooled["armOnly"], pooled["baselineOnly"]) == (5, 10) and abs(pooled["p"] - rob.mcnemar_exact(5, 10)) < 1e-15
    assert abs(pooled["difference"] - (10 - 15) / 30) < 1e-12 and pooled["notCompleted"] == {"arm": 10, "baseline": 10}


def test_only_a_win_is_a_win_and_only_a_win_or_a_death_is_completed():
    assert rob.won({"outcome": "win"}) and not rob.won({"outcome": "death"}) and not rob.won({"outcome": "timeout"}) and not rob.won({"outcome": "simulator_error"})
    assert rob.completed({"outcome": "win"}) and rob.completed({"outcome": "death"}) and not rob.completed({"outcome": "timeout"}) and not rob.completed({"outcome": "simulator_error"})


def test_the_exact_p_is_the_binomial_tail():
    assert rob.mcnemar_exact(0, 0) == 1.0
    assert abs(rob.mcnemar_exact(1, 9) - 22 / 1024) < 1e-15
    assert rob.mcnemar_exact(7, 7) == 1.0
