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


def read_values(path: str) -> tuple[dict[str, float], str, str, str | None]:
    """(card id -> beta, repo-relative path, sha256, character the values were measured for). Relative paths are resolved
    against the repository root. A file that does not name its character is read from its name (``ironclad-a0-v1.json``)."""
    p = Path(path)
    if not p.is_absolute():
        p = external.REPO_ROOT / p
    raw = p.read_bytes()
    data = json.loads(raw)
    if data.get("kind") != "card-values":
        raise ValueError(f"{p} is not a card-values file")
    rel = str(p.relative_to(external.REPO_ROOT)) if external.REPO_ROOT in p.parents else p.name
    character = data.get("character") or (p.name.split("-")[0].capitalize() if "-a0-" in p.name else None)
    return {c["id"]: float(c["beta"]) for c in data["cards"]}, rel, hashlib.sha256(raw).hexdigest(), character


def load_values(path: str) -> tuple[dict[str, float], str, str]:
    beta, rel, digest, _ = read_values(path)
    return beta, rel, digest


@register
class RulesV2(RulesV1):
    name = "rules_v2"
    version = "1"

    def __init__(self, values: str = DEFAULT_VALUES, threshold: float = 0.0, values_sha256: str | None = None, **params):
        self.beta, rel, digest, self.values_character = read_values(values)
        if values_sha256 is not None and values_sha256 != digest:  # a manifest's effective parameters must rebuild the same policy
            raise ValueError(f"{rel} has sha256 {digest}, but {values_sha256} was recorded")
        super().__init__(values=rel, values_sha256=digest, threshold=float(threshold), **params)
        self.threshold = float(threshold)

    def _card_reward(self, obs, actions) -> int:
        picks = _by(actions, "pick_card")
        if not picks:
            return super()._card_reward(obs, actions)
        played = obs["run"].get("character")
        if self.values_character and played and str(played).lower() != self.values_character.lower():
            # another class's values would read every card as unmeasured and skip every reward: never silently
            raise ValueError(f"card values were measured for {self.values_character}, this run plays {played}")
        size = len(deck_ids(obs["run"]))
        best = max(picks, key=lambda a: (self.beta.get(a["card_id"], 0.0), -a["idx"]))
        if self.beta.get(best["card_id"], 0.0) > self.threshold and size < self.tune["max_deck"]:
            return best["idx"]
        skip = _first(actions, "skip")
        return skip if skip is not None else super()._card_reward(obs, actions)
