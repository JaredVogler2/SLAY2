#!/usr/bin/env python3
"""Print the numbers of part 2 of ADR-062 (the frozen choices) from the committed files, so that nothing in the record is typed by hand.

    python3 scripts/studies/thresh/part2.py > part2-numbers.md        (run from the worktree that played the development stage)

The prose around the numbers is written by hand; this prints the development screen as it came out (one line per threshold), what each development batch
counted, the choice and why it did or did not advance, the SHA-256 of every file an arm reads, of the seed file and of the selection file, and the arms the
preflight will ask part 2 to name (`ARM_<tag>`).
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path

CLASSES = ["ironclad", "defect"]
EXACT = {c: c.capitalize() for c in CLASSES}
ROOT = Path(__file__).resolve().parents[3]
CARD = ROOT / "experiments" / "cardvalue"
REPLICATION_TAG = "t020"


def power_module():
    spec = importlib.util.spec_from_file_location("thresh_power", Path(__file__).resolve().parent / "power.py")
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def dev_head() -> str:
    """The commit the development stage was played from, as dev.sh recorded it before its first game; it has to be a commit of this repository."""
    p = ROOT / "artifacts" / "thresh" / "dev-head.txt"
    text = p.read_text(encoding="utf-8").strip() if p.exists() else ""
    if not re.fullmatch(r"[0-9a-f]{40}", text):
        raise SystemExit("part2: artifacts/thresh/dev-head.txt does not hold the commit the development stage was played from (run this in the worktree that played it)")
    if subprocess.run(["git", "cat-file", "-e", f"{text}^{{commit}}"], cwd=ROOT, capture_output=True).returncode != 0:
        raise SystemExit(f"part2: the development commit {text} is not in this repository")
    return text


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def pct(x: float, d: int = 2) -> str:
    return f"{100 * x:.{d}f} %"


def deck(m: dict) -> str:
    """The mean final deck size of the arm and of S over the pairs both completed (descriptive; the rule does not read it)."""
    return "not recorded" if m["pairs"] == 0 else f"{m['arm']:.2f} against {m['baseline']:.2f} cards"


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
            f"mean final deck {deck(r['meanDeckSize'])}, identity {r['identity']}"
        )
    print(f"\nbest: {json.dumps(sel['best'])}")
    if sel["headToHead"]:
        h = sel["headToHead"]
        print(f"head-to-head of the best against 0.2: {h['armOnly']} / {h['baselineOnly']} discordant, net {h['net']:+d}, exact p {h['p']:.4g}")
    print(f"choice: {json.dumps(sel['choice'])}\nDesign checks passed: {sel['designChecksPassed']}")
    print("\n### The commit the development stage was played from (the preflight of the held-out run reads it)")
    print(f"DEV_HEAD={dev_head()}")
    pw = power_module()
    held, dev = pw.SEEDS_PER_CLASS_HELD_OUT, pw.SEEDS_PER_CLASS_DEV
    if sel["choice"]["advance"]:
        r = pw.rates()
        pairs = round(2 * held * (1 - r["lost"]))
        alpha = 0.05 / 3
        h = sel["headToHead"]
        d3 = round((h["armOnly"] + h["baselineOnly"]) * held / dev)
        c = sel["arms"][sel["choice"]["arm"]]
        d2 = round((c["armOnly"] + c["baselineOnly"]) * held / dev)
        print("\n### What the held-out tests can see of the choice (the discordant pairs of the development stage scaled to the held-out seeds; power at α = 0.05 / 3)")
        print(f"- T3, the choice against 0.2: {h['armOnly'] + h['baselineOnly']} discordant pairs in development, about {d3} held-out; exact test / interval at θ = 0.55, 0.60, 0.65, 0.70: "
              + ", ".join(f"{pw.power_exact(d3, t, alpha):.2f} / {pw.power_interval(d3, t, pairs, alpha):.2f}" for t in (0.55, 0.60, 0.65, 0.70))
              + f"; net wins for 80 %: {pw.net_needed(d3, alpha, pairs)}")
        print(f"- T2, the choice against S: {c['armOnly'] + c['baselineOnly']} discordant pairs in development, about {d2} held-out; exact test / interval at the effect of half of ADR-061's: "
              f"{pw.power_exact(d2, (d2 + 0.5 * r['netPerPair'] * pairs) / (2 * d2), alpha):.2f} / {pw.power_interval(d2, (d2 + 0.5 * r['netPerPair'] * pairs) / (2 * d2), pairs, alpha):.2f}")
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
