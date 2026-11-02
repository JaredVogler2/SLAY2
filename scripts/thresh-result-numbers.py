#!/usr/bin/env python3
"""Print the numbers of the result sections of ADR-062 from the exporter's output, so that nothing in the record is typed by hand.

    node scripts/export-site-data.mjs                      (reads the selection, the pooled files, the all-pairs analysis, the design checks and the recomputation strictly)
    python3 scripts/thresh-result-numbers.py [thresh.generated.json] > result-numbers.md
    python3 scripts/thresh-result-numbers.py --arms [--stage dev|val] [--batches experiments/batches]

The prose around the numbers is written by hand. Without a flag this reads `apps/web/src/content/thresh.generated.json` (never the batches) and prints, for the
development screen if it exists, each threshold against S (the pooled pairs of the two classes, the games won, the net wins, the exact p, the shares past each boss,
the mean final deck, the design check), the head-to-head and the choice; and, for each held-out test if they exist, the pooled figures, the two readings (the registered
primary test and the all-pairs analysis of item 5), what the reading rule gave and which conditions withheld it, the shares past the first and the second boss, mean
floors, each class on its own and what the independent recomputation found. With `--arms` it reads the manifests and audit records of the batches of a stage (and
nothing else) and prints, per arm, the games, the completed games, the wins, the simulator errors and the timeouts, the commit they were played from and what the
audits found.
It lives outside `scripts/studies/thresh/` on purpose: that directory is frozen from the commit that registers the study.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "apps" / "web" / "src" / "content" / "thresh.generated.json"
BATCHES = ROOT / "experiments" / "batches"
THRESHOLD = {"t010": "0.1", "t020": "0.2", "t030": "0.3", "t045": "0.45", "t060": "0.6", "tnone": "no card in Act 2"}
ARMS = ["s", *THRESHOLD]
STAGES = {
    "dev": "thresh-dev-{arm}-*-a0-veteran-keeprelics-dev2-n3000",
    "val": "thresh-val-{arm}-*-a0-veteran-keeprelics-val3-n15000",
}
VERDICT = {"passed": "passed", "not-shown": "not shown", "reversed": "reversed"}
WITHHELD = {"robustness": "the all-pairs analysis did not show the same difference at an exact p below 0.05", "excluded": "more than a tenth of the pairs were dropped"}
CLASS_VERDICT = {"arm": "the arm ahead", "baseline": "the baseline ahead", "level": "neither shown"}


def name(arm: str) -> str:
    return "S (the baseline)" if arm == "s" else f"{THRESHOLD.get(arm, arm)} (`{arm}`)"


def pct(x: float, d: int = 2) -> str:
    return f"{100 * x:.{d}f} %"


def pts(x: float, d: int = 2) -> str:
    return f"{'+' if x >= 0 else '-'}{abs(100 * x):.{d}f} points"


def pval(p: float) -> str:
    return "p < 1e-300" if p == 0 else (f"p = {p:.4g}" if p >= 1e-4 else f"p = {p:.2e}")


def deck(d: dict | None) -> str:
    if not d or d.get("arm") is None:
        return "n/a"
    return f"{d['arm']:.1f} against {d['baseline']:.1f} cards over {d['pairs']:,} pairs"


def arm_lines(batches: Path, stage: str) -> list[str]:
    """Per arm over its class batches: games, completed games, wins, simulator errors, timeouts; then the commit(s) the batches were played from and the audits."""
    lines: list[str] = []
    heads: set[str] = set()
    dirty: set[bool] = set()
    overall: Counter[str] = Counter()
    for arm in ARMS:
        tot: Counter[str] = Counter()
        for d in sorted(batches.glob(STAGES[stage].format(arm=arm))):
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
        if not tot["batches"]:
            continue
        for k, v in tot.items():
            overall[k] += v
        lines.append(
            f"- {name(arm)}: {tot['batches']} batches, {tot['games']:,} games, {tot['completed']:,} completed, {tot['win']:,} wins, "
            f"{tot['simulator_error']:,} simulator errors, {tot['timeout']:,} timeouts."
        )
    lines.append(
        f"- All arms: {overall['batches']} batches, {overall['games']:,} games, {overall['completed']:,} completed, {overall['win']:,} wins, "
        f"{overall['simulator_error']:,} simulator errors, {overall['timeout']:,} timeouts."
    )
    lines.append(f"- Played from {len(heads)} commit{'' if len(heads) == 1 else 's'} ({', '.join(sorted(h[:12] for h in heads))}); tree dirty: {'yes' if True in dirty else 'no'}.")
    lines.append(
        f"- Audits: {overall['winsVerified']:,} of {overall['winsAudited']:,} audited wins re-derived (in {overall['winBatches']} batches that have a win); "
        f"{overall['sampleBatchesPassed']} of {overall['sampleBatches']} sample audits passed ({overall['sampleVerified']:,} of {overall['sampleGames']:,} sampled games verified)."
    )
    return lines


def screen_lines(d: dict) -> list[str]:
    s = d["screen"]
    lines = [f"### The development screen as it came out (role: {s['role']}; level of the tests it leaves: 0.05 / {len(s['tests'])})"]
    for tag, r in s["rows"].items():
        lines.append(
            f"- {name(tag)}: {r['pairs']:,} pairs ({r['excluded']:,} excluded), games won {pct(r['shares']['arm'])} against S's {pct(r['shares']['baseline'])} "
            f"({r['wins']['arm']:,} against {r['wins']['baseline']:,}), {pts(r['difference'])}, {r['armOnly']:,} won only by the arm against {r['baselineOnly']:,} only by S: net {r['net']:+d}, exact {pval(r['p'])}; "
            f"past the Act-1 boss {pct(r['pastAct1Boss']['arm'])} against {pct(r['pastAct1Boss']['baseline'])}, past the Act-2 boss {pct(r['pastAct2Boss']['arm'])} against {pct(r['pastAct2Boss']['baseline'])}; "
            f"mean floors {r['meanFloorDifference']:+.3f}; mean final deck {deck(r.get('meanDeckSize'))}; pairs stopped by the wall clock, not compared in the design check: {r['wallClockPairs']:,}."
        )
    b = s["best"]
    lines.append(f"- Largest net wins: {name(b['arm'])} ({b['net']:+d}).")
    h = s["headToHead"]
    if h:
        lines.append(
            f"- Head-to-head of {name(b['arm'])} against 0.2 on the pairs both games completed ({h['pairs']:,} pairs): {h['armOnly']:,} won only by the choice against {h['baselineOnly']:,} only by 0.2, "
            f"net {h['net']:+d}, exact {pval(h['p'])}."
        )
    else:
        lines.append("- No head-to-head was read (the best threshold is 0.2 itself, or its net wins are not above zero).")
    c = s["choice"]
    lines.append(f"- **Choice: {'ADVANCED ' + name(c['arm']) if c['advance'] else 'nothing advanced'}** ({c['reason']}). Tests left: " + ", ".join(f"{t['key']} ({t['arm']} against {t['baseline']})" for t in s["tests"]) + ".")
    lines.append(f"- DEV_HEAD={d.get('devHead')}; selection SHA-256 {d.get('selectionSha256')}.")
    return lines


def test_lines(d: dict) -> list[str]:
    tests = d["tests"]
    level = tests["level"]
    lines: list[str] = []
    for key in tests["order"]:
        t = tests["results"][key]
        base = "S" if t["baseline"] == "s" else f"{THRESHOLD.get(t['baseline'], t['baseline'])}"
        lines.append(f"### Test {key}: {name(t['arm'])} against {base}")
        lines.append(
            f"- **Primary (item 4):** {t['pairs']:,} paired games from {t['pairedSeeds']:,} paired seeds ({t['excluded']:,} pairs excluded because a game did not complete: "
            f"{t['notFinished']['a']:,} of the arm's, {t['notFinished']['b']:,} of the baseline's); games won {pct(t['shares']['arm'])} against {pct(t['shares']['baseline'])} "
            f"({t['wins']['arm']:,} against {t['wins']['baseline']:,}), difference {pts(t['difference'])}, whole-seed interval at the level 1 - {level:.6f} {pts(t['ci'][0])} to {pts(t['ci'][1])} "
            f"(95 %: {pts(t['ci95'][0])} to {pts(t['ci95'][1])}); {t['armOnly']:,} pairs won only by the arm against {t['baselineOnly']:,} only by the baseline, exact McNemar {pval(t['p'])}. "
            f"Primary reading: **{VERDICT[t['primaryVerdict']]}**."
        )
        r = t["robust"]
        lines.append(
            f"- **All-pairs analysis (item 4):** {r['pairs']:,} pairs, a game that did not end in a win scored as not won ({r['notCompleted']['arm']:,} of the arm's and {r['notCompleted']['baseline']:,} of the baseline's games "
            f"did not complete); {r['wins']['arm']:,} against {r['wins']['baseline']:,} won, {pct(r['shares']['arm'])} against {pct(r['shares']['baseline'])}, {pts(r['difference'])}, "
            f"{r['armOnly']:,} against {r['baselineOnly']:,}, exact {pval(r['p'])}. Share of the primary's pairs dropped: {pct(t['excludedFraction'])}."
        )
        why = "nothing was withheld" if not t["downgrades"] else "withheld because " + " and because ".join(WITHHELD[x] for x in t["downgrades"])
        lines.append(f"- **Reading by the rule of item 5: {VERDICT[t['verdict']].upper()}{' (a narrow pass)' if t.get('narrow') else ''}** ({why}).")
        a, b = t["actOne"], t["actTwo"]
        lines.append(
            f"- **Past the Act-1 boss:** {pct(a['shares']['arm'])} against {pct(a['shares']['baseline'])} ({a['armOnly']:,} pairs only the arm, {a['baselineOnly']:,} only the baseline, exact {pval(a['p'])}; "
            f"the arms are S until Act 2, so these must be equal); **past the Act-2 boss:** {pct(b['shares']['arm'])} against {pct(b['shares']['baseline'])} ({b['armOnly']:,} against {b['baselineOnly']:,}, exact {pval(b['p'])})."
        )
        f = t["floorDifference"]
        lines.append(f"- **Mean floors, arm minus baseline:** {f['meanAMinusB']:+.3f} (95 % bootstrap {f['ci95'][0]:+.3f} to {f['ci95'][1]:+.3f}).")
        v = t["verification"]
        lines.append(
            f"- **Independent recomputation (item 11):** {v['exactChecks']} exact checks agree with the episodes; {v['bootstrapChecks']} checks with the independent resample, "
            f"{len(v['bootstrapDisagreements'])} interval disagreements" + (": " + "; ".join(v["bootstrapDisagreements"]) if v["bootstrapDisagreements"] else "") + "."
        )
        lines.append("- **Each class on its own** (exact McNemar, uncorrected; the class level is 0.01):")
        for c in t["perClass"]:
            lines.append(
                f"  - {c['character']}: {c['pairs']:,} pairs, {c['wins']['arm']:,} against {c['wins']['baseline']:,} won ({pct(c['shares']['arm'])} against {pct(c['shares']['baseline'])}, {pts(c['difference'])}), "
                f"{c['armOnly']} against {c['baselineOnly']}, {pval(c['p'])} ({CLASS_VERDICT[c['verdict']]}); past the Act-1 boss {pct(c['actOne']['arm'])} against {pct(c['actOne']['baseline'])}; "
                f"mean floors {c['meanFloorDifference']:+.3f}"
            )
        lines.append("")
    ident = d.get("identity") or {}
    for arm, v in ident.items():
        lines.append(
            f"- Design check of {name(arm)} against S on the held-out batches: {v['beforePairs']:,} games that S ended in Act 1 are the arm's own record for record, {v['bossPairs']:,} pairs agree about the "
            f"Act-1 boss; {v['wallClockPairs']:,} pairs in which a game was stopped by the wall clock were not compared."
        )
    return lines


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("data", nargs="?", type=Path, default=DATA, help="the exporter's thresh.generated.json")
    ap.add_argument("--arms", action="store_true", help="print the per-arm counts of the batches of a stage instead of the tests")
    ap.add_argument("--stage", choices=sorted(STAGES), default="val")
    ap.add_argument("--batches", type=Path, default=BATCHES)
    args = ap.parse_args(argv)
    if args.arms:
        if not any(args.batches.glob(STAGES[args.stage].format(arm="s"))):
            print(f"no {args.stage} batch of the threshold study under {args.batches}", file=sys.stderr)
            return 1
        print("\n".join(arm_lines(args.batches, args.stage)))
        return 0
    d = json.loads(args.data.read_text(encoding="utf-8"))
    if not d.get("registered") or not (d.get("screen") or d.get("tests")):
        print("no screen or test result in the exporter's output yet", file=sys.stderr)
        return 1
    out: list[str] = []
    if d.get("screen"):
        out += screen_lines(d)
        out.append("")
    if d.get("tests"):
        out += test_lines(d)
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
