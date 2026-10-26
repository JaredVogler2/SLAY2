"""The win audit re-derives a win instead of trusting it. A 100,000-HP player is the only practical way to reach the win path
(a policy that cannot win cannot test the audit), exactly as in test_terminal_semantics.py."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from slay2_sim import runner
from slay2_sim.policies import make_policy
from slay2_sim.runner import RunConfig, run_episode
from slay2_sim.winaudit import audit_wins

SEED = 3


@pytest.fixture()
def invulnerable(monkeypatch):
    real = runner.new_run

    def boosted(cfg, seed):
        mgr = real(cfg, seed)
        player = mgr.run_state.player
        player.max_hp = player.current_hp = 100_000
        return mgr

    monkeypatch.setattr(runner, "new_run", boosted)


def make_batch(root: Path, *, tamper_floor: int = 0) -> Path:
    cfg = RunConfig()
    rec = run_episode(cfg, SEED, make_policy("rules_v1"), batch_id="synthetic-win")
    assert rec.outcome == "win", "the invulnerable player must reach the win path"
    row = rec.to_json()
    row["floor"] += tamper_floor
    d = root / "synthetic-win"
    d.mkdir(parents=True)
    (d / "episodes.jsonl").write_text(json.dumps(row, sort_keys=True) + "\n", encoding="utf-8")
    (d / "manifest.json").write_text(
        json.dumps({"batch_id": "synthetic-win", "config": cfg.describe(), "policy": {"name": "rules_v1", "params": {}}}),
        encoding="utf-8",
    )
    return d


def test_a_real_win_is_rerun_replayed_and_checked_in_its_terminal_state(sim, invulnerable, tmp_path: Path):
    batch = make_batch(tmp_path)
    report = audit_wins(batch)
    assert report["wins_in_batch"] == 1 and report["wins_audited"] == 1 and report["all_verified"]
    (win,) = report["wins"]
    assert win["rerun_matches_stored_record"] and win["replay_ok"]
    assert win["terminal_state"] == {"is_over": True, "player_won": True, "final_act_index": 2}
    assert win["boss_fights_entered_per_act"] == {"0": 1, "1": 1, "2": 1}
    assert (batch / "wins" / f"{SEED}.jsonl.gz").exists()
    assert json.loads((batch / "wins-audit.json").read_text(encoding="utf-8"))["wins_verified"] == 1


def test_a_stored_record_that_the_rerun_does_not_reproduce_is_not_verified(sim, invulnerable, tmp_path: Path):
    report = audit_wins(make_batch(tmp_path, tamper_floor=2))
    (win,) = report["wins"]
    assert not report["all_verified"] and not win["verified"]
    assert win["rerun_mismatched_fields"] == ["floor"]
    assert win["replay_ok"], "the replay itself is fine; it is the stored record that disagrees"


def test_a_batch_without_wins_audits_nothing_and_claims_nothing(sim, tmp_path: Path):
    d = tmp_path / "no-wins"
    d.mkdir()
    cfg = RunConfig()
    (d / "episodes.jsonl").write_text(
        json.dumps({"batch_id": "no-wins", "seed": 1, "character": "Ironclad", "ascension": 0, "policy": "rules_v1", "policy_version": "1", "outcome": "death"}) + "\n",
        encoding="utf-8",
    )
    (d / "manifest.json").write_text(
        json.dumps({"batch_id": "no-wins", "config": cfg.describe(), "policy": {"name": "rules_v1", "params": {}}}), encoding="utf-8"
    )
    report = audit_wins(d)
    assert report["wins_audited"] == 0 and report["all_verified"] is False
