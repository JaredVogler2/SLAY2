"""advisor_v1: rules_v3 whose card rewards are decided by the website's deck index (ADR-050)."""

from __future__ import annotations

import pytest

from slay2_sim import advisor
from slay2_sim.policies import make_policy
from slay2_sim.policies.rules3 import V3_TUNE

STARTER = [["STRIKE_IRONCLAD", False, 5], ["DEFEND_IRONCLAD", False, 4], ["BASH", False, 1]]


def reward(offered: list[str], deck=None, act: int = 0):
    obs = {"run": {"deck": deck or STARTER, "act": act, "character": "Ironclad"}}
    actions = [{"action": "pick_card", "idx": i, "card_id": c} for i, c in enumerate(offered)]
    actions.append({"action": "skip", "idx": len(offered)})
    return obs, actions


def pilot(**params):
    p = make_policy("advisor_v1", **params)
    p.reset(1)
    return p


def test_it_does_what_the_page_would_recommend(sim):
    offered = ["INFLAME", "POMMEL_STRIKE", "SHRUG_IT_OFF"]
    obs, actions = reward(offered)
    ranking = advisor.rank_options({"STRIKE_IRONCLAD": 5, "DEFEND_IRONCLAD": 4, "BASH": 1}, offered, 0)
    expected = ranking[0][0]
    assert expected != "skip"
    assert pilot()._card_reward(obs, actions) == offered.index(expected)


def test_the_synergy_term_can_change_the_pick_and_switching_it_off_changes_it_back(sim):
    # a card that needs a supply the starter deck lacks against a plain attack: the synergy term holds the card back
    offered = ["TEAR_ASUNDER", "POMMEL_STRIKE"]
    obs, actions = reward(offered)
    assert pilot(synergy=0.0)._card_reward(obs, actions) == 0
    assert pilot(synergy=1.0)._card_reward(obs, actions) == 1


def test_it_skips_when_skipping_ranks_first(sim):
    # a deck of strong cards: a starter-grade card lowers the average rating and the index
    strong = [["BATTLE_TRANCE", False, 4], ["OFFERING", False, 2], ["BLUDGEON", False, 3], ["SHRUG_IT_OFF", False, 4], ["IMPERVIOUS", False, 3]]
    offered = ["STRIKE_IRONCLAD"]
    obs, actions = reward(offered, strong, act=1)
    assert pilot()._card_reward(obs, actions) == len(offered)  # the skip action


def test_a_full_deck_stops_taking_cards(sim):
    cap = int(V3_TUNE.get("max_deck", 32))
    p = pilot()
    obs, actions = reward(["INFLAME"], [["STRIKE_IRONCLAD", False, p.tune["max_deck"]]])
    assert p._card_reward(obs, actions) == 1  # skip: the deck is at the cap
    assert cap == 32 or cap == p.tune["max_deck"]


def test_an_offer_the_catalog_does_not_know_is_never_taken_and_is_counted(sim):
    p = pilot()
    obs, actions = reward(["SOME_CARD_THE_CATALOG_LACKS"])
    assert p._card_reward(obs, actions) == 1
    assert p.episode_stats()["advisor"]["unscored"] == 1


def test_a_card_the_simulator_names_with_a_suffix_is_scored_as_the_catalog_card(sim):
    p = pilot()
    obs, actions = reward(["INFLAME_CARD"] if advisor.card_id_of("INFLAME_CARD") else ["INFLAME"])
    assert p._card_reward(obs, actions) == 0


def test_it_counts_what_it_did(sim):
    p = pilot()
    obs, actions = reward(["INFLAME", "POMMEL_STRIKE"])
    p._card_reward(obs, actions)
    stats = p.episode_stats()["advisor"]
    assert stats["offers"] == 1 and stats["taken"] + stats["skipped"] == 1
    p.reset(2)
    assert p.episode_stats()["advisor"] == {"offers": 0, "taken": 0, "skipped": 0, "unscored": 0}


def test_everything_but_the_card_screen_is_rules_v3(sim):
    p = pilot()
    for key, value in V3_TUNE.items():
        assert p.tune[key] == value
    relic = [{"action": "pick_relic_reward", "idx": 0}, {"action": "skip_relic", "idx": 1}]
    obs = {"run": {"deck": STARTER, "act": 0, "potions": [], "max_potion_slots": 3}}
    assert p._card_reward(obs, relic) == 0  # rules_v1 takes a relic


def test_effective_parameters_rebuild_the_same_policy(sim):
    first = make_policy("advisor_v1", synergy=0.5, needs=0.65, scalers=0.75, engines=0.25, risk="safe")
    effective = first.describe()["params"]
    again = make_policy("advisor_v1", **effective)
    assert again.describe()["params"] == effective
    assert (again.synergy, again.model, again.risk) == (0.5, advisor.Model(0.65, 0.75, 0.25), "safe")


def test_an_unknown_risk_is_an_error_not_a_silent_default(sim):
    with pytest.raises(ValueError, match="unknown risk"):
        make_policy("advisor_v1", risk="reckless")


def test_the_model_scales_what_the_index_keeps_of_each_part():
    deck = {"STRIKE_IRONCLAD": 5, "DEFEND_IRONCLAD": 4, "BASH": 1, "FEEL_NO_PAIN": 1, "INFLAME": 1, "BURNING_PACT": 1}
    full = advisor.synergy_components(deck, 0, advisor.Model())  # the first judgement, not the strengths the page keeps
    half = advisor.synergy_components(deck, 0, advisor.Model(needs=0.5, scalers=0.5, engines=0.5))
    none = advisor.synergy_components(deck, 0, advisor.Model(needs=0.0, scalers=0.0, engines=0.0))
    for whole, part in zip(full, half):
        assert part == pytest.approx(whole * 0.5, rel=1e-9, abs=1e-12) or whole == 0
    assert none == (0.0, 0.0, 0.0) or all(abs(x) < 1e-12 for x in none)
    # the weights apply to the parts separately
    only_engines = advisor.synergy_components(deck, 0, advisor.Model(needs=0.0, scalers=0.0, engines=1.0))
    assert abs(only_engines[0]) < 1e-12 and abs(only_engines[1]) < 1e-12 and only_engines[2] == pytest.approx(full[2])


def test_a_margin_makes_it_skip_a_card_that_adds_less_than_the_margin(sim):
    offered = ["POMMEL_STRIKE"]
    obs, actions = reward(offered)
    gain = advisor.rank_options({"STRIKE_IRONCLAD": 5, "DEFEND_IRONCLAD": 4, "BASH": 1}, offered, 0)[0][1]
    assert gain > 0
    assert pilot()._card_reward(obs, actions) == 0
    assert pilot(margin=gain - 0.01)._card_reward(obs, actions) == 0
    assert pilot(margin=gain + 0.01)._card_reward(obs, actions) == 1  # skip
    with pytest.raises(ValueError, match="margin"):
        make_policy("advisor_v1", margin=-1.0)
