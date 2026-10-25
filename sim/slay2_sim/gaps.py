"""Known gaps between the third-party simulator and STS2 v0.107.1.

Every batch manifest lists the gaps that apply to its configuration, so a reader can see what a number does
*not* model. Details and evidence: docs/SIMULATOR-CANDIDATE-MATRIX.md (hazards) and sim/tests/test_terminal_semantics.py.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Gap:
    id: str
    summary: str
    min_ascension: int = 0
    affects: str = "results"  # "results" = changes what a win rate means; "coverage" = drops or biases a few episodes

    def to_json(self) -> dict:
        return {"id": self.id, "summary": self.summary, "min_ascension": self.min_ascension, "affects": self.affects}


GAPS: tuple[Gap, ...] = (
    Gap(
        "G1-double-boss-not-entered",
        "A10 Double Boss is not modelled: the second Act-3 boss is rolled but the map has no second boss point and the "
        "run is won after the first boss (game: StandardActMap.SecondBossMapPoint, one row above the boss). "
        "Simulator A10 win rates are therefore NOT Double Boss win rates.",
        min_ascension=10,
    ),
    Gap(
        "G2-a8-hp-scaling",
        "Living Shield, Scroll of Biting and The Merchant??? ignore the A8 HP increase (97 of 100 audited enemy rows match).",
        min_ascension=8,
        affects="coverage",
    ),
    Gap(
        "G3-sovereign-blade-crash",
        "is_sovereign_blade(None) raises in rare power/attack interactions (~1 in 2,000 random games); such games are "
        "reported as simulator_error and excluded from win rates.",
        affects="coverage",
    ),
    Gap(
        "G4-rng-family",
        "The simulator ports .NET System.Random; the game uses xoshiro256** (v0.107.1). Distributions match where audited, "
        "but no seed reproduces a live run and per-card roll order differs.",
    ),
    Gap(
        "G5-no-live-parity",
        "State transitions have not been compared with a live STS2 build (no owned game in this environment).",
    ),
)


def applicable(ascension: int) -> list[dict]:
    """Gaps relevant to a run configuration (all of them below their ascension threshold are omitted)."""
    return [g.to_json() for g in GAPS if ascension >= g.min_ascension]
