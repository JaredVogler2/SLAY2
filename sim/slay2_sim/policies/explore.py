"""rules_explore - rules_v1 with randomised card rewards, for *measuring* what cards are worth (not for playing well).

Why: how much a card helps depends on the deck it joins and on who plays it, so a hand-written rating (``static_rating``)
is a guess. If card-reward picks are randomised, which cards end up in the deck at the Act-1 boss is decided by chance
rather than by the policy's taste, and the simulator can answer "did the run beat the boss?" for thousands of different
decks. With probability ``explore`` the policy picks uniformly among the offered cards **and skip**; otherwise it is
exactly rules_v1. Everything else (map, shop, rest, events, combat) is unchanged.

The deck at the first boss fight is recorded from the *fair observation* (a human sees their own deck), through
``episode_stats`` into the episode record's ``extra``. See docs/DECISIONS.md (ADR-031).
"""

from __future__ import annotations

from . import register
from .rules import RulesV1, _by, _first
from .rules2 import RulesV2
from .rules3 import RulesV3


class ExploreMixin:
    """Randomised card rewards and boss-fight logging on top of whichever rules policy follows it in the MRO."""

    def __init__(self, explore: float = 0.6, replicate: int = 0, **params):
        super().__init__(explore=explore, replicate=replicate, **params)
        self.explore = float(explore)
        self.replicate = int(replicate)

    def reset(self, rng_seed: int) -> None:
        # a replicate re-plays the same game seeds with different random picks (the game's own randomness is the seed's)
        super().reset(rng_seed ^ ((self.replicate * 0x9E3779B1) & 0xFFFFFFFF))
        self.entering: str | None = None  # kind of the map node the last move walked into
        self.boss_fights: list[dict] = []
        self._logged_acts: set[int] = set()
        self.random_picks = 0

    # ---- exploration: only the card reward screen differs from rules_v1
    def _card_reward(self, obs, actions) -> int:
        picks = _by(actions, "pick_card")
        if picks and self.rng.random() < self.explore:
            options = [a["idx"] for a in picks]
            skip = _first(actions, "skip")
            if skip is not None:
                options.append(skip)
            self.random_picks += 1
            return options[self.rng.randrange(len(options))]
        return super()._card_reward(obs, actions)

    # ---- measurement: remember where a move leads, log the deck when the boss fight starts
    def act(self, obs, actions, fm=None):
        idx = super().act(obs, actions, fm)
        phase = obs["phase"]
        if phase == "MAP_CHOICE" and obs["map"] is not None:
            chosen = obs["actions"][idx] if 0 <= idx < len(obs["actions"]) else None
            if chosen is not None and chosen.get("action") == "move":
                kinds = {(c, r): t for c, r, t in obs["map"]["nodes"]}
                self.entering = kinds.get(tuple(chosen["coord"]))
        elif phase == "COMBAT" and self.entering == "BOSS" and obs["run"]["act"] not in self._logged_acts:
            self._logged_acts.add(obs["run"]["act"])
            self.boss_fights.append(self._boss_record(obs))
        return idx

    @staticmethod
    def _boss_record(obs: dict) -> dict:
        run = obs["run"]
        deck: dict[str, int] = {}
        for cid, up, n in run["deck"]:
            key = f"{cid}+" if up else cid
            deck[key] = deck.get(key, 0) + int(n)
        return {
            "act": run["act"], "floor": run["total_floor"], "hp": run["hp"], "max_hp": run["max_hp"], "gold": run["gold"],
            "potions": len(run["potions"]), "relics": sorted(run["relics"]), "deck": dict(sorted(deck.items())),
            "boss": sorted(e["id"] for e in obs["combat"]["enemies"]),
        }

    def episode_stats(self) -> dict:
        return {"explore": self.explore, "replicate": self.replicate, "random_picks": self.random_picks, "boss_fights": self.boss_fights}


@register
class RulesExplore(ExploreMixin, RulesV1):
    name = "rules_explore"
    version = "1"


@register
class RulesExploreV2(ExploreMixin, RulesV2):
    """Round two of the measurement: the non-random card picks follow the measured values (rules_v2), so the values are
    fitted on decks assembled the way the improved policy assembles them, not the way rules_v1 does."""

    name = "rules_explore_v2"
    version = "1"


@register
class RulesExploreV3(ExploreMixin, RulesV3):
    """Round two of the card-value measurement, for a stronger pilot: the exploration of ADR-031 on top of rules_v3, whose
    non-random card picks follow the round-one values like rules_explore_v2's (ADR-046)."""

    name = "rules_explore_v3"
    version = "1"
