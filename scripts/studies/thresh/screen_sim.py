#!/usr/bin/env python3
"""What the development screen of ADR-062 (item 3) does in stylized worlds: how often it advances a threshold and which.

    PYTHONPATH=sim python3 scripts/studies/thresh/screen_sim.py            (run from the repository root; prints Markdown)

The screen picks the threshold with the largest net wins against S and advances it if its net is above zero, it is not 0.2, and in a head-to-head
against 0.2 it is ahead with an exact two-sided McNemar p below 0.20 (`slay2_sim.threshstudy`: the simulation calls the very functions the screen
calls). This script draws the development batches' counts from a model and applies that rule:

* each of the six arms has D discordant pairs against S (ADR-061's rate: 195 of 5,744 pairs), so the net wins of an arm against S have a variance of about D; its
  expected net is the world's value for it;
* **model "shared"** (the one the record quotes first): the arms play S's game up to the first card reward of Act 2 and, after it, mostly the same decisions as their
  neighbours, so their noise is shared. The nets are equicorrelated normals with correlation 1 - H / 2D, chosen so that the difference of two nets has the variance H,
  the number of pairs in which two arms differ (the head-to-head reads it); H is not known before the stage, so the tables show several values;
* **model "independent"**: the six arms are drawn independently (binomial arm-only wins). It overstates how often the screen advances something where nothing works
  (the best of six independent nets is more extreme than the best of six correlated ones): an upper bound;
* the head-to-head of the choice against 0.2 has the realised difference of their net wins (which the batches fix) among H discordant pairs.

The worlds are assumptions, not findings. The point is what an advance means: a threshold is advanced often even when no threshold does anything,
because the best of six noisy nets is above zero most of the time and the head-to-head is read on the same data that picked the choice.
"""
from __future__ import annotations

import numpy as np

from slay2_sim import threshstudy as ts
from slay2_sim.stats import mcnemar_exact

D_VS_S = 195
HEAD_PAIRS = (60, 130, 195)
DRAWS = 20_000
SEED = 20261102
# the true net wins of each threshold against S on the development pairs, in the order of the grid (t010 t020 t030 t045 t060 tnone)
WORLDS: dict[str, tuple[int, ...]] = {
    "no effect anywhere": (0, 0, 0, 0, 0, 0),
    "flat: every threshold +22 (half of ADR-061's net), taking no card 0": (22, 22, 22, 22, 22, 0),
    "0.2 is best: +22 at 0.2, less elsewhere": (10, 22, 15, 5, 0, -10),
    "a peak at 0.3: +35 against +22 at 0.2": (10, 22, 35, 22, 10, -10),
    "a high peak at 0.3: +60 against +22 at 0.2": (10, 22, 60, 35, 10, -10),
}


def draw_nets(world: tuple[int, ...], head_pairs: int, draws: int = DRAWS, seed: int = SEED, d: int = D_VS_S, model: str = "shared") -> np.ndarray:
    """The development nets (arm-only minus S-only wins) of the six arms in ``draws`` repetitions of the stage, a row each, in the order of the grid."""
    tags = list(ts.GRID)
    assert len(world) == len(tags) and model in ("shared", "independent")
    rng = np.random.default_rng(seed)
    mean = np.asarray(world, dtype=float)
    if model == "independent":
        return 2 * rng.binomial(d, 0.5 + mean / (2 * d), size=(draws, len(tags))) - d
    rho = max(0.0, 1.0 - head_pairs / (2.0 * d))
    shared = rng.standard_normal((draws, 1))
    own = rng.standard_normal((draws, len(tags)))
    return np.rint(mean + np.sqrt(d) * (np.sqrt(rho) * shared + np.sqrt(1.0 - rho) * own)).astype(int)


def simulate(world: tuple[int, ...], head_pairs: int, draws: int = DRAWS, seed: int = SEED, d: int = D_VS_S, model: str = "shared") -> dict:
    tags = list(ts.GRID)
    net = draw_nets(world, head_pairs, draws, seed, d, model)
    advanced = 0
    chose = dict.fromkeys(tags, 0)
    reference = tags.index(ts.REPLICATION_TAG)
    for row in net:
        best = int(np.argmax(row))                       # the grid is in increasing threshold: a tie goes to the smaller one
        tag = tags[best]
        head = None
        if row[best] > 0 and tag != ts.REPLICATION_TAG:
            diff = int(row[best] - row[reference])
            a_only = max(0, min(head_pairs, (head_pairs + diff + 1) // 2))
            b_only = head_pairs - a_only
            head = {"armOnly": a_only, "baselineOnly": b_only, "p": mcnemar_exact(a_only, b_only)}
        ok, _ = ts.advance_rule(tag, int(row[best]), head)
        if ok:
            advanced += 1
            chose[tag] += 1
    return {"advance": advanced / draws, "chose": {k: v / draws for k, v in chose.items()}}


def main() -> int:
    print(f"The development screen in stylized worlds: {DRAWS} draws a cell, D = {D_VS_S} discordant pairs against S for every arm. Cells: the share of draws in which the rule "
          f"advances a threshold (and, in brackets, in which it advances 0.3), for H discordant pairs between the choice and 0.2.")
    for model, label in (("shared", "arms that share the noise of the games they share (correlation 1 - H / 2D)"), ("independent", "arms drawn independently (an upper bound where nothing works)")):
        print(f"\n### {label}\n")
        print("| world (true net wins against S) | " + " | ".join(f"H = {h}" for h in HEAD_PAIRS) + " |")
        print("|---|" + "---|" * len(HEAD_PAIRS))
        for name, world in WORLDS.items():
            cells = []
            for h in HEAD_PAIRS:
                r = simulate(world, h, model=model)
                cells.append(f"{r['advance']:.2f} ({r['chose']['t030']:.2f})")
            print(f"| {name}: {', '.join(f'{w:+d}' for w in world)} | " + " | ".join(cells) + " |")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
