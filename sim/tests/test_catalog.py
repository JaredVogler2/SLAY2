"""Integrity of the committed facts-only card catalog (needs no external checkout)."""

import json
from pathlib import Path

from slay2_sim.manifest import canonical_json, sha256_hex

CATALOG = Path(__file__).resolve().parents[2] / "packages" / "game-data" / "data" / "cards.sts2-main-0.107.1.json"
RELICS = Path(__file__).resolve().parents[2] / "packages" / "game-data" / "data" / "relics.sts2-main-0.107.1.json"
CHARACTERS = Path(__file__).resolve().parents[2] / "packages" / "game-data" / "data" / "characters.sts2-main-0.107.1.json"
DATA_CARDS = Path(__file__).resolve().parents[2] / "docs" / "MODEL-AND-DATA-CARDS.md"
ALLOWED = {"id", "name", "class", "rarity", "type", "cost", "starCost", "keywords", "roles", "prior", "rewardEligible", "multiplayer", "epochGate"}


def load() -> dict:
    return json.loads(CATALOG.read_text(encoding="utf-8"))


def test_content_hash_matches():
    body = load()
    stored = body.pop("sha256")
    assert sha256_hex(canonical_json(body)) == stored, "regenerate with: python -m slay2_sim catalog"


def test_only_facts_and_slay2_analysis_are_stored():
    for c in load()["cards"]:
        assert set(c) <= ALLOWED, (c["id"], set(c) - ALLOWED)


def test_solo_reward_pools_match_the_published_20_35_25():
    cards = load()["cards"]
    for cls in ("ironclad", "silent", "regent", "necrobinder", "defect"):
        for rarity, want in (("common", 20), ("uncommon", 35), ("rare", 25)):
            n = sum(1 for c in cards if c["class"] == cls and c["rarity"] == rarity and c["rewardEligible"] and c["multiplayer"] != "multiplayer-only")
            assert n == want, (cls, rarity, n)


def test_provenance_pins_match_external_pins():
    from slay2_sim.external import load_pins

    pinned = {r["id"]: r["sha"] for r in load_pins()["repos"]}
    for s in load()["provenance"]["sources"]:
        assert s["sha"] == pinned[s["id"]]


def load_relics() -> dict:
    return json.loads(RELICS.read_text(encoding="utf-8"))


def test_relic_catalog_content_hash_matches():
    body = load_relics()
    stored = body.pop("sha256")
    assert sha256_hex(canonical_json(body)) == stored, "regenerate with: python -m slay2_sim catalog"


def test_relic_catalog_stores_facts_only():
    for r in load_relics()["relics"]:
        assert set(r) == {"id", "name", "rarity", "pools"}, (r["id"], set(r))


def test_relic_catalog_counts_and_pools():
    relics = load_relics()["relics"]
    assert len(relics) == 296 and len({r["id"] for r in relics}) == 296
    for cls in ("ironclad", "silent", "regent", "necrobinder", "defect"):
        assert sum(1 for r in relics if cls in r["pools"]) == 8, cls
    assert sum(1 for r in relics if "shared" in r["pools"]) == 118
    assert sum(1 for r in relics if "event" in r["pools"]) == 140
    assert sum(1 for r in relics if r["rarity"] == "ancient") == 100


def test_each_class_starts_with_a_starter_relic_of_its_own_pool():
    by_id = {r["id"]: r for r in load_relics()["relics"]}
    for ch in json.loads(CHARACTERS.read_text(encoding="utf-8"))["characters"]:
        for start in ch["startingRelics"]:
            relic = by_id[start["id"]]
            assert relic["rarity"] == "starter" and ch["id"] in relic["pools"] and relic["name"] == start["name"], (ch["id"], start)


def test_relic_provenance_pins_match_external_pins():
    from slay2_sim.external import load_pins

    pinned = {r["id"]: r["sha"] for r in load_pins()["repos"]}
    for s in load_relics()["provenance"]["sources"]:
        assert s["sha"] == pinned[s["id"]]


def test_the_data_cards_quote_the_hash_of_each_catalog():
    doc = DATA_CARDS.read_text(encoding="utf-8")
    assert load()["sha256"] in doc, "docs/MODEL-AND-DATA-CARDS.md (D2) does not quote the card catalog's hash"
    assert load_relics()["sha256"] in doc, "docs/MODEL-AND-DATA-CARDS.md (D11) does not quote the relic catalog's hash"
    table = json.loads((RELICS.parent / "relic-synergy.sts2-main-0.107.1.json").read_text(encoding="utf-8"))
    assert table["sha256"] in doc, "docs/MODEL-AND-DATA-CARDS.md (D12) does not quote the relic synergy table's hash"
