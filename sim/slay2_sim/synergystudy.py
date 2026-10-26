"""Stage B1 of the synergy study (ADR-050): do simulated runs carry signal for the parts of the advisor's synergy term?

The advisor's deck index is the mean rating of the cards plus role coverage plus a synergy term made of three parts, all hand-set
judgements (``slay2_sim.advisor``): what unmet needs take from a card's rating, what Strength, Dexterity and Focus add to the
cards they lift, and what engines (sources and payoffs together) add. The simulator plays thousands of runs whose card picks
were made at random (``rules_explore``, the data behind the measured card values), and records the deck each run brought to
the Act-1 boss and whether it got past the boss. Because chance, not taste, decided the decks, how often a deck passes can be
read against its index:

    logit P(pass) = controls (HP, max HP, potions, upgrades, boss, relics) + b_q quality + b_c coverage + b_k curve
                    + b_u unmet needs + b_s scalers + b_e engines

``b_u / b_q`` is the worth of a point of unmet-need penalty relative to a point of the average card rating, as the simulator
sees it; the same for scalers and engines. A ratio near 1 says the advisor's weight is about right, near 0 that the part carries
no signal. A second question guards against a trap: the index parts are functions of which cards the deck holds, so they could carry
signal only because they stand in for card quality. ``beyond_additive_card_values`` asks whether they add to a model that
already knows every card (a ridge logistic on card counts, one model per class, the form of the measured values of
``slay2_sim.cardvalue``): the held-out log loss of that model with and without the three parts.

What this is not: a test of the advisor (stage B2 is, with the advisor playing), a statement about the real game
(the simulator is unverified), a statement about engines for a pilot that builds them on purpose (random decks rarely hold
a whole engine), or confirmatory (it reads the training and development seeds the measured values were fitted on).

    python -m slay2_sim.synergystudy --out experiments/synergy/b1-calibration.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from . import advisor, cardvalue, external

SCHEMA = 1
FOLDS = 5
RIDGE = 1e-3
FEATURES = ("quality", "coverage", "curve", "unmet", "scaler", "engines")
ACT_INDEX = 0  # the Act-1 boss: the advisor's act-1 weights


@dataclass(frozen=True)
class Cohort:
    name: str
    character: str
    partition: str
    path: str


# The exploration batches of ADR-031 / ADR-034 (training seeds, one per class) and the Ironclad development batch of ADR-045.
COHORTS = (
    Cohort("ironclad-train", "Ironclad", "train", "experiments/cardvalue/explore-ironclad-a0-train-rep0"),
    Cohort("silent-train", "Silent", "train", "experiments/cardvalue/explore-silent-a0-train-rep0"),
    Cohort("regent-train", "Regent", "train", "experiments/cardvalue/explore-regent-a0-train-rep0"),
    Cohort("necrobinder-train", "Necrobinder", "train", "experiments/cardvalue/explore-necrobinder-a0-train-rep0"),
    Cohort("defect-train", "Defect", "train", "experiments/cardvalue/explore-defect-a0-train-rep0"),
    Cohort("ironclad-dev", "Ironclad", "dev", "experiments/cardvalue/explore3-ironclad-a0-dev-o5000-n5000"),
)


# ------------------------------------------------------------------------------------------------------------ data
def deck_features(deck_counts: dict[str, int], character: str | None = None, act_index: int = ACT_INDEX) -> dict[str, float]:
    """The advisor's index parts for one deck of a class (balanced risk), in index points."""
    deck = advisor.deck_from_ids([card for card, n in deck_counts.items() for _ in range(n)])
    profile = advisor.profile_deck(deck, act_index, character=character)
    terms = advisor.score_terms(profile, advisor.base_weights(act_index, "balanced"))
    unmet, scaler, engines = advisor.synergy_components(deck, act_index, character=character)
    return {
        "quality": terms.quality,
        "coverage": sum(terms.coverage.values()),
        "curve": terms.curve,
        "unmet": unmet,
        "scaler": scaler,
        "engines": engines,
    }


def load_cohort(cohort: Cohort) -> tuple[list[dict], dict]:
    """The boss-fight records of an exploration batch, after checking that the episodes file is the one its manifest names."""
    root = external.REPO_ROOT / cohort.path
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    packed = root / "episodes.jsonl.gz"
    digest = hashlib.sha256(packed.read_bytes()).hexdigest()
    if digest != manifest["episodes_gz"]["sha256"]:
        raise ValueError(f"{cohort.name}: episodes.jsonl.gz is not the file its manifest names")
    if manifest["config"]["character"] != cohort.character:
        raise ValueError(f"{cohort.name}: the batch was played with {manifest['config']['character']}")
    records = cardvalue.extract(cardvalue.read_episodes(root))
    meta = {
        "name": cohort.name, "character": cohort.character, "partition": cohort.partition, "batch_id": manifest["batch_id"],
        "episodes_gz_sha256": digest, "boss_fights": len(records),
        "pass_rate": round(float(np.mean([r["passed"] for r in records])), 4),
        "policy": manifest["policy"]["name"],
    }
    return records, meta


def controls(records: list[dict]) -> tuple[np.ndarray, list[str]]:
    """Intercept, HP fraction, max HP, potions, upgrades, boss and the relics that 2 % or more of the runs held (as in cardvalue)."""
    n = len(records)
    bosses = sorted({r["boss"] for r in records})
    relics = sorted({x for r in records for x in r["relics"]})
    common = [x for x in relics if 0.02 <= sum(1 for r in records if x in r["relics"]) / n <= 0.999 and x != "BURNING_BLOOD"]
    names = ["intercept", "hp_frac", "max_hp_per_100", "potions", "upgraded"] + [f"boss:{b}" for b in bosses[1:]] + [f"relic:{x}" for x in common]
    column = {name: k for k, name in enumerate(names)}
    X = np.zeros((n, len(names)))
    for i, r in enumerate(records):
        X[i, 0], X[i, 1], X[i, 2], X[i, 3], X[i, 4] = 1.0, r["hp_frac"], r["max_hp"] / 100.0, r["potions"], r["upgraded"]
        if r["boss"] != bosses[0]:
            X[i, column[f"boss:{r['boss']}"]] = 1.0
        for x in common:
            if x in r["relics"]:
                X[i, column[f"relic:{x}"]] = 1.0
    return X, names


@dataclass
class Table:
    X0: np.ndarray       # controls
    F: np.ndarray        # index parts, columns as FEATURES
    y: np.ndarray
    g: np.ndarray        # game seed (rows of one seed are resampled together)
    cohort: np.ndarray   # index of the cohort of each row


def build_table(cohorts: tuple[Cohort, ...] = COHORTS) -> tuple[Table, list[dict]]:
    """One block-diagonal controls matrix (each cohort has its own intercept, boss and relic effects) and the index parts."""
    blocks, metas = [], []
    for c in cohorts:
        records, meta = load_cohort(c)
        X0, _ = controls(records)
        F = np.array([[deck_features(r["deck"], c.character.lower())[f] for f in FEATURES] for r in records])
        blocks.append((X0, F, np.array([r["passed"] for r in records], dtype=float), np.array([r["seed"] for r in records], dtype=np.int64)))
        metas.append(meta)
    width = sum(b[0].shape[1] for b in blocks)
    rows = sum(len(b[2]) for b in blocks)
    X0 = np.zeros((rows, width))
    F, y, g, which = np.zeros((rows, len(FEATURES))), np.zeros(rows), np.zeros(rows, dtype=np.int64), np.zeros(rows, dtype=np.int64)
    r = col = 0
    for k, (x, f, yy, gg) in enumerate(blocks):
        n = len(yy)
        X0[r:r + n, col:col + x.shape[1]] = x
        F[r:r + n], y[r:r + n], g[r:r + n], which[r:r + n] = f, yy, gg, k
        r += n
        col += x.shape[1]
    return Table(X0, F, y, g, which), metas


def select(table: Table, which: list[int]) -> Table:
    keep = np.isin(table.cohort, which)
    X0 = table.X0[keep]
    X0 = X0[:, np.flatnonzero(np.abs(X0).sum(axis=0) > 0)]  # drop the controls of cohorts left out
    return Table(X0, table.F[keep], table.y[keep], table.g[keep], table.cohort[keep])


# ---------------------------------------------------------------------------------------------------------- models
def design(table: Table, features: tuple[str, ...]) -> np.ndarray:
    cols = [FEATURES.index(f) for f in features]
    return np.column_stack([table.X0, table.F[:, cols]]) if cols else table.X0


def fit(X: np.ndarray, y: np.ndarray) -> np.ndarray:
    return cardvalue.fit_logistic(X, y, RIDGE, np.ones(X.shape[1], dtype=bool))


def cv_loss(X: np.ndarray, y: np.ndarray, g: np.ndarray, folds: int = FOLDS) -> tuple[np.ndarray, np.ndarray]:
    """Held-out probabilities and per-row log loss; a seed is on one side of the split only (all of its rows, whatever the class)."""
    fold = g % folds
    p = np.zeros(len(y))
    for k in range(folds):
        tr, te = fold != k, fold == k
        p[te] = cardvalue.predict(X[te], fit(X[tr], y[tr]))
    return p, -(y * np.log(p + 1e-12) + (1 - y) * np.log(1 - p + 1e-12))


def seed_bootstrap(g: np.ndarray, draws: int, seed: int) -> list[np.ndarray]:
    """Row indices of ``draws`` resamples of whole seeds."""
    rng = np.random.default_rng(seed)
    seeds = np.unique(g)
    rows = {s: np.flatnonzero(g == s) for s in seeds}
    return [np.concatenate([rows[s] for s in rng.choice(seeds, size=len(seeds), replace=True)]) for _ in range(draws)]


def paired_loss_gap(loss_a: np.ndarray, loss_b: np.ndarray, g: np.ndarray, draws: int, seed: int) -> dict:
    """Mean of (loss_b - loss_a) with a 95 % interval from resampling seeds; negative: model b predicts better."""
    delta = loss_b - loss_a
    seeds, inverse = np.unique(g, return_inverse=True)
    total = np.bincount(inverse, weights=delta)
    count = np.bincount(inverse).astype(float)
    rng = np.random.default_rng(seed)
    means = []
    for _ in range(draws):
        pick = rng.integers(0, len(seeds), size=len(seeds))
        means.append(total[pick].sum() / count[pick].sum())
    lo, hi = np.percentile(means, [2.5, 97.5])
    return {"mean": round(float(delta.mean()), 5), "ci95": [round(float(lo), 5), round(float(hi), 5)]}


def analyse(table: Table, draws: int, seed: int) -> dict:
    """Nested models by cross-validation, and the full model's slopes with seed-bootstrap intervals."""
    y, g = table.y, table.g
    sets = {
        "controls": (),
        "index": ("quality", "coverage", "curve"),
        "index+synergy": ("quality", "coverage", "curve", "unmet", "scaler", "engines"),
        "index+needs": ("quality", "coverage", "curve", "unmet"),
        "index+needs+scalers": ("quality", "coverage", "curve", "unmet", "scaler"),
    }
    losses, out_cv = {}, {}
    for name, feats in sets.items():
        p, loss = cv_loss(design(table, feats), y, g)
        losses[name] = loss
        out_cv[name] = {"log_loss": round(float(loss.mean()), 5), "auc": round(cardvalue.auc(y, p), 4)}
    gaps = {
        "synergy_added_to_index": paired_loss_gap(losses["index"], losses["index+synergy"], g, draws, seed),
        "needs_added_to_index": paired_loss_gap(losses["index"], losses["index+needs"], g, draws, seed),
        "scalers_added_to_needs": paired_loss_gap(losses["index+needs"], losses["index+needs+scalers"], g, draws, seed),
        "engines_added_to_needs_and_scalers": paired_loss_gap(losses["index+needs+scalers"], losses["index+synergy"], g, draws, seed),
    }
    X = design(table, FEATURES)
    k = table.X0.shape[1]
    beta = fit(X, y)
    boots = np.array([fit(X[idx], y[idx])[k:] for idx in seed_bootstrap(g, draws, seed + 1)])
    sd = table.F.std(axis=0)
    coefficients, ratios = {}, {}
    for j, name in enumerate(FEATURES):
        lo, hi = np.percentile(boots[:, j], [2.5, 97.5])
        coefficients[name] = {"per_point": round(float(beta[k + j]), 4), "ci95": [round(float(lo), 4), round(float(hi), 4)], "sd_points": round(float(sd[j]), 3)}
        ratio = boots[:, j] / boots[:, 0]
        rlo, rhi = np.percentile(ratio, [2.5, 97.5])
        ratios[name] = {"to_quality": round(float(beta[k + j] / beta[k]), 3), "ci95": [round(float(rlo), 3), round(float(rhi), 3)]}
    return {
        "rows": int(len(y)), "pass_rate": round(float(y.mean()), 4), "cross_validation": out_cv,
        "loss_gaps": gaps, "coefficients": coefficients, "ratios": ratios,
    }


L2_GRID = (1.0, 3.0, 10.0, 30.0)  # the card-count model's penalty, chosen by the cross-validation of the model without the parts


def _cv_losses(X: np.ndarray, y: np.ndarray, g: np.ndarray, penalised: np.ndarray, l2: float) -> np.ndarray:
    fold = g % FOLDS
    p = np.zeros(len(y))
    for k in range(FOLDS):
        tr, te = fold != k, fold == k
        p[te] = cardvalue.predict(X[te], cardvalue.fit_logistic(X[tr], y[tr], l2, penalised))
    return -(y * np.log(p + 1e-12) + (1 - y) * np.log(1 - p + 1e-12))


def beyond_additive_card_values(draws: int, seed: int, cohort_set: tuple[Cohort, ...] = COHORTS) -> dict:
    """Held-out log loss of a model that knows every card (one ridge-logistic per class, the controls, a coefficient per card
    seen in 30 or more decks) against the same model with the three synergy parts added. Negative gaps: the parts help."""
    per_cohort, all_a, all_b, all_g = {}, [], [], []
    for cohort in cohort_set:
        records, _ = load_cohort(cohort)
        X, y, g, _, penalised = cardvalue.design(records, cardvalue.vocabulary(records))
        parts = np.array([[deck_features(r["deck"], cohort.character.lower())[f] for f in ("unmet", "scaler", "engines")] for r in records])
        l2 = min(L2_GRID, key=lambda v: _cv_losses(X, y, g, penalised, v).mean())
        loss_a = _cv_losses(X, y, g, penalised, l2)
        loss_b = _cv_losses(np.column_stack([X, parts]), y, g, np.concatenate([penalised, np.zeros(3, dtype=bool)]), l2)
        per_cohort[cohort.name] = {
            "rows": int(len(y)), "l2": l2, "log_loss_cards": round(float(loss_a.mean()), 5), "log_loss_cards_and_parts": round(float(loss_b.mean()), 5),
            "gap": paired_loss_gap(loss_a, loss_b, g, draws, seed),
        }
        all_a.append(loss_a), all_b.append(loss_b), all_g.append(g)
    a, b, g = np.concatenate(all_a), np.concatenate(all_b), np.concatenate(all_g)
    return {
        "model": "ridge logistic on card counts and the controls, one per class; the parts are added unpenalised",
        "per_cohort": per_cohort,
        "pooled": {"rows": int(len(g)), "log_loss_cards": round(float(a.mean()), 5), "log_loss_cards_and_parts": round(float(b.mean()), 5), "gap": paired_loss_gap(a, b, g, draws, seed)},
    }


def calibrated_weight(ratio: float) -> float:
    """The weight a synergy part keeps: its slope relative to the average card rating, in steps of 0.05 and no larger than the
    hand-set 1 (a part the data value less than the advisor does is scaled down; one they value more is left at its judgement)."""
    return round(round(min(1.0, max(0.0, ratio)) / 0.05) * 0.05, 2)


def build_report(draws: int = 200, seed: int = 0, cohort_set: tuple[Cohort, ...] = COHORTS) -> dict:
    table, metas = build_table(cohort_set)
    cohorts = {m["name"]: k for k, m in enumerate(metas)}
    all_cohorts = list(cohorts.values())
    train_only = [k for n, k in cohorts.items() if metas[k]["partition"] == "train"]
    report = {
        "schema": SCHEMA, "kind": "synergy-calibration", "stage": "B1 of ADR-050 (exploratory: training and development seeds)",
        "outcome": "the run gets past the Act-1 boss", "act_index": ACT_INDEX, "risk": "balanced",
        "advisor": {
            "synergy_table_sha256": advisor.synergy_table()["sha256"],
            "catalog_sha256": json.loads((advisor.DATA / f"cards.{advisor.BUILD_ID}.json").read_text(encoding="utf-8"))["sha256"],
        },
        "folds": FOLDS, "bootstrap_draws": draws, "cohorts": metas,
        "pooled": {"all_cohorts": analyse(select(table, all_cohorts), draws, seed), "training_cohorts_only": analyse(select(table, train_only), draws, seed)},
        "per_cohort": {name: analyse(select(table, [k]), draws, seed) for name, k in cohorts.items()},
        "beyond_additive_card_values": beyond_additive_card_values(draws, seed, cohort_set),
    }
    pooled = report["pooled"]["all_cohorts"]["ratios"]
    report["calibration"] = {
        "rule": "weight = pooled slope relative to the average card rating, rounded to 0.05, within [0, 1]; read from all cohorts pooled",
        "weights": {part: calibrated_weight(pooled[part]["to_quality"]) for part in ("unmet", "scaler", "engines")},
        "ratios": {part: pooled[part] for part in ("unmet", "scaler", "engines")},
    }
    return report


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
    pooled = report["pooled"]["all_cohorts"]
    print(f"wrote {out}: {pooled['rows']} boss fights, pass rate {pooled['pass_rate']}")
    for part in FEATURES:
        c, r = pooled["coefficients"][part], pooled["ratios"][part]
        print(f"  {part:9s} {c['per_point']:+.3f} per point {c['ci95']}   ratio to quality {r['to_quality']:+.2f} {r['ci95']}")
    extra = report["beyond_additive_card_values"]["pooled"]
    print(f"  beyond a model that knows every card: log loss {extra['log_loss_cards']} -> {extra['log_loss_cards_and_parts']}, gap {extra['gap']['mean']:+.5f} {extra['gap']['ci95']}")
    print("  calibrated weights:", report["calibration"]["weights"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
