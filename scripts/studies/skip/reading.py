"""Reads the pooled files of the price check and applies the rule of ADR-065 item 4 to the numbers alone. Standard library only.

    reading.py --dir experiments/skip --legs og ud [--root .] [--out experiments/skip/reading.json]

The rule: in a leg, the arm that charges for a slot (S1) is **not behind** the baseline (S0) if the lower end of the 95 % whole-seed interval of the pooled
difference in the share that got past the Act-1 boss (S1 minus S0) is above -1.0 point **and** the lower end of the 95 % paired interval of the mean floors
is above -0.25 floors. The price is **harmless as far as the simulation can see** if both legs are not behind. Anything else is **not shown to be harmless**
in that leg (and the registration says what follows). The file also gives, as description and not as part of the rule, the pooled shares and the paired
tables of the Act-2 boss and of the wins, each class on its own (`perClass`), and the share of card rewards each arm skipped (`skipShares`: overall and by
class for both arms, and by act for the arm that charges for a slot, which is the one that counts them).

Before it reads a number it checks, from the pooled file's own batch ids, that side `a` is the arm that charges for a slot and side `b` the baseline, class
for class and in the Act 1 of the leg: the file's policies are `advisor_v1` on both sides, so only the ids say which side is which, and a swapped pairing
would read a price that costs floors as a gain. `--dir` holds the pooled files and, in `batches/`, the batches of the arm that charges for a slot; the
baselines are read from `--root` (the repository: `experiments/batches` for Overgrowth, `experiments/underdocks/batches` for Underdocks).
"""

import argparse
import gzip
import json
from pathlib import Path

BOSS_MARGIN = -0.01  # the pooled share past the Act-1 boss, as a fraction: -1.0 point
FLOOR_MARGIN = -0.25  # the pooled mean floors reached
CLASSES = ["Ironclad", "Silent", "Regent", "Necrobinder", "Defect"]
ROOT = Path(__file__).resolve().parents[3]


def batch_ids(leg: str, cls: str) -> tuple[str, str]:
    """The ids that common.sh gives the two arms of a class in a leg: (S1, the arm that charges for a slot; S0, the baseline)."""
    tail = "-underdocks" if leg == "ud" else ""
    return (f"advisor_v1-slot-{cls.lower()}-a0-veteran-keeprelics{tail}-val-n2000", f"advisor_v1-astar-{cls.lower()}-a0-veteran-keeprelics{tail}-val-n2000")


def batch_dirs(base: Path, root: Path, leg: str, cls: str) -> tuple[Path, Path]:
    """Where those batches are: the arm that charges for a slot under --dir, the baseline in the repository."""
    s1, s0 = batch_ids(leg, cls)
    baselines = root / "experiments" / "underdocks" / "batches" if leg == "ud" else root / "experiments" / "batches"
    return base / "batches" / s1, baselines / s0


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


def check_pairing(d: dict, leg: str, path: Path) -> None:
    """Refuses a pooled file that is not the arm that charges for a slot (a) against the baseline (b), the five classes once each, in the Act 1 of the leg."""
    problems = []
    if d.get("policies") != {"a": "advisor_v1", "b": "advisor_v1"}:
        problems.append(f"policies {d.get('policies')}")
    members: dict[str, list[dict]] = {}
    for m in d.get("members") or []:
        members.setdefault(str(m.get("character")), []).append(m)
    if sorted(members) != sorted(CLASSES) or any(len(v) != 1 for v in members.values()):
        problems.append(f"the classes pooled are {[m.get('character') for m in d.get('members') or []]}, not the five once each")
    for cls in CLASSES:
        for m in members.get(cls, [])[:1]:
            for side, got, want in zip("ab", ((m.get("a") or {}).get("batchId"), (m.get("b") or {}).get("batchId")), batch_ids(leg, cls)):
                if got != want:
                    problems.append(f"{cls}: side {side} is {got}, not {want}")
    if problems:
        raise SystemExit(
            f"reading: {path}: not the pairing of ADR-065 for leg {leg} (side a the arm that charges for a slot, side b the baseline, the five classes once each, "
            "the Act 1 of the leg): " + "; ".join(problems)
        )


def load_pooled(path: Path, leg: str) -> dict:
    d = json.loads(path.read_text(encoding="utf-8"))
    check_pairing(d, leg, path)
    return d


def read_leg(d: dict) -> dict:
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


def classes_on_their_own(d: dict) -> dict:
    """Each class on its own, from the members of the pooled file (a secondary endpoint, ADR-065 item 4: the exact test is the file's, uncorrected)."""
    return {
        m["character"]: {
            "pairs": m["pairedSeeds"], "bothCompleted": m["bothCompleted"],
            "pastActOneBoss": {"s1": m["reachedAct2"]["a"], "s0": m["reachedAct2"]["b"], "onlyS1": m["reachedAct2"]["pairedTable"]["a_only"],
                               "onlyS0": m["reachedAct2"]["pairedTable"]["b_only"], "exactP": m["reachedAct2"]["pairedTable"]["mcnemar_p"]},
            "wins": {"s1": m["a"]["wins"], "s0": m["b"]["wins"]},
            "meanFloorsDifferenceS1MinusS0": m["meanFloorDifference"],
        }
        for m in d["members"]
    }


def arm_shares(per_class: dict[str, dict]) -> dict:
    """The five classes of one arm taken together (from their counts), and each class on its own."""
    parts = list(per_class.values())
    offers, skipped = sum(p["cardRewards"] for p in parts), sum(p["skipped"] for p in parts)
    out: dict = {"cardRewards": offers, "skipped": skipped, "share": round(skipped / offers, 4) if offers else None}
    counting = [p for p in parts if "byAct" in p]
    if counting and len(counting) != len(parts):
        raise SystemExit("reading: some batches of an arm count their card rewards by act and others do not")
    if counting:
        out["byAct"] = {}
        for act in ("act1", "act2", "act3"):
            o, k = sum(p["byAct"][act]["cardRewards"] for p in parts), sum(p["byAct"][act]["skipped"] for p in parts)
            out["byAct"][act] = {"cardRewards": o, "skipped": k, "share": round(k / o, 4) if o else None}
    out["perClass"] = per_class
    return out


def leg_skip_shares(base: Path, root: Path, leg: str, pooled: dict) -> dict:
    """The share of card rewards each arm skipped in a leg, from the batches the pooled file pooled (their content hashes are the ones it recorded)."""
    by_class = {m["character"]: m for m in pooled["members"]}
    per_arm: dict[str, dict[str, dict]] = {"s1": {}, "s0": {}}
    for cls in CLASSES:
        for (arm, side), directory in zip((("s1", "a"), ("s0", "b")), batch_dirs(base, root, leg, cls)):
            try:
                recorded = json.loads((directory / "manifest.json").read_text(encoding="utf-8")).get("content_sha256")
                if recorded != by_class[cls][side]["contentSha256"]:
                    raise SystemExit(f"reading: {directory} is not the batch the pooled file pooled (its content hash is {recorded}, the file has {by_class[cls][side]['contentSha256']})")
                per_arm[arm][cls] = skip_share(directory)
            except (OSError, ValueError) as e:
                raise SystemExit(f"reading: cannot read the batch {directory} for the share of card rewards skipped (--root is {root}): {e}") from e
    return {arm: arm_shares(per_class) for arm, per_class in per_arm.items()}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="holds pooled-slot-<leg>.json and batches/, the batches of the arm that charges for a slot")
    ap.add_argument("--legs", nargs="+", default=["og", "ud"], choices=["og", "ud"])
    ap.add_argument("--root", default=str(ROOT), help="the repository, where the baselines are (experiments/batches, experiments/underdocks/batches)")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    base, root = Path(args.dir), Path(args.root)
    pooled = {leg: load_pooled(base / f"pooled-slot-{leg}.json", leg) for leg in args.legs}
    legs = {leg: read_leg(d) | {"perClass": classes_on_their_own(d)} for leg, d in pooled.items()}
    result = {
        "schema": 1,
        "kind": "skip-reading",
        "rule": {"firstBossLowerEndAbove": BOSS_MARGIN, "meanFloorsLowerEndAbove": FLOOR_MARGIN, "interval": "95 %"},
        "legs": legs,
        "skipShares": {leg: leg_skip_shares(base, root, leg, d) for leg, d in pooled.items()},
        "harmless": all(v["verdict"] == "not behind" for v in legs.values()) and set(args.legs) == {"og", "ud"},
    }
    if args.out:
        Path(args.out).write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({leg: v["verdict"] for leg, v in legs.items()} | {"harmless": result["harmless"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
