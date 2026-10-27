"""Do the six arms of the Ascension 9 study play, and is the Ascension in force? (ADR-058 item 6)

Reads <dir>/<arm>-<class>/ (episode files and manifests of the same 100 development seeds per class) and checks, per arm and class:
(a) every game says Ascension 9 (Ascension 0 for the comparator `a0shown`), the exact class asked for, the relics kept, the class start
    verified and the canonical process state; (b) at least 90 % of the games ended in a win or a death, and none in a policy error, an
    invalid action, a harness error or an abort; and over the five classes (c) the pilot that follows the shown card values gets past the
    Act-1 boss in fewer games at Ascension 9 than at Ascension 0 on the same seeds. Standard library only.
"""

import argparse
import gzip
import json
from pathlib import Path

CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"]
ARMS = {"astar": 9, "d0star": 9, "shown": 9, "v1": 9, "neow": 9, "base": 9, "a0shown": 0}
EXACT = {"ironclad": "Ironclad", "silent": "Silent", "regent": "Regent", "necrobinder": "Necrobinder", "defect": "Defect"}
BAD = ("policy_error", "invalid_action", "harness_error", "aborted")


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
    arms: dict[str, dict] = {}
    heads: set[str] = set()
    all_a = all_b = True
    for arm, asc in ARMS.items():
        per_class = {}
        for cls in CLASSES:
            rows, man = load(base / f"{arm}-{cls}")
            counts: dict[str, int] = {}
            for r in rows:
                counts[r["outcome"]] = counts.get(r["outcome"], 0) + 1
            completed = counts.get("win", 0) + counts.get("death", 0)
            env = (man.get("environment") or {}).get("slay2") or {}
            heads.add(str(env.get("head")))
            cfg = man.get("config") or {}
            a_ok = (
                len(rows) == 100
                and all(r["ascension"] == asc and r["character"] == EXACT[cls] for r in rows)
                and cfg.get("ascension") == asc
                and cfg.get("keep_relics") is True
                and man.get("class_start_verified") is True
                and man.get("canonical_process_state") is True
            )
            b_ok = completed >= 90 and not any(counts.get(k, 0) for k in BAD)
            all_a = all_a and a_ok
            all_b = all_b and b_ok
            done = [r for r in rows if r["outcome"] in ("win", "death")]
            per_class[cls] = {
                "games": len(rows),
                "counts": dict(sorted(counts.items())),
                "completed": completed,
                "wins": counts.get("win", 0),
                "pastActOneBoss": sum(1 for r in done if past_boss(r)),
                "meanFloor": round(sum(r["floor"] for r in done) / completed, 2) if completed else None,
                "recordsOk": a_ok,
                "playsOk": b_ok,
                "errors": sorted({str(r.get("error"))[:80] for r in rows if r["outcome"] == "simulator_error"}),
            }
        arms[arm] = {"ascension": asc, "classes": per_class}
    pooled = {
        arm: {
            "completed": sum(c["completed"] for c in arms[arm]["classes"].values()),
            "pastActOneBoss": sum(c["pastActOneBoss"] for c in arms[arm]["classes"].values()),
        }
        for arm in ("shown", "a0shown")
    }
    rate = {arm: pooled[arm]["pastActOneBoss"] / pooled[arm]["completed"] for arm in pooled}
    harder = rate["shown"] < rate["a0shown"]
    report = {
        "schema": 1,
        "kind": "ascension9-precondition",
        "claim": "the six arms of ADR-058 play at Ascension 9 with the relics kept in all five classes, and the Ascension is in force",
        "partition": "dev",
        "seeds": "dev[0:100) of experiments/seeds/ironclad-a0-v2.json, per class",
        "criteria": {
            "a_records": all_a,
            "b_plays": all_b,
            "c_ascension_in_force": harder,
        },
        "passed": bool(all_a and all_b and harder),
        "pooledShownValues": {
            "ascension9": {**pooled["shown"], "rate": round(rate["shown"], 4)},
            "ascension0": {**pooled["a0shown"], "rate": round(rate["a0shown"], 4)},
        },
        "heads": sorted(heads),
        "arms": arms,
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"criteria": report["criteria"], "passed": report["passed"], "pooledShownValues": report["pooledShownValues"]}, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
