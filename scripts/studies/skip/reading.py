"""Reads the pooled files of the price check and applies the rule of ADR-065 item 4 to the numbers alone. Standard library only.

    reading.py --dir experiments/skip --legs og ud [--out experiments/skip/reading.json]

The rule: in a leg, the arm that charges for a slot (S1) is **not behind** the baseline (S0) if the lower end of the 95 % whole-seed interval of the pooled
difference in the share that got past the Act-1 boss (S1 minus S0) is above -1.0 point **and** the lower end of the 95 % paired interval of the mean floors
is above -0.25 floors. The price is **harmless as far as the simulation can see** if both legs are not behind. Anything else is **not shown to be harmless**
in that leg (and the registration says what follows). The file also gives, as description and not as part of the rule, the pooled shares and the paired
tables of the Act-2 boss and of the wins, and the share of card rewards each arm skipped.
"""

import argparse
import gzip
import json
from pathlib import Path

BOSS_MARGIN = -0.01  # the pooled share past the Act-1 boss, as a fraction: -1.0 point
FLOOR_MARGIN = -0.25  # the pooled mean floors reached


def skip_share(batch: Path) -> dict:
    gz = batch / "episodes.jsonl.gz"
    raw = gzip.open(gz, "rt", encoding="utf-8").read() if gz.exists() else (batch / "episodes.jsonl").read_text(encoding="utf-8")
    offers = skipped = 0
    by_act = {"0": [0, 0], "1": [0, 0], "2": [0, 0]}
    for line in raw.splitlines():
        if not line.strip():
            continue
        stats = ((json.loads(line).get("extra") or {}).get("advisor")) or {}
        offers += int(stats.get("offers", 0))
        skipped += int(stats.get("skipped", 0))
        for act, v in (stats.get("by_act") or {}).items():
            by_act[act][0] += int(v["offers"])
            by_act[act][1] += int(v["skipped"])
    out = {"cardRewards": offers, "skipped": skipped, "share": round(skipped / offers, 4) if offers else None}
    if any(v[0] for v in by_act.values()):
        out["byAct"] = {f"act{int(a) + 1}": {"cardRewards": v[0], "skipped": v[1], "share": round(v[1] / v[0], 4) if v[0] else None} for a, v in by_act.items()}
    return out


def read_leg(path: Path) -> dict:
    d = json.loads(path.read_text(encoding="utf-8"))
    boss = d["clusteredDifference"]
    floors = d["floorDifference"]
    boss_lo, floor_lo = float(boss["ci95"][0]), float(floors["ci95"][0])
    return {
        "pairs": d["pairedSeeds"],
        "bothCompleted": d["bothCompleted"],
        "excludedNotCompleted": d["excludedNotCompleted"],
        "pastActOneBoss": {"s1": d["reachedAct2"]["a"]["rate"], "s0": d["reachedAct2"]["b"]["rate"], "differenceS1MinusS0": boss["meanAMinusB"],
                           "interval95": boss["ci95"], "onlyS1": d["reachedAct2"]["pairedTable"]["a_only"], "onlyS0": d["reachedAct2"]["pairedTable"]["b_only"],
                           "exactP": d["reachedAct2"]["pairedTable"]["mcnemar_p"]},
        "meanFloors": {"differenceS1MinusS0": floors["meanAMinusB"], "interval95": floors["ci95"]},
        "pastActTwoBoss": {"s1": d["reachedAct3"]["a"]["rate"], "s0": d["reachedAct3"]["b"]["rate"], "onlyS1": d["reachedAct3"]["pairedTable"]["a_only"],
                           "onlyS0": d["reachedAct3"]["pairedTable"]["b_only"], "exactP": d["reachedAct3"]["pairedTable"]["mcnemar_p"]},
        "wins": {"s1": d["wins"]["a"], "s0": d["wins"]["b"], "onlyS1": d["wins"]["pairedTable"]["a_only"], "onlyS0": d["wins"]["pairedTable"]["b_only"]},
        "notBehind": {"firstBoss": boss_lo > BOSS_MARGIN, "floors": floor_lo > FLOOR_MARGIN, "firstBossLowerEnd": boss_lo, "floorsLowerEnd": floor_lo},
        "verdict": "not behind" if (boss_lo > BOSS_MARGIN and floor_lo > FLOOR_MARGIN) else "not shown to be harmless",
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--legs", nargs="+", default=["og", "ud"], choices=["og", "ud"])
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    base = Path(args.dir)
    legs = {leg: read_leg(base / f"pooled-slot-{leg}.json") for leg in args.legs}
    result = {
        "schema": 1,
        "kind": "skip-reading",
        "rule": {"firstBossLowerEndAbove": BOSS_MARGIN, "meanFloorsLowerEndAbove": FLOOR_MARGIN, "interval": "95 %"},
        "legs": legs,
        "harmless": all(v["verdict"] == "not behind" for v in legs.values()) and set(args.legs) == {"og", "ud"},
    }
    if args.out:
        Path(args.out).write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({leg: v["verdict"] for leg, v in legs.items()} | {"harmless": result["harmless"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
