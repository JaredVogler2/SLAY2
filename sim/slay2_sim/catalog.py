"""Derive SLAY2's minimal, facts-only card catalog from the pinned local references (ADR-011, docs/IP-COMPLIANCE.md).

Inputs (read-only, git-ignored, SHA-pinned in external/pins.json):
  * ``spire-archive`` ``data/sts2/cards.json`` (game v0.107.1): identifiers, display names, class, rarity, type, cost,
    keywords, targeting and numeric variables.
  * ``sts2-rl-agent`` ``decompiled/`` (E1): class card pools, epoch unlock lists and multiplayer constraints.

Output: ``packages/game-data/data/cards.sts2-main-0.107.1.json``. It deliberately contains NO card text, NO art, NO
numeric effect values. Per card it keeps what a player can read off the card frame (id, name, class, rarity, type, cost,
keywords) plus pool facts (multiplayer constraint, epoch gate) plus SLAY2's own analysis: ``roles`` (a vocabulary of
what the card does) and ``prior`` (a heuristic 0-100 static-power estimate, NOT a win-rate and NOT validated).

Derived numbers are computed here and then discarded; only the analysis is shipped.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from . import external
from .manifest import canonical_json, sha256_hex

BUILD_ID = "sts2-main-0.107.1"
OUT_PATH = external.REPO_ROOT / "packages" / "game-data" / "data" / "cards.sts2-main-0.107.1.json"
CHARACTERS_PATH = external.REPO_ROOT / "packages" / "game-data" / "data" / "characters.sts2-main-0.107.1.json"

CLASSES = ("ironclad", "silent", "regent", "necrobinder", "defect")
COLOR_TO_CLASS = {c: c for c in CLASSES} | {"colorless": "colorless", "curse": "curse", "status": "status", "token": "token", "event": "event", "quest": "quest"}
RARITY_MAP = {"Basic": "basic", "Common": "common", "Uncommon": "uncommon", "Rare": "rare", "Ancient": "ancient", "Event": "event",
              "Curse": "curse", "Status": "status", "Token": "token", "Quest": "quest"}
TYPE_MAP = {"Attack": "attack", "Skill": "skill", "Power": "power", "Curse": "curse", "Status": "status", "Quest": "quest"}
REWARD_RARITIES = ("common", "uncommon", "rare")


def snake(pascal: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", pascal).upper()


# ----------------------------------------------------------------------------- E1 facts: pools, epochs, constraints
def read_pool_membership(decompiled: Path) -> dict[str, set[str]]:
    """pool name -> set of card ids, from ``Models.CardPools/<Pool>CardPool.cs`` (GenerateAllCards)."""
    pools: dict[str, set[str]] = {}
    for f in sorted((decompiled / "MegaCrit.Sts2.Core.Models.CardPools").glob("*CardPool.cs")):
        text = f.read_text(encoding="utf-8", errors="ignore")
        body = text.split("GenerateAllCards", 1)[1].split("FilterThroughEpochs", 1)[0]
        pools[f.stem.replace("CardPool", "").lower()] = {snake(c) for c in re.findall(r"ModelDb\.Card<(\w+)>\(\)", body)}
    return pools


def read_epoch_cards(decompiled: Path) -> dict[str, set[str]]:
    """epoch class (e.g. ``Ironclad2Epoch``) -> card ids it unlocks (``<Epoch>.Cards``)."""
    out: dict[str, set[str]] = {}
    for f in sorted((decompiled / "MegaCrit.Sts2.Core.Timeline.Epochs").glob("*Epoch.cs")):
        text = f.read_text(encoding="utf-8", errors="ignore")
        if "static List<CardModel> Cards" not in text:
            continue
        out[f.stem] = {snake(c) for c in re.findall(r"ModelDb\.Card<(\w+)>\(\)", text)}
    return out


def read_pool_epoch_filters(decompiled: Path) -> dict[str, list[str]]:
    """pool name -> epoch class names whose cards the pool removes while the epoch is not revealed."""
    out: dict[str, list[str]] = {}
    for f in sorted((decompiled / "MegaCrit.Sts2.Core.Models.CardPools").glob("*CardPool.cs")):
        text = f.read_text(encoding="utf-8", errors="ignore")
        if "FilterThroughEpochs" not in text.split("GenerateAllCards", 1)[1]:
            continue
        out[f.stem.replace("CardPool", "").lower()] = re.findall(r"IsEpochRevealed<(\w+)>\(\)\)\s*\{\s*list\.RemoveAll", text)
    return out


def read_multiplayer_constraints(decompiled: Path) -> dict[str, str]:
    """card id -> 'multiplayer-only' | 'singleplayer-only'."""
    out: dict[str, str] = {}
    for f in (decompiled / "MegaCrit.Sts2.Core.Models.Cards").glob("*.cs"):
        text = f.read_text(encoding="utf-8", errors="ignore")
        if "CardMultiplayerConstraint.MultiplayerOnly" in text:
            out[snake(f.stem)] = "multiplayer-only"
        elif "CardMultiplayerConstraint.SingleplayerOnly" in text:
            out[snake(f.stem)] = "singleplayer-only"
    return out


# ----------------------------------------------------------------------------- SLAY2's own analysis
def roles_for(card: dict) -> list[str]:
    """What the card does, in SLAY2's vocabulary. Derived from structured fields, never from card text."""
    v = card.get("vars") or {}
    kws = {k.lower() for k in card.get("keywords", [])}
    t = card.get("type")
    target = card.get("target")
    roles: set[str] = set()
    if v.get("damage") or v.get("osty_damage") or v.get("extra_damage") or v.get("calculation_base"):
        roles.add("damage")
        if target == "AllEnemies":
            roles.add("aoe")
        if target == "RandomEnemy":
            roles.add("random-target")
        if (v.get("repeat") or 0) > 1:
            roles.add("multi-hit")
    if v.get("block") or v.get("block_for_stars") or v.get("power_plating") or v.get("blur"):
        roles.add("block")
    if v.get("cards"):
        roles.add("draw")
    if v.get("energy"):
        roles.add("energy")
    for key, role in (("power_strength", "strength"), ("power_dexterity", "dexterity"), ("power_focus", "focus"),
                      ("power_vulnerable", "vulnerable"), ("power_weak", "weak"), ("power_poison", "poison"), ("power_doom", "doom"),
                      ("power_thorns", "thorns"), ("power_intangible", "intangible"), ("power_vigor", "vigor"), ("power_artifact", "artifact"),
                      ("summon", "summon"), ("forge", "forge"), ("stars_var", "stars"), ("orb_slots", "orbs"), ("heal", "heal"),
                      ("max_hp", "max-hp"), ("gold", "gold"), ("hp_loss", "self-damage"), ("shivs", "shiv"), ("strength_loss", "strength-loss")):
        if v.get(key):
            roles.add(role)
    if card.get("star_cost"):
        roles.add("stars")
    if t == "power":
        roles.add("engine")
    for kw in ("exhaust", "ethereal", "retain", "innate", "sly", "unplayable", "eternal"):
        if kw in kws:
            roles.add(kw)
    return sorted(roles)


def prior_for(card: dict, rarity: str, cost: int | str | None) -> int:
    """Heuristic static-power estimate (0-100), bounded: rarity band +/- a capped stat adjustment.

    Context-free and NOT validated against outcomes; the advisor treats it as a weak prior. The adjustment is capped so
    that a card with an unusually large effect number cannot outrank the whole rarity ladder (Pact's End scoring 95 under
    the first, unbounded formula was the warning sign).
    """
    from math import tanh

    v = card.get("vars") or {}
    if rarity in ("curse", "status", "quest"):
        return 0
    if cost is None:
        return 5
    energy = 2.0 if cost == "X" else float(max(int(cost), 1))
    raw = 0.0
    hits = v.get("repeat") or 1 if (v.get("repeat") or 0) > 1 else 1
    raw += (v.get("damage") or 0) * hits * 0.55
    raw += (v.get("block") or 0) * 0.5 + (v.get("block_for_stars") or 0) * 0.4
    raw += min(v.get("cards") or 0, 3) * 2.2 + min(v.get("energy") or 0, 3) * 3.0
    raw += (v.get("power_strength") or 0) * 4.5 + (v.get("power_dexterity") or 0) * 3.5 + (v.get("power_focus") or 0) * 3.5
    raw += (v.get("power_vulnerable") or 0) * 1.6 + (v.get("power_weak") or 0) * 1.4 + (v.get("power_poison") or 0) * 1.0
    raw -= (v.get("hp_loss") or 0) * 0.7
    if card.get("target") == "AllEnemies":
        raw += (v.get("damage") or 0) * 0.35
    if card.get("type") == "Power":
        raw += 5.0
    if "Exhaust" in card.get("keywords", []):
        raw -= 1.0
    per_energy = raw / energy
    base = {"basic": 22.0, "common": 40.0, "uncommon": 52.0, "rare": 62.0, "ancient": 66.0, "event": 32.0, "token": 25.0}.get(rarity, 30.0)
    return int(max(5, min(95, round(base + 14.0 * tanh((per_energy - 5.0) / 12.0)))))


def build_catalog(*, write: bool = True) -> dict:
    archive = external.locate("spire-archive", require_clean=True)
    sim = external.locate("sts2-rl-agent", require_clean=True)
    decompiled = sim.root / "decompiled"
    cards_raw = json.loads((archive.root / "data" / "sts2" / "cards.json").read_text(encoding="utf-8"))
    versions = json.loads((archive.root / "data" / "sts2" / "history" / "versions.json").read_text(encoding="utf-8"))
    if versions[0]["version"] != "0.107.1":
        raise external.ExternalError(f"spire-archive newest data is {versions[0]['version']}, expected 0.107.1")

    pools = read_pool_membership(decompiled)
    epoch_cards = read_epoch_cards(decompiled)
    epoch_filters = read_pool_epoch_filters(decompiled)
    constraints = read_multiplayer_constraints(decompiled)
    card_to_gate: dict[str, str] = {}
    for pool, epochs in epoch_filters.items():
        for ep in epochs:
            for cid in epoch_cards.get(ep, set()) & pools.get(pool, set()):
                card_to_gate[cid] = ep.removesuffix("Epoch").upper()

    cards = []
    for c in cards_raw:
        rarity = RARITY_MAP[c["rarity"]]
        cls = COLOR_TO_CLASS[c["color"]]
        raw_cost = c.get("cost")
        cost: int | str | None = "X" if raw_cost == -1 else (None if raw_cost is None else int(raw_cost))
        entry = {
            "id": c["id"],
            "name": c["name"],
            "class": cls,
            "rarity": rarity,
            "type": TYPE_MAP[c["type"]],
            "cost": cost,
            "keywords": sorted(c.get("keywords", [])),
            "roles": roles_for(c),
            "prior": prior_for(c, rarity, cost),
            "rewardEligible": cls in CLASSES + ("colorless",) and rarity in REWARD_RARITIES,
            "multiplayer": constraints.get(c["id"]),
            "epochGate": card_to_gate.get(c["id"]),
        }
        if c.get("star_cost"):
            entry["starCost"] = int(c["star_cost"])
        cards.append(entry)
    cards.sort(key=lambda e: (e["class"], e["rarity"], e["id"]))
    body = {
        "schema": 1,
        "build": BUILD_ID,
        "provenance": {
            "kind": "facts-only catalog derived locally from rights-restricted references (ADR-011); no card text, art or effect numbers",
            "sources": [
                {"id": "spire-archive", "sha": archive.head, "gameVersion": versions[0]["version"], "used": "identifiers, names, class, rarity, type, cost, keywords (facts); structured fields to compute roles/prior, then discarded"},
                {"id": "sts2-rl-agent", "sha": sim.head, "gameVersion": "0.107.1", "evidence": "E1", "used": "class pool membership, epoch unlock lists, multiplayer constraints"},
            ],
            "derivedBy": "sim/slay2_sim/catalog.py",
            "retrieved": "2026-10-25",
            "notes": [
                "`roles` and `prior` are SLAY2 analysis. `prior` is a heuristic static-power estimate in 0-100, not a probability and not validated against outcomes.",
                "`epochGate` names the unlock epoch that adds the card to its class pool for profiles that have not revealed it.",
            ],
        },
        "cards": cards,
    }
    body["sha256"] = sha256_hex(canonical_json({k: v for k, v in body.items() if k != "sha256"}))
    if write:
        OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        OUT_PATH.write_text(json.dumps(body, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return body


def pool_sizes(catalog: dict) -> dict:
    """Solo reward-pool sizes per class and rarity, with and without unlock gating."""
    out: dict = {}
    for cls in CLASSES + ("colorless",):
        row = {}
        for r in REWARD_RARITIES:
            members = [c for c in catalog["cards"] if c["class"] == cls and c["rarity"] == r and c["multiplayer"] != "multiplayer-only"]
            row[r] = {"allUnlocked": len(members), "noEpochs": len([c for c in members if c["epochGate"] is None])}
        out[cls] = row
    return out


# ----------------------------------------------------------------------------- characters (E1 facts)
def build_characters(*, write: bool = True) -> dict:
    """Starting HP/gold/energy, starting deck and relic of each playable character (E1 ``Models.Characters/*.cs``)."""
    archive = external.locate("spire-archive", require_clean=True)
    sim = external.locate("sts2-rl-agent", require_clean=True)
    chars_dir = sim.root / "decompiled" / "MegaCrit.Sts2.Core.Models.Characters"
    relics = {r["id"]: r["name"] for r in json.loads((archive.root / "data" / "sts2" / "relics.json").read_text(encoding="utf-8"))}
    cards = {c["id"]: c["name"] for c in json.loads((archive.root / "data" / "sts2" / "cards.json").read_text(encoding="utf-8"))}
    out = []
    for cls in CLASSES:
        text = (chars_dir / f"{cls.capitalize()}.cs").read_text(encoding="utf-8", errors="ignore")

        def num(name: str) -> int:
            m = re.search(rf"{name}\s*=>\s*(\d+);", text)
            if not m:
                raise external.ExternalError(f"{cls}: {name} not found")
            return int(m.group(1))

        deck_block = text.split("StartingDeck", 1)[1].split("StartingRelics", 1)[0]
        deck: dict[str, int] = {}
        for c in re.findall(r"ModelDb\.Card<(\w+)>\(\)", deck_block):
            deck[snake(c)] = deck.get(snake(c), 0) + 1
        relic_block = text.split("StartingRelics", 1)[1].split(";", 1)[0]
        relic_ids = [snake(r) for r in re.findall(r"ModelDb\.Relic<(\w+)>\(\)", relic_block)]
        orb = re.search(r"BaseOrbSlotCount\s*=>\s*(\d+);", text)
        out.append({
            "id": cls,
            "startingHp": num("StartingHp"),
            "startingGold": num("StartingGold"),
            "maxEnergy": 3,
            "startingDeck": [{"id": cid, "count": n} for cid, n in deck.items()],
            "startingRelics": [{"id": rid, "name": relics.get(rid, rid)} for rid in relic_ids],
            **({"baseOrbSlots": int(orb.group(1))} if orb else {}),
        })
        missing = [cid for cid in deck if cid not in cards]
        if missing:
            raise external.ExternalError(f"{cls}: starting-deck cards missing from the catalog: {missing}")
    body = {
        "schema": 1,
        "build": BUILD_ID,
        "provenance": {
            "kind": "facts-only (E1: Models.Characters/*.cs); relic display names from spire-archive",
            "sources": [{"id": "sts2-rl-agent", "sha": sim.head}, {"id": "spire-archive", "sha": archive.head}],
            "derivedBy": "sim/slay2_sim/catalog.py",
            "retrieved": "2026-10-25",
            "notes": ["maxEnergy is the CharacterModel default (3); no character in v0.107.1 overrides it in these files."],
        },
        "characters": out,
    }
    body["sha256"] = sha256_hex(canonical_json({k: v for k, v in body.items() if k != "sha256"}))
    if write:
        CHARACTERS_PATH.parent.mkdir(parents=True, exist_ok=True)
        CHARACTERS_PATH.write_text(json.dumps(body, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return body
