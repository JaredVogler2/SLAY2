#!/usr/bin/env python3
"""Print the numbers of part 2 of ADR-062 (the frozen choices) from the committed files, so that nothing in the record is typed by hand.

    python3 scripts/studies/thresh/part2.py > part2-numbers.md        (run from the worktree that played the development stage)

The prose around the numbers is written by hand; this prints the development screen as it came out (one line per threshold), what each development batch
counted, the choice and why it did or did not advance, the SHA-256 of every file an arm reads, of the seed file and of the selection file, and the arms the
preflight will ask part 2 to name (`ARM_<tag>`).
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

CLASSES = ["ironclad", "defect"]
EXACT = {c: c.capitalize() for c in CLASSES}
ROOT = Path(__file__).resolve().parents[3]
CARD = ROOT / "experiments" / "cardvalue"
REPLICATION_TAG = "t020"


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def pct(x: float, d: int = 2) -> str:
    return f"{100 * x:.{d}f} %"


def main() -> int:
    sets = json.loads((CARD / "site-sets.json").read_text())["sets"]
    shown = {c: next(CARD / e["file"] for e in sets if e["file"].startswith(f"{c}-a0-")) for c in CLASSES}
    sel = json.loads((ROOT / "experiments" / "thresh" / "dev-selection.json").read_text())
    print("### The development screen as it came out")
    print(f"slice {sel['slice']}; rule applied by `threshstudy dev`; the pooled wins of the arm against S over the pairs both games completed:")
    for tag, r in sel["arms"].items():
        print(
            f"- {tag} (threshold {r['threshold']}): {r['pairs']} pairs ({r['excluded']} excluded), wins {r['wins']['arm']} against {r['wins']['baseline']} "
            f"({pct(r['shares']['arm'])} against {pct(r['shares']['baseline'])}), {r['armOnly']} / {r['baselineOnly']} discordant, net {r['net']:+d}, exact p {r['p']:.4g}, "
            f"past the Act-1 boss {pct(r['pastAct1Boss']['arm'])} against {pct(r['pastAct1Boss']['baseline'])}, past the Act-2 boss {pct(r['pastAct2Boss']['arm'])} against {pct(r['pastAct2Boss']['baseline'])}, "
            f"identity {r['identity']}"
        )
    print(f"\nbest: {json.dumps(sel['best'])}")
    if sel["headToHead"]:
        h = sel["headToHead"]
        print(f"head-to-head of the best against 0.2: {h['armOnly']} / {h['baselineOnly']} discordant, net {h['net']:+d}, exact p {h['p']:.4g}")
    print(f"choice: {json.dumps(sel['choice'])}\nDesign checks passed: {sel['designChecksPassed']}")
    print("\n### What the development batches counted (completed / wins / simulator errors / timeouts)")
    for tag in sel["arms"]:
        for arm in (tag,):
            counts = []
            for c in CLASSES:
                m = json.loads((ROOT / "experiments" / "batches" / f"thresh-dev-{arm}-{c}-a0-veteran-keeprelics-dev2-n3000" / "manifest.json").read_text())
                k = m["summary"]["counts"]
                counts.append(f"{EXACT[c]} {m['summary']['completed']}/{k['win']}/{k['simulator_error']}/{k['timeout']}")
            print(f"- {arm}: " + "; ".join(counts))
    counts = []
    for c in CLASSES:
        m = json.loads((ROOT / "experiments" / "batches" / f"thresh-dev-s-{c}-a0-veteran-keeprelics-dev2-n3000" / "manifest.json").read_text())
        k = m["summary"]["counts"]
        counts.append(f"{EXACT[c]} {m['summary']['completed']}/{k['win']}/{k['simulator_error']}/{k['timeout']}")
    print("- s: " + "; ".join(counts))
    print("\n### SHA-256 of every file an arm reads, of the seed file and of the selection")
    for c in CLASSES:
        print(f"- `{shown[c].relative_to(ROOT)}`: `{sha(shown[c])}`")
    seeds = ROOT / sel["slice"]["seedsFile"]
    print(f"- `{seeds.relative_to(ROOT)}`: `{sha(seeds)}`")
    sp = ROOT / "experiments" / "thresh" / "dev-selection.json"
    print(f"- `{sp.relative_to(ROOT)}`: `{sha(sp)}`")
    print("\n### The arms the preflight asks part 2 to name (S and 0.2 are always played and need not be)")
    if sel["choice"]["advance"] and sel["choice"]["arm"] != REPLICATION_TAG:
        print(f"ARM_{sel['choice']['arm']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
