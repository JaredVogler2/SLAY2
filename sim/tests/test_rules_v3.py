"""rules_v3: rules_v2 with the three elite thresholds the registered tuning study kept (ADR-036, ADR-045)."""

from __future__ import annotations

from slay2_sim.policies import make_policy
from slay2_sim.policies.rules import DEFAULT_TUNE
from slay2_sim.policies.rules3 import V3_TUNE


def test_it_differs_from_rules_v2_in_exactly_the_three_registered_thresholds(sim):
    v2, v3 = make_policy("rules_v2"), make_policy("rules_v3")
    changed = {k: v3.tune[k] for k in v3.tune if v3.tune[k] != v2.tune[k]}
    assert changed == V3_TUNE == {"elite_value": 0.5, "elite_ok_floor": 8, "elite_ok_hp": 0.9}
    assert all(v2.tune[k] == DEFAULT_TUNE[k] for k in DEFAULT_TUNE)
    assert (v3.beta, v3.threshold) == (v2.beta, v2.threshold)  # the measured card values and the pick rule are untouched


def test_an_explicit_tune_overrides_the_registered_values_and_the_effective_parameters_rebuild_the_policy(sim):
    custom = make_policy("rules_v3", tune={"elite_value": 1.0})
    assert custom.tune["elite_value"] == 1.0 and custom.tune["elite_ok_hp"] == 0.9
    original = make_policy("rules_v3")
    rebuilt = make_policy("rules_v3", **original.describe()["params"])  # what a batch manifest records must rebuild the policy
    assert rebuilt.tune == original.tune and rebuilt.describe()["params"] == original.describe()["params"]
