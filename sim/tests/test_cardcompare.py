"""Card-value comparison (ADR-046): the statistics on known inputs, the split-half noise reference, and the command end to end."""

from __future__ import annotations

import gzip
import json
from pathlib import Path

import numpy as np
import pytest

from slay2_sim import cardcompare, cardvalue


def synthetic(n_games: int = 1500, n_cards: int = 12, seed: int = 0) -> tuple[list[dict], np.ndarray, list[str]]:
    """Runs whose chance of passing the boss follows a known additive effect per card copy."""
    rng = np.random.default_rng(seed)
    cards = [f"C{i:02d}" for i in range(n_cards)]
    effect = np.linspace(-1.0, 1.0, n_cards)
    np.random.default_rng(12345).shuffle(effect)  # the same effects whatever the sample: two samples of one pilot
    records = []
    for s in range(n_games):
        deck = {c: int(rng.integers(0, 3)) for c in cards}
        deck = {c: n for c, n in deck.items() if n}
        z = -0.2 + sum(effect[i] * deck.get(c, 0) for i, c in enumerate(cards))
        records.append({
            "seed": 1000 + s, "boss": "B1", "hp_frac": 0.8, "max_hp": 80, "potions": 1, "relics": ["BURNING_BLOOD"],
            "deck": deck, "upgraded": 0, "passed": int(rng.random() < 1.0 / (1.0 + np.exp(-z))),
        })
    return records, effect, cards


def test_the_same_values_agree_completely_and_reversed_values_disagree_completely():
    betas = {f"C{i:02d}": float(i) for i in range(30)}
    same = cardcompare.compare_betas(betas, betas, k=10)
    assert same["cards_in_both"] == 30 and same["spearman"] == pytest.approx(1.0)
    assert same["best_k_in_both"] == 10 and same["worst_k_in_both"] == 10
    flipped = cardcompare.compare_betas(betas, {c: -b for c, b in betas.items()}, k=10)
    assert flipped["spearman"] == pytest.approx(-1.0)
    assert flipped["best_k_in_both"] == 0 and flipped["worst_k_in_both"] == 0
    assert cardcompare.compare_betas({"A": 1.0}, {"B": 2.0})["spearman"] is None  # nothing in common


def test_disjoint_intervals_are_counted_and_cards_in_one_file_only_are_named():
    def report(rows):
        return {"cards": [{"id": i, "beta": b, "ci95": [lo, hi]} for i, b, lo, hi in rows]}

    a = report([("A", 0.0, -0.5, 0.5), ("B", 1.0, 0.6, 1.4), ("C", 0.2, 0.0, 0.4), ("ONLY_A", 0.3, 0.1, 0.5)])
    b = report([("A", 0.1, -0.4, 0.6), ("B", 2.0, 1.5, 2.5), ("C", 0.3, 0.1, 0.5), ("ONLY_B", 0.9, 0.7, 1.1)])
    c = cardcompare.compare_reports(a, b)
    assert c["cards_in_both"] == 3
    assert c["disjoint_ci95"] == 1  # B: [0.6, 1.4] against [1.5, 2.5]
    assert c["cards_only_in_a"] == ["ONLY_A"] and c["cards_only_in_b"] == ["ONLY_B"]


def test_the_fit_recovers_the_order_of_known_effects():
    records, effect, cards = synthetic()
    betas = cardcompare.fit_betas(records)
    assert set(betas) == set(cards)
    assert cardvalue.spearman([betas[c] for c in cards], list(effect)) > 0.85


def test_the_split_half_reference_splits_by_seed_parity_and_applies_spearman_brown():
    records, _, _ = synthetic()
    half = cardcompare.split_half(records)
    assert sum(half["games"]) == len(records) and abs(half["games"][0] - half["games"][1]) <= 1
    r = half["spearman"]
    assert r > 0.6  # two samples of one pilot agree on a clear signal
    assert half["spearman_brown"] == pytest.approx(2 * r / (1 + r))
    assert half["spearman_brown"] > r
    assert cardcompare.split_half(records) == half  # deterministic


def write_batch(root: Path, name: str, records: list[dict]) -> Path:
    """An exploration batch as ``cardvalue.extract`` reads it: one boss fight per run, the run passes it or dies in it."""
    d = root / name
    d.mkdir(parents=True)
    with gzip.open(d / "episodes.jsonl.gz", "wt", encoding="utf-8") as fh:
        for r in records:
            fight = {"act": 0, "boss": [r["boss"]], "deck": r["deck"], "hp": 64, "max_hp": r["max_hp"], "potions": r["potions"],
                     "relics": r["relics"], "floor": 16}
            ep = {"seed": r["seed"], "outcome": "death", "floor": 17 if r["passed"] else 16, "extra": {"boss_fights": [fight]}}
            fh.write(json.dumps(ep) + "\n")
    return d


def test_the_command_compares_two_files_end_to_end(tmp_path: Path):
    records, _, _ = synthetic(n_games=900, seed=1)
    older, newer = synthetic(n_games=900, seed=2)[0], records
    a = cardvalue.build_report(older, bootstrap_draws=8)
    b = cardvalue.build_report(newer, bootstrap_draws=8)
    pa, pb = tmp_path / "a.json", tmp_path / "b.json"
    pa.write_text(json.dumps(a), encoding="utf-8")
    pb.write_text(json.dumps(b), encoding="utf-8")
    batch = write_batch(tmp_path, "explore-b", newer)
    out = tmp_path / "out" / "cmp.json"
    assert cardcompare.main(["--a", str(pa), "--b", str(pb), "--batches-b", str(batch), "--out", str(out)]) == 0
    got = json.loads(out.read_text(encoding="utf-8"))
    assert got["kind"] == "card-value-comparison"
    assert got["a"]["sha256"] != got["b"]["sha256"] and len(got["b"]["sha256"]) == 64
    assert got["comparison"]["cards_in_both"] == 12 and got["comparison"]["spearman"] > 0.5
    assert got["noise_reference"]["games"] == [450, 450]
    assert got["noise_reference"]["spearman_brown"] is not None
