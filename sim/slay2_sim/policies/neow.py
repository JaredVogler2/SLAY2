"""rules_v2_neow - rules_v2 that takes one of the three relics the opening Ancient (Neow) offers *at random*, for measuring
what each option is worth (H10, ADR-041). It is not for playing well.

Why: which relic the pilot starts with decides a good part of the run, and the hand-written choice of rules_v1/v2 ("the first
positive relic offered") is a guess. If the choice among the three offered relics (two positive, one cursed) is randomised,
the relic in hand is decided by chance and not by the policy's taste, so the simulator can answer "did the run get past the
Act-1 boss?" for each relic *taken from the same offers*. The contrast that is identified is the randomised one: among the
games in which relic X was offered, the games that took X against the games that took one of the others.

Everything else (card picks by measured values, map, shop, rest, combat) is rules_v2. With ``neow_explore`` 0 the policy is
exactly rules_v2 (and still logs the offer and what it took). The offer and the choice are read from the fair observation
(the options a human sees on the screen), and the draw uses its own random stream so that exploring does not perturb the
other decisions of the policy.

``rules_v2_neow_values`` is the policy the measurement is for: it takes the offered relic with the largest measured value
(``neow_values``, a file written by ``slay2_sim.neowvalue``; a relic the file does not list counts as 0, the average) and
is otherwise rules_v2. Its path and SHA-256 are recorded in the policy parameters.
"""

from __future__ import annotations

import hashlib
import json
import random
from pathlib import Path

from .. import external
from . import register
from .rules import _by
from .rules2 import RulesV2

NEOW_OPTIONS = ("positive_1", "positive_2", "cursed")
_NEOW_SALT = 0x4E454F57  # "NEOW"


class _NeowMixin:
    """The opening-Ancient screen: detect it, let ``_pick_neow`` choose (or defer to rules_v2), and log offer and choice."""

    def __init__(self, **params):
        super().__init__(**params)
        self.neow: dict | None = None

    def reset(self, rng_seed: int) -> None:
        super().reset(rng_seed)
        self._neow_rng = random.Random(rng_seed ^ _NEOW_SALT)
        self.neow = None

    def _pick_neow(self, by_kind: dict[str, dict]) -> dict | None:  # pragma: no cover - overridden
        return None

    def _event(self, obs, actions) -> int:
        enabled = [a for a in _by(actions, "event_choice") if a.get("enabled", True)]
        by_kind = {a["option_id"]: a for a in enabled}
        if not set(NEOW_OPTIONS) <= set(by_kind):  # any other event: rules_v2
            return super()._event(obs, actions)
        picked = self._pick_neow(by_kind)
        if picked is not None:
            taken, idx, explored = picked, picked["idx"], True
        else:
            idx = super()._event(obs, actions)
            taken, explored = next(a for a in enabled if a["idx"] == idx), False
        self.neow = {
            # relic names as the screen shows them, positives sorted so the order of the two positive slots carries nothing
            "positive": sorted(str(by_kind[k].get("label", "")) for k in NEOW_OPTIONS[:2]),
            "cursed": str(by_kind["cursed"].get("label", "")),
            "taken": str(taken.get("label", "")),
            "kind": "cursed" if taken["option_id"] == "cursed" else "positive",
            "explored": explored,
        }
        return idx

    def episode_stats(self) -> dict:
        base = super().episode_stats() if hasattr(super(), "episode_stats") else {}
        return {**base, "neow": self.neow}


class NeowExploreMixin(_NeowMixin):
    def __init__(self, neow_explore: float = 1.0, **params):
        super().__init__(neow_explore=float(neow_explore), **params)
        self.neow_explore = float(neow_explore)

    def _pick_neow(self, by_kind: dict[str, dict]) -> dict | None:
        if self.neow_explore > 0 and self._neow_rng.random() < self.neow_explore:
            return by_kind[NEOW_OPTIONS[self._neow_rng.randrange(len(NEOW_OPTIONS))]]
        return None

    def episode_stats(self) -> dict:
        return {**super().episode_stats(), "neow_explore": self.neow_explore}


def read_neow_values(path: str) -> tuple[dict[str, float], str, str]:
    """(relic label -> beta, repo-relative path, sha256). Relative paths are resolved against the repository root."""
    p = Path(path)
    if not p.is_absolute():
        p = external.REPO_ROOT / p
    raw = p.read_bytes()
    data = json.loads(raw)
    if data.get("kind") != "neow-values":
        raise ValueError(f"{p} is not a neow-values file")
    rel = str(p.relative_to(external.REPO_ROOT)) if external.REPO_ROOT in p.parents else p.name
    return {r["label"]: float(r["beta"]) for r in data["relics"]}, rel, hashlib.sha256(raw).hexdigest()


class NeowValuesMixin(_NeowMixin):
    def __init__(self, neow_values: str, neow_values_sha256: str | None = None, **params):
        self.neow_beta, rel, digest = read_neow_values(neow_values)
        if neow_values_sha256 is not None and neow_values_sha256 != digest:  # a manifest's parameters must rebuild the same policy
            raise ValueError(f"{rel} has sha256 {digest}, but {neow_values_sha256} was recorded")
        super().__init__(neow_values=rel, neow_values_sha256=digest, **params)

    def _pick_neow(self, by_kind: dict[str, dict]) -> dict | None:
        # the largest measured value wins; a relic the file does not list counts as 0 (the average); ties go to the first slot
        return max((by_kind[k] for k in NEOW_OPTIONS), key=lambda a: self.neow_beta.get(str(a.get("label", "")), 0.0))


@register
class RulesV2Neow(NeowExploreMixin, RulesV2):
    name = "rules_v2_neow"
    version = "1"


@register
class RulesV2NeowValues(NeowValuesMixin, RulesV2):
    """The measured rule: take the offered opening-Ancient relic with the largest value (ADR-041)."""

    name = "rules_v2_neow_values"
    version = "1"
