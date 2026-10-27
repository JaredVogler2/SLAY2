"""The per-mechanic reading of the unmet-need part (stage B1): the columns are a split of the part B1 reads, and the report is
about the data and the tags that exist now."""

from __future__ import annotations

import json

import numpy as np
import pytest

from slay2_sim import advisor, external, synergymechanics as mech, synergystudy as study

REPORT = external.REPO_ROOT / "experiments" / "synergy" / "b1-mechanics.json"
CLASSES = ("ironclad", "silent", "regent", "necrobinder", "defect")
STARTER = {"STRIKE_IRONCLAD": 5, "DEFEND_IRONCLAD": 4, "BASH": 1}
WAITING = {"STRIKE_IRONCLAD": 5, "DEFEND_IRONCLAD": 4, "FEEL_NO_PAIN_CARD": 1}  # a card that needs Exhaust, with nothing to feed it


def random_decks(character: str, count: int, seed: int) -> list[dict[str, int]]:
    """Decks of 6 to 24 cards drawn from the class's reward pool, a card taken up to twice (the table's tags, not a play, decide)."""
    rng = np.random.default_rng(seed)
    pool = sorted(c["id"] for c in advisor.reward_pool(character))
    decks = []
    for _ in range(count):
        deck: dict[str, int] = {}
        for card in rng.choice(pool, size=int(rng.integers(6, 25))):
            deck[str(card)] = min(2, deck.get(str(card), 0) + 1)
        decks.append(deck)
    return decks


def unmet_part(deck: dict[str, int], character: str, act_index: int, model: advisor.Model = mech.MODEL) -> float:
    return advisor.synergy_components(advisor.deck_from_ids(c for c, n in deck.items() for _ in range(n)), act_index, model, character)[0]


@pytest.mark.parametrize("character", CLASSES)
def test_the_columns_split_the_unmet_need_part_of_the_index(character):
    for deck in random_decks(character, 20, seed=3):
        for act in (0, 1, 2):
            columns = mech.mechanic_columns(deck, character, act)
            assert set(columns) == set(advisor.mechanic_ids())
            assert all(v <= 0 for v in columns.values())
            assert sum(columns.values()) == pytest.approx(unmet_part(deck, character, act), abs=1e-9)


def test_a_deck_with_no_need_has_no_column():
    assert not any(mech.mechanic_columns(STARTER, "ironclad").values())


def test_an_unmet_need_is_charged_to_the_mechanic_it_waits_on():
    columns = mech.mechanic_columns(WAITING, "ironclad")
    prior = advisor.catalog()["FEEL_NO_PAIN"]["prior"]
    # Feel No Pain wants Exhaust at weight 3: it rides on min(0.7, 0.25 x 3) of its rating, nothing in the deck supplies Exhaust,
    # and 30 % of an act-1 shortfall is expected to be met later. The mass is shared over the deck's twelve counted cards.
    expected = -prior * min(0.7, 0.25 * 3) * (1 - advisor.FUTURE_SUPPORT[0]) * 1.0 / 12
    assert columns["exhaust"] == pytest.approx(expected)
    assert {m for m, v in columns.items() if v} == {"exhaust"}
    fed = mech.mechanic_columns({**WAITING, "BURNING_PACT": 1}, "ironclad")  # Burning Pact supplies Exhaust
    assert columns["exhaust"] < fed["exhaust"] < 0
    # a later act expects less help to arrive, so more of the rating is held back
    assert mech.mechanic_columns(WAITING, "ironclad", act_index=2)["exhaust"] < columns["exhaust"]


def test_the_columns_follow_the_strength_the_index_gives_needs_and_not_the_other_parts():
    deck = random_decks("silent", 1, seed=9)[0]
    full = mech.mechanic_columns(deck, "silent")
    half = mech.mechanic_columns(deck, "silent", model=advisor.Model(needs=0.5, scalers=0.0, engines=0.0))
    assert any(full.values())
    for m, v in full.items():
        assert half[m] == pytest.approx(0.5 * v)


def test_the_table_holds_one_row_per_boss_fight_with_its_columns_adding_up_to_the_part_b1_reads():
    cohort = study.COHORTS[4]  # Defect
    table, columns, metas = mech.build_table((cohort,))
    assert len(table.y) == len(columns) == metas[0]["boss_fights"]
    assert columns.shape[1] == len(advisor.mechanic_ids())
    assert np.allclose(columns.sum(axis=1), table.F[:, study.FEATURES.index("unmet")], atol=1e-9)
    reference, _ = study.build_table((cohort,))
    assert np.array_equal(reference.F, table.F) and np.array_equal(reference.y, table.y)


def small_report(draws: int = 3):
    return mech.build_report(draws=draws, seed=1, cohort_set=(study.COHORTS[4],))


def test_a_small_report_has_every_part_and_is_reproducible():
    a, b = small_report(), small_report()
    assert a == b
    assert a["kind"] == "synergy-mechanics" and a["rows"] == a["cohorts"][0]["boss_fights"]
    assert a["model_strengths"] == {"needs": 1.0, "scalers": 1.0, "engines": 1.0}
    assert a["mechanics_in_the_model"] == len(a["mechanics"]) <= a["mechanics_in_the_vocabulary"]
    assert set(a["pooled_unmet_ratio"]) == {"to_quality", "ci95"}
    for row in a["mechanics"]:
        assert row["mechanic"] in advisor.mechanic_ids() and row["label"]
        assert row["sd_points"] > mech.MIN_SD and row["mean_points"] <= 0 and row["decks_with_the_need"] > 0
        assert set(row) >= {"ratio_to_quality", "ratio_ci95", "per_point", "ci95"}
    spreads = [(-r["sd_points"], r["mechanic"]) for r in a["mechanics"]]
    assert spreads == sorted(spreads)


def test_the_command_writes_the_report_it_built_and_says_what_it_found(tmp_path, capsys, monkeypatch):
    small = small_report()
    monkeypatch.setattr(mech, "build_report", lambda draws, seed: small)
    out = tmp_path / "nested" / "mechanics.json"
    assert mech.main(["--out", str(out), "--bootstrap", "3"]) == 0
    assert json.loads(out.read_text(encoding="utf-8")) == small
    printed = capsys.readouterr().out
    assert "mechanics in the model" in printed and "pooled unmet-need ratio" in printed


def test_the_committed_report_is_about_the_data_and_the_tags_that_exist_now():
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    assert report["advisor"]["synergy_table_sha256"] == advisor.synergy_table()["sha256"], "the tags changed: rerun slay2_sim.synergymechanics"
    catalog = json.loads((advisor.DATA / f"cards.{advisor.BUILD_ID}.json").read_text(encoding="utf-8"))
    assert report["advisor"]["catalog_sha256"] == catalog["sha256"]
    assert report["model_strengths"] == {"needs": 1.0, "scalers": 1.0, "engines": 1.0}
    assert [m["name"] for m in report["cohorts"]] == [c.name for c in study.COHORTS]
    for meta in report["cohorts"]:
        cohort = next(c for c in study.COHORTS if c.name == meta["name"])
        manifest = json.loads((external.REPO_ROOT / cohort.path / "manifest.json").read_text(encoding="utf-8"))
        assert meta["episodes_gz_sha256"] == manifest["episodes_gz"]["sha256"]
    assert report["rows"] == sum(m["boss_fights"] for m in report["cohorts"])
    assert report["mechanics_in_the_model"] == len(report["mechanics"])
    assert {m["mechanic"] for m in report["mechanics"]} <= set(advisor.mechanic_ids())
    b1 = json.loads((external.REPO_ROOT / "experiments" / "synergy" / "b1-calibration.json").read_text(encoding="utf-8"))
    assert report["rows"] == b1["pooled"]["all_cohorts"]["rows"], "the two reports read different runs"
