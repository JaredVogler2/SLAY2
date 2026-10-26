"""Golden cases for the website's "what simulated runs say" panel.

The panel replays, in TypeScript, the card-reward rule of ``rules_v2`` (the pilot the measured values were validated with,
ADR-031; ``rules_v3`` follows the same rule and differs only in its elite thresholds, ADR-045). This module asks the
Python policy itself what it would do on a fixed set of offers and decks, so the TypeScript port is tested against the
original instead of against its own reading of it:

    python -m slay2_sim pickgolden --out apps/web/test/fixtures/simulation-pick-golden.json
"""

from __future__ import annotations

import json
import random
from pathlib import Path

from . import external
from .policies import make_policy
from .policies.rules2 import MAX_DECK

DECK_SIZES = (10, 22, MAX_DECK - 1, MAX_DECK, MAX_DECK + 8)
UNMEASURED = ("BASH", "SOME_UNLISTED_CARD")  # a starter card and an id the values file does not contain


def values_files() -> list[Path]:
    """The card-values files the website shows (experiments/cardvalue/site-sets.json, ADR-046), in a fixed order.

    The website's exporter reads the same list, so the cases here and the values the panel uses cannot name different files;
    a values file that exists only because a study measured it (a round-two fit before it is adopted) is not in it.
    """
    listing = json.loads((external.REPO_ROOT / "experiments" / "cardvalue" / "site-sets.json").read_text(encoding="utf-8"))
    return sorted(external.REPO_ROOT / "experiments" / "cardvalue" / entry["file"] for entry in listing["sets"])


def build_class(values: str, *, cases: int, seed: int) -> dict:
    policy = make_policy("rules_v2", values=values)
    policy.reset(1)
    rng = random.Random(seed)
    ids = sorted(policy.beta) + list(UNMEASURED)
    out = []
    # offers made only of cards the values file does not contain are rare in a random draw: pin them explicitly
    fixed = [([UNMEASURED[1]], 12), (list(UNMEASURED), 12), (list(UNMEASURED), MAX_DECK)]
    for k in range(cases):
        if k < len(fixed):
            offered, size = fixed[k]
        else:
            offered = rng.sample(ids, rng.choice((1, 2, 3, 3, 3, 4)))
            size = rng.choice(DECK_SIZES)
        character = policy.values_character
        obs = {"run": {"deck": [["STRIKE_IRONCLAD", False, size]], "character": character}}
        actions = [{"action": "pick_card", "idx": i, "card_id": c} for i, c in enumerate(offered)]
        actions.append({"action": "skip", "idx": len(offered)})
        idx = policy._card_reward(obs, actions)
        out.append({"offered": offered, "deckSize": size, "pick": "skip" if idx == len(offered) else offered[idx]})
    params = policy.describe()["params"]
    return {"character": (policy.values_character or "").lower(), "valuesFile": params["values"], "valuesSha256": params["values_sha256"], "cases": out}


def build_golden(*, cases: int = 80, seed: int = 31) -> dict:
    return {
        "schema": 2,
        "about": "what rules_v2 does on a card reward, per class; the website must give the same answer wherever it speaks (simulation-pick.ts)",
        "deckCap": MAX_DECK,
        "threshold": 0.0,
        "classes": [build_class(str(f), cases=cases, seed=seed) for f in values_files()],
    }
