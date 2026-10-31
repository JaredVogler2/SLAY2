"""`scripts/studies/act2/robustness.py`: the post hoc check that keeps the games that ended in a simulator error, scored by the floor they reached (ADR-060 item 3)."""

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


def test_errors_are_kept_and_scored_by_the_floor_they_reached_and_other_endings_still_drop_the_pair(tmp_path, monkeypatch):
    batches = tmp_path / "experiments" / "batches"
    for c in CLASSES:
        base = [(1, "death", 40, 2), (2, "death", 20, 1), (3, "simulator_error", 36, 2), (4, "simulator_error", 25, 1), (5, "timeout", 31, 1), (6, "win", 51, 2)]
        arm = [(1, "death", 20, 1), (2, "death", 40, 2), (3, "simulator_error", 25, 1), (4, "simulator_error", 33, 2), (5, "death", 40, 2), (6, "win", 51, 2)]
        batch(batches, "s", c, base)
        batch(batches, "lead", c, arm)
    (tmp_path / "experiments" / "act2").mkdir(parents=True)
    (tmp_path / "experiments" / "act2" / "dev-selection.json").write_text(json.dumps({"P": {"advance": False}, "V": {"advance": False}}))
    monkeypatch.chdir(tmp_path)
    out = tmp_path / "out.json"
    assert rob.main(["--batches", str(batches), "--out", str(out)]) == 0
    body = json.loads(out.read_text())
    assert body["label"].startswith("post hoc, not the registered endpoint") and list(body["tests"]) == ["L"]
    per = body["tests"]["L"]["perClass"]["Ironclad"]
    # seed 5 is a timeout in the baseline: the pair is dropped; five pairs remain
    assert per["pairs"] == 5 and per["droppedPairs"] == 1
    # past the Act-2 boss = a win or a last floor beyond 31: baseline seeds 1, 3 (error at 36) and 6; the arm's seeds 2, 4 (error at 33) and 6
    assert (per["baseline"], per["arm"]) == (3, 3)
    assert per["armOnly"] == 2 and per["baselineOnly"] == 2     # the arm alone: seeds 2 and 4 (an error at floor 33 counts); the baseline alone: seeds 1 and 3 (an error at 36 counts)
    assert per["errors"] == {"arm": 2, "baseline": 2}
    pooled = body["tests"]["L"]["pooled"]
    assert pooled["pairs"] == 25 and pooled["errors"] == {"arm": 10, "baseline": 10} and pooled["p"] == 1.0


def test_the_exact_p_is_the_binomial_tail():
    assert rob.mcnemar_exact(0, 0) == 1.0
    assert abs(rob.mcnemar_exact(1, 9) - 22 / 1024) < 1e-15
