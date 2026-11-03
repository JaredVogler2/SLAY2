#!/usr/bin/env python3
"""The all-pairs analysis of the three Underdocks tests (ADR-064 item 5), a condition of the reading rule.

The registered primary test drops every pair in which either game did not end in a win or a death (a simulator error, a step limit or a timeout). Those
games are not losses, but a pilot whose rule made the simulator fail more often or later would lose or keep pairs *because of* the rule. Nearly all such
errors come after the Act-1 boss (92 % of the errors in the Overgrowth twins of these batches, 881 of the 960), where the endpoint of the test is already known. So the same
pooled test is run once more on every pair of the seeds both batches hold, the endpoint scored as it was *observed*: a game got past the Act-1 boss if it
was won or if it was in a later act when it ended, whatever way it ended, and a game that ended in Act 1 did not.

The reading rule asks this analysis to show the arm ahead (or behind) at an exact McNemar p below 0.05 when the primary test says so, and the primary
test to have dropped at most a tenth of the pairs. This script reads the batches' episode files and shares no code with `slay2_sim`.

    python3 scripts/studies/underdocks/robustness.py --out experiments/underdocks/robustness-all-pairs.json
"""
from __future__ import annotations

import argparse
import gzip
import json
from fractions import Fraction
from math import comb
from pathlib import Path

CLASSES = ("Ironclad", "Silent", "Regent", "Necrobinder", "Defect")
# test key -> (first arm, second arm), as the batch ids name them (the same pairs as pool.sh)
TESTS = {
    "synergy": ("advisor_v1-astar", "advisor_v1-d0star"),
    "values": ("rules_v2-shownvals", "rules_v1"),
    "neow": ("rules_v2_neow_values-keepvals", "rules_v2"),
}
SCHEMA = 1
MAX_EXCLUDED_FRACTION = 0.10
LEVEL = 0.05
VAL_N = 2000


def batch_id(arm: str, cls: str) -> str:
    return f"{arm}-{cls.lower()}-a0-veteran-keeprelics-underdocks-val-n{VAL_N}"


def episodes(batch: Path) -> dict[int, dict]:
    gz, plain = batch / "episodes.jsonl.gz", batch / "episodes.jsonl"
    opener, path = (gzip.open, gz) if gz.exists() else (open, plain)
    with opener(path, "rt", encoding="utf-8") as fh:  # type: ignore[operator]
        return {int(r["seed"]): r for r in (json.loads(line) for line in fh if line.strip())}


def content_hash(batch: Path) -> str | None:
    """The content hash the batch's manifest records (the reader ties the analysis to the batches by it)."""
    try:
        return json.loads((batch / "manifest.json").read_text(encoding="utf-8")).get("content_sha256")
    except (OSError, ValueError):
        return None


def completed(r: dict) -> bool:
    return r["outcome"] in ("win", "death")


def past_boss(r: dict) -> bool:
    """The endpoint as it was observed: won, or in a later act than the first when the game ended (by a death, an error or a timeout)."""
    return r["outcome"] == "win" or int(r["act"]) >= 1


def mcnemar_exact(a_only: int, b_only: int) -> float:
    n = a_only + b_only
    if n == 0:
        return 1.0
    return min(1.0, float(Fraction(2 * sum(comb(n, i) for i in range(min(a_only, b_only) + 1)), 2**n)))


def compare(arm: Path, base: Path) -> dict:
    a, b = episodes(arm), episodes(base)
    shared = sorted(set(a) & set(b))
    primary = [s for s in shared if completed(a[s]) and completed(b[s])]
    fa, fb = [past_boss(a[s]) for s in shared], [past_boss(b[s]) for s in shared]
    a_only = sum(1 for x, y in zip(fa, fb) if x and not y)
    b_only = sum(1 for x, y in zip(fa, fb) if y and not x)
    return {
        "shared": len(shared),
        "primaryPairs": len(primary),
        "pairs": len(shared),
        "notCompleted": {"arm": sum(1 for s in shared if not completed(a[s])), "baseline": sum(1 for s in shared if not completed(b[s]))},
        "armOnly": a_only,
        "baselineOnly": b_only,
        "arm": sum(fa),
        "baseline": sum(fb),
        "p": mcnemar_exact(a_only, b_only),
    }


def add(total: dict, part: dict) -> None:
    for k in ("shared", "primaryPairs", "pairs", "armOnly", "baselineOnly", "arm", "baseline"):
        total[k] += part[k]
    for k in ("arm", "baseline"):
        total["notCompleted"][k] += part["notCompleted"][k]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--batches", type=Path, default=Path("experiments/underdocks/batches"))
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args(argv)
    out: dict = {
        "kind": "underdocks-robustness", "schema": SCHEMA,
        "label": "a condition of the reading rule (ADR-064 item 5): every pair of seeds both batches hold, the endpoint scored as observed (won, or in a later act when the game ended)",
        "maxExcludedFraction": MAX_EXCLUDED_FRACTION, "level": LEVEL, "tests": {}, "contentSha256": {},
    }
    for test, (arm_a, arm_b) in TESTS.items():
        per: dict[str, dict] = {}
        tot = {"shared": 0, "primaryPairs": 0, "pairs": 0, "armOnly": 0, "baselineOnly": 0, "arm": 0, "baseline": 0, "notCompleted": {"arm": 0, "baseline": 0}}
        for c in CLASSES:
            r = compare(args.batches / batch_id(arm_a, c), args.batches / batch_id(arm_b, c))
            per[c] = r
            add(tot, r)
            for who in (arm_a, arm_b):
                out["contentSha256"][batch_id(who, c)] = content_hash(args.batches / batch_id(who, c))
        tot["p"] = mcnemar_exact(tot["armOnly"], tot["baselineOnly"])
        tot["difference"] = (tot["arm"] - tot["baseline"]) / tot["pairs"]
        tot["primaryExcludedFraction"] = 1 - tot["primaryPairs"] / tot["shared"]
        out["tests"][test] = {"arm": arm_a, "baseline": arm_b, "pooled": tot, "perClass": per}
        print(
            f"{test} ({arm_a} against {arm_b}): {tot['pairs']} pairs (the primary kept {tot['primaryPairs']}), past the Act-1 boss {tot['arm']} against "
            f"{tot['baseline']} (only the first {tot['armOnly']}, only the second {tot['baselineOnly']}, exact p {tot['p']:.4g}); not completed {tot['notCompleted']}"
        )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
