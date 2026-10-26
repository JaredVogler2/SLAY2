"""The sample audit (red-team campaign 6): a batch's ledger must be complete and a random sample of its completed games,
deaths included, must be re-derivable. Real games, three seeds: the point is that tampering is caught."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import pytest

from slay2_sim import external
from slay2_sim.manifest import load_seed_manifest, partition_seeds
from slay2_sim.policies import make_policy
from slay2_sim.runner import RunConfig, run_episode
from slay2_sim.winaudit import audit_sample

SEEDS_FILE = "experiments/seeds/ironclad-a0-v2.json"


def make_batch(root: Path, *, n: int = 3, drop: int = 0, tamper_floor: int = 0) -> Path:
    cfg = RunConfig()
    seeds = partition_seeds(load_seed_manifest(external.REPO_ROOT / SEEDS_FILE), "dev")[:n]
    rows = [run_episode(cfg, s, make_policy("rules_v1"), batch_id="mini").to_json() for s in seeds]
    counts = Counter(r["outcome"] for r in rows)
    rows[0]["floor"] += tamper_floor
    if drop:
        rows = rows[drop:]  # the ledger must notice a seed that has no record
    d = root / "mini"
    d.mkdir(parents=True)
    (d / "episodes.jsonl").write_text("".join(json.dumps(r, sort_keys=True) + "\n" for r in rows), encoding="utf-8")
    (d / "manifest.json").write_text(
        json.dumps(
            {
                "batch_id": "mini",
                "config": cfg.describe(),
                "policy": {"name": "rules_v1", "params": {}},
                "seeds": {"file": SEEDS_FILE, "partition": "dev", "n": n},
                "summary": {"counts": dict(counts)},
            }
        ),
        encoding="utf-8",
    )
    return d


def test_a_faithful_batch_has_a_complete_ledger_and_every_sampled_game_is_rederived(sim, tmp_path: Path):
    batch = make_batch(tmp_path)
    report = audit_sample(batch, n=3)
    assert report["ledger"]["ok"] and report["ledger"]["every_requested_seed_has_one_record"]
    assert report["sample"]["drawn"] == 3 and report["verified"] == 3 and report["all_verified"]
    for g in report["games"]:
        assert g["replay_ok"] and g["rerun_matches_stored_record"]
        assert g["terminal_state"]["is_over"] and g["terminal_state"]["hp"] <= 0 and not g["terminal_state"]["player_won"]
    assert json.loads((batch / "sample-audit.json").read_text(encoding="utf-8"))["verified"] == 3


def test_a_stored_record_the_rerun_does_not_reproduce_is_caught(sim, tmp_path: Path):
    report = audit_sample(make_batch(tmp_path, tamper_floor=3), n=3)
    bad = [g for g in report["games"] if not g["verified"]]
    assert len(bad) == 1 and bad[0]["rerun_mismatched_fields"] == ["floor"] and bad[0]["replay_ok"]
    assert not report["all_verified"]


def test_a_seed_without_a_record_breaks_the_ledger(sim, tmp_path: Path):
    report = audit_sample(make_batch(tmp_path, drop=1), n=3)
    assert report["ledger"]["every_requested_seed_has_one_record"] is False and report["ledger"]["ok"] is False
    assert not report["all_verified"], "a batch that lost a seed must not pass on the strength of the games it kept"


def test_the_sample_is_reproducible_and_never_larger_than_the_batch(sim, tmp_path: Path):
    batch = make_batch(tmp_path)
    a = audit_sample(batch, n=2, rng_seed=7)
    b = audit_sample(batch, n=2, rng_seed=7)
    assert [g["seed"] for g in a["games"]] == [g["seed"] for g in b["games"]] and len(a["games"]) == 2
    assert audit_sample(batch, n=50)["sample"]["drawn"] == 3
