"""The Neow relic-value fit recovers a known truth from randomised choices (synthetic games, no simulator needed)."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from slay2_sim.classes import ClassError
from slay2_sim.neowvalue import binomial_upper_tail, build_report, design, extract, extract_excluded, main, vocabulary

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


def test_the_games_of_one_seed_move_together_in_folds_and_bootstrap():
    # a seed decides the offer and, under exploration, the relic taken: the same seeds in a second class are not new draws
    games = synthetic(200)
    both = extract(games, "ironclad") + extract(games, "silent")
    _, _, g, _, _ = design(both, vocabulary(both, min_taken=1))
    assert len(g) == 400 and len(np.unique(g)) == 200
    assert g[:200].tolist() == g[200:].tolist()  # row k of one class and row k of the other share a group
    report = build_report(both, bootstrap_draws=20, min_taken=1)
    assert report["model"]["seeds"] == 200 and "seed" in report["model"]["resampling_unit"]


def _batch(tmp_path: Path, name: str, character: str, *, verified: bool | None) -> Path:
    d = tmp_path / name
    d.mkdir()
    manifest = {"batch_id": name, "policy": {"name": "rules_v2_neow", "params": {"neow_explore": 1.0}}, "content_sha256": "c" * 64,
                "config": {"character": character, "ascension": 0, "profile": "veteran"}}
    if verified is not None:
        manifest["class_start_verified"] = verified
    (d / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (d / "episodes.jsonl").write_text("\n".join(json.dumps(g) for g in synthetic(40)) + "\n", encoding="utf-8")
    return d


def test_the_fit_refuses_batches_that_were_not_played_with_the_class_check_or_whose_class_is_inexact(tmp_path):
    out = tmp_path / "values.json"
    for name, character, verified in (("a", "Silent", None), ("b", "Silent", False)):
        with pytest.raises(SystemExit, match="class_start_verified"):
            main(["--batches", str(_batch(tmp_path, name, character, verified=verified)), "--out", str(out)])
    with pytest.raises(ClassError):
        main(["--batches", str(_batch(tmp_path, "c", "silent", verified=True)), "--out", str(out)])  # the first study's mistake
    assert not out.exists()
    # an exact class with the check is accepted, and is named in lower case in the model (the site's keys)
    ok = _batch(tmp_path, "d", "Silent", verified=True)
    other = _batch(tmp_path, "e", "Ironclad", verified=True)
    main(["--batches", str(ok), str(other), "--out", str(out), "--bootstrap", "5", "--min-taken", "1"])
    body = json.loads(out.read_text(encoding="utf-8"))
    assert set(body["classes"]) == {"silent", "ironclad"}
    assert [b["character"] for b in body["batches"]] == ["Silent", "Ironclad"]
