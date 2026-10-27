"""Stage B1 of the synergy study: the features are the advisor's own parts, the statistics are the ones they claim to be."""

from __future__ import annotations

import json

import numpy as np
import pytest

from slay2_sim import advisor, external, synergystudy as study

REPORT = external.REPO_ROOT / "experiments" / "synergy" / "b1-calibration.json"
DECK = {"STRIKE_IRONCLAD": 5, "DEFEND_IRONCLAD": 4, "BASH": 1, "FEEL_NO_PAIN_CARD": 1, "INFLAME": 1, "BURNING_PACT": 1}


def test_the_features_are_the_advisors_index_parts():
    f = study.deck_features(DECK)
    deck = advisor.deck_from_ids(k for k, n in DECK.items() for _ in range(n))
    profile = advisor.profile_deck(deck, 0)
    assert f["quality"] == pytest.approx(profile.meanPrior)
    assert f["unmet"] + f["scaler"] + f["engines"] == pytest.approx(profile.synergy)
    assert f["unmet"] <= 0 <= f["scaler"] and f["engines"] >= 0
    # a simulator name with the _CARD suffix is read as the catalog card, upgrades are ignored
    assert study.deck_features({"FEEL_NO_PAIN_CARD+": 1})["quality"] == study.deck_features({"FEEL_NO_PAIN": 1})["quality"]


def test_the_parts_are_read_at_the_hand_set_strengths_whatever_the_index_keeps():
    deck = advisor.deck_from_ids(k for k, n in DECK.items() for _ in range(n))
    f = study.deck_features(DECK)
    first = advisor.synergy_components(deck, 0, advisor.Model(needs=1.0, scalers=1.0, engines=1.0))
    assert (f["unmet"], f["scaler"], f["engines"]) == pytest.approx(first)
    assert f["unmet"] < 0 < f["scaler"] and f["engines"] > 0  # a deck on which the two readings below can differ
    assert study.FIRST_JUDGEMENT == advisor.Model(needs=1.0, scalers=1.0, engines=1.0)
    for part, strength in (("unmet", "needs"), ("scaler", "scalers"), ("engines", "engines")):
        half = study.deck_features(DECK, model=advisor.Model(**{strength: 0.5}))
        assert half[part] == pytest.approx(0.5 * f[part])  # so a change to the website's strengths would show here
        assert half["quality"] == f["quality"] and half["coverage"] == f["coverage"] and half["curve"] == f["curve"]


def test_the_weight_a_part_keeps_is_its_slope_relative_to_quality_within_zero_and_one():
    assert study.calibrated_weight(0.66) == 0.65
    assert study.calibrated_weight(0.77) == 0.75
    assert study.calibrated_weight(0.965) == 0.95 and study.calibrated_weight(0.71) == 0.7
    assert study.calibrated_weight(-0.01) == 0.0
    assert study.calibrated_weight(-4.0) == 0.0
    assert study.calibrated_weight(2.5) == 1.0  # a part the data value more than the advisor does keeps its judgement


def test_resampling_moves_the_rows_of_a_seed_together():
    g = np.array([1, 1, 2, 3, 3, 3, 4])
    for rows in study.seed_bootstrap(g, draws=20, seed=3):
        counts = {s: int((g[rows] == s).sum()) for s in np.unique(g)}
        sizes = {1: 2, 2: 1, 3: 3, 4: 1}
        assert all(counts[s] % sizes[s] == 0 for s in counts)
    again = study.seed_bootstrap(g, draws=20, seed=3)
    first = study.seed_bootstrap(g, draws=20, seed=3)
    assert all(np.array_equal(a, b) for a, b in zip(again, first))


def test_the_paired_loss_gap_has_its_sign_and_its_interval_covers_a_known_shift():
    rng = np.random.default_rng(0)
    g = np.arange(400)
    base = rng.uniform(0.3, 0.7, size=400)
    better = base - 0.05
    gap = study.paired_loss_gap(base, better, g, draws=300, seed=1)
    assert gap["mean"] == pytest.approx(-0.05)
    assert gap["ci95"][0] == pytest.approx(-0.05) and gap["ci95"][1] == pytest.approx(-0.05)
    noisy = study.paired_loss_gap(base, base + rng.normal(0, 0.1, size=400), g, draws=300, seed=1)
    assert noisy["ci95"][0] < 0 < noisy["ci95"][1]


def test_a_batch_whose_episodes_file_is_not_the_one_its_manifest_names_is_refused(tmp_path, monkeypatch):
    src = external.REPO_ROOT / study.COHORTS[0].path
    folder = tmp_path / "batch"
    folder.mkdir()
    manifest = json.loads((src / "manifest.json").read_text(encoding="utf-8"))
    (folder / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (folder / "episodes.jsonl.gz").write_bytes(b"not the file the manifest hashes")
    monkeypatch.setattr(study, "external", type("E", (), {"REPO_ROOT": tmp_path}))
    with pytest.raises(ValueError, match="not the file its manifest names"):
        study.load_cohort(study.Cohort("x", "Ironclad", "train", "batch"))


def test_a_small_report_has_every_part_and_is_reproducible():
    small = (study.COHORTS[4],)  # Defect: the smallest of the training cohorts
    a = study.build_report(draws=3, seed=1, cohort_set=small)
    b = study.build_report(draws=3, seed=1, cohort_set=small)
    assert a == b
    pooled = a["pooled"]["all_cohorts"]
    assert set(pooled["coefficients"]) == set(study.FEATURES)
    assert set(a["calibration"]["weights"]) == {"unmet", "scaler", "engines"}
    assert {"controls", "index", "index+synergy"} <= set(pooled["cross_validation"])
    beyond = a["beyond_additive_card_values"]["pooled"]
    assert beyond["rows"] == pooled["rows"] and set(beyond["gap"]) == {"mean", "ci95"}


def test_the_committed_report_is_about_the_data_and_the_tags_that_exist_now():
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    assert report["advisor"]["synergy_table_sha256"] == advisor.synergy_table()["sha256"], "the tags changed: rerun slay2_sim.synergystudy"
    catalog = json.loads((advisor.DATA / f"cards.{advisor.BUILD_ID}.json").read_text(encoding="utf-8"))
    assert report["advisor"]["catalog_sha256"] == catalog["sha256"]
    for meta in report["cohorts"]:
        cohort = next(c for c in study.COHORTS if c.name == meta["name"])
        manifest = json.loads((external.REPO_ROOT / cohort.path / "manifest.json").read_text(encoding="utf-8"))
        assert meta["episodes_gz_sha256"] == manifest["episodes_gz"]["sha256"]
    assert report["pooled"]["all_cohorts"]["rows"] == sum(m["boss_fights"] for m in report["cohorts"])
