#!/usr/bin/env python3
"""Print the numbers of part 2 of ADR-060 (the frozen choices) from the committed files, so that nothing in the record is typed by hand.

    python3 scripts/studies/act2/part2.py > part2-numbers.md        (run from the worktree that played the development stage)

The prose around the numbers is written by hand; this prints the fit as it came out (one line per class), the development screen (one line per
candidate rule), what each development batch counted, the SHA-256 of the ten value files and of the selection file, and the arms the preflight
will ask part 2 to name (`ARM_<tag>`).
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"]
EXACT = {c: c.capitalize() for c in CLASSES}
ROOT = Path(__file__).resolve().parents[3]
CARD = ROOT / "experiments" / "cardvalue"


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def pct(x: float, d: int = 2) -> str:
    return f"{100 * x:.{d}f} %"


def main() -> int:
    sets = json.loads((CARD / "site-sets.json").read_text())["sets"]
    shown = {c: next(CARD / e["file"] for e in sets if e["file"].startswith(f"{c}-a0-")) for c in CLASSES}
    sel = json.loads((ROOT / "experiments" / "act2" / "dev-selection.json").read_text())
    print("### The fit as it came out (second run, after addendum A)")
    for c in CLASSES:
        f = json.loads((CARD / f"{c}-a0-act2-v1.json").read_text())
        g = f["gate"]
        cvr = f.get("crossValidation")
        line = f"- {EXACT[c]}: {f['boss_fights']} Act-2 boss fights, {f['passed']} passed; "
        if g.get("gain") is None:
            line += "gate not asked (too few runs or too few passes or fails); the shown values are kept"
        else:
            line += (
                f"held-out log loss {cvr['baselineLogLoss']:.4f} (scale alone) -> {cvr['baselineLogLoss'] - cvr['gain']:.4f} "
                f"(base rate {cvr['baselineLogLossOfTheBaseRate']:.4f}), gain {g['gain']:+.5f} against the gate {g['required']} at card penalty {g['bestL2']}, "
                f"indicator penalty {cvr['indicatorPenalty']['chosen']}: {'FITTED' if f['fitted'] else 'the shown values are kept'}"
            )
            so = f.get("scaleOnly")
            if so and so.get("ci95"):
                line += f"; scale of the shown ranking {so['estimate']:.3f} (95 % {so['ci95'][0]:.3f} to {so['ci95'][1]:.3f})"
        print(line)
    print("\n### The development screen as it came out")
    print(f"slice {sel['slice']}; rule applied by `act2study dev`; the pooled share past the Act-2 boss, the arm against S:")
    for tag, r in sel["arms"].items():
        print(
            f"- {tag}{'' if r.get('lateThreshold') is None else ' (threshold ' + str(r['lateThreshold']) + ')'}: {r['pairs']} pairs ({r['excluded']} excluded), "
            f"{pct(r['pastAct2Boss']['arm'])} against {pct(r['pastAct2Boss']['baseline'])}, difference {100 * r['difference']:+.2f} points, "
            f"{r['armOnly']} / {r['baselineOnly']} discordant, exact p {r['p']:.4g}, "
            f"past the Act-1 boss {pct(r['pastAct1Boss']['arm'])} against {pct(r['pastAct1Boss']['baseline'])} (pairs that differ: {r['actOneDiffers']}), "
            f"{'ELIGIBLE' if r['eligible'] else 'not eligible'}"
        )
    print(f"\nP: {json.dumps(sel['P'])}\nV: {json.dumps(sel['V'])}\nL: always tested\nActs 1 identical for the Act-2-only arms: {sel['actOneIdentical']}")
    print("\n### What the development batches counted (completed / wins / simulator errors / timeouts)")
    for tag in sel["arms"]:
        counts = []
        for c in CLASSES:
            m = json.loads((ROOT / "experiments" / "batches" / f"act2dev-{tag}-{c}-a0-veteran-keeprelics-dev-o1000-n600" / "manifest.json").read_text())
            k = m["summary"]["counts"]
            counts.append(f"{EXACT[c]} {m['summary']['completed']}/{k['win']}/{k['simulator_error']}/{k['timeout']}")
        print(f"- {tag}: " + "; ".join(counts))
    print("\n### SHA-256 of every file an arm reads, and of the selection")
    for c in CLASSES:
        print(f"- `{shown[c].relative_to(ROOT)}`: `{sha(shown[c])}`")
    for c in CLASSES:
        p = CARD / f"{c}-a0-act2-v1.json"
        print(f"- `{p.relative_to(ROOT)}`: `{sha(p)}`")
    sp = ROOT / "experiments" / "act2" / "dev-selection.json"
    print(f"- `{sp.relative_to(ROOT)}`: `{sha(sp)}`")
    print("\n### The arms the preflight asks part 2 to name")
    if sel["P"]["advance"]:
        print(f"ARM_{sel['P']['arm']}")
    if sel["V"]["advance"]:
        print("ARM_v")
    return 0


if __name__ == "__main__":
    sys.exit(main())
