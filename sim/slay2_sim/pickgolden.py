"""Golden cases for the website's "what simulated runs say" panel.

The panel replays, in TypeScript, the card-reward rule of ``rules_v2`` (the pilot the measured values were validated with,
ADR-031). This module asks the Python policy itself what it would do on a fixed set of offers and decks, so the TypeScript
port is tested against the original instead of against its own reading of it:

    python -m slay2_sim pickgolden --out apps/web/test/fixtures/simulation-pick-golden.json
"""

from __future__ import annotations

import random

from .policies import make_policy
from .policies.rules2 import DEFAULT_VALUES, MAX_DECK

DECK_SIZES = (10, 22, MAX_DECK - 1, MAX_DECK, MAX_DECK + 8)
UNMEASURED = ("BASH", "SOME_UNLISTED_CARD")  # a starter card and an id the values file does not contain


def build_golden(values: str = DEFAULT_VALUES, *, cases: int = 80, seed: int = 31) -> dict:
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
        obs = {"run": {"deck": [["STRIKE_IRONCLAD", False, size]]}}
        actions = [{"action": "pick_card", "idx": i, "card_id": c} for i, c in enumerate(offered)]
        actions.append({"action": "skip", "idx": len(offered)})
        idx = policy._card_reward(obs, actions)
        out.append({"offered": offered, "deckSize": size, "pick": "skip" if idx == len(offered) else offered[idx]})
    return {
        "schema": 1,
        "about": "what rules_v2 does on a card reward; the website must give the same answer (simulation-pick.ts)",
        "valuesFile": policy.describe()["params"]["values"],
        "valuesSha256": policy.describe()["params"]["values_sha256"],
        "deckCap": MAX_DECK,
        "threshold": policy.threshold,
        "cases": out,
    }
