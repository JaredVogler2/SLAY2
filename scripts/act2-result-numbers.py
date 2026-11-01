#!/usr/bin/env python3
"""Print the numbers of the result section of ADR-060 from the exporter's output, so that nothing in the record is typed by hand.

    node scripts/export-site-data.mjs                      (reads the pooled files, the robustness file, the identity and determinism records strictly)
    python3 scripts/act2-result-numbers.py [act2.generated.json] > result-numbers.md

The prose around the numbers is written by hand. This reads `apps/web/src/content/act2.generated.json` (never the batches) and prints, for each
test that was played, the pooled figures, the two readings (the registered primary test and the observed-endpoint check of addendum B), what
the reading rule gave, each class on its own, the share past the Act-1 boss, mean floors, wins, and the determinism record of the replayed
baseline. It lives outside `scripts/studies/act2/` on purpose: that directory is frozen from the commit that registers the held-out run.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

DATA = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "apps" / "web" / "src" / "content" / "act2.generated.json"
NAMES = {"L": "L (`lead`: threshold 0.2 in every act)", "P": "P (`{arm}`: late threshold in Act 2 only)", "V": "V (`v`: the refitted values in Act 2 only)"}
VERDICT = {"passed": "passed", "not-shown": "not shown", "reversed": "reversed"}


def pct(x: float, d: int = 2) -> str:
    return f"{100 * x:.{d}f} %"


def pts(x: float, d: int = 2) -> str:
    return f"{'+' if x >= 0 else '-'}{abs(100 * x):.{d}f} points"


def pval(p: float) -> str:
    return "p < 1e-300" if p == 0 else (f"p = {p:.4g}" if p >= 1e-4 else f"p = {p:.2e}")


def main() -> int:
    d = json.loads(DATA.read_text(encoding="utf-8"))
    if not d.get("registered") or not d.get("tests"):
        print("no test result in the exporter's output yet", file=sys.stderr)
        return 1
    tests = d["tests"]["results"]
    det = d["tests"]["determinism"]
    for key in ("L", "P", "V"):
        t = tests.get(key)
        if t is None:
            continue
        print(f"### Test {NAMES[key].format(arm=t['arm'])} against S")
        print(
            f"- **Primary (item 3):** {t['pairs']:,} paired games from {t['pairedSeeds']:,} paired seeds ({t['excluded']:,} pairs excluded because a game did not complete: "
            f"{t['notFinished']['a']:,} of the arm's, {t['notFinished']['b']:,} of S's); past the Act-2 boss {pct(t['shares']['arm'])} against {pct(t['shares']['baseline'])}, "
            f"difference {pts(t['difference'])}, whole-seed interval at the level 1 - 0.05 / 3 {pts(t['ci'][0])} to {pts(t['ci'][1])} (95 %: {pts(t['ci95'][0])} to {pts(t['ci95'][1])}); "
            f"{t['armOnly']:,} pairs only the arm against {t['baselineOnly']:,} only S, exact McNemar {pval(t['p'])}; the games that got past it: {t['games']['arm']:,} against {t['games']['baseline']:,}. "
            f"Primary reading: **{VERDICT[t['primaryVerdict']]}**."
        )
        r = t["robust"]
        print(
            f"- **Observed-endpoint check (addendum B):** {r['pairs']:,} pairs whose two endpoints are known ({r['droppedUnknown']:,} dropped); games that ended in an error after the Act-2 boss "
            f"counted as passes (of the {t['pairedSeeds']:,} games each played, {r['erroredAfterTheBoss']['arm']} of the arm's and {r['erroredAfterTheBoss']['baseline']} of S's ended that way); {pct(r['shares']['arm'])} against {pct(r['shares']['baseline'])}, "
            f"{pts(r['difference'])}, {r['armOnly']:,} against {r['baselineOnly']:,}, exact {pval(r['p'])}. Share of the primary's pairs dropped: {pct(t['excludedFraction'])}."
        )
        why = {None: "nothing was withheld", "robustness": "withheld: the check did not show the same difference at an exact p below 0.05", "excluded": "withheld: more than a tenth of the pairs were dropped"}[t["downgrade"]]
        print(f"- **Reading by the rule of item 4 and addendum B: {VERDICT[t['verdict']].upper()}** ({why}).")
        a = t["actOne"]
        print(
            f"- **Past the Act-1 boss:** {pct(a['shares']['arm'])} against {pct(a['shares']['baseline'])} ({a['armOnly']:,} pairs only the arm, {a['baselineOnly']:,} only S, exact {pval(a['p'])})."
        )
        f = t["floorDifference"]
        print(f"- **Mean floors, arm minus S:** {f['meanAMinusB']:+.3f} (95 % bootstrap {f['ci95'][0]:+.3f} to {f['ci95'][1]:+.3f}); **wins:** {t['wins']['arm']} against {t['wins']['baseline']} (exact {pval(t['wins']['p'])}).")
        print("- **Each class on its own** (exact McNemar, uncorrected; the class level is 0.01):")
        for c in t["perClass"]:
            print(
                f"  - {c['character']}: {c['pairs']:,} pairs, {pct(c['shares']['arm'])} against {pct(c['shares']['baseline'])} ({pts(c['difference'])}), {c['armOnly']} against {c['baselineOnly']}, "
                f"{pval(c['p'])} ({ {'arm': 'the arm ahead', 'baseline': 'S ahead', 'level': 'neither shown'}[c['verdict']] }); past the Act-1 boss {pct(c['actOne']['arm'])} against {pct(c['actOne']['baseline'])} "
                f"({c['actOne']['armOnly']} against {c['actOne']['baselineOnly']}); wins {c['wins']['arm']} against {c['wins']['baseline']}; mean floors {c['meanFloorDifference']:+.3f}"
            )
        print()
    print(
        f"### The determinism record of the replayed baseline\n- {det['identical']:,} of {det['shared']:,} shared episodes are identical to those the batches of ADR-058 hold (played at 687db50), {det['different']:,} differ. This gates nothing."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
