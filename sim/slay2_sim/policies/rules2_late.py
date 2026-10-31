"""rules_v2_late - rules_v2 whose card-reward rule can differ in the later acts (ADR-060).

The measured card values (``slay2_sim.cardvalue``) are for getting past the *Act-1 boss*, and rules_v2 uses one value table and one
threshold for the whole run. This policy is rules_v2 with an optional second rule for the acts named in ``late_acts`` (the game's
acts counted from 0: ``[1]`` is Act 2, which is the default): a card reward shown while the run is in one of those acts is decided
with ``late_threshold`` (default: the threshold of every other act) and, if ``late_values`` is given, with that table instead of the
policy's own. Everything else (the map, rests, shops, events, combat, the deck cap, the card reward of every other act) is rules_v2.

With no ``late_*`` parameter it plays exactly as rules_v2 does; in an act that is not in ``late_acts`` it plays exactly as rules_v2
does whatever the late parameters are (a test pins both). So two arms that differ only in their late parameters play the same game
up to the first card reward of the late act, which is what lets a paired test read the effect of the later rule alone.

The act is read from the fair observation (``run.act``, the act the player is in, which a human sees), and a threshold of +/-100
(finite, so that the parameters stay valid JSON) is "never take a card" / "take the best card offered unless the deck is full".

Fair: the policy sees the offered card ids, the deck and the act (all visible to a human) and static tables; no hidden state.
"""

from __future__ import annotations

from . import register
from .rules import RulesV1, _by, _first, deck_ids
from .rules2 import RulesV2, read_values

LATE_ACTS = (1,)


@register
class RulesV2Late(RulesV2):
    name = "rules_v2_late"
    version = "1"

    def __init__(
        self,
        late_threshold: float | None = None,
        late_values: str | None = None,
        late_values_sha256: str | None = None,
        late_acts: list[int] | tuple[int, ...] = LATE_ACTS,
        **params,
    ):
        acts = sorted({int(a) for a in late_acts})
        if not acts or any(a < 0 or a > 2 for a in acts):
            raise ValueError(f"late_acts must be acts 0, 1 or 2 of the game, got {list(late_acts)!r}")
        late_params: dict = {"late_acts": acts}
        beta = character = None
        if late_values is not None:
            beta, rel, digest, character = read_values(late_values)
            if late_values_sha256 is not None and late_values_sha256 != digest:  # a manifest's effective parameters must rebuild the same policy
                raise ValueError(f"{rel} has sha256 {digest}, but {late_values_sha256} was recorded")
            late_params.update(late_values=rel, late_values_sha256=digest)
        elif late_values_sha256 is not None:
            raise ValueError("late_values_sha256 without late_values")
        threshold = float(params.get("threshold", 0.0))
        late_params["late_threshold"] = threshold if late_threshold is None else float(late_threshold)
        super().__init__(**late_params, **params)
        self.late_acts = tuple(acts)
        self.late_threshold = float(late_params["late_threshold"])
        self.late_beta = beta
        self.late_character = character

    def _card_reward(self, obs, actions) -> int:
        run = obs["run"]
        if int(run.get("act", 0)) not in self.late_acts:
            return super()._card_reward(obs, actions)
        picks = _by(actions, "pick_card")
        if not picks:
            return RulesV1._card_reward(self, obs, actions)
        played = run.get("character")
        for owner in (self.values_character, self.late_character):
            if owner and played and str(played).lower() != owner.lower():
                # another class's values would read every card as unmeasured and skip every reward: never silently
                raise ValueError(f"card values were measured for {owner}, this run plays {played}")
        beta = self.late_beta if self.late_beta is not None else self.beta
        size = len(deck_ids(run))
        best = max(picks, key=lambda a: (beta.get(a["card_id"], 0.0), -a["idx"]))
        if beta.get(best["card_id"], 0.0) > self.late_threshold and size < self.tune["max_deck"]:
            return best["idx"]
        skip = _first(actions, "skip")
        return skip if skip is not None else RulesV1._card_reward(self, obs, actions)
