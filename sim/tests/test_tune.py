"""The tuning tool: candidate expansion, paired comparison arithmetic, and the refusal to tune on held-out seeds."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from slay2_sim import external
from slay2_sim.outcomes import EpisodeRecord
from slay2_sim.tune import compare_records, expand_one_at_a_time, merge_params, render, run_candidates

SEEDS_V2 = external.REPO_ROOT / "experiments" / "seeds" / "ironclad-a0-v2.json"


def test_one_at_a_time_expands_every_value_of_every_threshold():
    cands = expand_one_at_a_time("heal_below=0.5,0.6; elite_value=1,3 ;")
    assert [c["name"] for c in cands] == ["heal_below=0.5", "heal_below=0.6", "elite_value=1", "elite_value=3"]
    assert cands[0]["tune"] == {"heal_below": 0.5} and cands[3]["tune"] == {"elite_value": 3}


def test_candidate_overrides_are_merged_over_the_base_not_instead_of_it():
    base = {"threshold": 0.1, "tune": {"heal_below": 0.6, "elite_value": 2.0}}
    merged = merge_params(base, {"name": "x", "tune": {"elite_value": 3.0}, "params": {"threshold": 0.2}})
    assert merged == {"threshold": 0.2, "tune": {"heal_below": 0.6, "elite_value": 3.0}}
    assert merge_params({}, {"name": "x"}) == {}


def rec(seed: int, outcome: str, floor: int, act: int) -> EpisodeRecord:
    return EpisodeRecord(batch_id="b", seed=seed, character="Ironclad", ascension=0, policy="p", policy_version="1", outcome=outcome, floor=floor, act=act)


def test_paired_comparison_counts_the_endpoints_on_shared_completed_seeds_only():
    base = {1: rec(1, "death", 10, 0), 2: rec(2, "death", 20, 1), 3: rec(3, "death", 30, 2), 4: rec(4, "timeout", 5, 0), 5: rec(5, "death", 8, 0)}
    cand = {1: rec(1, "death", 18, 1), 2: rec(2, "death", 19, 1), 3: rec(3, "win", 45, 2), 4: rec(4, "death", 9, 0), 5: rec(5, "death", 9, 0), 6: rec(6, "death", 1, 0)}
    r = compare_records(base, cand, iters=500)
    assert r["paired"] == 4 and r["excluded"] == 1  # seed 4 timed out on one side, seed 6 is unpaired
    assert r["meanFloor"] == pytest.approx((18 + 19 + 45 + 9) / 4) and r["meanFloorBase"] == pytest.approx((10 + 20 + 30 + 8) / 4)
    assert r["floorDiff"] == pytest.approx(r["meanFloor"] - r["meanFloorBase"])
    lo, hi = r["floorDiffCi95"]
    assert lo <= r["floorDiff"] <= hi
    # past the Act-1 boss: candidate 1, 2, 3 (act >= 1 or win); base 2, 3
    assert r["pastAct1Boss"]["rate"] == 0.75 and r["pastAct1Boss"]["rateBase"] == 0.5
    assert (r["pastAct1Boss"]["onlyCandidate"], r["pastAct1Boss"]["onlyBase"]) == (1, 0)
    # past the Act-2 boss: candidate 3 (win), base 3 (act 2)
    assert r["pastAct2Boss"]["rate"] == 0.25 and r["pastAct2Boss"]["rateBase"] == 0.25
    assert r["wins"] == 1 and r["winsBase"] == 0
    with pytest.raises(ValueError):
        compare_records({1: rec(1, "death", 1, 0)}, {1: rec(1, "death", 1, 0)})


@pytest.mark.parametrize("partition", ["val", "test"])
def test_held_out_partitions_are_refused(sim, tmp_path: Path, partition: str):
    with pytest.raises(PermissionError, match="held-out"):
        run_candidates(policy="rules_v1", base_params={}, candidates=[{"name": "a", "tune": {}}], seeds_file=SEEDS_V2, partition=partition,
                       offset=0, n=2, workers=1, out_dir=tmp_path, sim=sim)


def test_a_tiny_end_to_end_run_writes_a_summary_and_a_table(sim, tmp_path: Path):
    summary = run_candidates(policy="rules_v1", base_params={}, candidates=[{"name": "heal_below=0.5", "tune": {"heal_below": 0.5}}],
                             seeds_file=SEEDS_V2, partition="dev", offset=0, n=6, workers=2, out_dir=tmp_path / "t", sim=sim)
    assert json.loads((tmp_path / "t" / "summary.json").read_text())["seeds"]["partition"] == "dev"
    (row,) = summary["candidates"]
    assert row["params"]["tune"] == {"heal_below": 0.5} and row["paired"] >= 4
    assert "heal_below=0.5" in render(summary)
