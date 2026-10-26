"""advisor_v1 - rules_v3 whose card-reward screen is decided by the website's deck index (ADR-050).

The advisor page ranks the offered cards and skipping by how much each would change a deck index: the mean rating of the cards,
role coverage, the energy curve, deck size, and a synergy term (what unmet needs take from a card's rating, what scalers add,
what engines add). ``slay2_sim.advisor`` is the Python port of that code, tested number for number against the TypeScript. This
policy asks it what to do on every card reward and does what the page would recommend: the best-ranked offered card, or skip when
skipping ranks first. A deck at the size cap (``max_deck``, as in rules_v2) skips.

Everything else (map, shop, rest, events, combat, elite thresholds) is rules_v3, so two advisor_v1 arms that differ only in the
index's parameters differ only in the cards they take. The parameters are ``synergy`` (the advisor's weight for the whole synergy
term; 0 switches it off) and ``needs`` / ``scalers`` / ``engines`` (how much of each hand-set part the index keeps, see
``advisor.Model``), ``risk`` ("safe", "balanced", "aggressive"; the page's default is balanced) and ``margin`` (the index points a
card must add over skipping to be taken; 0 is what the page does, and it almost never recommends skipping).

Fair: the policy sees the deck and the offered card ids (a human sees both), the act, and the public catalog; no hidden state.
It does not use the Act-1 version or boss the page can take as an input, so it is the page without that optional context.
"""

from __future__ import annotations

from .. import advisor
from . import register
from .explore import ExploreMixin
from .rules import RulesV1, _by, _first, deck_ids
from .rules3 import V3_TUNE


class AdvisorCards:
    """The card-reward screen, decided by the deck index; any other screen (relics, potions) is rules_v1's."""

    def __init__(
        self, synergy: float = 1.0, needs: float = 1.0, scalers: float = 1.0, engines: float = 1.0, risk: str = "balanced", margin: float = 0.0, **params
    ):
        super().__init__(synergy=synergy, needs=needs, scalers=scalers, engines=engines, risk=risk, margin=margin, **params)
        if risk not in advisor.RISK_MULTIPLIERS:
            raise ValueError(f"unknown risk {risk!r}; known: {sorted(advisor.RISK_MULTIPLIERS)}")
        if margin < 0:
            raise ValueError("margin is the index points a card must add over skipping: not negative")
        self.synergy = float(synergy)
        self.model = advisor.Model(needs=float(needs), scalers=float(scalers), engines=float(engines))
        self.risk = risk
        self.margin = float(margin)

    def reset(self, rng_seed: int) -> None:
        super().reset(rng_seed)
        self.offers = self.taken = self.skipped = self.unscored = 0

    def _card_reward(self, obs, actions) -> int:
        picks = _by(actions, "pick_card")
        if not picks:
            return super()._card_reward(obs, actions)
        run = obs["run"]
        unknown: list[str] = []
        deck = advisor.deck_from_ids((cid for cid, _ in deck_ids(run)), unknown)
        by_card: dict[str, int] = {}
        for a in picks:
            card = advisor.card_id_of(a["card_id"])
            if card is None:
                self.unscored += 1  # an offer the catalog does not know cannot be scored: it is not taken
            else:
                by_card.setdefault(card, a["idx"])
        act = min(max(int(run["act"]), 0), 2)
        weights = advisor.base_weights(act, self.risk, self.synergy)
        best, gain = advisor.rank_options(deck, list(by_card), act, self.risk, weights, self.model)[0]
        self.offers += 1
        skip = _first(actions, "skip")
        if best == advisor.SKIP or gain < self.margin or sum(deck.values()) >= self.tune["max_deck"]:
            self.skipped += 1
            return skip if skip is not None else super()._card_reward(obs, actions)
        self.taken += 1
        return by_card[best]

    def episode_stats(self) -> dict:
        return {**super().episode_stats(), "advisor": {"offers": self.offers, "taken": self.taken, "skipped": self.skipped, "unscored": self.unscored}}


@register
class AdvisorV1(AdvisorCards, ExploreMixin, RulesV1):
    name = "advisor_v1"
    version = "1"

    def __init__(self, tune: dict | None = None, explore: float = 0.0, **params):
        # the boss-fight log of ExploreMixin is wanted, its random card picks are not
        if explore != 0.0:
            raise ValueError("advisor_v1 does not randomise its card picks")
        super().__init__(tune={**V3_TUNE, **(tune or {})}, explore=0.0, **params)
