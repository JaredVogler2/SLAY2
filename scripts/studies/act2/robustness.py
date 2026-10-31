#!/usr/bin/env python3
"""The observed-endpoint analysis of the Act-2 tests (ADR-060 addendum B), a condition of the reading rule.

The registered primary endpoint drops every pair in which either episode did not end in a win or a death. Most of the games that end in a
simulator error do so after the Act-1 boss, and an error in the third act ends a game that has *already got past the Act-2 boss*: in the
baseline's games of ADR-058, 55 of 1,086 passers were dropped for that reason, and an arm whose third-act errors differ in number would then
look better or worse than it is. So the same pooled test is run once more on every pair whose two endpoints are known:

* a game that ended in a win or a death: the run got past the Act-2 boss when it won or its last act index is 2 or more (the definition of
  `slay2_sim.compare`);
* a game that ended in a simulator error, a step limit or a timeout: the run got past the Act-2 boss when its last act index is 2 or more (it
  had), and its endpoint is unknown when the index is 0 or 1 (the pair is dropped, and counted).

The reading rule asks this analysis to show the arm ahead (or behind) at an exact McNemar p below 0.05 when the primary says so, and the share
of pairs the primary dropped to be at most a tenth. This script reads the batches' episode files and shares no code with `slay2_sim`.

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
SCHEMA = 2
MAX_EXCLUDED_FRACTION = 0.10
LEVEL = 0.05


def episodes(batch: Path) -> dict[int, dict]:
    gz, plain = batch / "episodes.jsonl.gz", batch / "episodes.jsonl"
    opener, path = (gzip.open, gz) if gz.exists() else (open, plain)
    with opener(path, "rt", encoding="utf-8") as fh:  # type: ignore[operator]
        return {int(r["seed"]): r for r in (json.loads(line) for line in fh if line.strip())}


def completed(r: dict) -> bool:
    return r["outcome"] in ("win", "death")


def endpoint(r: dict) -> bool | None:
    """True: got past the Act-2 boss. False: did not. None: unknown (the game ended in an error or a timeout before the Act-2 boss was passed)."""
    if r["outcome"] == "win":
        return True
    if int(r["act"]) >= 2:
        return True
    return False if completed(r) else None


def mcnemar_exact(a_only: int, b_only: int) -> float:
    n = a_only + b_only
    if n == 0:
        return 1.0
    return min(1.0, float(Fraction(2 * sum(comb(n, i) for i in range(min(a_only, b_only) + 1)), 2**n)))


def compare(arm: Path, base: Path) -> dict:
    a, b = episodes(arm), episodes(base)
    shared = sorted(set(a) & set(b))
    primary = [s for s in shared if completed(a[s]) and completed(b[s])]
    known = [s for s in shared if endpoint(a[s]) is not None and endpoint(b[s]) is not None]
    fa, fb = [bool(endpoint(a[s])) for s in known], [bool(endpoint(b[s])) for s in known]
    a_only = sum(1 for x, y in zip(fa, fb) if x and not y)
    b_only = sum(1 for x, y in zip(fa, fb) if y and not x)
    errored_pass = {
        "arm": sum(1 for s in shared if not completed(a[s]) and endpoint(a[s]) is True),
        "baseline": sum(1 for s in shared if not completed(b[s]) and endpoint(b[s]) is True),
    }
    return {
        "shared": len(shared),
        "primaryPairs": len(primary),
        "pairs": len(known),
        "droppedUnknown": len(shared) - len(known),
        "erroredAfterTheBoss": errored_pass,
        "armOnly": a_only,
        "baselineOnly": b_only,
        "arm": sum(fa),
        "baseline": sum(fb),
        "p": mcnemar_exact(a_only, b_only),
    }


def add(total: dict, part: dict) -> None:
    for k in ("shared", "primaryPairs", "pairs", "droppedUnknown", "armOnly", "baselineOnly", "arm", "baseline"):
        total[k] += part[k]
    for k in ("arm", "baseline"):
        total["erroredAfterTheBoss"][k] += part["erroredAfterTheBoss"][k]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--batches", type=Path, default=Path("experiments/batches"))
    ap.add_argument("--selection", type=Path, default=Path("experiments/act2/dev-selection.json"))
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args(argv)
    sel = json.loads(args.selection.read_text(encoding="utf-8"))
    arms = {"L": "lead"}
    if sel["P"]["advance"]:
        arms["P"] = sel["P"]["arm"]
    if sel["V"]["advance"]:
        arms["V"] = "v"
    out: dict = {
        "kind": "act2-robustness", "schema": SCHEMA,
        "label": "a condition of the reading rule (ADR-060 addendum B): every pair whose two endpoints are known, errors after the Act-2 boss counted as passes",
        "maxExcludedFraction": MAX_EXCLUDED_FRACTION, "level": LEVEL, "tests": {},
    }
    for test, arm in arms.items():
        per: dict[str, dict] = {}
        tot = {"shared": 0, "primaryPairs": 0, "pairs": 0, "droppedUnknown": 0, "armOnly": 0, "baselineOnly": 0, "arm": 0, "baseline": 0, "erroredAfterTheBoss": {"arm": 0, "baseline": 0}}
        for c in CLASSES:
            r = compare(args.batches / f"act2-{arm}-{c.lower()}-a0-veteran-keeprelics-val-n2000", args.batches / f"act2-s-{c.lower()}-a0-veteran-keeprelics-val-n2000")
            per[c] = r
            add(tot, r)
        tot["p"] = mcnemar_exact(tot["armOnly"], tot["baselineOnly"])
        tot["difference"] = (tot["arm"] - tot["baseline"]) / tot["pairs"]
        tot["primaryExcludedFraction"] = 1 - tot["primaryPairs"] / tot["shared"]
        out["tests"][test] = {"arm": arm, "pooled": tot, "perClass": per}
        print(
            f"{test} ({arm}): {tot['pairs']} pairs with both endpoints known ({tot['droppedUnknown']} dropped; the primary kept {tot['primaryPairs']} of {tot['shared']}), "
            f"past the Act-2 boss {tot['arm']} against {tot['baseline']} (only-arm {tot['armOnly']}, only-S {tot['baselineOnly']}, exact p {tot['p']:.4g}); "
            f"errored after the boss {tot['erroredAfterTheBoss']}"
        )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
