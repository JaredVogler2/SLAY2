"""Integrity of the committed facts-only card catalog (needs no external checkout)."""

import json
from pathlib import Path

from slay2_sim.manifest import canonical_json, sha256_hex

CATALOG = Path(__file__).resolve().parents[2] / "packages" / "game-data" / "data" / "cards.sts2-main-0.107.1.json"
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
