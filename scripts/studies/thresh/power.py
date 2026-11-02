#!/usr/bin/env python3
"""The power tables of ADR-062, computed from the committed result of ADR-061 (nothing is typed by hand) and from nothing else.

    python3 scripts/studies/thresh/power.py            (run from the repository root; prints Markdown)

The pairs of a test are those both games completed. The rates are those of the Act-2 arm of ADR-061 (A2, the threshold 0.2 in Act 2 alone) in Ironclad
and Defect on the `val2` seeds: the share of pairs in which exactly one of the two games was won (D / pair), the net wins per pair (the arm-only minus the
baseline-only wins) and the share of pairs lost to a simulator error, a step limit or a timeout. Those seeds are the ones that raised the question, so the
effect read from them is probably an overestimate (a winner's curse); the tables therefore also show smaller effects.

For a test at the level a (the study-wise 0.05 divided by the number of tests that are played), the power is the probability, given D discordant pairs of
which each goes to the arm with probability theta, that

* the exact two-sided McNemar p is below a with the arm ahead (the binomial enumeration, exact), and
* the whole-seed interval of the pooled difference at the level 1 - a excludes zero (a normal approximation: the net over a standard error of
  sqrt(D) / pairs, inflated by 15 % because the two classes' games of one seed are not independent pairs).

The reading rule needs both and the all-pairs analysis; the smaller of the first two figures is therefore an upper bound of the power of the rule. The
all-pairs analysis and the rule on dropped pairs are not modelled; they rarely bind when the primary test passes by a margin.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from statistics import NormalDist

ROOT = Path(__file__).resolve().parents[3]
CLASSES = ("ironclad", "defect")
SEEDS_PER_CLASS_HELD_OUT = 10_000
SEEDS_PER_CLASS_DEV = 3_000
INFLATION = 1.15


def logpmf(k: int, n: int, p: float) -> float:
    if p <= 0.0:
        return 0.0 if k == 0 else -math.inf
    if p >= 1.0:
        return 0.0 if k == n else -math.inf
    return math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1) + k * math.log(p) + (n - k) * math.log1p(-p)


def exact_p(a: int, b: int) -> float:
    """The exact two-sided McNemar p: twice the smaller binomial tail of n = a + b at 1/2, at most 1."""
    n = a + b
    if n == 0:
        return 1.0
    k = min(a, b)
    return min(1.0, 2 * sum(math.exp(logpmf(i, n, 0.5)) for i in range(k + 1)))


def critical(n: int, alpha: float) -> int | None:
    """The smallest arm-only count a, of n discordant pairs, for which the exact two-sided p is below alpha with the arm ahead."""
    for a in range(n // 2 + 1, n + 1):
        if exact_p(a, n - a) < alpha:
            return a
    return None


def power_exact(d: int, theta: float, alpha: float) -> float:
    c = critical(d, alpha)
    return 0.0 if c is None else sum(math.exp(logpmf(a, d, theta)) for a in range(c, d + 1))


def power_interval(d: int, theta: float, pairs: int, alpha: float, inflation: float = INFLATION) -> float:
    z = NormalDist().inv_cdf(1 - alpha / 2)
    net = d * (2 * theta - 1)
    se = math.sqrt(d) / pairs * inflation
    return 1 - NormalDist().cdf(z - (net / pairs) / se)


def rates(root: Path = ROOT) -> dict:
    """D / pair, net / pair and the share of pairs lost, for A2 of ADR-061 in the study's two classes."""
    pairs = a_only = b_only = excluded = seeds = 0
    for c in CLASSES:
        f = json.loads((root / "experiments" / "acts" / "per-class" / f"A2-{c}.json").read_text(encoding="utf-8"))
        t = f["pairedWinTable"]
        pairs += f["bothCompleted"]
        excluded += f["excludedNotCompleted"]
        seeds += f["pairedSeeds"]
        a_only += t["a_only"]
        b_only += t["b_only"]
    return {
        "pairs": pairs, "aOnly": a_only, "bOnly": b_only, "d": a_only + b_only, "net": a_only - b_only,
        "dPerPair": (a_only + b_only) / pairs, "netPerPair": (a_only - b_only) / pairs, "lost": excluded / seeds,
    }


def table_vs_s(r: dict, pairs: int, alpha: float, fractions=(1.0, 0.75, 0.5, 0.33)) -> list[str]:
    d = round(r["dPerPair"] * pairs)
    out = [f"| share of ADR-061's net | net wins | theta | exact test | interval (SE x {INFLATION}) |", "|---|---|---|---|---|"]
    for f in fractions:
        net = f * r["netPerPair"] * pairs
        theta = (d + net) / (2 * d)
        out.append(f"| {f:.2f} | {net:.0f} | {theta:.3f} | {power_exact(d, theta, alpha):.2f} | {power_interval(d, theta, pairs, alpha):.2f} |")
    return out


def table_head_to_head(pairs: int, alpha: float, ds=(100, 200, 300, 400), thetas=(0.55, 0.60, 0.65, 0.70)) -> list[str]:
    out = ["| D | " + " | ".join(f"theta = {t:.2f}" for t in thetas) + " |", "|---|" + "---|" * len(thetas)]
    for d in ds:
        out.append(f"| {d} | " + " | ".join(f"{power_exact(d, t, alpha):.2f} / {power_interval(d, t, pairs, alpha):.2f}" for t in thetas) + " |")
    return out


def main() -> int:
    r = rates()
    held = round(2 * SEEDS_PER_CLASS_HELD_OUT * (1 - r["lost"]))
    dev = round(2 * SEEDS_PER_CLASS_DEV * (1 - r["lost"]))
    print(f"ADR-061, A2 (0.2 in Act 2) in Ironclad and Defect on val2: {r['pairs']} pairs, {r['aOnly']} won only by the arm, {r['bOnly']} only by S: "
          f"D = {r['d']} ({r['dPerPair']:.4f} a pair), net {r['net']:+d} ({100 * r['netPerPair']:.3f} points of the win share), {100 * r['lost']:.2f} % of the seeds' pairs lost.")
    print(f"Expected pairs: {held} held-out ({SEEDS_PER_CLASS_HELD_OUT} seeds x 2 classes), {dev} development ({SEEDS_PER_CLASS_DEV} x 2).\n")
    for label, alpha in (("T1 alone (the screen advanced nothing): level 0.05", 0.05), ("T1, T2 and T3 (the screen advanced a threshold): level 0.05 / 3", 0.05 / 3)):
        print(f"### Held-out test of an arm against S, {label}, {held} pairs, D = {round(r['dPerPair'] * held)}\n")
        print("\n".join(table_vs_s(r, held, alpha)) + "\n")
    alpha = 0.05 / 3
    print(f"### T3: the screen's choice against 0.2, level 0.05 / 3 = {alpha:.5f}, {held} pairs; D = pairs in which exactly one of the two won; cells: exact test / interval\n")
    print("\n".join(table_head_to_head(held, alpha)) + "\n")
    d = round(r["dPerPair"] * dev)
    sd = math.sqrt(d)
    print(f"### The development screen: an arm like A2 against S on {dev} pairs has D = {d}; its net wins have a standard deviation of about {sd:.1f}; "
          f"the net at the full ADR-061 effect is {r['netPerPair'] * dev:.0f}, at half {r['netPerPair'] * dev / 2:.0f}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
