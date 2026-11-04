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
    classes = json.loads(FIXTURE.read_text(encoding="utf-8"))["classes"]
    assert classes, "at least one class has measured values"
    for entry in classes:
        cases = entry["cases"]
        picks = {c["pick"] for c in cases}
        assert "skip" in picks and len(picks) > 3, entry["character"]
        assert any(c["deckSize"] >= 32 and c["pick"] == "skip" for c in cases), "the deck cap must decide some case"
        assert any(c["deckSize"] < 32 and c["pick"] != "skip" for c in cases), entry["character"]


def test_the_late_rule_differs_from_the_baseline_only_by_skipping_more(sim):
    """Act 2's threshold 0.2 never takes a card the baseline skips, takes the same card or skips where the baseline took one, and does both in the fixture."""
    classes = json.loads(FIXTURE.read_text(encoding="utf-8"))["classes"]
    for entry in classes:
        cases = entry["cases"]
        for c in cases:
            assert c["latePick"] in ("skip", c["pick"]), (entry["character"], c)
        assert any(c["latePick"] == c["pick"] != "skip" for c in cases), f"{entry['character']}: the late rule must take some card"
        assert any(c["latePick"] == "skip" != c["pick"] for c in cases), f"{entry['character']}: the late rule must skip where the baseline takes"
        assert any(c["latePick"] == c["pick"] == "skip" for c in cases), entry["character"]


def test_the_late_policy_plays_the_baseline_outside_act_2(sim):
    """The advisor speaks for Act 2 only because that is where the policy differs: in acts 0 and 2 it is rules_v2 whatever the late threshold."""
    from slay2_sim.pickgolden import LATE_THRESHOLD, UNMEASURED, values_files
    from slay2_sim.policies import make_policy

    for f in values_files():
        base = make_policy("rules_v2", values=str(f))
        late = make_policy("rules_v2_late", values=str(f), late_acts=[1], late_threshold=LATE_THRESHOLD)
        base.reset(1)
        late.reset(1)
        ids = sorted(base.beta)[:12] + list(UNMEASURED)
        for act in (0, 2):
            for k in range(0, len(ids) - 2, 3):
                offered = ids[k : k + 3]
                actions = [{"action": "pick_card", "idx": i, "card_id": c} for i, c in enumerate(offered)]
                actions.append({"action": "skip", "idx": len(offered)})
                run = {"deck": [["STRIKE_IRONCLAD", False, 12]], "character": base.values_character, "act": act}
                assert late._card_reward({"run": run}, actions) == base._card_reward({"run": run}, actions), (str(f), act, offered)
