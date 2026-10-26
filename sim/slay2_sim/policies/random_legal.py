"""Uniformly random legal action - the floor every other policy must beat."""

from __future__ import annotations

from .base import Policy


class RandomLegal(Policy):
    name = "random_legal"
    version = "1"

    def act(self, obs, actions, fm=None):
        return self.rng.randrange(len(actions))
