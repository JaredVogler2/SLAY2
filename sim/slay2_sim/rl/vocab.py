"""Stable vocabularies for the neural policy.

Cards, powers and relics use the simulator's own enums (exact: index = 1 + position among the sorted member names, 0 is
padding / unknown). Monsters, potions and selection prompts are hashed into fixed bucket counts with crc32, which is
deterministic across processes and platforms and needs no external list. A vocabulary is a property of the pinned
simulator, so it is recomputed, never stored.
"""

from __future__ import annotations

import zlib
from functools import lru_cache

N_MONSTER = 4096
N_POTION = 512
N_PROMPT = 64


def hashed(name: str, buckets: int) -> int:
    """1 + crc32(name) mod (buckets - 1): index 0 stays reserved for padding."""
    return 1 + zlib.crc32(name.encode("utf-8")) % (buckets - 1)


@lru_cache(maxsize=None)
def _enum_names(which: str) -> tuple[str, ...]:
    if which == "card":
        from sts2_env.core.enums import CardId as E
    elif which == "power":
        from sts2_env.core.enums import PowerId as E
    elif which == "relic":
        from sts2_env.relics.base import RelicId as E
    else:  # pragma: no cover - programming error
        raise KeyError(which)
    return tuple(sorted(m.name for m in E))


@lru_cache(maxsize=None)
def _enum_index(which: str) -> dict[str, int]:
    return {name: i + 1 for i, name in enumerate(_enum_names(which))}


def card_index(card_id: str) -> int:
    return _enum_index("card").get(card_id, 0)


def power_index(power_id: str) -> int:
    return _enum_index("power").get(power_id, 0)


def relic_index(relic_id: str) -> int:
    return _enum_index("relic").get(relic_id, 0)


def monster_index(monster_id: str) -> int:
    return hashed(monster_id, N_MONSTER)


def potion_index(potion_id: str) -> int:
    return hashed(potion_id, N_POTION)


def prompt_index(prompt: str) -> int:
    return hashed(prompt, N_PROMPT)


def sizes() -> dict[str, int]:
    """Embedding-table sizes (including the padding row)."""
    return {
        "card": len(_enum_names("card")) + 1,
        "power": len(_enum_names("power")) + 1,
        "relic": len(_enum_names("relic")) + 1,
        "monster": N_MONSTER,
        "potion": N_POTION,
        "prompt": N_PROMPT,
    }
