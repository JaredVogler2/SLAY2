"""Policy interface.

A policy receives the *fair observation* (slay2_sim.observation) and the list of legal actions
(raw dicts, same order as ``obs["actions"]``) and returns an index into that list. It never receives the
manager, the seed, or any RNG. Search policies that need a forward model declare ``needs_forward_model``
and receive a ``ForwardModel`` that only hands out *fairly determinized* clones.
"""

from __future__ import annotations

import random
from typing import Protocol


class ForwardModel(Protocol):
    def clone(self, seed: int):  # pragma: no cover - protocol
        """A faithful clone of the live run with hidden state replaced by a fair sample for ``seed``."""


class Policy:
    name = "base"
    version = "0"
    needs_forward_model = False

    def __init__(self, **params):
        self.params = params
        self.rng = random.Random(0)

    def reset(self, rng_seed: int) -> None:
        """Called once per episode with a *policy-private* seed (unrelated to the run seed)."""
        self.rng = random.Random(rng_seed)

    def act(self, obs: dict, actions: list[dict], fm: ForwardModel | None = None) -> int:  # pragma: no cover
        raise NotImplementedError

    def describe(self) -> dict:
        return {"name": self.name, "version": self.version, "params": self.params}
