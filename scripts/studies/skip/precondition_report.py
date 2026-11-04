"""Do the two arms of the price check play in each Act 1, and does the price bite? (ADR-065 item 6)

Reads <dir>/<leg>-<arm>-<class>/ (episode files and manifests of the same 100 development seeds per class) for the legs `og` (Act 1 in Overgrowth) and
`ud` (Underdocks) and the arms `s0` (the pilot with version 1's price) and `s1` (the pilot that charges one point from the 21st card on), and checks:
(a) every game says the Act 1 of its leg (nothing for Overgrowth, `underdocks` and a named boss for Underdocks), Ascension 0, the exact class asked
    for, the relics kept, the class start verified and the canonical process state, and the price the arm is meant to charge (s1 names it; s0 does not);
(b) at least 90 % of the games end in a win or a death, and none in a policy error, an invalid action, a harness error or an abort;
(c) the price bites: in each leg, over the five classes, s1 skips a larger share of the card rewards it meets than s0, by at least two points.
Standard library only.
"""

import argparse
import gzip
import json
from pathlib import Path

CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"]
EXACT = {"ironclad": "Ironclad", "silent": "Silent", "regent": "Regent", "necrobinder": "Necrobinder", "defect": "Defect"}
BAD = ("policy_error", "invalid_action", "harness_error", "aborted")
UNDERDOCKS_BOSSES = {"LagavulinMatriarchBoss", "SoulFyshBoss", "WaterfallGiantBoss"}
MIN_GAP = 0.02


def load(batch: Path) -> tuple[list[dict], dict]:
    gz = batch / "episodes.jsonl.gz"
    raw = gzip.open(gz, "rt", encoding="utf-8").read() if gz.exists() else (batch / "episodes.jsonl").read_text(encoding="utf-8")
    rows = [json.loads(line) for line in raw.splitlines() if line.strip()]
    return rows, json.loads((batch / "manifest.json").read_text(encoding="utf-8"))


def past_boss(r: dict) -> bool:
    return r["outcome"] == "win" or int(r["act"]) >= 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    base = Path(args.dir)
    legs: dict[str, dict] = {}
    heads: set[str] = set()
    all_a = all_b = True
    rows_of: dict[tuple[str, str, str], list[dict]] = {}
    for leg in ("og", "ud"):
        arms = {}
        for arm in ("s0", "s1"):
            per_class = {}
            offers = skipped = 0
            for cls in CLASSES:
                rows, man = load(base / f"{leg}-{arm}-{cls}")
                rows_of[(leg, arm, cls)] = rows
                counts: dict[str, int] = {}
                for r in rows:
                    counts[r["outcome"]] = counts.get(r["outcome"], 0) + 1
                completed = counts.get("win", 0) + counts.get("death", 0)
                env = (man.get("environment") or {}).get("slay2") or {}
                heads.add(str(env.get("head")))
                cfg = man.get("config") or {}
                params = (man.get("policy") or {}).get("params") or {}
                if leg == "ud":
                    act_ok = (
                        cfg.get("act1") == "underdocks"
                        and all(((r.get("extra") or {}).get("act1") or {}).get("version") == "underdocks" for r in rows)
                        and all(((r.get("extra") or {}).get("act1") or {}).get("boss") in UNDERDOCKS_BOSSES for r in rows)
                    )
                else:
                    act_ok = "act1" not in cfg and all("act1" not in (r.get("extra") or {}) for r in rows)
                price_ok = (params.get("size") == 1.0 and params.get("size_from") == 20.0) if arm == "s1" else ("size" not in params and "size_from" not in params)
                a_ok = (
                    len(rows) == 100
                    and all(r["ascension"] == 0 and r["character"] == EXACT[cls] for r in rows)
                    and cfg.get("ascension") == 0
                    and cfg.get("keep_relics") is True
                    and man.get("class_start_verified") is True
                    and man.get("canonical_process_state") is True
                    and act_ok
                    and price_ok
                )
                b_ok = completed >= 90 and not any(counts.get(k, 0) for k in BAD)
                all_a, all_b = all_a and a_ok, all_b and b_ok
                o = sum(int(((r.get("extra") or {}).get("advisor") or {}).get("offers", 0)) for r in rows)
                k = sum(int(((r.get("extra") or {}).get("advisor") or {}).get("skipped", 0)) for r in rows)
                offers, skipped = offers + o, skipped + k
                per_class[cls] = {"games": len(rows), "counts": dict(sorted(counts.items())), "completed": completed, "cardRewards": o, "skipped": k,
                                  "recordsOk": a_ok, "playsOk": b_ok}
            arms[arm] = {"cardRewards": offers, "skipped": skipped, "skipShare": round(skipped / offers, 4) if offers else None, "classes": per_class}
        legs[leg] = arms
    # description for the power paragraph of the registration, from the same development games; nothing is decided by it
    pairs: dict[str, dict] = {}
    for leg in ("og", "ud"):
        both = only1 = only0 = 0
        floors = []
        for cls in CLASSES:
            a = {r["seed"]: r for r in rows_of[(leg, "s1", cls)] if r["outcome"] in ("win", "death")}
            b = {r["seed"]: r for r in rows_of[(leg, "s0", cls)] if r["outcome"] in ("win", "death")}
            for seed in a.keys() & b.keys():
                both += 1
                pa, pb = past_boss(a[seed]), past_boss(b[seed])
                only1 += pa and not pb
                only0 += pb and not pa
                floors.append(a[seed]["floor"] - b[seed]["floor"])
        n = len(floors)
        mean = sum(floors) / n if n else 0.0
        sd = (sum((f - mean) ** 2 for f in floors) / (n - 1)) ** 0.5 if n > 1 else 0.0
        pairs[leg] = {"bothCompleted": both, "pastActOneBossOnlyS1": only1, "pastActOneBossOnlyS0": only0,
                      "pairsThatDifferInTheBossOutcome": only1 + only0, "meanFloorDifferenceS1MinusS0": round(mean, 3), "sdOfFloorDifference": round(sd, 3)}
    bites = {leg: (legs[leg]["s1"]["skipShare"] or 0) - (legs[leg]["s0"]["skipShare"] or 0) >= MIN_GAP for leg in legs}
    report = {
        "schema": 1,
        "kind": "skip-precondition",
        "claim": "the two arms of ADR-065 play in each Act 1 with the relics kept in all five classes, and the price of a slot bites",
        "partition": "dev",
        "seeds": "dev[0:100) of experiments/seeds/ironclad-a0-v2.json, per class",
        "criteria": {"a_records": all_a, "b_plays": all_b, "c_the_price_bites": all(bites.values())},
        "minimumGapInSkipShare": MIN_GAP,
        "passed": bool(all_a and all_b and all(bites.values())),
        "heads": sorted(heads),
        "legs": legs,
        "developmentPairs": pairs,
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"criteria": report["criteria"], "passed": report["passed"], "skipShares": {leg: {a: legs[leg][a]["skipShare"] for a in legs[leg]} for leg in legs}}, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
