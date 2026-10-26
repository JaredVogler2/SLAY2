"""Card-value regression (H8): extraction rules, the logistic fit against known truth, grouped cross-validation. Pure numpy."""

from __future__ import annotations

import numpy as np

from slay2_sim import cardvalue as cv

TRUE = {"GOOD": 0.9, "OKAY": 0.3, "NEUTRAL": 0.0, "WEAK": -0.35, "BAD": -0.9}
INTERCEPT = -0.4


def synthetic(n: int = 6000, seed: int = 0) -> list[dict]:
    rng = np.random.default_rng(seed)
    records = []
    for i in range(n):
        deck = {c: int(rng.integers(0, 3)) for c in TRUE}
        deck = {c: k for c, k in deck.items() if k}
        hp = float(rng.uniform(0.4, 1.0))
        z = INTERCEPT + 1.2 * (hp - 0.7) + sum(TRUE[c] * k for c, k in deck.items())
        records.append({"seed": i, "boss": "VANTOM", "hp_frac": hp, "max_hp": 80, "potions": int(rng.integers(0, 4)),
                        "relics": ["BURNING_BLOOD"], "deck": deck, "upgraded": int(rng.integers(0, 4)),
                        "passed": int(rng.random() < 1 / (1 + np.exp(-z)))})
    return records


def episode(seed, outcome, boss_floor=16, final_floor=16, deck=None, act=0):
    return {"seed": seed, "outcome": outcome, "floor": final_floor, "extra": {"boss_fights": [
        {"act": act, "floor": boss_floor, "hp": 40, "max_hp": 80, "gold": 0, "potions": 2, "relics": ["BURNING_BLOOD"],
         "boss": ["VANTOM"], "deck": deck or {"BASH": 1, "STRIKE_IRONCLAD": 4, "STRIKE_IRONCLAD+": 1}}]}}


def test_extract_defines_passing_by_the_floor_reached_and_skips_unclean_episodes():
    rows = [
        episode(1, "death", final_floor=16),                      # died in the boss fight
        episode(2, "death", final_floor=19),                      # got past it, died later
        episode(3, "win", final_floor=51),
        episode(4, "timeout", final_floor=16),                    # not a clean episode: never read as a loss
        episode(5, "death", boss_floor=40, act=1),                # first recorded boss is not Act 1: skipped
        {"seed": 6, "outcome": "death", "floor": 8, "extra": {"boss_fights": []}},   # never reached the boss
    ]
    recs = cv.extract(rows)
    assert [(r["seed"], r["passed"]) for r in recs] == [(1, 0), (2, 1), (3, 1)]
    assert recs[0]["deck"] == {"BASH": 1, "STRIKE_IRONCLAD": 5} and recs[0]["upgraded"] == 1


def test_the_fit_recovers_known_card_effects():
    recs = synthetic()
    vocab = cv.vocabulary(recs, min_games=10)
    X, y, g, names, pen = cv.design(recs, vocab)
    beta = cv.fit_logistic(X, y, 1.0, pen)
    got = {n[5:]: b for n, b in zip(names, beta) if n.startswith("card:")}
    for c, truth in TRUE.items():
        assert abs(got[c] - truth) < 0.12, (c, got[c], truth)
    order = sorted(got, key=lambda c: -got[c])
    assert order == ["GOOD", "OKAY", "NEUTRAL", "WEAK", "BAD"]


def test_penalty_shrinks_towards_zero():
    recs = synthetic(1500)
    X, y, g, names, pen = cv.design(recs, cv.vocabulary(recs, min_games=10))
    weak, strong = cv.fit_logistic(X, y, 0.1, pen), cv.fit_logistic(X, y, 300.0, pen)
    assert np.abs(strong[pen]).sum() < np.abs(weak[pen]).sum() * 0.5


def test_cross_validation_is_grouped_and_beats_the_covariate_baseline():
    recs = synthetic(4000, seed=3)
    X, y, g, names, pen = cv.design(recs, cv.vocabulary(recs, min_games=10))
    out = cv.cross_validate(X, y, g, pen)
    best = out["l2"][str(out["best_l2"])]
    assert best["log_loss"] < out["baseline_log_loss"] - 0.02
    assert best["auc"] > 0.62


def test_auc_handles_ties_and_perfect_ranking():
    assert cv.auc(np.array([0, 0, 1, 1]), np.array([0.1, 0.2, 0.8, 0.9])) == 1.0
    assert cv.auc(np.array([0, 1, 0, 1]), np.array([0.5, 0.5, 0.5, 0.5])) == 0.5
    assert np.isnan(cv.auc(np.array([1, 1]), np.array([0.2, 0.3])))


def test_spearman_is_one_for_a_monotone_relation():
    assert cv.spearman([1, 2, 3, 4], [10, 20, 35, 90]) == 1.0
    assert cv.spearman([1, 2, 3, 4], [4, 3, 2, 1]) == -1.0


def test_report_orders_cards_and_the_interval_covers_the_truth():
    recs = synthetic(3000, seed=5)
    rep = cv.build_report(recs, bootstrap_draws=40, seed=1, static={c: float(i) for i, c in enumerate(TRUE)})
    assert [c["id"] for c in rep["cards"]][0] == "GOOD" and [c["id"] for c in rep["cards"]][-1] == "BAD"
    by = {c["id"]: c for c in rep["cards"]}
    for c, truth in TRUE.items():
        lo, hi = by[c]["ci95"]
        assert lo - 0.15 <= truth <= hi + 0.15, (c, lo, hi, truth)
    assert rep["boss_fights"] == 3000 and 0.0 < rep["pass_rate"] < 1.0
    assert rep["spearman_with_static_rating"] is not None
