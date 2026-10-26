"""Policy registry."""

from __future__ import annotations

from .base import Policy
from .random_legal import RandomLegal

REGISTRY: dict[str, type[Policy]] = {"random_legal": RandomLegal}


def register(cls: type[Policy]) -> type[Policy]:
    REGISTRY[cls.name] = cls
    return cls


def make_policy(name: str, **params) -> Policy:
    if name not in REGISTRY:
        raise KeyError(f"unknown policy {name!r}; known: {sorted(REGISTRY)}")
    return REGISTRY[name](**params)


from . import rules  # noqa: E402,F401  (registers rules_v1)
from . import explore  # noqa: E402,F401  (registers rules_explore: rules_v1 with randomised card rewards, for measurement)
from . import rules2  # noqa: E402,F401  (registers rules_v2: rules_v1 with card rewards chosen by measured card values)
from . import search  # noqa: E402,F401  (registers search_v1)
from . import search2  # noqa: E402,F401  (registers search_v2: best-first turn planner with state de-duplication)
from . import ppo_combat  # noqa: E402,F401  (registers ppo_combat_v1; torch is imported lazily)
