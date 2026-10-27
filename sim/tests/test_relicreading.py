"""The relic synergy table is what the two blind readings and their reconciliation make (ADR-051)."""

from __future__ import annotations

import json

import pytest

from slay2_sim import relicreading as rr


def readings():
    return rr.read("reading-a.json"), rr.read("reading-b.json"), rr.read("reconciliation.json")


def catalog():
    return json.loads((rr.DATA / f"relics.{rr.BUILD_ID}.json").read_text(encoding="utf-8"))["relics"]


def test_the_committed_table_is_what_the_readings_make():
    body = rr.build()
    assert rr.TABLE.read_text(encoding="utf-8") == rr.render(body), "regenerate with: python -m slay2_sim.relicreading --write"


def test_each_reading_covers_every_relic_exactly_once_in_the_card_tables_vocabulary():
    ids = {r["id"] for r in catalog()}
    vocabulary = set(json.loads((rr.DATA / f"synergy.{rr.BUILD_ID}.json").read_text(encoding="utf-8"))["mechanics"])
    for reading in readings()[:2]:
        tagged, untagged = set(reading["tagged"]), set(reading["untagged"])
        assert tagged | untagged == ids and not tagged & untagged
        assert set(reading["unsure"]) <= ids
        for tags in reading["tagged"].values():
            assert set(tags) <= {"g", "w"}
            for part in tags.values():
                assert set(part) <= vocabulary


def test_a_mechanic_both_readers_wrote_is_kept_at_the_lower_magnitude():
    a, b, _ = readings()
    table = rr.build()["relics"]
    checked = 0
    for rid, tags in table.items():
        for mechanic, value in tags["g"].items():
            ga, gb = rr.gives(a, rid), rr.gives(b, rid)
            if mechanic in ga and mechanic in gb:
                assert abs(value) == min(abs(ga[mechanic]), abs(gb[mechanic])), (rid, mechanic)
                assert abs(ga[mechanic] - gb[mechanic]) <= 1, (rid, mechanic, "the readers differed by more than a step")
                checked += 1
    assert checked > 50


def test_a_mechanic_only_one_reader_wrote_has_a_decision_with_a_reason_and_nothing_else_does():
    a, b, decisions = readings()
    relics = {r["id"]: r for r in catalog()}
    one_reader = {
        (rid, m)
        for rid in relics
        if relics[rid]["rarity"] != "starter"
        for m in set(rr.gives(a, rid)) ^ set(rr.gives(b, rid))
    }
    decided = {(rid, m) for rid, ms in decisions["decisions"].items() for m in ms}
    assert decided == one_reader
    for ms in decisions["decisions"].values():
        for decision in ms.values():
            assert decision["why"].strip() and (decision["keep"] is None or decision["keep"] != 0)


def test_no_starting_relic_is_tagged_and_only_what_a_relic_provides_is_kept():
    table = rr.build()["relics"]
    starters = {r["id"] for r in catalog() if r["rarity"] == "starter"}
    assert len(starters) == 10 and not starters & set(table)
    assert all(set(tags) == {"g"} for tags in table.values())


def test_the_rule_refuses_what_it_cannot_decide():
    a, b, decisions = readings()
    relics = catalog()
    vocabulary = {"strength"}
    base = {"schema": 1, "tagged": {}, "untagged": [], "unsure": []}
    one = {**base, "tagged": {"VAJRA": {"g": {"strength": 1}}}}
    none = {"decisions": {}}
    with pytest.raises(rr.ReconciliationError, match="no decision"):
        rr.reconcile(one, base, none, [{"id": "VAJRA", "rarity": "common"}], vocabulary)
    with pytest.raises(rr.ReconciliationError, match="sign"):
        rr.reconcile(one, {**base, "tagged": {"VAJRA": {"g": {"strength": -1}}}}, none, [{"id": "VAJRA", "rarity": "common"}], vocabulary)
    with pytest.raises(rr.ReconciliationError, match="not a one-reader"):
        rr.reconcile(base, base, {"decisions": {"VAJRA": {"strength": {"keep": 1, "why": "x"}}}}, [{"id": "VAJRA", "rarity": "common"}], vocabulary)
    table, stats = rr.reconcile(one, {**base, "tagged": {"VAJRA": {"g": {"strength": 2}}}}, none, [{"id": "VAJRA", "rarity": "common"}], vocabulary)
    assert table == {"VAJRA": {"g": {"strength": 1}}} and stats["lower_magnitude_taken"] == 1
