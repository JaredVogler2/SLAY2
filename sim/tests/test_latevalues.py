"""Card values for the Act-2 boss (ADR-060): the shown values as a prior, a shrunk card-specific part, the cross-validated gate. Pure numpy."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from slay2_sim import cardvalue as cv
from slay2_sim import latevalues as lv

CARDS = [f"CARD_{i:02d}" for i in range(14)]
SHOWN = {c: round(float(v), 3) for c, v in zip(CARDS, np.linspace(-0.8, 0.9, len(CARDS)))}


def world(n: int, seed: int, kappa: float, delta: dict[str, float] | None = None, intercept: float = -1.2) -> list[dict]:
    """Runs at the second boss whose chance of passing is known: logit = intercept + HP + sum of (kappa * shown + delta) per card copy."""
    rng = np.random.default_rng(seed)
    delta = delta or {}
    out = []
    for i in range(n):
        deck = {c: int(rng.integers(0, 3)) for c in CARDS}
        deck = {c: k for c, k in deck.items() if k}
        hp = float(rng.uniform(0.3, 1.0))
        z = intercept + 1.5 * (hp - 0.65) + sum((kappa * SHOWN[c] + delta.get(c, 0.0)) * k for c, k in deck.items())
        out.append({
            "seed": i, "boss": "THE_INSATIABLE", "hp_frac": hp, "max_hp": 90, "potions": int(rng.integers(0, 4)), "relics": ["BURNING_BLOOD"],
            "deck": deck, "upgraded": int(rng.integers(0, 4)), "passed": int(rng.random() < 1 / (1 + np.exp(-z))),
        })
    return out


def episode(seed: int, outcome: str, final_floor: int, fights: list[tuple[int, int]]) -> dict:
    """An episode record with one boss-fight record per (act, floor)."""
    return {"seed": seed, "outcome": outcome, "floor": final_floor, "extra": {"boss_fights": [
        {"act": act, "floor": floor, "hp": 40, "max_hp": 80, "gold": 0, "potions": 1, "relics": ["BURNING_BLOOD"], "boss": ["B"], "deck": {"BASH": 2}}
        for act, floor in fights]}}


def test_extract_reads_the_boss_fight_of_the_act_asked_for_and_the_default_is_unchanged():
    rows = [
        episode(1, "death", 31, [(0, 16), (1, 31)]),    # died in the Act-2 boss fight
        episode(2, "death", 40, [(0, 16), (1, 31)]),    # got past it
        episode(3, "win", 51, [(0, 16), (1, 31), (2, 45)]),
        episode(4, "death", 20, [(0, 16)]),             # never reached the second boss
        episode(5, "timeout", 31, [(0, 16), (1, 31)]),  # not a clean episode
        episode(6, "death", 12, []),
    ]
    second = cv.extract(rows, act=1)
    assert [(r["seed"], r["passed"]) for r in second] == [(1, 0), (2, 1), (3, 1)]
    first = cv.extract(rows)
    assert first == cv.extract(rows, act=0)
    assert [(r["seed"], r["passed"]) for r in first] == [(1, 1), (2, 1), (3, 1), (4, 1)]  # past floor 16 in all four (seed 4 died on 20)


def test_a_world_where_the_second_boss_values_are_a_scaled_copy_of_the_shown_ones_keeps_the_shown_values():
    fit = lv.fit_records(world(8000, 1, kappa=0.5), SHOWN, draws=0)
    assert fit["fitted"] is False and fit["gate"]["passed"] is False
    assert fit["gate"]["gain"] < lv.GATE
    # a class that keeps the shown values: every beta is the shown one (the policy of that arm plays as the baseline)
    assert {c["id"]: c["beta"] for c in fit["cards"]} == pytest.approx(SHOWN)
    assert fit["kappa"]["estimate"] == pytest.approx(0.5, abs=0.15)
    assert fit["scaleOnly"]["estimate"] == pytest.approx(0.5, abs=0.15) and fit["scaleOnly"]["ci95"] is None  # draws=0: no interval


def test_a_world_with_card_specific_differences_passes_the_gate_and_recovers_them():
    truth = {"CARD_00": 0.9, "CARD_13": -0.8, "CARD_06": 0.6}   # three cards that matter more (or the other way) at the second boss
    fit = lv.fit_records(world(8000, 2, kappa=0.5, delta=truth), SHOWN, draws=40, seed=7)
    assert fit["fitted"] is True and fit["gate"]["passed"] is True and fit["gate"]["gain"] >= lv.GATE
    by = {c["id"]: c for c in fit["cards"]}
    for cid, d in truth.items():
        want = 0.5 * SHOWN[cid] + d
        assert by[cid]["beta"] == pytest.approx(want, abs=0.35), (cid, by[cid]["beta"], want)  # shrunk towards the prior, never beyond a plausible range
        assert np.sign(by[cid]["delta"]) == np.sign(d)
        lo, hi = by[cid]["delta_ci95"]
        assert lo < by[cid]["delta"] < hi
    # a card with no difference stays near kappa * shown
    assert by["CARD_03"]["beta"] == pytest.approx(0.5 * SHOWN["CARD_03"], abs=0.3)
    # the joint kappa can be absorbed by the deviations when the penalty is weak (the values above do not depend on it); the scale-only fit is the
    # figure to read as the scale of the shown ranking: three cards that deviate a lot pull it below the 0.5 that holds for the other eleven
    assert fit["kappa"]["clippedAtZero"] is False
    lo, hi = fit["scaleOnly"]["ci95"]
    assert lo < fit["scaleOnly"]["estimate"] < hi and 0.0 < fit["scaleOnly"]["estimate"] < 0.5


def test_a_negative_scale_is_set_to_zero_instead_of_turning_the_shown_ranking_upside_down():
    truth = {"CARD_00": 0.9, "CARD_13": -0.8, "CARD_06": 0.6}
    fit = lv.fit_records(world(8000, 3, kappa=-0.6, delta=truth), SHOWN, draws=20, seed=3)
    assert fit["kappa"]["clippedAtZero"] is True and fit["kappa"]["estimate"] == 0.0
    by = {c["id"]: c for c in fit["cards"]}
    for cid in truth:  # no part of the shown ranking is carried over: the value is the deviation alone
        assert by[cid]["beta"] == pytest.approx(by[cid]["delta"], abs=1e-3)


def test_too_few_runs_or_too_few_passes_fit_nothing_and_keep_the_shown_values():
    few = lv.fit_records(world(60, 4, kappa=0.5), SHOWN, draws=0)
    assert few["fitted"] is False and few["kappa"] is None and "nothing fitted" in few["reason"]
    assert {c["id"]: c["beta"] for c in few["cards"]} == pytest.approx(SHOWN)
    rare = world(1000, 5, kappa=0.5, intercept=-9.0)   # a class that almost never passes the second boss
    assert sum(r["passed"] for r in rare) < lv.MIN_OUTCOMES
    assert lv.fit_records(rare, SHOWN, draws=0)["fitted"] is False


def rare_relic_world(n: int, seed: int, relics: int = 80) -> list[dict]:
    """A class like Regent at the second boss: few passes (about 12 %), many relics each held in a few fights, none of them with any effect."""
    rng = np.random.default_rng(seed)
    out = world(n, seed, kappa=0.3, intercept=-2.3)
    ids = [f"RELIC_{i:02d}" for i in range(relics)]
    for r in out:
        r["relics"] = ["BURNING_BLOOD"] + [x for x in ids if rng.random() < 0.04]
    return out


def test_relics_held_in_a_few_fights_do_not_break_the_baseline_or_the_intervals():
    """The first run of the fit (ADR-060 addendum A): a relic held in a dozen fights that none passed separates the outcome, the scale-only model
    scored 3.66 nats held out for Regent (a model of the base rate scores 0.39) and the intervals of the scale were 10**9 wide."""
    recs = rare_relic_world(500, 11)
    vocab = cv.vocabulary(recs)
    X, y, g, names, pen = lv.design(recs, vocab, SHOWN)
    base = np.flatnonzero(~pen)
    Xb, names_b = X[:, base], [names[j] for j in base]
    none = np.zeros(len(base), dtype=bool)
    assert sum(n.startswith("relic:") for n in names_b) > 40            # the world has the many rare relics of a real class
    entropy = cv.log_loss(y, np.full(len(y), y.mean()))
    bare = lv.held_out_loss(Xb, y, g, lv.lam_vector(names_b, none, 0.0, lv.TINY))      # the specification of the first run
    ridged = lv.held_out_loss(Xb, y, g, lv.lam_vector(names_b, none, 0.0, 10.0))
    assert bare > 2 * entropy, (bare, entropy)      # without a penalty on the indicators the baseline is far worse than the base rate
    assert ridged < 1.15 * entropy, (ridged, entropy)
    fit = lv.fit_records(recs, SHOWN, draws=20, seed=4)
    cvr = fit["crossValidation"]
    assert cvr["baselineLogLoss"] < 1.15 * cvr["baselineLogLossOfTheBaseRate"] and cvr["indicatorPenalty"]["chosen"] >= 3.0
    lo, hi = fit["scaleOnly"]["ci95"]
    assert -20 < lo < fit["scaleOnly"]["estimate"] < hi < 20 and -20 < fit["kappa"]["ci95"][0] and fit["kappa"]["ci95"][1] < 20
    assert fit["fitted"] is False and fit["gate"]["gain"] < lv.GATE          # and nothing card-specific is found where nothing is there


def test_the_indicator_penalty_is_chosen_without_the_cards_and_applied_to_both_models():
    recs = rare_relic_world(500, 12)
    fit = lv.fit_records(recs, SHOWN, draws=0)
    pen = fit["crossValidation"]["indicatorPenalty"]
    assert pen["grid"] == list(lv.LAMBDA_GRID) and pen["chosen"] in lv.LAMBDA_GRID
    assert pen["byPenalty"][str(pen["chosen"])]["log_loss"] == fit["crossValidation"]["baselineLogLoss"]   # the gate's baseline is the best this grid does
    assert fit["indicatorPenalty"] == pen["chosen"] and fit["l2"] in lv.L2_GRID
    lam = lv.lam_vector(["intercept", "relic:X", "boss:Y", "prior", "card:Z"], np.array([False, False, False, False, True]), 7.0, 3.0)
    assert list(lam) == [lv.TINY, 3.0, 3.0, lv.TINY, 7.0]


def test_the_fit_is_reproducible():
    a = lv.fit_records(world(3000, 6, kappa=0.4, delta={"CARD_01": 0.7}), SHOWN, draws=20, seed=11)
    b = lv.fit_records(world(3000, 6, kappa=0.4, delta={"CARD_01": 0.7}), SHOWN, draws=20, seed=11)
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


def test_the_prior_score_is_the_sum_of_the_shown_values_over_the_deck():
    recs = [{"deck": {"CARD_00": 2, "CARD_13": 1, "UNKNOWN": 5}}, {"deck": {}}]
    got = lv.prior_score(recs, SHOWN)
    assert got[0] == pytest.approx(2 * SHOWN["CARD_00"] + SHOWN["CARD_13"]) and got[1] == 0.0


def test_the_design_has_the_prior_column_unpenalised_just_before_the_cards():
    recs = world(500, 7, kappa=0.5)
    vocab = cv.vocabulary(recs, min_games=10)
    X, _, _, names, pen = lv.design(recs, vocab, SHOWN)
    j = names.index("prior")
    assert names[j + 1].startswith("card:") and not pen[j] and pen[j + 1:].all() and not pen[:j].any()
    assert X[:, j] == pytest.approx(lv.prior_score(recs, SHOWN))
    assert X.shape[1] == len(names) == len(pen)


def write_batch(root: Path, name: str, rows: list[dict], character: str = "Ironclad") -> Path:
    d = root / name
    d.mkdir(parents=True)
    (d / "manifest.json").write_text(json.dumps({
        "batch_id": name, "content_sha256": "c" * 64, "policy": {"name": "rules_explore_v3"},
        "config": {"character": character, "ascension": 0, "profile": "veteran", "keep_relics": True},
    }), encoding="utf-8")
    (d / "episodes.jsonl").write_text("\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf-8")
    return d


def test_the_written_file_is_a_card_values_file_a_policy_can_follow(sim, tmp_path):
    from slay2_sim.policies import make_policy
    from slay2_sim.policies.rules2 import read_values

    rows = []
    for r in world(2500, 8, kappa=0.5, delta={"CARD_00": 0.9}):
        deck = {c: k for c, k in r["deck"].items()}
        rows.append({"seed": r["seed"], "outcome": "death", "floor": 40 if r["passed"] else 31, "extra": {"boss_fights": [
            {"act": 1, "floor": 31, "hp": int(r["hp_frac"] * 90), "max_hp": 90, "gold": 0, "potions": r["potions"], "relics": r["relics"], "boss": ["B"], "deck": deck}]}})
    batch = write_batch(tmp_path, "explore-x", rows)
    shown_file = tmp_path / "ironclad-a0-v2.json"
    shown_file.write_text(json.dumps({"kind": "card-values", "character": "Ironclad", "cards": [{"id": c, "beta": b} for c, b in SHOWN.items()]}), encoding="utf-8")
    body = lv.build(shown_file, [batch], draws=10)
    out = tmp_path / "ironclad-a0-act2-v1.json"
    out.write_text(json.dumps(body, indent=2, sort_keys=True), encoding="utf-8")
    beta, _, _, character = read_values(str(out))
    assert character == "Ironclad" and set(beta) == set(SHOWN) and body["prior"]["sha256"] == lv.sha256_of(shown_file)
    assert body["outcome"] == "the run gets past the Act-2 boss" and body["act"] == 2 and body["keepRelics"] is True
    assert body["boss_fights"] == 2500 and body["batches"][0]["batch_id"] == "explore-x"
    assert json.loads(out.read_text(encoding="utf-8"))["gate"]["required"] == lv.GATE   # strict JSON, no NaN
    json.loads(out.read_text(encoding="utf-8"), parse_constant=lambda c: pytest.fail(f"{c} in the file"))
    p = make_policy("rules_v2_late", values=str(shown_file), late_values=str(out))   # the arm of ADR-060 can follow it
    assert p.late_beta == beta


def test_batches_of_two_cohorts_or_another_class_are_refused(tmp_path):
    rows = [episode(1, "death", 31, [(0, 16), (1, 31)])]
    a = write_batch(tmp_path, "a", rows)
    b = write_batch(tmp_path, "b", rows, character="Silent")
    shown_file = tmp_path / "s.json"
    shown_file.write_text(json.dumps({"kind": "card-values", "character": "Ironclad", "cards": [{"id": "BASH", "beta": 0.1}]}), encoding="utf-8")
    with pytest.raises(SystemExit, match="one cohort"):
        lv.build(shown_file, [a, b], draws=0)
    with pytest.raises(SystemExit, match="shown values are for Ironclad"):
        lv.build(shown_file, [b], draws=0)


def test_not_a_number_becomes_null():
    assert lv._json_safe({"a": [float("nan"), 1.0, float("inf")], "b": {"c": float("-inf")}}) == {"a": [None, 1.0, None], "b": {"c": None}}
