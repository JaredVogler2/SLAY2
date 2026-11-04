#!/usr/bin/env python3
"""Prints the numbers of the Result block of ADR-064 from what the exporter wrote (underdocks.generated.json) and the manifests and audit files of the
thirty batches, in the style of the earlier result blocks. It reads; it decides nothing (the verdicts are the reader's, by the rule of item 5). It lives outside
the directory that ADR-064 froze (`scripts/studies/underdocks/`), as `scripts/thresh-result-numbers.py` does for ADR-062.

    python3 scripts/underdocks-result-numbers.py [repo root]
"""
import json
import sys
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
data = json.loads((root / "apps/web/src/content/underdocks.generated.json").read_text())
if not data.get("tests"):
    raise SystemExit("the exporter's file has no tests yet")
CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"]
LABEL = {c: c.capitalize() for c in CLASSES}
ARMS = {
    "advisor_v1-astar": "A* (the synergy term)",
    "advisor_v1-d0star": "d0* (no term)",
    "rules_v2-shownvals": "the shown card values",
    "rules_v1": "rules_v1",
    "rules_v2_neow_values-keepvals": "the opening-relic rule",
    "rules_v2": "the first helpful relic",
}


def pc(x, d=1):
    return f"{x * 100:.{d}f} %"


def pts(x, d=2):
    return f"{'−' if x < 0 else '+'}{abs(x * 100):.{d}f}"


def num(n):
    return f"{n:,}"


def pv(p):
    if p == 0:
        return "p < 1e-300"
    return f"p = {p:.1e}" if p < 1e-4 else f"p = {p:.2g}"


def manifest(batch_id):
    return json.loads((root / "experiments/underdocks/batches" / batch_id / "manifest.json").read_text())


def sum_arm(arm):
    t = {"completed": 0, "win": 0, "simulator_error": 0, "step_limit": 0, "timeout": 0, "other": 0, "games": 0}
    for c in CLASSES:
        m = manifest(f"{arm}-{c}-a0-veteran-keeprelics-underdocks-val-n2000")
        t["games"] += m["summary"].get("episodes", 0) or sum(m["summary"]["counts"].values())
        t["completed"] += m["summary"]["completed"]
        t["win"] += m["summary"]["counts"].get("win", 0)
        for k in ("simulator_error", "step_limit", "timeout"):
            t[k] += m["summary"]["counts"].get(k, 0)
    return t


out = ["### games per arm (10,000 each, in Underdocks)"]
for arm, label in ARMS.items():
    t = sum_arm(arm)
    out.append(f"- {label}: {num(t['completed'])} completed ({t['win']} wins), {t['simulator_error']} simulator errors, {t['step_limit']} step limits, {t['timeout']} timeouts")

NAMES = {
    "synergy": "T1 the synergy term (A* against d0*)",
    "values": "T2 the shown card values against rules_v1",
    "neow": "T3 the opening-relic rule against the first helpful relic",
}
for key in ("synergy", "values", "neow"):
    t = data["tests"][key]
    tab = t["reachedAct2"]["pairedTable"]
    d = t["clusteredDifference"]
    ap = t["allPairs"]
    og = t["overgrowth"]
    size_words = {"smaller": "smaller than in Overgrowth", "larger": "larger than in Overgrowth", "about-the-same": "about the same as in Overgrowth"}
    out += ["", f"### {NAMES[key]} — {t['verdict']}{(', ' + size_words.get(t['size'], str(t['size']))) if t.get('size') else ''}"]
    if t.get("withheld"):
        out.append(f"- WITHHELD by the rule: {t['withheld']} (primary reading: {t['primary']})")
    if t.get("downgrades"):
        out.append(f"- downgrades: {t['downgrades']}")
    out.append(f"- file {t['file']}, SHA-256 {t['sha256']}")
    out.append(f"- {num(t['pairedSeeds'])} paired seeds, {num(t['bothCompleted'])} completed by both ({num(t['excludedNotCompleted'])} excluded; not completed: first arm {t['notFinished']['a']}, second {t['notFinished']['b']})")
    out.append(
        f"- past the Act-1 boss: {pc(t['reachedAct2']['a']['rate'])} against {pc(t['reachedAct2']['b']['rate'])}; {num(tab['a_only'])} pairs only the first arm, {num(tab['b_only'])} only the second; exact McNemar {pv(tab['mcnemar_p'])}"
    )
    out.append(
        f"- difference of the shares (whole seeds): {pts(d['meanAMinusB'])} points (95 % {pts(d['ci95'][0])} to {pts(d['ci95'][1])}; at level {d['ciAtLevel']['level']:.4f}: {pts(d['ciAtLevel']['ci'][0])} to {pts(d['ciAtLevel']['ci'][1])})"
    )
    out.append(
        f"- Overgrowth twin ({og['adr']}): {pts(og['mean'])} points ({pc(og['a'])} against {pc(og['b'])}, {num(og['bothCompleted'])} pairs, 95 % {pts(og['ci95'][0])} to {pts(og['ci95'][1])})"
    )
    fl = t["floorDifference"]
    out.append("- mean floors " + f"{fl['meanAMinusB']:+.2f} (95 % {fl['ci95'][0]:+.2f} to {fl['ci95'][1]:+.2f})".replace("-", "−"))
    a3 = t["reachedAct3"]
    out.append(f"- past the Act-2 boss (secondary): {pc(a3['a']['rate'])} against {pc(a3['b']['rate'])} ({num(a3['pairedTable']['a_only'])} pairs against {num(a3['pairedTable']['b_only'])}, {pv(a3['pairedTable']['mcnemar_p'])})")
    out.append(f"- wins (secondary): {t['wins']['a']} against {t['wins']['b']} ({num(t['wins']['pairedTable']['a_only'])} pairs against {num(t['wins']['pairedTable']['b_only'])}, {pv(t['wins']['pairedTable']['mcnemar_p'])})")
    out.append(
        f"- all-pairs analysis: {num(ap['pairs'])} pairs, the endpoint as the games ended: {pc(ap['aRate'])} against {pc(ap['bRate'])} ({num(ap['aOnly'])} pairs against {num(ap['bOnly'])}, {pv(ap['p'])}); the primary dropped {pc(ap['excludedFraction'], 2)} of the pairs"
    )
    out.append("- each class (uncorrected; item 6 reads them at p below 0.01):")
    for m in t["members"]:
        c = t["classes"][m["character"]]
        own = m["reachedAct2"]
        fd = m["meanFloorDifference"]
        out.append(
            f"  - {LABEL[m['character']]}: {pc(own['b'])} → {pc(own['a'])} ({num(own['pairedTable']['a_only'])} pairs against {num(own['pairedTable']['b_only'])}, {pv(own['pairedTable']['mcnemar_p'])}); "
            f"floors {'+' if fd >= 0 else '−'}{abs(fd):.2f}; {'first arm ahead at the class level' if c['ahead'] else ('second arm ahead at the class level' if c['behind'] else 'neither ahead at the class level')}"
        )

neow = data["tests"]["neow"]
allowed = [c for c in CLASSES if neow["verdict"] == "passed" and neow["classes"][c]["ahead"]]
out += ["", f"### the opening-relic advice in Underdocks (item 6 iii): a relic is named for {'no class' if not allowed else ', '.join(LABEL[c] for c in allowed)}"]
for key in ("synergy", "values"):
    t = data["tests"][key]
    flagged = [LABEL[c] for c in CLASSES if t["classes"][c]["behind"]]
    out.append(f"- {key}: classes whose own Underdocks games had the second arm ahead at p < 0.01 (item 6 v): {', '.join(flagged) if flagged else 'none'}")

# audits and timings read from the batches' own files
wins_total = verified_total = sample_total = sample_ok = 0
for arm in ARMS:
    for c in CLASSES:
        d = root / "experiments/underdocks/batches" / f"{arm}-{c}-a0-veteran-keeprelics-underdocks-val-n2000"
        w = d / "wins-audit.json"
        if w.exists():
            a = json.loads(w.read_text())
            wins_total += a["wins_in_batch"]
            verified_total += a["wins_verified"]
        s = d / "sample-audit.json"
        if s.exists():
            a = json.loads(s.read_text())
            sample_total += 1
            sample_ok += 1 if a["all_verified"] is True else 0
out += ["", "### audits", f"- wins re-derived: {verified_total} of {wins_total} (batches with wins have a wins-audit.json)", f"- sample audits passing: {sample_ok} of {sample_total} batches"]
print("\n".join(out))
