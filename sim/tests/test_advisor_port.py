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


@pytest.mark.parametrize("index", range(240))
def test_every_golden_case_is_reproduced(index):
    case = cases()[index]
    deck = {card_id: count for card_id, count in case["deck"]}
    act = case["actIndex"]
    weights = advisor.base_weights(act, case["risk"])

    # the cases from 160 on also hold relics (ADR-051); the others are the class alone, as before. Cases 200 on hold every relic the
    # table tags between them, the one that takes a mechanic away included (it is negative supply, which the port must read as the page does)
    character = advisor.Setting(case["character"], tuple(case.get("relics", ())))
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

    # the engines the index counts (the page keeps none of them, ADR-050 addendum D) and, beside them, the engine formula as first judged
    engines = advisor.engines_of(deck, character=character)
    assert {m: v for m, v in engines.items() if v != 0}.keys() == case["engines"].keys()
    for mechanic, value in case["engines"].items():
        assert close(engines[mechanic], value), (mechanic, engines[mechanic], value)
    judged = advisor.engines_of(deck, advisor.Model(), character)
    assert {m: v for m, v in judged.items() if v != 0}.keys() == case["enginesJudged"].keys()
    for mechanic, value in case["enginesJudged"].items():
        assert close(judged[mechanic], value), (mechanic, judged[mechanic], value)

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
    assert any(c["enginesJudged"] for c in data)
    # eighty cases hold relics (ADR-051), the first hundred and sixty are the class alone
    assert len(data) == 240 and [i for i, c in enumerate(data) if "relics" in c] == list(range(160, 240))
    # between them they hold every relic the table tags, and the one that takes a mechanic away
    held = {r for c in data for r in c.get("relics", [])}
    assert set(advisor.relic_synergy_table()["relics"]) <= held
    assert any("BIG_MUSHROOM" in c.get("relics", []) for c in data)


def test_the_vocabulary_is_the_tag_files_own():
    ids = advisor.mechanic_ids()
    assert len(ids) == len(set(ids)) == 27
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


@pytest.mark.parametrize("index", range(0, 240, 7))
def test_the_synergy_parts_add_up_to_the_synergy_term(index):
    case = cases()[index]
    deck = {card_id: count for card_id, count in case["deck"]}
    character = advisor.Setting(case["character"], tuple(case.get("relics", ())))
    unmet, scaler, engines = advisor.synergy_components(deck, case["actIndex"], character=character)
    assert unmet <= 1e-12 and scaler >= -1e-12 and engines >= 0
    assert close(unmet + scaler + engines, case["profile"]["synergy"])


def test_a_class_starts_with_what_its_relic_supplies():
    assert advisor.innate_supply("necrobinder") == {"osty": 9}
    assert advisor.innate_supply("Necrobinder") == {"osty": 9}
    assert advisor.innate_supply("ironclad") == {} and advisor.innate_supply(None) == {}
    bare = advisor.supply_of({"STRIKE_NECROBINDER": 4}, "necrobinder")
    assert bare["osty"] == 9 and advisor.supply_of({"STRIKE_NECROBINDER": 4})["osty"] == 0
    # an Osty payoff is not held back in a deck without a single Osty card: the relic summons Osty every combat
    held = advisor.realized_of("FLATTEN", bare, 0)
    assert held.fit > 0.9 and held.held_back < 0.05


def test_relics_supply_what_the_table_says_and_each_counts_once():
    table = advisor.relic_synergy_table()["relics"]
    tagged = [r for r, tags in table.items() if tags.get("g")]
    assert tagged, "the relic table has no relic that provides a mechanic"
    relic = tagged[0]
    supply = advisor.relic_supply([relic, relic])
    assert supply == advisor.relic_supply([relic]) and supply == {m: float(g) for m, g in table[relic]["g"].items()}
    assert advisor.relic_supply(["NOT_A_RELIC"]) == {} and advisor.relic_supply([]) == {}
    deck = {"STRIKE_IRONCLAD": 5, "DEFEND_IRONCLAD": 4}
    with_relic = advisor.supply_of(deck, advisor.Setting("ironclad", (relic,)))
    bare = advisor.supply_of(deck, "ironclad")
    for mechanic, g in table[relic]["g"].items():
        assert with_relic[mechanic] == bare[mechanic] + g
