"""rules_v2 - rules_v1 whose card-reward choice is driven by *measured* card values (H8, ADR-031).

rules_v1 rates a card with a hand-written formula (``knowledge.static_rating``). rules_v2 reads a values file written by
``slay2_sim.cardvalue`` (the regression of "gets past the Act-1 boss" on the deck, over simulated runs whose card picks were
randomised) and, on a card reward, takes the offered card with the largest measured value if that value exceeds
``threshold`` (log-odds per copy; 0 means "a copy helps on average"), otherwise skips. Everything else (map, shop, rest,
events, combat) is rules_v1. The values file's path and SHA-256 are recorded in the policy parameters, so a batch manifest
says which measurement it used.

Fair: the policy sees the offered card ids and the deck (both visible to a human) and a static table; no hidden state.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from .. import external
from . import register
from .rules import RulesV1, _by, _first, deck_ids

DEFAULT_VALUES = "experiments/cardvalue/ironclad-a0-v1.json"
MAX_DECK = 32


def load_values(path: str) -> tuple[dict[str, float], str, str]:
    """(card id -> beta, repo-relative path, sha256). Relative paths are resolved against the repository root."""
    p = Path(path)
    if not p.is_absolute():
        p = external.REPO_ROOT / p
    raw = p.read_bytes()
    data = json.loads(raw)
    if data.get("kind") != "card-values":
        raise ValueError(f"{p} is not a card-values file")
    rel = str(p.relative_to(external.REPO_ROOT)) if external.REPO_ROOT in p.parents else p.name
    return {c["id"]: float(c["beta"]) for c in data["cards"]}, rel, hashlib.sha256(raw).hexdigest()


@register
class RulesV2(RulesV1):
    name = "rules_v2"
    version = "1"

    def __init__(self, values: str = DEFAULT_VALUES, threshold: float = 0.0, values_sha256: str | None = None, **params):
        self.beta, rel, digest = load_values(values)
        if values_sha256 is not None and values_sha256 != digest:  # a manifest's effective parameters must rebuild the same policy
            raise ValueError(f"{rel} has sha256 {digest}, but {values_sha256} was recorded")
        super().__init__(values=rel, values_sha256=digest, threshold=float(threshold), **params)
        self.threshold = float(threshold)

    def _card_reward(self, obs, actions) -> int:
        picks = _by(actions, "pick_card")
        if not picks:
            return super()._card_reward(obs, actions)
        size = len(deck_ids(obs["run"]))
        best = max(picks, key=lambda a: (self.beta.get(a["card_id"], 0.0), -a["idx"]))
        if self.beta.get(best["card_id"], 0.0) > self.threshold and size < self.tune["max_deck"]:
            return best["idx"]
        skip = _first(actions, "skip")
        return skip if skip is not None else super()._card_reward(obs, actions)
