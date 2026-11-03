#!/usr/bin/env python3
"""Prints the numbers of the Result block of one leg of ADR-065's price check from the files the run, the audits, the pooling and the reader wrote: the manifests
and episodes of the ten batches of the leg, the pooled file, the per-class comparisons and (if it exists) the reader's output. It reads; it decides nothing (the
verdict of a leg is the reader's, by the rule of item 4). It lives outside the directory that ADR-065 froze (`scripts/studies/skip/`), as
`scripts/underdocks-result-numbers.py` does for ADR-064.

    python3 scripts/skip-result-numbers.py <og|ud> [repo root]
"""
import collections
import gzip
import hashlib
import json
import sys
from pathlib import Path

LEG = sys.argv[1] if len(sys.argv) > 1 else ""
if LEG not in ("og", "ud"):
    raise SystemExit("usage: skip-result-numbers.py <og|ud> [repo root]")
root = Path(sys.argv[2] if len(sys.argv) > 2 else ".")
CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"]
TAIL = "-underdocks" if LEG == "ud" else ""
S1 = root / "experiments" / "skip" / "batches"
S0 = root / ("experiments/underdocks/batches" if LEG == "ud" else "experiments/batches")


def s1_id(c):
    return f"advisor_v1-slot-{c}-a0-veteran-keeprelics{TAIL}-val-n2000"


def s0_id(c):
    return f"advisor_v1-astar-{c}-a0-veteran-keeprelics{TAIL}-val-n2000"


def episodes(directory):
    gz = directory / "episodes.jsonl.gz"
    raw = gzip.open(gz, "rt", encoding="utf-8").read() if gz.exists() else (directory / "episodes.jsonl").read_text(encoding="utf-8")
    return [json.loads(line) for line in raw.splitlines() if line.strip()]


def pc(x, d=2):
    return f"{x * 100:.{d}f} %"


def pts(x, d=2):
    return f"{'-' if x < 0 else '+'}{abs(x * 100):.{d}f}"


def sgn(x, d=3):
    return f"{'-' if x < 0 else '+'}{abs(x):.{d}f}"


pooled_path = root / "experiments" / "skip" / f"pooled-slot-{LEG}.json"
pooled = json.loads(pooled_path.read_text(encoding="utf-8"))
print(f"== leg {LEG}: {pooled_path}  sha256 {hashlib.sha256(pooled_path.read_bytes()).hexdigest()}")

# the games of the arm that charges for a slot (S1) and of the baseline (S0)
for label, base, ident in (("S1 (slot price)", S1, s1_id), ("S0 (baseline)", S0, s0_id)):
    tot = collections.Counter()
    kinds = collections.Counter()
    timeouts = collections.Counter()
    longest = 0.0
    finished, wall = [], 0.0
    for c in CLASSES:
        d = base / ident(c)
        m = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
        counts = m["summary"]["counts"]
        tot.update(counts)
        finished.append(m["finished"])
        wall += m.get("wall_seconds_this_invocation", 0.0)
        for e in episodes(d):
            if e.get("outcome") == "simulator_error":
                kinds[(e.get("error") or "")[:70]] += 1
            if e.get("outcome") == "timeout":
                timeouts[(e.get("error") or "").split("=")[0]] += 1
                longest = max(longest, e.get("wall_seconds", 0.0))
        print(f"  {label} {c:12s} " + " ".join(f"{k}={v}" for k, v in sorted(counts.items()) if v))
    games = sum(tot.values())
    completed = tot["death"] + tot["win"]
    print(f"  {label} TOTAL games={games} completed={completed} deaths={tot['death']} wins={tot['win']} simulator_error={tot['simulator_error']} timeout={tot['timeout']}")
    print(f"  {label} error kinds: " + "; ".join(f"{v} x {k}" for k, v in kinds.most_common()))
    print(f"  {label} timeout kinds: {dict(timeouts)}  longest {longest:.1f} s")
    if base == S1:
        print(f"  {label} finished: first {min(finished)}  last {max(finished)}  wall seconds {wall:.0f}  games/s {games / wall:.2f}")

# overlap of the error seeds by kind
for key in ("_roll_random_relic_rewards", "unhashable", "no legal actions", "card_id"):
    def seeds(base, ident):
        out = set()
        for c in CLASSES:
            for e in episodes(base / ident(c)):
                if e.get("outcome") == "simulator_error" and key in (e.get("error") or ""):
                    out.add((e["character"], e["seed"]))
        return out

    a, b = seeds(S1, s1_id), seeds(S0, s0_id)
    print(f"  error seeds '{key}': S1 {len(a)}  S0 {len(b)}  in both {len(a & b)}")

# audits
wins_audited = wins_verified = sample_drawn = sample_verified = 0
for c in CLASSES:
    d = S1 / s1_id(c)
    w = d / "wins-audit.json"
    if w.exists():
        j = json.loads(w.read_text(encoding="utf-8"))
        wins_audited += j["wins_audited"]
        wins_verified += j["wins_verified"]
    j = json.loads((d / "sample-audit.json").read_text(encoding="utf-8"))
    sample_drawn += j["sample"]["drawn"]
    sample_verified += j["verified"]
print(f"== audits of the S1 batches: wins {wins_verified} of {wins_audited} re-derived; sample games {sample_verified} of {sample_drawn} replayed")

# the pooled comparison (a = S1, b = S0)
b1, b0 = pooled["reachedAct2"]["a"], pooled["reachedAct2"]["b"]
t = pooled["reachedAct2"]["pairedTable"]
cd = pooled["clusteredDifference"]
fd = pooled["floorDifference"]
print(f"== pairs {pooled['pairedSeeds']}, completed by both {pooled['bothCompleted']}, excluded {pooled['excludedNotCompleted']}")
print(f"   past the Act-1 boss: S1 {pc(b1['rate'])} ({b1['games']})  S0 {pc(b0['rate'])} ({b0['games']})  diff {pts(cd['meanAMinusB'])} points  whole-seed 95 % {pts(cd['ci95'][0])} to {pts(cd['ci95'][1])}")
print(f"   paired table: S1 only {t['a_only']}  S0 only {t['b_only']}  both {t['both']}  neither {t['neither']}  exact p {t['mcnemar_p']:.4g}")
print(f"   mean floors S1-S0 {sgn(fd['meanAMinusB'])}  95 % {sgn(fd['ci95'][0])} to {sgn(fd['ci95'][1])}")
a3, b3, t3 = pooled["reachedAct3"]["a"], pooled["reachedAct3"]["b"], pooled["reachedAct3"]["pairedTable"]
print(f"   past the Act-2 boss: S1 {pc(a3['rate'])} ({a3['games']})  S0 {pc(b3['rate'])} ({b3['games']})  S1 only {t3['a_only']}  S0 only {t3['b_only']}  p {t3['mcnemar_p']:.4g}")
w, tw = pooled["wins"], pooled["wins"]["pairedTable"]
print(f"   wins S1 {w['a']}  S0 {w['b']}  S1 only {tw['a_only']}  S0 only {tw['b_only']}  both {tw['both']}  p {tw['mcnemar_p']:.4g}")

# each class on its own
for c in CLASSES:
    p = json.loads((root / "experiments" / "skip" / "per-class" / f"slot-{LEG}-{c}.json").read_text(encoding="utf-8"))
    r, tt, f = p["reachedAct2"], p["reachedAct2"]["pairedTable"], p["floorDifference"]
    ws = p["pairedWinTable"]
    print(
        f"   {c:12s} pairs {p['bothCompleted']}  S1 {pc(r['a']['rate'], 1)}  S0 {pc(r['b']['rate'], 1)}  S1 only {tt['a_only']}  S0 only {tt['b_only']}  p {tt['mcnemar_p']:.3g}"
        f"  floors {sgn(f['meanAMinusB'], 2)} ({sgn(f['ci95'][0], 2)} to {sgn(f['ci95'][1], 2)})  wins S1 {p['a']['wins']} S0 {p['b']['wins']} (S1 only {ws['a_only']}, S0 only {ws['b_only']}, p {ws['mcnemar_p']:.3g})"
    )

# the reader's output, if it exists
reading = root / "experiments" / "skip" / "reading.json"
if reading.exists():
    r = json.loads(reading.read_text(encoding="utf-8"))
    print(f"== reading.json sha256 {hashlib.sha256(reading.read_bytes()).hexdigest()}  legs {list(r['legs'])}  harmless {r['harmless']}")
    if LEG in r["legs"]:
        leg = r["legs"][LEG]
        print(f"   verdict {leg['verdict']}  notBehind {leg['notBehind']}")
        sh = r["skipShares"][LEG]
        s1, s0 = sh["s1"], sh["s0"]
        print(f"   card rewards skipped: S1 {pc(s1['share'], 1)} ({s1['skipped']} of {s1['cardRewards']})  S0 {pc(s0['share'], 1)} ({s0['skipped']} of {s0['cardRewards']})")
        for act, v in sorted((s1.get("byAct") or {}).items()):
            print(f"      S1 {act}: {pc(v['share'], 1)} ({v['skipped']} of {v['cardRewards']})")
