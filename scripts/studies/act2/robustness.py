#!/usr/bin/env python3
"""Post hoc robustness of the Act-2 tests to the games that ended in a simulator error (ADR-060 item 3; labelled as such, never the registered endpoint).

The registered endpoint drops every pair in which either episode ended in anything but a win or a death, and counts the drops. Simulator errors
are not random: most of them (G6 to G8) happen after the Act-1 boss, which is where this study looks, and an arm could meet them more often. So
the same pooled test is run once more with the games that ended in a simulator error *kept*, scored by the floor they had reached (a run is "past
the Act-2 boss" when it won or its last floor is beyond the boss floor), and the number of errors of each arm by class is listed. Timeouts and any
other ending still drop the pair. This reads the batches' episode files and shares no code with `slay2_sim`.

    python3 scripts/studies/act2/robustness.py --out experiments/act2/robustness-errors.json
"""
from __future__ import annotations

import argparse
import gzip
import json
from fractions import Fraction
from math import comb
from pathlib import Path

CLASSES = ("Ironclad", "Silent", "Regent", "Necrobinder", "Defect")
BOSS_FLOOR_ACT2 = 31


def episodes(batch: Path) -> dict[int, dict]:
    gz, plain = batch / "episodes.jsonl.gz", batch / "episodes.jsonl"
    opener, path = (gzip.open, gz) if gz.exists() else (open, plain)
    with opener(path, "rt", encoding="utf-8") as fh:  # type: ignore[operator]
        return {int(r["seed"]): r for r in (json.loads(line) for line in fh if line.strip())}


def past_act2(r: dict) -> bool:
    return r["outcome"] == "win" or int(r["floor"]) > BOSS_FLOOR_ACT2


def mcnemar_exact(a_only: int, b_only: int) -> float:
    n = a_only + b_only
    if n == 0:
        return 1.0
    return min(1.0, float(Fraction(2 * sum(comb(n, i) for i in range(min(a_only, b_only) + 1)), 2**n)))


def compare(arm: Path, base: Path) -> dict:
    a, b = episodes(arm), episodes(base)
    counted = ("win", "death", "simulator_error")
    shared = sorted(set(a) & set(b))
    pairs = [s for s in shared if a[s]["outcome"] in counted and b[s]["outcome"] in counted]
    fa, fb = [past_act2(a[s]) for s in pairs], [past_act2(b[s]) for s in pairs]
    a_only = sum(1 for x, y in zip(fa, fb) if x and not y)
    b_only = sum(1 for x, y in zip(fa, fb) if y and not x)
    return {
        "pairs": len(pairs), "droppedPairs": len(shared) - len(pairs),
        "errors": {"arm": sum(1 for s in shared if a[s]["outcome"] == "simulator_error"), "baseline": sum(1 for s in shared if b[s]["outcome"] == "simulator_error")},
        "armOnly": a_only, "baselineOnly": b_only, "arm": sum(fa), "baseline": sum(fb), "p": mcnemar_exact(a_only, b_only),
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--batches", type=Path, default=Path("experiments/batches"))
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args(argv)
    sel = json.loads(Path("experiments/act2/dev-selection.json").read_text(encoding="utf-8"))
    arms = {"L": "lead"}
    if sel["P"]["advance"]:
        arms["P"] = sel["P"]["arm"]
    if sel["V"]["advance"]:
        arms["V"] = "v"
    out: dict = {"kind": "act2-robustness-errors", "label": "post hoc, not the registered endpoint: simulator errors kept and scored by the floor reached", "tests": {}}
    for test, arm in arms.items():
        per, tot = {}, {"pairs": 0, "droppedPairs": 0, "armOnly": 0, "baselineOnly": 0, "arm": 0, "baseline": 0, "errors": {"arm": 0, "baseline": 0}}
        for c in CLASSES:
            r = compare(args.batches / f"act2-{arm}-{c.lower()}-a0-veteran-keeprelics-val-n2000", args.batches / f"act2-s-{c.lower()}-a0-veteran-keeprelics-val-n2000")
            per[c] = r
            for k in ("pairs", "droppedPairs", "armOnly", "baselineOnly", "arm", "baseline"):
                tot[k] += r[k]
            for k in ("arm", "baseline"):
                tot["errors"][k] += r["errors"][k]
        tot["p"] = mcnemar_exact(tot["armOnly"], tot["baselineOnly"])
        tot["difference"] = (tot["arm"] - tot["baseline"]) / tot["pairs"]
        out["tests"][test] = {"arm": arm, "pooled": tot, "perClass": per}
        print(f"{test} ({arm}): {tot['pairs']} pairs, past the Act-2 boss {tot['arm']} against {tot['baseline']} (only-arm {tot['armOnly']}, only-S {tot['baselineOnly']}, exact p {tot['p']:.4g}); errors {tot['errors']}")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
