"""Paired comparison artifact: arithmetic on synthetic batches, strict pairing rules, and the committed artifact."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from slay2_sim import external
from slay2_sim.compare import build_comparison, render_text, write_comparison

REPO = external.REPO_ROOT


def make_batch(
    root: Path, name: str, rows: list[tuple[int, str, int, float]], *, seeds_sha: str = "s" * 64, profile: str = "veteran"
) -> Path:
    """rows: (seed, outcome, floor, wall_seconds). Writes the two files build_comparison reads."""
    d = root / name
    d.mkdir(parents=True)
    (d / "manifest.json").write_text(
        json.dumps(
            {
                "batch_id": name,
                "policy": {"name": name.split("-")[0]},
                "content_sha256": "c" * 64,
                "seeds": {"file_sha256": seeds_sha, "partition": "train"},
                "config": {"character": "Ironclad", "ascension": 0, "profile": profile},
                "simulator": {"id": "sim", "pinned": "abc", "parity_with_live_game": "UNVERIFIED"},
            }
        ),
        encoding="utf-8",
    )
    with (d / "episodes.jsonl").open("w", encoding="utf-8") as fh:
        for seed, outcome, floor, wall in rows:
            fh.write(
                json.dumps(
                    {
                        "batch_id": name, "seed": seed, "character": "Ironclad", "ascension": 0, "policy": name,
                        "policy_version": "1", "outcome": outcome, "floor": floor, "wall_seconds": wall,
                    }
                )
                + "\n"
            )
    return d


def test_arithmetic_on_known_rows(tmp_path: Path):
    a = make_batch(tmp_path, "alpha-x", [(1, "death", 10, 1.0), (2, "win", 51, 1.0), (3, "death", 20, 1.0), (4, "death", 30, 1.0)])
    b = make_batch(tmp_path, "beta-x", [(1, "death", 8, 4.0), (2, "death", 40, 4.0), (3, "death", 20, 4.0), (9, "death", 99, 4.0)])
    c = build_comparison(a, b, iters=2000, seed=1)
    # seeds 1,2,3 are shared; 4 and 9 are not paired
    assert c["pairedSeeds"] == 3 and c["bothCompleted"] == 3 and c["excludedNotCompleted"] == 0
    assert c["a"]["wins"] == 1 and c["b"]["wins"] == 0
    assert c["pairedWinTable"] == {"both": 0, "a_only": 1, "b_only": 0, "neither": 2, "mcnemar_p": 1.0}
    # floors on the shared seeds: A = 10,51,20 (mean 27); B = 8,40,20 (mean 22.6667); mean(A-B) = (2+11+0)/3
    assert c["a"]["meanFloor"] == pytest.approx(27.0)
    assert c["b"]["meanFloor"] == pytest.approx(68 / 3)
    assert c["floorDifference"]["meanAMinusB"] == pytest.approx(13 / 3)
    lo, hi = c["floorDifference"]["ci95"]
    assert lo <= 13 / 3 <= hi
    assert c["wallTimeRatioBOverA"] == 4.0
    assert c["role"].startswith("development")
    assert len(c["contentSha256"]) == 64


def test_non_completed_episodes_are_excluded_and_counted_not_scored_as_losses(tmp_path: Path):
    a = make_batch(tmp_path, "alpha-y", [(1, "win", 51, 1.0), (2, "timeout", 12, 1.0), (3, "death", 5, 1.0)])
    b = make_batch(tmp_path, "beta-y", [(1, "death", 9, 1.0), (2, "death", 9, 1.0), (3, "simulator_error", 0, 1.0)])
    c = build_comparison(a, b, iters=500)
    assert c["pairedSeeds"] == 3
    assert c["bothCompleted"] == 1 and c["excludedNotCompleted"] == 2
    assert c["a"]["wins"] == 1 and c["bothCompleted"] == 1  # the win rate denominator is the paired completed games


def test_unpaired_batches_are_refused(tmp_path: Path):
    a = make_batch(tmp_path, "alpha-z", [(1, "death", 3, 1.0)])
    other_seeds = make_batch(tmp_path, "beta-z", [(1, "death", 3, 1.0)], seeds_sha="t" * 64)
    other_profile = make_batch(tmp_path, "gamma-z", [(1, "death", 3, 1.0)], profile="first_run")
    disjoint = make_batch(tmp_path, "delta-z", [(7, "death", 3, 1.0)])
    for bad in (other_seeds, other_profile):
        with pytest.raises(ValueError):
            build_comparison(a, bad)
    with pytest.raises(ValueError, match="completed"):
        build_comparison(a, disjoint)


def test_output_is_deterministic_and_round_trips(tmp_path: Path):
    a = make_batch(tmp_path, "alpha-d", [(i, "death", 10 + i % 7, 0.5) for i in range(1, 40)])
    b = make_batch(tmp_path, "beta-d", [(i, "death", 9 + i % 5, 2.0) for i in range(1, 40)])
    first = build_comparison(a, b, iters=1000, seed=3)
    second = build_comparison(a, b, iters=1000, seed=3)
    assert first == second
    out = tmp_path / "out" / "cmp.json"
    write_comparison(first, out)
    assert json.loads(out.read_text(encoding="utf-8")) == first
    assert "mean(A-B)" in render_text(first)


COMMITTED = REPO / "experiments" / "comparisons" / "rules_v1-vs-search_v1-ironclad-a0-veteran-train.json"
BATCHES = REPO / "experiments" / "batches"


def test_committed_comparison_matches_a_recomputation_from_the_committed_batches():
    committed = json.loads(COMMITTED.read_text(encoding="utf-8"))
    fresh = build_comparison(
        BATCHES / committed["a"]["batchId"], BATCHES / committed["b"]["batchId"], iters=2000, seed=0
    )
    for key in ("pairedSeeds", "bothCompleted", "excludedNotCompleted", "pairedWinTable", "cohort", "role"):
        assert fresh[key] == committed[key], key
    for side in ("a", "b"):
        for key in ("batchId", "policy", "contentSha256", "wins", "meanFloor", "meanWallSecondsPerEpisode"):
            assert fresh[side][key] == committed[side][key], (side, key)
    assert fresh["floorDifference"]["meanAMinusB"] == pytest.approx(committed["floorDifference"]["meanAMinusB"])
    assert fresh["wallTimeRatioBOverA"] == committed["wallTimeRatioBOverA"]
    # the committed interval is from 20,000 resamples, this one from 2,000: allow Monte-Carlo noise only
    for got, want in zip(fresh["floorDifference"]["ci95"], committed["floorDifference"]["ci95"]):
        assert got == pytest.approx(want, abs=0.25)
