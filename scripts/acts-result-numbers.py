#!/usr/bin/env python3
"""Print the numbers of the result section of ADR-061 from the exporter's output, so that nothing in the record is typed by hand.

    node scripts/export-site-data.mjs                      (reads the pooled files, the all-pairs analysis, the design checks and the recomputation strictly)
    python3 scripts/acts-result-numbers.py [acts.generated.json] > result-numbers.md
    python3 scripts/acts-result-numbers.py --arms [--batches experiments/batches]

The prose around the numbers is written by hand. Without a flag this reads `apps/web/src/content/acts.generated.json` (never the batches) and
prints, for each of the four tests, the pooled figures, the two readings (the registered primary test and the all-pairs analysis of item 4), what
the reading rule gave and which conditions withheld it, the shares past the first and the second boss, mean floors, each class on its own and what
the independent recomputation found. With `--arms` it reads the manifests and audit records of the 25 held-out batches (and nothing else) and prints,
per arm, the games, the completed games, the wins, the simulator errors and the timeouts, the commit they were played from and what the audits found.
It lives outside `scripts/studies/acts/` on purpose: that directory is frozen from the commit that registers the held-out run.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "apps" / "web" / "src" / "content" / "acts.generated.json"
BATCHES = ROOT / "experiments" / "batches"
ARMS = {
    "s": "S (`s`, the baseline)",
    "lead": "L (`lead`)",
    "a1": "A1 (`a1`)",
    "a2": "A2 (`a2`)",
    "a3": "A3 (`a3`)",
}
BATCH_GLOB = "acts-{arm}-*-a0-veteran-keeprelics-val2-n3000"
NAMES = {
    "L": "L (`lead`: threshold 0.2 in every act)",
    "A1": "A1 (`a1`: 0.2 in the card rewards of Act 1 only)",
    "A2": "A2 (`a2`: 0.2 in the card rewards of Act 2 only)",
    "A3": "A3 (`a3`: 0.2 in the card rewards of Act 3 only)",
}
VERDICT = {"passed": "passed", "not-shown": "not shown", "reversed": "reversed"}
WITHHELD = {"robustness": "the all-pairs analysis did not show the same difference at an exact p below 0.05", "excluded": "more than a tenth of the pairs were dropped"}


def pct(x: float, d: int = 2) -> str:
    return f"{100 * x:.{d}f} %"


def pts(x: float, d: int = 2) -> str:
    return f"{'+' if x >= 0 else '-'}{abs(100 * x):.{d}f} points"


def pval(p: float) -> str:
    return "p < 1e-300" if p == 0 else (f"p = {p:.4g}" if p >= 1e-4 else f"p = {p:.2e}")


def arm_lines(batches: Path) -> list[str]:
    """Per arm over its class batches: games, completed games, wins, simulator errors, timeouts; then the commit(s) the batches were played from and the audits."""
    lines: list[str] = []
    heads: set[str] = set()
    dirty: set[bool] = set()
    overall: Counter[str] = Counter()
    for arm, name in ARMS.items():
        tot: Counter[str] = Counter()
        dirs = sorted(batches.glob(BATCH_GLOB.format(arm=arm)))
        for d in dirs:
            m = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
            s = m["summary"]
            tot["batches"] += 1
            tot["games"] += s["episodes"]
            tot["completed"] += s["completed"]
            for k in ("win", "simulator_error", "timeout"):
                tot[k] += s["counts"].get(k, 0)
            env = (m.get("environment") or {}).get("slay2") or {}
            heads.add(str(env.get("head")))
            dirty.add(bool(env.get("dirty")))
            if s["counts"].get("win", 0):
                w = json.loads((d / "wins-audit.json").read_text(encoding="utf-8"))
                overall["winBatches"] += 1
                overall["winsAudited"] += w["wins_audited"]
                overall["winsVerified"] += w["wins_verified"]
            a = json.loads((d / "sample-audit.json").read_text(encoding="utf-8"))
            overall["sampleBatches"] += 1
            overall["sampleBatchesPassed"] += 1 if a["all_verified"] is True else 0
            overall["sampleGames"] += a["sample"]["drawn"]
            overall["sampleVerified"] += a["verified"]
        for k, v in tot.items():
            overall[k] += v
        lines.append(
            f"- {name}: {tot['batches']} batches, {tot['games']:,} games, {tot['completed']:,} completed, {tot['win']:,} wins, "
            f"{tot['simulator_error']:,} simulator errors, {tot['timeout']:,} timeouts."
        )
    lines.append(
        f"- All arms: {overall['batches']} batches, {overall['games']:,} games, {overall['completed']:,} completed, {overall['win']:,} wins, "
        f"{overall['simulator_error']:,} simulator errors, {overall['timeout']:,} timeouts."
    )
    lines.append(
        f"- Played from {len(heads)} commit{'' if len(heads) == 1 else 's'} ({', '.join(sorted(h[:12] for h in heads))}); "
        f"tree dirty: {'yes' if True in dirty else 'no'}."
    )
    lines.append(
        f"- Audits: {overall['winsVerified']:,} of {overall['winsAudited']:,} audited wins re-derived (in {overall['winBatches']} batches that have a win); "
        f"{overall['sampleBatchesPassed']} of {overall['sampleBatches']} sample audits passed ({overall['sampleVerified']:,} of {overall['sampleGames']:,} sampled games verified)."
    )
    return lines


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("data", nargs="?", type=Path, default=DATA, help="the exporter's acts.generated.json")
    ap.add_argument("--arms", action="store_true", help="print the per-arm counts of the held-out batches instead of the tests")
    ap.add_argument("--batches", type=Path, default=BATCHES)
    args = ap.parse_args(argv)
    if args.arms:
        if not any(args.batches.glob(BATCH_GLOB.format(arm="s"))):
            print(f"no held-out batch of the acts study under {args.batches}", file=sys.stderr)
            return 1
        print("\n".join(arm_lines(args.batches)))
        return 0
    d = json.loads(args.data.read_text(encoding="utf-8"))
    if not d.get("registered") or not d.get("tests"):
        print("no test result in the exporter's output yet", file=sys.stderr)
        return 1
    tests = d["tests"]["results"]
    level = d["level"]
    for key in ("L", "A1", "A2", "A3"):
        t = tests[key]
        print(f"### Test {NAMES[key]} against S")
        print(
            f"- **Primary (item 3):** {t['pairs']:,} paired games from {t['pairedSeeds']:,} paired seeds ({t['excluded']:,} pairs excluded because a game did not complete: "
            f"{t['notFinished']['a']:,} of the arm's, {t['notFinished']['b']:,} of S's); games won {pct(t['shares']['arm'])} against {pct(t['shares']['baseline'])} "
            f"({t['wins']['arm']:,} against {t['wins']['baseline']:,}), difference {pts(t['difference'])}, whole-seed interval at the level 1 - 0.05 / 4 = {1 - level:.4f} {pts(t['ci'][0])} to {pts(t['ci'][1])} "
            f"(95 %: {pts(t['ci95'][0])} to {pts(t['ci95'][1])}); {t['armOnly']:,} pairs won only by the arm against {t['baselineOnly']:,} only by S, exact McNemar {pval(t['p'])}. "
            f"Primary reading: **{VERDICT[t['primaryVerdict']]}**."
        )
        r = t["robust"]
        print(
            f"- **All-pairs analysis (item 4):** {r['pairs']:,} pairs, a game that did not end in a win scored as not won ({r['notCompleted']['arm']:,} of the arm's and {r['notCompleted']['baseline']:,} of S's games "
            f"did not complete); {r['wins']['arm']:,} against {r['wins']['baseline']:,} won, {pct(r['shares']['arm'])} against {pct(r['shares']['baseline'])}, {pts(r['difference'])}, "
            f"{r['armOnly']:,} against {r['baselineOnly']:,}, exact {pval(r['p'])}. Share of the primary's pairs dropped: {pct(t['excludedFraction'])}."
        )
        why = "nothing was withheld" if not t["downgrades"] else "withheld because " + " and because ".join(WITHHELD[x] for x in t["downgrades"])
        print(f"- **Reading by the rule of item 4: {VERDICT[t['verdict']].upper()}** ({why}).")
        a, b = t["actOne"], t["actTwo"]
        print(
            f"- **Past the Act-1 boss:** {pct(a['shares']['arm'])} against {pct(a['shares']['baseline'])} ({a['armOnly']:,} pairs only the arm, {a['baselineOnly']:,} only S, exact {pval(a['p'])}); "
            f"**past the Act-2 boss:** {pct(b['shares']['arm'])} against {pct(b['shares']['baseline'])} ({b['armOnly']:,} against {b['baselineOnly']:,}, exact {pval(b['p'])})."
        )
        f = t["floorDifference"]
        print(f"- **Mean floors, arm minus S:** {f['meanAMinusB']:+.3f} (95 % bootstrap {f['ci95'][0]:+.3f} to {f['ci95'][1]:+.3f}).")
        v = t["verification"]
        print(
            f"- **Independent recomputation (item 10):** {v['exactChecks']} exact checks agree with the episodes; {v['bootstrapChecks']} checks with the independent resample, "
            f"{len(v['bootstrapDisagreements'])} interval disagreements" + (": " + "; ".join(v["bootstrapDisagreements"]) if v["bootstrapDisagreements"] else "") + "."
        )
        print("- **Each class on its own** (exact McNemar, uncorrected; the class level is 0.01):")
        for c in t["perClass"]:
            print(
                f"  - {c['character']}: {c['pairs']:,} pairs, {c['wins']['arm']:,} against {c['wins']['baseline']:,} won ({pct(c['shares']['arm'])} against {pct(c['shares']['baseline'])}, {pts(c['difference'])}), "
                f"{c['armOnly']} against {c['baselineOnly']}, {pval(c['p'])} ({ {'arm': 'the arm ahead', 'baseline': 'S ahead', 'level': 'neither shown'}[c['verdict']] }); "
                f"past the Act-1 boss {pct(c['actOne']['arm'])} against {pct(c['actOne']['baseline'])}; mean floors {c['meanFloorDifference']:+.3f}"
            )
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
