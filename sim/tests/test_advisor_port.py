"""The Python port of the website's deck index reproduces what the TypeScript code computes (its golden file)."""

from __future__ import annotations

import json
import math

import pytest

from slay2_sim import advisor, external

GOLDEN = external.REPO_ROOT / "packages" / "decision" / "test" / "golden" / "advisor-index.json"
TOL = 1e-9


def cases() -> list[dict]:
    return json.loads(GOLDEN.read_text(encoding="utf-8"))["cases"]


def close(a: float, b: float) -> bool:
    return math.isclose(a, b, rel_tol=TOL, abs_tol=TOL)


@pytest.mark.parametrize("index", range(160))
def test_every_golden_case_is_reproduced(index):
    case = cases()[index]
    deck = {card_id: count for card_id, count in case["deck"]}
    act = case["actIndex"]
    weights = advisor.base_weights(act, case["risk"])

    character = case["character"]
    profile = advisor.profile_deck(deck, act, character=character)
    want = case["profile"]
    assert profile.size == want["size"]
    assert profile.highCostCount == want["highCostCount"]
    assert dict(profile.groups) == want["groups"]
    for key in ("meanPrior", "averageEnergyCost", "starterShare", "synergy"):
        assert close(getattr(profile, key), want[key]), (key, getattr(profile, key), want[key])

    terms = advisor.score_terms(profile, weights)
    wt = case["terms"]
    for key in ("quality", "curve", "size", "synergy"):
        assert close(getattr(terms, key), wt[key]), (key, getattr(terms, key), wt[key])
    for group, value in wt["coverage"].items():
        assert close(terms.coverage[group], value), (group, terms.coverage[group], value)
    assert close(advisor.total(terms), wt["total"])

    engines = advisor.engines_of(deck, character=character)
    assert {m: v for m, v in engines.items() if v != 0}.keys() == case["engines"].keys()
    for mechanic, value in case["engines"].items():
        assert close(engines[mechanic], value), (mechanic, engines[mechanic], value)

    ranking = advisor.rank_options(deck, case["offered"], act, case["risk"], character=character)
    assert [r[0] for r in ranking] == [r[0] for r in case["ranking"]]
    for (_, got), (_, expected) in zip(ranking, case["ranking"]):
        assert close(got, expected)


def test_the_golden_file_covers_what_the_port_must_get_right():
    data = cases()
    assert {c["character"] for c in data} == {"ironclad", "silent", "regent", "necrobinder", "defect"}
    assert {c["actIndex"] for c in data} == {0, 1, 2}
    assert any(c["terms"]["synergy"] < 0 for c in data) and any(c["terms"]["synergy"] > 0 for c in data)
    assert any(c["profile"]["size"] > 30 for c in data)


def test_the_vocabulary_is_the_tag_files_own():
    ids = advisor.mechanic_ids()
    assert len(ids) == len(set(ids)) == 28
    for card_id, entry in advisor.synergy_table()["cards"].items():
        assert card_id in advisor.catalog(), card_id
        for part in ("g", "w", "s"):
            assert set(entry.get(part, {})) <= set(ids), (card_id, part)


def test_a_deck_is_counted_without_upgrade_marks():
    assert advisor.deck_from_ids(["STRIKE_IRONCLAD", "STRIKE_IRONCLAD+", "BASH"]) == {"STRIKE_IRONCLAD": 2, "BASH": 1}


def test_the_simulators_power_name_collisions_are_read_as_the_catalog_card():
    # the simulator appends _CARD to a card whose name is also a power's (Feel No Pain, Rupture ...)
    unknown: list[str] = []
    deck = advisor.deck_from_ids(["FEEL_NO_PAIN_CARD", "FEEL_NO_PAIN_CARD+", "RUPTURE_CARD", "NOT_A_CARD", "BASH"], unknown)
    assert deck == {"FEEL_NO_PAIN": 2, "RUPTURE": 1, "BASH": 1}
    assert unknown == ["NOT_A_CARD"]


def test_skipping_wins_ties_and_is_worth_zero():
    deck = {"STRIKE_IRONCLAD": 5, "DEFEND_IRONCLAD": 4, "BASH": 1}
    ranking = advisor.rank_options(deck, [], 0)
    assert ranking == [("skip", 0.0)]


@pytest.mark.parametrize("index", range(0, 160, 7))
def test_the_synergy_parts_add_up_to_the_synergy_term(index):
    case = cases()[index]
    deck = {card_id: count for card_id, count in case["deck"]}
    unmet, scaler, engines = advisor.synergy_components(deck, case["actIndex"], character=case["character"])
    assert unmet <= 1e-12 and scaler >= -1e-12 and engines >= 0
    assert close(unmet + scaler + engines, case["profile"]["synergy"])


def test_a_class_starts_with_what_its_relic_supplies():
    assert advisor.innate_supply("necrobinder") == {"osty": 3}
    assert advisor.innate_supply("Necrobinder") == {"osty": 3}
    assert advisor.innate_supply("ironclad") == {} and advisor.innate_supply(None) == {}
    bare = advisor.supply_of({"STRIKE_NECROBINDER": 4}, "necrobinder")
    assert bare["osty"] == 3 and advisor.supply_of({"STRIKE_NECROBINDER": 4})["osty"] == 0
    # an Osty payoff is not held back in a deck without a single Osty card: the relic summons Osty every combat
    held = advisor.realized_of("FLATTEN", bare, 0)
    assert held.fit > 0.5
