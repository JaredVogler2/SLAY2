#!/usr/bin/env python3
"""Recompute each pooled file of the acts study from the raw episodes with `scripts/verify-pooled.py`, which shares no code with `slay2_sim`, and write the
record of it (ADR-061 item 10).

* Every exact check (the counts, the paired tables, the exact McNemar p-values, the rates, the mean floors, the pooled difference) must agree with the
  episodes: any disagreement is an error (exit status 1) and `pool.sh` stops without writing a result.
* The intervals are checked by an independent resample whose tolerance is 6 % of the interval's width. The pooled file's own interval governs
  (ADR-060 addendum B.5(i)): a disagreement of the resample is recorded, shown with the result and decides nothing.

    python3 scripts/studies/acts/verify_all.py experiments/acts/pooled-acts-*.json --out experiments/acts/verification.json
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def load_verifier():
    spec = importlib.util.spec_from_file_location("verify_pooled", ROOT / "scripts" / "verify-pooled.py")
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("pooled", type=Path, nargs="+")
    ap.add_argument("--batches", type=Path, default=Path("experiments/batches"))
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args(argv)
    vp = load_verifier()
    files: dict[str, dict] = {}
    status = 0
    for path in sorted(args.pooled):
        exact, n_exact = vp.verify(path, args.batches, bootstrap=False)
        boot, n_boot = vp.verify(path, args.batches, bootstrap=True)
        disagreements = [line for line in boot if line not in exact]
        files[path.name] = {
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "exactChecks": n_exact, "exactProblems": exact,
            "bootstrapChecks": n_boot, "bootstrapDisagreements": disagreements,
        }
        print(f"{path.name}: {n_exact} exact checks, {len(exact)} problems; {n_boot} checks with the independent resample, {len(disagreements)} interval disagreements")
        for line in exact + disagreements:
            print("  " + line)
        if exact:
            status = 1
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({"kind": "acts-verification", "schema": 1, "files": files}, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return status


if __name__ == "__main__":
    sys.exit(main())
