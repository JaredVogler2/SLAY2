"""The Neow relic-value fit recovers a known truth from randomised choices (synthetic games, no simulator needed)."""

from __future__ import annotations

import numpy as np

from slay2_sim.neowvalue import binomial_upper_tail, build_report, extract, extract_excluded, vocabulary

POSITIVE = ["Arcane Scroll", "Booming Conch", "Fishing Rod", "Golden Pearl", "Kaleidoscope", "Lead Paperweight"]
CURSED = ["Cursed Pearl", "Hefty Tablet", "Large Capsule"]
TRUE = {"Arcane Scroll": 0.6, "Booming Conch": -0.5, "Fishing Rod": 0.0, "Golden Pearl": 0.3, "Kaleidoscope": -0.2,
        "Lead Paperweight": 0.0, "Cursed Pearl": -0.9, "Hefty Tablet": 0.0, "Large Capsule": 0.4}
CLASS = {"Ironclad": 0.3, "Silent": -0.6}


def synthetic(n: int, seed: int = 0) -> list[dict]:
    rng = np.random.default_rng(seed)
    games = []
    for i in range(n):
        character = ["Ironclad", "Silent"][i % 2]
        pos = sorted(rng.choice(POSITIVE, size=2, replace=False).tolist())
        cur = str(rng.choice(CURSED))
        offered = pos + [cur]
        taken = offered[int(rng.integers(3))]  # uniformly at random among the three offered: the randomised design
        p = 1.0 / (1.0 + np.exp(-(CLASS[character] + TRUE[taken])))
        games.append({"outcome": "death", "seed": i, "act": int(rng.random() < p), "floor": 10,
                      "_character": character,
                      "extra": {"neow": {"positive": pos, "cursed": cur, "taken": taken, "explored": True}}})
    return games


def records(n: int) -> list[dict]:
    games = synthetic(n)
    out = []
    for character in ("Ironclad", "Silent"):
        out += extract([g for g in games if g["_character"] == character], character)
    return out


def test_it_recovers_the_order_and_sign_of_the_true_effects():
    report = build_report(records(9000), bootstrap_draws=60)
    got = {r["label"]: r for r in report["relics"]}
    assert set(got) == set(TRUE)
    order_true = sorted(TRUE, key=TRUE.get)
    order_got = sorted(got, key=lambda k: got[k]["beta"])
    rank = {k: i for i, k in enumerate(order_got)}
    # rank correlation with the truth
    a = np.array([rank[k] for k in order_true], dtype=float)
    b = np.arange(len(order_true), dtype=float)
    assert np.corrcoef(a, b)[0, 1] > 0.9
    assert got["Arcane Scroll"]["beta"] > 0 > got["Cursed Pearl"]["beta"]
    # a relic's interval covers its true effect, up to the shrinkage toward the average (the centre of the truth)
    centre = float(np.mean(list(TRUE.values())))
    covered = sum(1 for k, r in got.items() if r["ci95"][0] - 0.15 <= TRUE[k] - centre <= r["ci95"][1] + 0.15)
    assert covered >= 8


def test_the_randomised_contrast_and_the_counts_are_consistent_with_the_offers():
    recs = records(3000)
    report = build_report(recs, bootstrap_draws=20, min_taken=10)
    vocab = vocabulary(recs, min_taken=10)
    for r in report["relics"]:
        assert r["taken"] == vocab["taken"][r["label"]]
        assert r["taken"] <= r["offered"]
        # taken about a third of the time it was offered (the design)
        assert abs(r["taken"] / r["offered"] - 1 / 3) < 0.06, r["label"]
    kinds = {r["label"]: r["kind"] for r in report["relics"]}
    assert all(kinds[c] == "cursed" for c in CURSED if c in kinds)
    assert all(kinds[p] == "positive" for p in POSITIVE if p in kinds)


def test_incomplete_games_and_games_without_an_offer_are_not_read_as_losses():
    games = synthetic(40)
    games[0]["outcome"] = "timeout"
    games[1]["outcome"] = "simulator_error"
    games[2]["extra"] = {}
    got = extract(games, "Ironclad")
    assert len(got) == 37
    assert {g["seed"] for g in got}.isdisjoint({0, 1, 2})


def test_a_win_counts_as_past_the_boss():
    g = synthetic(1)[0]
    g["outcome"], g["act"] = "win", 2
    assert extract([g], "Ironclad")[0]["passed"] == 1
    g["outcome"], g["act"] = "death", 0
    assert extract([g], "Ironclad")[0]["passed"] == 0


def test_excluded_games_are_counted_against_the_relic_they_took_and_never_as_losses():
    games = synthetic(60)
    games[0]["outcome"] = "simulator_error"
    games[1]["outcome"] = "timeout"
    games[2]["outcome"] = "simulator_error"
    games[2]["extra"] = {}  # it failed before the opening screen: there is no relic to count it against
    got = extract_excluded(games, "Ironclad")
    assert [(g["seed"], g["outcome"]) for g in got] == [(0, "simulator_error"), (1, "timeout")]
    assert got[0]["taken"] == games[0]["extra"]["neow"]["taken"]
    assert {g["seed"] for g in extract(games, "Ironclad")}.isdisjoint({0, 1, 2})


def test_a_relic_whose_games_end_in_errors_far_more_often_is_flagged_and_a_uniform_rate_is_not():
    recs = records(6000)
    rng = np.random.default_rng(5)
    labels = sorted({r["taken"] for r in recs})
    # the same 3 % of games fail whatever they took
    uniform = [{"character": "Ironclad", "seed": 10_000 + i, "taken": str(rng.choice(labels)), "outcome": "simulator_error"} for i in range(int(0.03 * len(recs)))]
    quiet = build_report(recs, excluded=uniform, bootstrap_draws=10, min_taken=10)
    assert quiet["excluded_games"] == len(uniform) and quiet["excluded_by_outcome"] == {"simulator_error": len(uniform)}
    assert not any(r["exclusion_flag"] for r in quiet["relics"]), [r["label"] for r in quiet["relics"] if r["exclusion_flag"]]
    # one relic loses a quarter of its games to errors
    taken_n = sum(1 for r in recs if r["taken"] == "Fishing Rod")
    loud = uniform + [{"character": "Ironclad", "seed": 20_000 + i, "taken": "Fishing Rod", "outcome": "simulator_error"} for i in range(taken_n // 3)]
    flagged = [r["label"] for r in build_report(recs, excluded=loud, bootstrap_draws=10, min_taken=10)["relics"] if r["exclusion_flag"]]
    assert flagged == ["Fishing Rod"]


def test_the_exact_binomial_tail():
    assert binomial_upper_tail(0, 10, 0.3) == 1.0
    assert abs(binomial_upper_tail(10, 10, 0.5) - 0.5**10) < 1e-15
    assert abs(binomial_upper_tail(3, 5, 0.5) - (10 + 5 + 1) / 32) < 1e-15
