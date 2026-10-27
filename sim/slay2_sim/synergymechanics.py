"""A descriptive reading of the unmet-need part of the advisor's index, one mechanic at a time (stage B1 of ADR-050).

Stage B1 gives the unmet-need part of the index one slope for all mechanics together (``slay2_sim.synergystudy``). That hides which
needs the simulated runs support: a pooled slope below the advisor's weight could come from one badly tagged mechanic or from all
of them. Here the part is split into one column per mechanic, each the index points that mechanic's unmet need takes from the
deck's cards, and the logistic model of B1 is fitted with those columns in place of the single one (the other parts stay in):

    logit P(pass) = controls + b_q quality + b_c coverage + b_k curve + b_s scalers + b_e engines + sum_m b_m unmet_m

Each ``b_m / b_q`` is read as in B1, relative to a point of average card rating: near the pooled unmet-need ratio, the mechanic's
need is worth what the pooled slope says; far below it, the random-draft runs do not support that need at the weight the tags
give it; negative, the runs went the other way.

What this is not: a test (the tags were not tuned by it and the table is not changed by it), a statement about the live game
(the simulator is unverified), or corrected for looking at many mechanics at once: with 25 intervals read together a few will
miss zero by chance. A mechanic that few decks need, or that the pilot's random picks rarely leave unmet, has an interval too wide to
read. The runs are the training and development seeds the measured card values were fitted on.

    OMP_NUM_THREADS=1 python -m slay2_sim.synergymechanics --out experiments/synergy/b1-mechanics.json

(With other jobs running, leave the numerical library one thread: its threads wait on each other and the report takes ten times as long.)
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from . import advisor, synergystudy as study

SCHEMA = 1
MIN_SD = 1e-3  # a mechanic whose unmet part varies less than this (index points) across the decks is left out of the model
MODEL = study.FIRST_JUDGEMENT
OTHER_PARTS = ("quality", "coverage", "curve", "scaler", "engines")  # B1's other parts, kept in the model beside the split


def mechanic_columns(deck_counts: dict[str, int], character: str | None = None, act_index: int = study.ACT_INDEX, model: advisor.Model = MODEL) -> dict[str, float]:
    """What each mechanic's unmet need takes from the deck's index, in index points (0 or negative). They add up to the unmet-need
    part of ``advisor.synergy_components``: a card holds back ``prior x share x (1 - fit) x (1 - future support)`` of its rating, and
    ``1 - fit`` is its needs' weighted shortfall, so each need owns its weighted share of it."""
    deck = advisor.deck_from_ids(card for card, n in deck_counts.items() for _ in range(n))
    supply = advisor.supply_of(deck, character)
    free = 1 - advisor.FUTURE_SUPPORT[act_index]
    out = dict.fromkeys(advisor.mechanic_ids(), 0.0)
    for card_id, count in deck.items():
        needs, total_weight, share = advisor.needs_of(card_id, model)
        if total_weight == 0:
            continue
        scale = advisor.synergy_tags(card_id).scale
        prior = advisor.catalog()[card_id]["prior"]
        for mechanic, weight in needs:
            shortfall = weight * (1 - advisor.saturation(mechanic, supply[mechanic] / scale.get(mechanic, 1))) / total_weight
            out[mechanic] -= count * prior * share * free * shortfall / advisor.SYNERGY_CARDS
    return out


def build_table(cohorts: tuple[study.Cohort, ...]) -> tuple[study.Table, np.ndarray, list[dict]]:
    """B1's table (controls, the index parts, outcome, seed) and, beside it, one unmet-need column per mechanic."""
    blocks, metas = [], []
    mechanics = advisor.mechanic_ids()
    for c in cohorts:
        records, meta = study.load_cohort(c)
        character = c.character.lower()
        X0, _ = study.controls(records)
        parts = [study.deck_features(r["deck"], character) for r in records]
        F = np.array([[p[f] for f in study.FEATURES] for p in parts])
        M = np.array([[v for v in mechanic_columns(r["deck"], character).values()] for r in records])
        blocks.append((X0, F, M, np.array([r["passed"] for r in records], dtype=float), np.array([r["seed"] for r in records], dtype=np.int64)))
        metas.append(meta)
    width = sum(b[0].shape[1] for b in blocks)
    rows = sum(len(b[3]) for b in blocks)
    X0, F, M = np.zeros((rows, width)), np.zeros((rows, len(study.FEATURES))), np.zeros((rows, len(mechanics)))
    y, g, which = np.zeros(rows), np.zeros(rows, dtype=np.int64), np.zeros(rows, dtype=np.int64)
    r = col = 0
    for k, (x, f, m, yy, gg) in enumerate(blocks):
        n = len(yy)
        X0[r:r + n, col:col + x.shape[1]] = x
        F[r:r + n], M[r:r + n], y[r:r + n], g[r:r + n], which[r:r + n] = f, m, yy, gg, k
        r += n
        col += x.shape[1]
    return study.Table(X0, F, y, g, which), M, metas


def build_report(draws: int = 200, seed: int = 0, cohort_set: tuple[study.Cohort, ...] = study.COHORTS) -> dict:
    table, M, metas = build_table(cohort_set)
    mechanics = advisor.mechanic_ids()
    unmet_column = study.FEATURES.index("unmet")
    # the columns add up to the part B1 reads, or the split is not a split of it
    if not np.allclose(M.sum(axis=1), table.F[:, unmet_column], atol=1e-9):
        raise ValueError("the per-mechanic columns do not add up to the unmet-need part of the index")
    sd = M.std(axis=0)
    keep = [j for j in range(len(mechanics)) if sd[j] > MIN_SD]
    others = [study.FEATURES.index(f) for f in OTHER_PARTS]
    X_split = np.column_stack([table.X0, table.F[:, others], M[:, keep]])
    X_pooled = np.column_stack([table.X0, table.F[:, others], table.F[:, unmet_column]])
    k = table.X0.shape[1]
    quality = OTHER_PARTS.index("quality")
    resamples = study.seed_bootstrap(table.g, draws, seed)

    def slopes(X: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        return study.fit(X, table.y)[k:], np.array([study.fit(X[idx], table.y[idx])[k:] for idx in resamples])

    split, split_boots = slopes(X_split)
    pooled, pooled_boots = slopes(X_pooled)
    first_mechanic = len(OTHER_PARTS)

    def ratio(beta: np.ndarray, boots: np.ndarray, j: int) -> dict:
        lo, hi = np.percentile(boots[:, j] / boots[:, quality], [2.5, 97.5])
        return {"to_quality": round(float(beta[j] / beta[quality]), 3), "ci95": [round(float(lo), 3), round(float(hi), 3)]}

    table_of = advisor.synergy_table()["mechanics"]
    rows = []
    for position, j in enumerate(keep):
        lo, hi = np.percentile(split_boots[:, first_mechanic + position], [2.5, 97.5])
        rows.append({
            "mechanic": mechanics[j],
            "label": table_of[mechanics[j]]["label"],
            "decks_with_the_need": int((np.abs(M[:, j]) > 1e-6).sum()),
            "mean_points": round(float(M[:, j].mean()), 4),
            "sd_points": round(float(sd[j]), 3),
            "per_point": round(float(split[first_mechanic + position]), 4),
            "ci95": [round(float(lo), 4), round(float(hi), 4)],
            **{f"ratio_{key}": value for key, value in ratio(split, split_boots, first_mechanic + position).items()},
        })
    rows.sort(key=lambda r: (-r["sd_points"], r["mechanic"]))
    return {
        "schema": SCHEMA, "kind": "synergy-mechanics", "stage": "B1 of ADR-050 (exploratory, descriptive: training and development seeds)",
        "outcome": "the run gets past the Act-1 boss", "act_index": study.ACT_INDEX, "risk": "balanced",
        "model_strengths": {"needs": MODEL.needs, "scalers": MODEL.scalers, "engines": MODEL.engines},
        "advisor": {
            "synergy_table_sha256": advisor.synergy_table()["sha256"],
            "catalog_sha256": json.loads((advisor.DATA / f"cards.{advisor.BUILD_ID}.json").read_text(encoding="utf-8"))["sha256"],
        },
        "model": "logistic regression: the controls of each cohort, quality, coverage, curve, scalers, engines, and one unmet-need column per mechanic",
        "bootstrap_draws": draws, "bootstrap_seed": seed, "resampling": "whole seeds",
        "cohorts": metas, "rows": int(len(table.y)), "pass_rate": round(float(table.y.mean()), 4),
        "mechanics_in_the_vocabulary": len(mechanics), "mechanics_in_the_model": len(keep), "min_sd_points": MIN_SD,
        "pooled_unmet_ratio": ratio(pooled, pooled_boots, len(OTHER_PARTS)),
        "quality_per_point": round(float(split[quality]), 4),
        "mechanics": rows,
        "reading": f"descriptive; {len(keep)} intervals read together are not corrected for it; the tags were not tuned by this and the table is unchanged",
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    ap.add_argument("--bootstrap", type=int, default=200)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args(argv)
    report = build_report(args.bootstrap, args.seed)
    out = Path(args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    pooled = report["pooled_unmet_ratio"]
    print(f"wrote {out}: {report['rows']} boss fights, {report['mechanics_in_the_model']} of {report['mechanics_in_the_vocabulary']} mechanics in the model")
    print(f"  pooled unmet-need ratio to quality {pooled['to_quality']:+.2f} {pooled['ci95']}")
    for r in report["mechanics"]:
        print(f"  {r['mechanic']:12s} ratio {r['ratio_to_quality']:+7.2f} {r['ratio_ci95']}   sd {r['sd_points']:.3f}   decks with the need {r['decks_with_the_need']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
