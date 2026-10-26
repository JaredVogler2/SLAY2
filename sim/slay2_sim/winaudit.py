"""Replay-verification of the wins in a batch.

CLAUDE.md: a completed episode must reach a true success or death state; a win is the strongest claim a batch can make, so
every win is re-derived instead of trusted. For each winning seed the audit

1. re-runs the episode with the policy the manifest names (its effective parameters when it recorded them) and a trace,
   and checks that the fresh record agrees with the stored one (outcome, floor, HP, deck, steps);
2. replays the trace on a fresh run, observation hash by observation hash (determinism of simulator, adapter and policy);
3. reads the terminal state of the replayed run: the run is over, the player won, the run ended in the third act (index 2;
   STS2 has no fourth act and no Heart), and one boss fight was entered in every act.

The result is written next to the batch as ``wins-audit.json`` and the traces as ``wins/<seed>.jsonl.gz`` (a few KB each;
committed, unlike the git-ignored ``traces/`` of a whole batch).
"""

from __future__ import annotations

import json
from pathlib import Path

from .batch import read_episodes
from .manifest import save_json
from .policies import make_policy
from .runner import RunConfig, replay_manager, run_episode

STORED_FIELDS = ("outcome", "floor", "act", "hp", "max_hp", "deck_size", "relics", "combats_won", "steps")


def _policy_params(manifest: dict) -> dict:
    eff = manifest["policy"].get("effective") or {}
    return eff["params"] if "params" in eff else manifest["policy"]["params"]


def audit_wins(batch_dir: Path, *, limit: int | None = None) -> dict:
    """Verify every win (or the first ``limit``) of a finished batch. The simulator must already be activated."""
    from sts2_env.core.enums import RoomType

    batch_dir = Path(batch_dir)
    manifest = json.loads((batch_dir / "manifest.json").read_text(encoding="utf-8"))
    cfg = RunConfig(**manifest["config"])
    name, params = manifest["policy"]["name"], _policy_params(manifest)
    wins = sorted((r for r in read_episodes(batch_dir) if r.outcome == "win"), key=lambda r: r.seed)
    if limit is not None:
        wins = wins[:limit]
    effective = make_policy(name, **params).describe()["params"]  # e.g. the values file's path and sha256 the audit really used
    rows = []
    for rec in wins:
        trace = batch_dir / "wins" / f"{rec.seed}.jsonl.gz"  # not traces/: that directory is git-ignored, these are evidence
        again = run_episode(cfg, rec.seed, make_policy(name, **params), batch_id=rec.batch_id, trace_path=trace)
        mismatched = [k for k in STORED_FIELDS if getattr(again, k) != getattr(rec, k)]

        boss_entries: dict[int, int] = {}
        seen = {"phase": None}

        def count(mgr) -> None:
            if mgr.phase == "COMBAT" and seen["phase"] != "COMBAT" and mgr._current_room_type == RoomType.BOSS:
                act = int(mgr.run_state.current_act_index)
                boss_entries[act] = boss_entries.get(act, 0) + 1
            seen["phase"] = mgr.phase

        ok, message, mgr = replay_manager(cfg, rec.seed, trace, on_step=count)
        final_act = int(mgr.run_state.current_act_index)
        terminal = bool(mgr.is_over) and bool(mgr.player_won)
        three_bosses = boss_entries == {0: 1, 1: 1, 2: 1}
        rows.append(
            {
                "seed": rec.seed,
                "floor": rec.floor,
                "hp": rec.hp,
                "max_hp": rec.max_hp,
                "deck_size": rec.deck_size,
                "relics": rec.relics,
                "steps": rec.steps,
                "trace_sha256": again.trace_sha256,
                "rerun_matches_stored_record": not mismatched,
                "rerun_mismatched_fields": mismatched,
                "replay_ok": ok,
                "replay_message": message,
                "terminal_state": {"is_over": bool(mgr.is_over), "player_won": bool(mgr.player_won), "final_act_index": final_act},
                "boss_fights_entered_per_act": {str(k): v for k, v in sorted(boss_entries.items())},
                "verified": bool(ok and not mismatched and terminal and final_act == 2 and three_bosses),
            }
        )
    report = {
        "schema": 1,
        "batch_id": manifest["batch_id"],
        "policy": {"name": name, "params": params, "effective_params": effective},
        "wins_in_batch": sum(1 for r in read_episodes(batch_dir) if r.outcome == "win"),
        "wins_audited": len(rows),
        "wins_verified": sum(1 for r in rows if r["verified"]),
        "all_verified": bool(rows) and all(r["verified"] for r in rows),
        "criteria": "re-run agrees with the stored record; trace replays hash for hash; run over + player_won; ended in act index 2; one boss fight entered per act",
        "wins": rows,
    }
    save_json(batch_dir / "wins-audit.json", report)
    return report
