"""The website's deck-index heuristic (``@slay2/decision``), ported to Python so the simulator can score decks and play on it.

The TypeScript package is the original: it is what the advisor page runs. This module repeats its arithmetic for two uses the
browser code cannot serve, measuring the index against simulated runs (``slay2_sim.synergystudy``) and playing card rewards
by it (``policies/advisor.py``). Nothing here is a second opinion: ``packages/decision/test/golden/advisor-index.json`` is
written by the TypeScript code from fixed random decks, and ``sim/tests/test_advisor_port.py`` fails if this module does not
reproduce every number in it (and the TypeScript suite fails if the file is not what the TypeScript code writes today).

What the index is: a unit-less deck score, the mean static rating of the cards (``prior``), plus saturating coverage of roles
the deck needs by act, minus penalties for an expensive curve and a bloated deck, plus ``synergy`` (what the cards need from
each other: unmet needs hold a card's rating back, Strength and the like lift whole kinds of cards, sources and payoffs
together build engines). Every strength in it is a hand-set judgement; none was fitted when this module was written.

Upgrades are ignored, as they are on the website: a deck is a count per card id.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from functools import lru_cache
from typing import Iterable, Mapping, Sequence

from . import external

DATA = external.REPO_ROOT / "packages" / "game-data" / "data"
BUILD_ID = "sts2-main-0.107.1"

GROUPS = ("damage", "aoe", "block", "scaling", "draw", "energy", "debuff")
SCALING_ROLES = frozenset({"strength", "dexterity", "focus", "engine", "poison", "doom", "summon", "forge", "orbs", "thorns", "vigor", "intangible"})
DEBUFF_ROLES = frozenset({"vulnerable", "weak", "poison", "doom"})

# ---------------------------------------------------------------------------------------------------------- the data


@lru_cache(maxsize=1)
def catalog() -> dict[str, dict]:
    """Card id -> catalog entry (type, cost, rarity, keywords, roles, prior ...), read from the committed catalog."""
    raw = json.loads((DATA / f"cards.{BUILD_ID}.json").read_text(encoding="utf-8"))
    return {c["id"]: c for c in raw["cards"]}


@lru_cache(maxsize=1)
def synergy_table() -> dict:
    return json.loads((DATA / f"synergy.{BUILD_ID}.json").read_text(encoding="utf-8"))


def mechanic_ids() -> tuple[str, ...]:
    return tuple(synergy_table()["mechanics"])


def reward_pool(character: str) -> list[dict]:
    """The class's reward-eligible cards (the advisor's pool of what can be offered)."""
    return [c for c in catalog().values() if c["class"] == character and c["rewardEligible"] and c["rarity"] in ("common", "uncommon", "rare")]


# ------------------------------------------------------------------------------------------------------------- tags


def _derived_gives(card: Mapping) -> dict[str, int]:
    out: dict[str, int] = {}
    if card["type"] in ("attack", "skill", "power"):
        out[card["type"]] = 1
    cost = None if "unplayable" in card["roles"] else card["cost"]
    if cost is not None and cost != "X" and cost <= 1:
        out["cheap"] = 1
    if cost == 0:
        out["zero_cost"] = 1
    if "STRIKE" in card["id"]:
        out["strike"] = 1
    if "block" in card["roles"]:
        out["block"] = 1
    if "Exhaust" in card["keywords"]:
        out["exhaust"] = 1
    if "Ethereal" in card["keywords"]:
        out["ethereal"] = 1
    return out


def _derived_wants(card: Mapping) -> dict[str, int]:
    return {"discard": 2} if "Sly" in card["keywords"] else {}


def _merge(derived: Mapping[str, int], explicit: Mapping[str, int] | None) -> dict[str, int]:
    """The larger of what the code counts and what was written: a card is never counted twice for one mechanic."""
    out = dict(derived)
    for mechanic, value in (explicit or {}).items():
        current = out.get(mechanic, 0)
        out[mechanic] = value if abs(value) > abs(current) else out.get(mechanic, value)
    return out


@dataclass(frozen=True)
class Tags:
    gives: Mapping[str, float]
    wants: Mapping[str, float]
    scale: Mapping[str, float]


@lru_cache(maxsize=None)
def synergy_tags(card_id: str) -> Tags:
    card = catalog()[card_id]
    written = synergy_table()["cards"].get(card_id, {})
    return Tags(
        gives=_merge(_derived_gives(card), written.get("g")),
        wants=_merge(_derived_wants(card), written.get("w")),
        scale=dict(written.get("s", {})),
    )


SCALERS = ("strength", "dexterity", "focus")


@lru_cache(maxsize=None)
def benefits_from(card_id: str) -> tuple[str, ...]:
    """The scalers (Strength, Dexterity, Focus) that lift this kind of card, unless the card already needs the scaler."""
    card = catalog()[card_id]
    tags = synergy_tags(card_id)
    out = []
    if card["type"] == "attack" and not tags.wants.get("strength"):
        out.append("strength")
    if "block" in card["roles"] and not tags.wants.get("dexterity"):
        out.append("dexterity")
    if tags.gives.get("orb", 0) > 0 and not tags.wants.get("focus"):
        out.append("focus")
    return tuple(out)


# ------------------------------------------------------------------------------------------------------- synergy
DEPENDENCE_PER_WEIGHT = 0.25
MAX_DEPENDENCE = 0.7
FUTURE_SUPPORT = (0.3, 0.15, 0.05)
SCALER_BETA = {"strength": 0.25, "dexterity": 0.25, "focus": 0.25}
SYNERGY_CARDS = 12
ENGINE_PAYOFF_SCALE = 3

Deck = Mapping[str, int]  # card id -> copies


@dataclass(frozen=True)
class Model:
    """How much of each hand-set part of the synergy term the index keeps (1 is the first judgement; the website's constants are
    ``DEFAULT_MODEL``). Studies vary these to ask which parts the simulated runs support (``slay2_sim.synergystudy``)."""

    needs: float = 1.0     # multiplies how much of a card's rating an unmet need holds back
    scalers: float = 1.0   # multiplies what Strength, Dexterity and Focus add to the cards they lift
    engines: float = 1.0   # multiplies what sources and payoffs together add


DEFAULT_MODEL = Model()


def saturation(mechanic: str, supply: float) -> float:
    return 1 - math.exp(-max(0.0, supply) / synergy_table()["mechanics"][mechanic]["k"])


def innate_supply(character: str | None) -> dict[str, float]:
    """What the class's starting relic supplies in every combat (the Necrobinder's Osty, the Regent's Stars ...); empty for none."""
    entry = synergy_table()["innate"].get((character or "").lower())
    return dict(entry["gives"]) if entry else {}


def supply_of(deck: Deck, character: str | None = None) -> dict[str, float]:
    supply = {m: 0.0 for m in mechanic_ids()}
    for mechanic, g in innate_supply(character).items():
        supply[mechanic] += g
    for card_id, count in deck.items():
        for mechanic, g in synergy_tags(card_id).gives.items():
            if g:
                supply[mechanic] += g * count
    return supply


def payoff_mass_of(deck: Deck) -> dict[str, float]:
    mass = {m: 0.0 for m in mechanic_ids()}
    for card_id, count in deck.items():
        for mechanic, w in synergy_tags(card_id).wants.items():
            if w:
                mass[mechanic] += w * count
    return mass


@lru_cache(maxsize=None)
def needs_of(card_id: str, model: Model = DEFAULT_MODEL) -> tuple[tuple[tuple[str, float], ...], float, float]:
    """(needs in vocabulary order, their total weight, the share of the card's rating that rides on them)."""
    wants = synergy_tags(card_id).wants
    needs = tuple((m, wants[m]) for m in mechanic_ids() if wants.get(m))
    total_weight = sum(w for _, w in needs)
    return needs, total_weight, model.needs * min(MAX_DEPENDENCE, DEPENDENCE_PER_WEIGHT * total_weight)


def fit_of(card_id: str, supply: Mapping[str, float]) -> float:
    needs, total_weight, _ = needs_of(card_id)
    if total_weight == 0:
        return 1.0
    scale = synergy_tags(card_id).scale
    return sum(w * saturation(m, supply[m] / scale.get(m, 1)) for m, w in needs) / total_weight


def _scaler_bonus(card_id: str, supply: Mapping[str, float], model: Model = DEFAULT_MODEL) -> float:
    return sum(model.scalers * SCALER_BETA[s] * saturation(s, supply[s]) for s in benefits_from(card_id))


@dataclass(frozen=True)
class Realized:
    prior: float
    fit: float
    held_back: float
    scaler: float
    value: float


def realized_of(card_id: str, supply: Mapping[str, float], act_index: int, model: Model = DEFAULT_MODEL) -> Realized:
    _, _, share = needs_of(card_id, model)
    fit = fit_of(card_id, supply)
    fit_used = fit + FUTURE_SUPPORT[act_index] * (1 - fit)
    held_back = share * (1 - fit_used)
    scaler = _scaler_bonus(card_id, supply, model)
    prior = catalog()[card_id]["prior"]
    return Realized(prior, fit, held_back, scaler, prior * (1 - held_back) * (1 + scaler))


def realized_split(deck: Deck, act_index: int, model: Model = DEFAULT_MODEL, character: str | None = None) -> tuple[float, float]:
    """(rating lost to unmet needs, rating gained from scalers), summed over the deck's copies, in rating points.

    realized - prior = -prior x held_back + prior x (1 - held_back) x scaler, so the two parts add up to ``realized_mass``."""
    supply = supply_of(deck, character)
    unmet = scaler = 0.0
    for card_id, count in deck.items():
        r = realized_of(card_id, supply, act_index, model)
        unmet -= count * r.prior * r.held_back
        scaler += count * r.prior * (1 - r.held_back) * r.scaler
    return unmet, scaler


def realized_mass(deck: Deck, act_index: int, model: Model = DEFAULT_MODEL, character: str | None = None) -> float:
    unmet, scaler = realized_split(deck, act_index, model, character)
    return unmet + scaler


def engine_value(mechanic: str, supply: float, payoff: float, model: Model = DEFAULT_MODEL) -> float:
    return model.engines * synergy_table()["mechanics"][mechanic]["engine"] * saturation(mechanic, supply) * (1 - math.exp(-max(0.0, payoff) / ENGINE_PAYOFF_SCALE))


def engines_of(deck: Deck, model: Model = DEFAULT_MODEL, character: str | None = None) -> dict[str, float]:
    supply, payoff = supply_of(deck, character), payoff_mass_of(deck)
    return {m: engine_value(m, supply[m], payoff[m], model) for m in mechanic_ids()}


def synergy_components(deck: Deck, act_index: int, model: Model = DEFAULT_MODEL, character: str | None = None) -> tuple[float, float, float]:
    """The deck's synergy in index points as its three parts: (unmet needs, scalers, engines). Unmet needs are 0 or negative."""
    unmet, scaler = realized_split(deck, act_index, model, character)
    engines = engines_of(deck, model, character)
    return unmet / SYNERGY_CARDS, scaler / SYNERGY_CARDS, sum(engines[m] for m in mechanic_ids())


def synergy_of(deck: Deck, act_index: int, model: Model = DEFAULT_MODEL, character: str | None = None) -> float:
    return realized_mass(deck, act_index, model, character) / SYNERGY_CARDS + sum(engines_of(deck, model, character).values())


# -------------------------------------------------------------------------------------------------------- profile


def _energy_cost(card: Mapping) -> int | None:
    if card["cost"] is None or "unplayable" in card["roles"]:
        return None
    return 2 if card["cost"] == "X" else card["cost"]


@dataclass(frozen=True)
class Profile:
    size: int
    meanPrior: float
    averageEnergyCost: float
    highCostCount: int
    starterShare: float
    groups: Mapping[str, int]
    synergy: float


def profile_deck(deck: Deck, act_index: int = 0, model: Model = DEFAULT_MODEL, character: str | None = None) -> Profile:
    size = prior_sum = playable = high_cost = starters = 0
    cost_sum = 0.0
    groups = {g: 0 for g in GROUPS}
    cat = catalog()
    for card_id, count in deck.items():
        card = cat[card_id]
        roles = card["roles"]
        size += count
        prior_sum += card["prior"] * count
        if card["rarity"] == "basic":
            starters += count
        cost = _energy_cost(card)
        if cost is not None:
            playable += count
            cost_sum += cost * count
            if cost >= 3:
                high_cost += count
        for g in ("damage", "aoe", "block", "draw", "energy"):
            if g in roles:
                groups[g] += count
        if any(r in SCALING_ROLES for r in roles):
            groups["scaling"] += count
        if any(r in DEBUFF_ROLES for r in roles):
            groups["debuff"] += count
    return Profile(
        size=size,
        meanPrior=0.0 if size == 0 else prior_sum / size,
        averageEnergyCost=0.0 if playable == 0 else cost_sum / playable,
        highCostCount=high_cost,
        starterShare=0.0 if size == 0 else starters / size,
        groups=groups,
        synergy=synergy_of(deck, act_index, model, character),
    )


# -------------------------------------------------------------------------------------------------------- quality
COVERAGE_SCALE = {"damage": 7, "aoe": 1.5, "block": 6, "scaling": 2, "draw": 2, "energy": 1.5, "debuff": 2}
COVERAGE_BY_ACT = {
    "damage": (7, 5, 5),
    "aoe": (2, 6, 6),
    "block": (6, 7, 7),
    "scaling": (2, 6, 9),
    "draw": (3, 4, 4),
    "energy": (3, 3, 3),
    "debuff": (2.5, 3, 3),
}
RISK_MULTIPLIERS = {
    "safe": {"block": 1.3, "scaling": 0.9, "damage": 0.95},
    "balanced": {},
    "aggressive": {"damage": 1.25, "aoe": 1.1, "block": 0.8, "scaling": 1.1},
}


@dataclass(frozen=True)
class Weights:
    quality: float
    coverage: Mapping[str, float]
    curve: float
    size: float
    synergy: float


def base_weights(act_index: int = 0, risk: str = "balanced", synergy: float = 1.0) -> Weights:
    coverage = {g: COVERAGE_BY_ACT[g][act_index] * RISK_MULTIPLIERS[risk].get(g, 1) for g in GROUPS}
    return Weights(quality=1.0, coverage=coverage, curve=6.0, size=0.6, synergy=synergy)


@dataclass(frozen=True)
class Terms:
    quality: float
    coverage: Mapping[str, float]
    curve: float
    size: float
    synergy: float


def _saturate(n: float, k: float) -> float:
    return 1 - math.exp(-n / k)


def score_terms(p: Profile, w: Weights) -> Terms:
    coverage = {g: w.coverage[g] * _saturate(p.groups[g], COVERAGE_SCALE[g]) for g in GROUPS}
    curve = -(w.curve * max(0.0, p.averageEnergyCost - 1.3) + 0.8 * max(0, p.highCostCount - 2))
    size = -(w.size * max(0, p.size - 30))
    return Terms(w.quality * p.meanPrior, coverage, curve, size, w.synergy * p.synergy)


def total(t: Terms) -> float:
    return t.quality + sum(t.coverage[g] for g in GROUPS) + t.curve + t.size + t.synergy


# ---------------------------------------------------------------------------------------------------------- draft
SKIP = "skip"


def with_card(deck: Deck, card_id: str) -> dict[str, int]:
    out = dict(deck)
    out[card_id] = out.get(card_id, 0) + 1
    return out


def rank_options(
    deck: Deck,
    offered: Sequence[str],
    act_index: int = 0,
    risk: str = "balanced",
    weights: Weights | None = None,
    model: Model = DEFAULT_MODEL,
    character: str | None = None,
) -> list[tuple[str, float]]:
    """The offered cards and skipping, best first, each with the change in the deck index its pick makes.

    Skipping is worth 0 by definition and wins ties (it is sorted before a pick of equal value), as on the website.
    """
    w = weights or base_weights(act_index, risk)
    base_total = total(score_terms(profile_deck(deck, act_index, model, character), w))
    scored = [(card_id, total(score_terms(profile_deck(with_card(deck, card_id), act_index, model, character), w)) - base_total) for card_id in offered]
    scored.append((SKIP, 0.0))
    return sorted(scored, key=lambda s: (-s[1], 0 if s[0] == SKIP else 1))


def card_id_of(raw: str) -> str | None:
    """The catalog id of a simulator card name: the upgrade mark is dropped, and the ``_CARD`` / ``_STATUS`` the simulator appends
    to a card whose name collides with a power's is removed. None when the name is not a catalog card."""
    name = raw[:-1] if raw.endswith("+") else raw
    cat = catalog()
    if name in cat:
        return name
    for suffix in ("_CARD", "_STATUS"):
        if name.endswith(suffix) and name[: -len(suffix)] in cat:
            return name[: -len(suffix)]
    return None


def deck_from_ids(ids: Iterable[str], unknown: list[str] | None = None) -> dict[str, int]:
    """Count the cards of a simulator deck by catalog id (the index ignores upgrades). Names that are not catalog cards are left out
    of the count and, when ``unknown`` is given, appended to it, so a caller can say how much of a deck the index could not read."""
    out: dict[str, int] = {}
    for raw in ids:
        card_id = card_id_of(raw)
        if card_id is None:
            if unknown is not None:
                unknown.append(raw)
            continue
        out[card_id] = out.get(card_id, 0) + 1
    return out
