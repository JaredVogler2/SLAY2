"""Turn a combat-network run into a small, checkpoint-free record that can be committed (ADR-026).

Checkpoints are never committed (weights derived from a third-party simulator are audited separately); what is kept is the
configuration, the validation trajectory, the SHA-256 of each checkpoint, and the paired held-out evaluation against the
rules baseline, with the operator's note about how the run ended.

    python -m slay2_sim.rl.summary --run experiments/rl/combat-ppo-v1-run1 \\
        --eval experiments/rl/results/combat-ppo-v1-run1-paired-eval.json.gz \\
        --note "stopped at iteration 189 of 300: validation plateaued below the baseline" \\
        --out experiments/rl/results/combat-ppo-v1-run1.json
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path

SCHEMA = 1
SIM_KEYS = ("id", "head", "pinned", "dirty")  # never the local checkout path


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def read_json(path: Path):
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as fh:
        return json.load(fh)


def validation_trajectory(log_lines: list[str]) -> list[dict]:
    rows = [json.loads(line) for line in log_lines if line.strip()]
    return [{"iteration": r["it"], "steps": r["steps"], **{k: r["val"]["all"].get(k) for k in ("n", "win", "hp_lost_on_win")}}
            for r in rows if "val" in r]


def summarize(run: Path, eval_path: Path | None, note: str) -> dict:
    cfg = json.loads((run / "config.json").read_text(encoding="utf-8"))
    log = [line for line in (run / "log.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    last = json.loads(log[-1])
    args = {k: v for k, v in cfg["args"].items() if k != "out"}
    out: dict = {
        "schema": SCHEMA, "kind": "combat-network-run", "run": run.name, "note": note,
        "config": args, "net": cfg["net"], "libraries": cfg["libraries"], "library_nodes": cfg["nodes"],
        "simulator": {k: cfg["simulator"].get(k) for k in SIM_KEYS if k in cfg["simulator"]},
        "iterations_logged": last["it"], "steps": last["steps"],
        "validation": validation_trajectory(log),
        "checkpoints": {p.name: {"sha256": sha256_of(p), "bytes": p.stat().st_size} for p in sorted(run.glob("*.pt"))},
    }
    if (run / "bc.json").exists():
        bc = json.loads((run / "bc.json").read_text(encoding="utf-8"))
        out["behaviour_cloning"] = {k: bc[k] for k in ("demonstrations", "decisions_by_node", "train_decisions", "holdout_decisions") if k in bc}
        out["behaviour_cloning"]["final_epoch"] = bc["history"][-1] if bc.get("history") else None
    if eval_path is not None:
        ev = read_json(eval_path)
        out["paired_evaluation"] = {
            "file": eval_path.name, "partition": ev["partition"], "seeds": ev["seeds"], "repeats": ev["repeats"], "workers": ev["workers"],
            "agents": ev["agents"], "summaries": ev["summaries"], "paired": ev["paired"],
        }
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run", required=True)
    ap.add_argument("--eval")
    ap.add_argument("--note", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    record = summarize(Path(args.run), Path(args.eval) if args.eval else None, args.note)
    Path(args.out).write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
