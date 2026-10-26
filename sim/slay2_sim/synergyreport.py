"""Stage B2 of the synergy study (ADR-050), secondary descriptives: what each arm did on the card screens and what its decks held.

The primary endpoint compares how often two arms get past the Act-1 boss. This report says *how* the arms differ in the cards they
took, which the endpoint cannot: how often an arm skipped a card reward, and the parts of the advisor's deck index (average card
rating, role coverage, energy curve, unmet needs, scaler lifts, engines) of the deck it brought to the Act-1 boss, computed by
the same Python port the pilot used. The question it answers is whether the arm with the synergy term holds fewer unmet needs, as
the term is meant to make it, whatever that does to winning.

Every figure is a mean over games with an interval that resamples whole seeds (the five classes' games of one seed are not
independent), and a difference between two arms is paired by class and seed, over the games in which both brought a deck to the boss.
Games that did not finish (a simulator error, a timeout) are left out of both arms.

    python -m slay2_sim.synergyreport --arm astar 'experiments/batches/advisor_v1-astar-{class}-a0-veteran-val-n2000' \\
        --arm d0star 'experiments/batches/advisor_v1-d0star-{class}-a0-veteran-val-n2000' --diff astar d0star --out arm-profile.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from . import cardvalue, external
from .synergystudy import deck_features

SCHEMA = 1
CLASSES = ("ironclad", "silent", "regent", "necrobinder", "defect")
PARTS = ("quality", "coverage", "curve", "unmet", "scaler", "engines")
MEASURES = ("deck_size",) + PARTS
ITERS = 2000


def game_rows(episodes: list[dict], character: str) -> list[dict]:
    """One row per finished game: its seed, the advisor's card-screen counters, and (when it reached the Act-1 boss) the deck's parts."""
    boss = {r["seed"]: r for r in cardvalue.extract(episodes)}
    rows = []
    for ep in episodes:
        if ep.get("outcome") not in ("death", "win"):
            continue
        stats = (ep.get("extra") or {}).get("advisor") or {}
        row: dict = {
            "seed": int(ep["seed"]),
            "offers": int(stats.get("offers", 0)),
            "taken": int(stats.get("taken", 0)),
            "skipped": int(stats.get("skipped", 0)),
            "boss": None,
        }
        record = boss.get(row["seed"])
        if record is not None:
            deck = record["deck"]
            row["boss"] = {"deck_size": sum(deck.values()), **deck_features(deck, character)}
        rows.append(row)
    return rows


def bootstrap(values: np.ndarray, clusters: np.ndarray, rng: np.random.Generator, iters: int = ITERS) -> dict:
    """Mean of ``values`` with a 95 % interval that resamples whole clusters (seeds)."""
    if values.size == 0:
        return {"n": 0, "mean": None, "ci95": None}
    _, inverse = np.unique(clusters, return_inverse=True)
    sums = np.bincount(inverse, weights=values)
    counts = np.bincount(inverse).astype(float)
    k = sums.size
    picks = rng.integers(0, k, size=(iters, k))
    means = sums[picks].sum(axis=1) / counts[picks].sum(axis=1)
    lo, hi = np.quantile(means, [0.025, 0.975])
    return {"n": int(values.size), "mean": float(values.mean()), "ci95": [float(lo), float(hi)]}


def ratio_bootstrap(num: np.ndarray, den: np.ndarray, clusters: np.ndarray, rng: np.random.Generator, iters: int = ITERS) -> dict:
    """``sum(num) / sum(den)`` with a 95 % interval that resamples whole clusters (seeds)."""
    if den.sum() == 0:
        return {"n": int(den.sum()), "value": None, "ci95": None}
    _, inverse = np.unique(clusters, return_inverse=True)
    n_sums, d_sums = np.bincount(inverse, weights=num), np.bincount(inverse, weights=den)
    picks = rng.integers(0, n_sums.size, size=(iters, n_sums.size))
    d = d_sums[picks].sum(axis=1)
    ratios = n_sums[picks].sum(axis=1)[d > 0] / d[d > 0]
    lo, hi = np.quantile(ratios, [0.025, 0.975])
    return {"n": int(den.sum()), "value": float(num.sum() / den.sum()), "ci95": [float(lo), float(hi)]}


def summarise(rows: list[tuple[str, dict]], rng: np.random.Generator) -> dict:
    """The card-screen counters and the boss decks' parts of a set of games (``(class, row)`` pairs; the seed clusters across classes)."""
    seeds = np.array([r["seed"] for _, r in rows])
    out: dict = {
        "games": len(rows),
        "offers": int(sum(r["offers"] for _, r in rows)),
        "taken": int(sum(r["taken"] for _, r in rows)),
        "skipped": int(sum(r["skipped"] for _, r in rows)),
        "skip_rate": ratio_bootstrap(
            np.array([r["skipped"] for _, r in rows], dtype=float), np.array([r["offers"] for _, r in rows], dtype=float), seeds, rng
        ),
    }
    at_boss = [(c, r) for c, r in rows if r["boss"] is not None]
    out["boss_decks"] = len(at_boss)
    boss_seeds = np.array([r["seed"] for _, r in at_boss])
    out["at_boss"] = {m: bootstrap(np.array([r["boss"][m] for _, r in at_boss], dtype=float), boss_seeds, rng) for m in MEASURES}
    return out


def profile_arm(by_class: dict[str, list[dict]], rng: np.random.Generator) -> dict:
    """Per class and pooled over the classes; ``by_class`` maps a class to its ``game_rows``."""
    pooled = [(c, r) for c in by_class for r in by_class[c]]
    return {
        "classes": {c: summarise([(c, r) for r in rows], rng) for c, rows in by_class.items()},
        "pooled": summarise(pooled, rng),
    }


def paired_differences(a: dict[str, list[dict]], b: dict[str, list[dict]], rng: np.random.Generator) -> dict:
    """A minus B for every measure, paired by class and seed over the games in which both brought a deck to the Act-1 boss."""
    def pairs(classes: list[str]) -> list[tuple[str, dict, dict]]:
        out = []
        for c in classes:
            index = {r["seed"]: r for r in b[c] if r["boss"] is not None}
            out += [(c, r, index[r["seed"]]) for r in a[c] if r["boss"] is not None and r["seed"] in index]
        return out

    def one(selected: list[tuple[str, dict, dict]]) -> dict:
        seeds = np.array([ra["seed"] for _, ra, _ in selected])
        return {
            "pairs": len(selected),
            "measures": {
                m: bootstrap(np.array([ra["boss"][m] - rb["boss"][m] for _, ra, rb in selected], dtype=float), seeds, rng) for m in MEASURES
            },
        }

    classes = [c for c in a if c in b]
    return {"classes": {c: one(pairs([c])) for c in classes}, "pooled": one(pairs(classes))}


def read_arm(pattern: str) -> tuple[dict[str, list[dict]], dict[str, dict]]:
    """The finished games of one arm in each class, and the batch each came from (id and the hash its manifest names)."""
    rows: dict[str, list[dict]] = {}
    batches: dict[str, dict] = {}
    for c in CLASSES:
        root = Path(pattern.format(**{"class": c}))
        root = root if root.is_absolute() else external.REPO_ROOT / root
        manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
        if str(manifest["config"]["character"]).lower() != c:
            raise ValueError(f"{root.name}: the batch was played as {manifest['config']['character']}, not as {c}")
        rows[c] = game_rows(cardvalue.read_episodes(root), c)
        batches[c] = {"batch_id": manifest["batch_id"], "episodes_gz_sha256": manifest["episodes_gz"]["sha256"], "policy": manifest["policy"]}
    return rows, batches


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--arm", nargs=2, action="append", metavar=("NAME", "PATTERN"), required=True, help="an arm and the folder of its batches, {class} standing for the lower-case class id")
    ap.add_argument("--diff", nargs=2, action="append", metavar=("A", "B"), default=[], help="the paired difference A minus B between two named arms")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    rng = np.random.default_rng(args.seed)
    games: dict[str, dict[str, list[dict]]] = {}
    report: dict = {"kind": "arm-profile", "schema": SCHEMA, "resampling": f"whole seeds, {ITERS} resamples, rng seed {args.seed}", "arms": {}, "differences": {}}
    for name, pattern in args.arm:
        games[name], batches = read_arm(pattern)
        report["arms"][name] = {"batches": batches, **profile_arm(games[name], rng)}
    for a, b in args.diff:
        report["differences"][f"{a}-vs-{b}"] = paired_differences(games[a], games[b], rng)
    Path(args.out).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    for name in report["arms"]:
        p = report["arms"][name]["pooled"]
        skip = p["skip_rate"]
        unmet = p["at_boss"]["unmet"]
        print(f"{name}: {p['games']} games, skipped {p['skipped']} of {p['offers']} offers ({skip['value']:.1%}), unmet needs at the boss {unmet['mean']:+.3f} over {p['boss_decks']} decks")
    for key, d in report["differences"].items():
        u = d["pooled"]["measures"]["unmet"]
        print(f"{key}: unmet needs at the boss {u['mean']:+.3f} (95% {u['ci95'][0]:+.3f} to {u['ci95'][1]:+.3f}) over {d['pooled']['pairs']} pairs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
