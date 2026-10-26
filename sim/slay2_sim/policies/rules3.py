"""rules_v3 - rules_v2 with the three elite thresholds that the registered tuning study kept (H9, ADR-036 and ADR-045).

The study (development seeds only) varied one threshold at a time, confirmed the winners on fresh seeds and checked the
combination on a third slice; the procedure fixed before any game is in ADR-036. rules_v3 is that combination and nothing
else: every other threshold is rules_v2's, the card-pick rule and the measured values are untouched. It is additive: rules_v2
stays what ADR-031 validated. Whether the combination helps on held-out seeds is the one test registered in ADR-045.
"""

from __future__ import annotations

from . import register
from .rules2 import RulesV2

# the tuning study's kept changes: fight an elite only with at least 90 % of max HP, from floor 8 on, and weigh it at 0.5
V3_TUNE = {"elite_value": 0.5, "elite_ok_floor": 8, "elite_ok_hp": 0.9}


@register
class RulesV3(RulesV2):
    name = "rules_v3"
    version = "1"

    def __init__(self, tune: dict | None = None, **params):
        super().__init__(tune={**V3_TUNE, **(tune or {})}, **params)
