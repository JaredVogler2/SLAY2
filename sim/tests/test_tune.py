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


# --- the selection rule of ADR-036, as code -------------------------------------------------------------------------------

def row(name: str, rate: float, base: float, p: float, floor: float, base_params: dict | None = None) -> dict:
    """A summary row shaped like run_candidates' output, with the params the candidate would have been played with."""
    key, _, value = name.partition("=")
    params = {**(base_params or {})}
    if key == "threshold":
        params["threshold"] = float(value)
    else:
        params["tune"] = {**params.get("tune", {}), key: float(value)}
    return {"name": name, "params": params, "floorDiff": floor, "pastAct1Boss": {"rate": rate, "rateBase": base, "mcnemarP": p}}


def test_screen_advances_only_higher_and_significant_candidates_best_floor_first_and_capped():
    from slay2_sim.tune import SCREEN_LIMIT, screen

    rows = [
        row("a=1", 0.60, 0.55, 0.04, 0.5),       # higher, p < 0.10: advances
        row("b=1", 0.50, 0.55, 0.01, 1.5),       # significantly LOWER: never advances
        row("c=1", 0.58, 0.55, 0.30, 2.0),       # higher but not significant
        row("d=1", 0.61, 0.55, 0.09, 1.0),       # advances, better floor than a=1
        row("e=1", 0.55, 0.55, 0.50, 0.0),       # equal rate
    ]
    assert [r["name"] for r in screen(rows)] == ["d=1", "a=1"]
    many = [row(f"k{i}=1", 0.60, 0.55, 0.01, float(i)) for i in range(SCREEN_LIMIT + 4)]
    advanced = screen(many)
    assert len(advanced) == SCREEN_LIMIT and advanced[0]["name"] == f"k{SCREEN_LIMIT + 3}=1"


def test_confirm_uses_a_bonferroni_level_and_keeps_one_value_per_threshold():
    from slay2_sim.tune import confirm

    rows = [
        row("heal_below=0.5", 0.62, 0.55, 0.004, 0.8),
        row("heal_below=0.6", 0.63, 0.55, 0.001, 1.2),  # same threshold, larger floor gain: this one is kept
        row("elite_value=3", 0.60, 0.55, 0.03, 2.0),     # p below 0.05 but not below 0.05 / 4: not confirmed
        row("rest_weight=5", 0.50, 0.55, 0.0001, 3.0),   # lower than the base: not confirmed
    ]
    out = confirm(rows)
    assert out["alpha"] == pytest.approx(0.05 / 4)
    assert out["confirmed"] == ["heal_below=0.5", "heal_below=0.6"]
    assert [r["name"] for r in out["kept"]] == ["heal_below=0.6"]
    assert confirm([]) == {"alpha": 0.05, "confirmed": [], "kept": []}


def test_the_combined_candidate_holds_every_kept_change_and_only_those():
    from slay2_sim.tune import candidate_spec, combined_candidate

    base = {"threshold": 0.0, "tune": {"max_deck": 30}}
    kept = [
        row("heal_below=0.6", 0.6, 0.5, 0.01, 1.0, base),
        row("threshold=0.1", 0.6, 0.5, 0.01, 1.0, base),
        row("max_deck=30", 0.6, 0.5, 0.01, 1.0, base),   # equal to the base: nothing to override
    ]
    assert candidate_spec(base, kept[0]) == {"name": "heal_below=0.6", "tune": {"heal_below": 0.6}}
    assert candidate_spec(base, kept[1]) == {"name": "threshold=0.1", "params": {"threshold": 0.1}}
    assert candidate_spec(base, kept[2]) == {"name": "max_deck=30"}
    combined = combined_candidate(base, kept)
    assert combined == {"name": "combined", "tune": {"heal_below": 0.6}, "params": {"threshold": 0.1}}
    # played through the same merge as any candidate, it is the base plus exactly those changes
    assert merge_params(base, combined) == {"threshold": 0.1, "tune": {"max_deck": 30, "heal_below": 0.6}}


def test_tune_select_cli_runs_the_three_stages_on_a_summary(tmp_path: Path):
    from slay2_sim.cli import main

    base = {"threshold": 0.0}
    stage1 = {"base": base, "candidates": [row("heal_below=0.6", 0.62, 0.55, 0.02, 1.0, base), row("elite_value=3", 0.5, 0.55, 0.02, 1.0, base)]}
    (tmp_path / "s1.json").write_text(json.dumps(stage1), encoding="utf-8")
    assert main(["tune-select", "--stage", "screen", "--summary", str(tmp_path / "s1.json"), "--out", str(tmp_path / "c2.json")]) == 0
    assert json.loads((tmp_path / "c2.json").read_text(encoding="utf-8")) == [{"name": "heal_below=0.6", "tune": {"heal_below": 0.6}}]

    stage2 = {"base": base, "candidates": [row("heal_below=0.6", 0.63, 0.55, 0.001, 1.1, base)]}
    (tmp_path / "s2.json").write_text(json.dumps(stage2), encoding="utf-8")
    assert main(["tune-select", "--stage", "confirm", "--summary", str(tmp_path / "s2.json"), "--out", str(tmp_path / "c3.json")]) == 0
    assert json.loads((tmp_path / "c3.json").read_text(encoding="utf-8")) == [{"name": "combined", "tune": {"heal_below": 0.6}}]

    combined_row = {"name": "combined", "params": {"threshold": 0.0, "tune": {"heal_below": 0.6}}, "floorDiff": 0.2,
                    "pastAct1Boss": {"rate": 0.60, "rateBase": 0.55, "mcnemarP": 0.20}}
    stage3 = {"base": base, "candidates": [combined_row]}
    (tmp_path / "s3.json").write_text(json.dumps(stage3), encoding="utf-8")
    # not significant at 0.05: the combination is dropped (exit 3, empty file) and nothing is adopted
    assert main(["tune-select", "--stage", "combine", "--summary", str(tmp_path / "s3.json"), "--out", str(tmp_path / "c4.json")]) == 3
    assert json.loads((tmp_path / "c4.json").read_text(encoding="utf-8")) == []
