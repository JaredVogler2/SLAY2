"""Opening-relic value comparison (ADR-055): the statistics on known inputs, the split-half noise reference, and the command end to end."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from slay2_sim import cardvalue, neowcompare
from slay2_sim.neowvalue import build_report, extract

POSITIVE = ["Arcane Scroll", "Booming Conch", "Fishing Rod", "Golden Pearl", "Kaleidoscope", "Lead Paperweight"]
CURSED = ["Cursed Pearl", "Hefty Tablet", "Large Capsule"]
TRUE = {"Arcane Scroll": 0.6, "Booming Conch": -0.5, "Fishing Rod": 0.0, "Golden Pearl": 0.3, "Kaleidoscope": -0.2,
        "Lead Paperweight": 0.0, "Cursed Pearl": -0.9, "Hefty Tablet": 0.0, "Large Capsule": 0.4}


def games(n: int, truth: dict[str, float], seed: int = 0) -> list[dict]:
    """Randomised opening choices whose chance of passing the boss follows a known additive effect per relic taken."""
    rng = np.random.default_rng(seed)
    out = []
    for i in range(n):
        pos = sorted(rng.choice(POSITIVE, size=2, replace=False).tolist())
        cur = str(rng.choice(CURSED))
        taken = (pos + [cur])[int(rng.integers(3))]
        p = 1.0 / (1.0 + np.exp(-(0.2 + truth[taken])))
        out.append({"outcome": "death", "seed": i, "act": int(rng.random() < p), "floor": 10,
                    "extra": {"neow": {"positive": pos, "cursed": cur, "taken": taken, "explored": True}}})
    return out


def report(rows: list[tuple[str, float, float, float]]) -> dict:
    return {"relics": [{"label": label, "beta": b, "ci95": [lo, hi]} for label, b, lo, hi in rows]}


def test_the_same_values_agree_completely_and_reversed_values_disagree_completely():
    rows = [(f"R{i:02d}", float(i), float(i) - 0.4, float(i) + 0.4) for i in range(20)]
    same = neowcompare.compare_reports(report(rows), report(rows), k=5)
    assert same["relics_in_both"] == 20 and same["spearman"] == pytest.approx(1.0)
    assert same["best_k_in_both"] == 5 and same["worst_k_in_both"] == 5 and same["disjoint_ci95"] == 0
    assert same["best_in_a"] == same["best_in_b"] == "R19"
    flipped = neowcompare.compare_reports(report(rows), report([(l, -b, -hi, -lo) for l, b, lo, hi in rows]), k=5)
    assert flipped["spearman"] == pytest.approx(-1.0)
    assert flipped["best_k_in_both"] == 0 and flipped["worst_k_in_both"] == 0
    assert flipped["best_in_a"] == "R19" and flipped["best_in_b"] == "R00"


def test_disjoint_intervals_are_counted_and_relics_in_one_file_only_are_named():
    a = report([("A", 0.0, -0.5, 0.5), ("B", 1.0, 0.6, 1.4), ("C", 0.2, 0.0, 0.4), ("ONLY_A", 0.3, 0.1, 0.5)])
    b = report([("A", 0.1, -0.4, 0.6), ("B", 2.0, 1.5, 2.5), ("C", 0.3, 0.1, 0.5), ("ONLY_B", 0.9, 0.7, 1.1)])
    c = neowcompare.compare_reports(a, b)
    assert c["relics_in_both"] == 3
    assert c["disjoint_ci95"] == 1  # B: [0.6, 1.4] against [1.5, 2.5]
    assert c["relics_only_in_a"] == ["ONLY_A"] and c["relics_only_in_b"] == ["ONLY_B"]
    assert neowcompare.compare_reports(report([("A", 1.0, 0.0, 2.0)]), report([("B", 2.0, 1.0, 3.0)]))["spearman"] is None


def test_the_fit_recovers_the_order_of_known_effects():
    recs = extract(games(9000, TRUE), "ironclad")
    betas = neowcompare.fit_betas(recs, min_taken=30)
    assert set(betas) == set(TRUE)
    assert cardvalue.spearman([betas[r] for r in TRUE], [TRUE[r] for r in TRUE]) > 0.85
    # the same point estimates as the report the fit command writes
    built = {r["label"]: r["beta"] for r in build_report(recs, bootstrap_draws=10)["relics"]}
    assert all(abs(built[r] - betas[r]) < 1e-3 for r in TRUE)


def test_the_split_half_reference_splits_by_seed_parity_and_applies_spearman_brown():
    recs = extract(games(9000, TRUE), "ironclad")
    half = neowcompare.split_half(recs, min_taken=30)
    assert sum(half["seeds"]) == len({r["seed"] for r in recs}) and abs(half["seeds"][0] - half["seeds"][1]) <= 1
    r = half["spearman"]
    assert r > 0.6  # two samples of one game agree on a clear signal
    assert half["spearman_brown"] == pytest.approx(2 * r / (1 + r))
    assert half["spearman_brown"] > r
    assert neowcompare.split_half(recs, min_taken=30) == half  # deterministic


def write_batch(root: Path, name: str, truth: dict[str, float], seed: int) -> Path:
    d = root / name
    d.mkdir(parents=True)
    manifest = {"batch_id": name, "policy": {"name": "rules_v2_neow", "params": {"neow_explore": 1.0}}, "content_sha256": "c" * 64,
                "class_start_verified": True, "config": {"character": "Ironclad", "ascension": 0, "profile": "veteran"}}
    (d / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (d / "episodes.jsonl").write_text("\n".join(json.dumps(g) for g in games(6000, truth, seed)) + "\n", encoding="utf-8")
    return d


def test_the_command_compares_two_fits_end_to_end_and_names_the_relic_each_would_take_first(tmp_path):
    from slay2_sim.neowvalue import main as fit

    # the second game ranks the relics as the first does but moves one relic: Large Capsule goes from good to the best
    moved = {**TRUE, "Large Capsule": 1.3}
    first = write_batch(tmp_path, "first", TRUE, 1)
    second = write_batch(tmp_path, "second", moved, 2)
    a, b = tmp_path / "a.json", tmp_path / "b.json"
    fit(["--batches", str(first), "--out", str(a), "--bootstrap", "10", "--min-taken", "30"])
    fit(["--batches", str(second), "--out", str(b), "--bootstrap", "10", "--min-taken", "30"])
    out = tmp_path / "compare.json"
    assert neowcompare.main(["--a", str(a), "--b", str(b), "--batches-b", str(second), "--out", str(out)]) == 0
    body = json.loads(out.read_text(encoding="utf-8"))
    assert body["kind"] == "neow-value-comparison" and body["a"]["relics"] == body["b"]["relics"] == len(TRUE)
    c = body["comparison"]
    assert c["relics_in_both"] == len(TRUE) and c["spearman"] > 0.7
    assert c["best_in_a"] == "Arcane Scroll" and c["best_in_b"] == "Large Capsule"
    n = body["noise_reference"]
    assert n["spearman"] is not None and n["spearman_brown"] > n["spearman"]
