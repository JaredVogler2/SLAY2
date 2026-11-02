"""Do the six arms of the Underdocks study play, is Underdocks in force, and can the act be got through? (ADR-064 item 6)

Reads <dir>/<arm>-<class>/ (episode files and manifests of the same 100 development seeds per class) and checks, per arm and class:
(a) every game says Act 1 in Underdocks (Overgrowth for the comparator `ogshown`), Ascension 0, the exact class asked for, the relics kept, the
    class start verified and the canonical process state, and, for a game in Underdocks, names one of the three Underdocks bosses;
(b) at least 90 % of the games ended in a win or a death, and none in a policy error, an invalid action, a harness error or an abort;
and over the five classes
(c) Underdocks is in force: every Underdocks game names an Underdocks boss, all three bosses are met in every arm of the study, and no
    comparator game names one;
(d) the act can be got through: the pilot that follows the shown card values gets past the Act-1 boss in at least 10 % of its completed games
    (a floor that says the tests have something to measure, not a claim about how hard the act is).
Standard library only.
"""

import argparse
import gzip
import json
from pathlib import Path

CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"]
ARMS = ["astar", "d0star", "shown", "v1", "neow", "base", "ogshown"]
EXACT = {"ironclad": "Ironclad", "silent": "Silent", "regent": "Regent", "necrobinder": "Necrobinder", "defect": "Defect"}
BAD = ("policy_error", "invalid_action", "harness_error", "aborted")
UNDERDOCKS_BOSSES = {"LagavulinMatriarchBoss", "SoulFyshBoss", "WaterfallGiantBoss"}
MIN_PASS_RATE = 0.10


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
    bosses_by_arm: dict[str, set[str]] = {}
    for arm in ARMS:
        underdocks = arm != "ogshown"
        per_class = {}
        bosses_by_arm[arm] = set()
        for cls in CLASSES:
            rows, man = load(base / f"{arm}-{cls}")
            counts: dict[str, int] = {}
            for r in rows:
                counts[r["outcome"]] = counts.get(r["outcome"], 0) + 1
            completed = counts.get("win", 0) + counts.get("death", 0)
            env = (man.get("environment") or {}).get("slay2") or {}
            heads.add(str(env.get("head")))
            cfg = man.get("config") or {}
            named = [((r.get("extra") or {}).get("act1") or {}).get("boss") for r in rows]
            bosses_by_arm[arm].update(b for b in named if b)
            act_ok = (
                all(((r.get("extra") or {}).get("act1") or {}).get("version") == "underdocks" for r in rows)
                and all(b in UNDERDOCKS_BOSSES for b in named)
                and cfg.get("act1") == "underdocks"
                if underdocks
                else all("act1" not in (r.get("extra") or {}) for r in rows) and "act1" not in cfg
            )
            a_ok = (
                len(rows) == 100
                and all(r["ascension"] == 0 and r["character"] == EXACT[cls] for r in rows)
                and cfg.get("ascension") == 0
                and cfg.get("keep_relics") is True
                and man.get("class_start_verified") is True
                and man.get("canonical_process_state") is True
                and act_ok
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
        arms[arm] = {"act1": "underdocks" if underdocks else "overgrowth", "bosses": sorted(bosses_by_arm[arm]), "classes": per_class}
    in_force = all(bosses_by_arm[a] == UNDERDOCKS_BOSSES for a in ARMS if a != "ogshown") and not (bosses_by_arm["ogshown"] & UNDERDOCKS_BOSSES)
    pooled = {
        arm: {
            "completed": sum(c["completed"] for c in arms[arm]["classes"].values()),
            "pastActOneBoss": sum(c["pastActOneBoss"] for c in arms[arm]["classes"].values()),
        }
        for arm in ("shown", "ogshown")
    }
    rate = {arm: pooled[arm]["pastActOneBoss"] / pooled[arm]["completed"] for arm in pooled}
    passable = rate["shown"] >= MIN_PASS_RATE
    report = {
        "schema": 1,
        "kind": "underdocks-precondition",
        "claim": "the six arms of ADR-064 play in Underdocks with the relics kept in all five classes, Underdocks is in force, and the act can be got through",
        "partition": "dev",
        "seeds": "dev[0:100) of experiments/seeds/ironclad-a0-v2.json, per class",
        "criteria": {
            "a_records": all_a,
            "b_plays": all_b,
            "c_underdocks_in_force": in_force,
            "d_the_act_can_be_got_through": passable,
        },
        "passed": bool(all_a and all_b and in_force and passable),
        "floorForD": MIN_PASS_RATE,
        "pooledShownValues": {
            "underdocks": {**pooled["shown"], "rate": round(rate["shown"], 4)},
            "overgrowth": {**pooled["ogshown"], "rate": round(rate["ogshown"], 4)},
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
