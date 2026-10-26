"""The website's simulation-pick golden fixture is what rules_v2 does today (regenerate with `slay2_sim pickgolden`)."""

from __future__ import annotations

import json

from slay2_sim import external
from slay2_sim.pickgolden import build_golden

FIXTURE = external.REPO_ROOT / "apps" / "web" / "test" / "fixtures" / "simulation-pick-golden.json"


def test_the_committed_fixture_is_a_regeneration_of_the_policy_itself(sim):
    committed = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert build_golden() == committed, "rules_v2 or the values file changed: run `python -m slay2_sim pickgolden`"


def test_the_fixture_exercises_every_branch(sim):
    cases = json.loads(FIXTURE.read_text(encoding="utf-8"))["cases"]
    picks = {c["pick"] for c in cases}
    assert "skip" in picks and len(picks) > 5
    assert any(c["deckSize"] >= 32 and c["pick"] == "skip" for c in cases), "the deck cap must decide some case"
    assert any(c["deckSize"] < 32 and c["pick"] != "skip" for c in cases)
