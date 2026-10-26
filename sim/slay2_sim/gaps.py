"""Known gaps between the third-party simulator and STS2 v0.107.1.

Every batch manifest lists the gaps that apply to its configuration, so a reader can see what a number does
*not* model. The single source of truth is ``gaps.json`` (also read by the website exporter). Details and evidence:
docs/SIMULATOR-CANDIDATE-MATRIX.md (hazards) and sim/tests/test_terminal_semantics.py.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

GAPS_PATH = Path(__file__).with_name("gaps.json")


@dataclass(frozen=True)
class Gap:
    id: str
    summary: str
    min_ascension: int = 0
    affects: str = "results"  # "results" = changes what a win rate means; "coverage" = drops or biases a few episodes
    classes: tuple[str, ...] = ()  # the exact class ids the gap is about; empty = every class

    def __post_init__(self) -> None:
        object.__setattr__(self, "classes", tuple(self.classes))

    def to_json(self) -> dict:
        d = {"id": self.id, "summary": self.summary, "min_ascension": self.min_ascension, "affects": self.affects}
        if self.classes:
            d["classes"] = list(self.classes)  # a gap that is not class-specific keeps the shape every earlier manifest has
        return d


GAPS: tuple[Gap, ...] = tuple(Gap(**g) for g in json.loads(GAPS_PATH.read_text(encoding="utf-8"))["gaps"])


def applicable(ascension: int, character: str | None = None) -> list[dict]:
    """Gaps relevant to a run configuration: those with a higher ascension threshold are omitted, and a gap that is about
    particular classes is listed only for those (never when the class is not given)."""
    return [g.to_json() for g in GAPS if ascension >= g.min_ascension and (not g.classes or character in g.classes)]
