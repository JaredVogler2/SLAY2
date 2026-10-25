"""Episode outcome taxonomy (ADR-012).

Only ``win`` and ``death`` are *completed games*. Everything else is reported separately and is never
silently dropped or folded into the loss count.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum


class Outcome(str, Enum):
    WIN = "win"                          # final act cleared (A10: both bosses) -> run victory
    DEATH = "death"                      # player HP reached 0
    TIMEOUT = "timeout"                  # step / stall limit reached; policy or sim never terminated
    SIMULATOR_ERROR = "simulator_error"  # exception inside the simulator (NOT a loss)
    INVALID_ACTION = "invalid_action"    # simulator rejected a legal-list action (harness/policy bug)
    HARNESS_ERROR = "harness_error"      # exception in SLAY2's own adapter/runner (our bug, not a game result)
    POLICY_ERROR = "policy_error"        # exception raised by a policy (our bug, not a game result)
    ABORTED = "aborted"                  # stopped by the harness (signal, worker loss)


COMPLETED = frozenset({Outcome.WIN, Outcome.DEATH})


@dataclass
class EpisodeRecord:
    """One episode. ``seed`` is an internal run seed: it is logged for reproducibility but never given to a policy."""

    batch_id: str
    seed: int
    character: str
    ascension: int
    policy: str
    policy_version: str
    outcome: str
    steps: int = 0
    act: int = 0                       # 0-based act index reached
    floor: int = 0                     # total floors entered
    hp: int = 0
    max_hp: int = 0
    gold: int = 0
    deck_size: int = 0
    relics: int = 0
    combats_won: int = 0
    killed_by: str | None = None       # enemy ids alive at death (display only)
    wall_seconds: float = 0.0
    error: str | None = None           # exception type: message (simulator_error only)
    trace_sha256: str | None = None
    extra: dict = field(default_factory=dict)

    @property
    def completed(self) -> bool:
        return Outcome(self.outcome) in COMPLETED

    def to_json(self) -> dict:
        return asdict(self)


def summarize(records: list[EpisodeRecord]) -> dict:
    """Counts by outcome plus the win rate with its denominator spelled out."""
    counts = {o.value: 0 for o in Outcome}
    for r in records:
        counts[r.outcome] += 1
    wins, deaths = counts[Outcome.WIN.value], counts[Outcome.DEATH.value]
    completed = wins + deaths
    return {
        "episodes": len(records),
        "counts": counts,
        "completed": completed,
        "win_rate_of_completed": (wins / completed) if completed else None,
        "denominator": "wins / (wins + deaths); timeouts, simulator errors and invalid actions are NOT losses and NOT excluded silently",
    }
