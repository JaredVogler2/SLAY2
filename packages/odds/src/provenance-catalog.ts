import { COMMON_NOT_MODELLED, FLOAT_NOTE, type Provenance } from "./provenance";

/**
 * One place that says what each calculator assumes and what it does not model. The web UI shows these strings and the
 * HTTP API returns them, so the two can never disagree. Rule ids refer to docs/game/MECHANICS-COVERAGE.md (a test
 * checks that every id exists there).
 */
export type CalculatorId = "rarity" | "potion" | "unknown_room" | "draw" | "shop" | "route";

const BUILD = "sts2-main-0.107.1" as const;

export function provenanceFor(
  id: CalculatorId,
  opts: { ascension?: number; ascensionConfirmed?: boolean } = {},
): Provenance {
  switch (id) {
    case "rarity": {
      const asc = opts.ascension ?? 0;
      return {
        build: BUILD,
        ruleIds: [
          "CARD-1",
          "CARD-2",
          "CARD-3",
          "CARD-4",
          "CARD-5",
          "CARD-6",
          "CARD-7",
          "CARD-10",
          "UPG-1",
        ],
        evidence: ["E1", "E3", "E4", "E6"],
        assumptions: [
          "Each card is rolled one at a time; a rare resets the hidden counter to −5 points and every other card adds +1 point (A7: +0.5), capped at +40.",
          "A run starts at −5 points, so history that begins at the first reward is fully determined by what you saw.",
          "Boss packs are three rares and also reset the counter; shop cards read the counter without moving it; events and relic packs use fixed base odds.",
          opts.ascensionConfirmed === false
            ? "Ascension not confirmed: A0 base rates are assumed."
            : `Ascension ${String(asc)} (${asc >= 7 ? "Scarcity rates" : "base rates"}).`,
          FLOAT_NOTE,
        ],
        notModelled: [
          ...COMMON_NOT_MODELLED,
          "A profile's very first run has scripted early packs; leave 'first run' unknown unless you are certain.",
        ],
      };
    }
    case "potion":
      return {
        build: BUILD,
        ruleIds: ["POT-1", "POT-2", "POT-3", "POT-5"],
        evidence: ["E1", "E3", "E4", "E6"],
        assumptions: [
          "The stored chance starts at 40%. After each normal fight, elite or boss it falls by 10 points if a potion dropped and rises by 10 if not.",
          "Elites add 12.5 points to that roll only; the stored value moves by exactly 10 either way.",
          "The stored chance is never clamped: it reaches 100% after six misses in a row (the next drop is then certain) and only forced drops can push it below 0%.",
          "A forced drop (for example White Beast Statue) still lowers the stored chance on this build (v0.107.1); the beta changed that.",
          FLOAT_NOTE,
        ],
        notModelled: [
          ...COMMON_NOT_MODELLED,
          "Fights inside events and rooms with suppressed rewards do not roll; log only fights that could have dropped a potion.",
        ],
      };
    case "unknown_room":
      return {
        build: BUILD,
        ruleIds: ["UNK-1", "UNK-2", "UNK-3", "UNK-4"],
        evidence: ["E1", "E4", "E6"],
        assumptions: [
          "One roll per “?” is compared with running chances for fight (10% at the start), treasure (2%) and shop (3%), in that order; what is left is an event.",
          "The room that came up goes back to its starting chance and the other two grow by their starting chance. Elites cannot appear from a “?” on this build.",
          "The counters reset at the start of every act, so log only the “?” rooms of the current act.",
          FLOAT_NOTE,
        ],
        notModelled: [
          ...COMMON_NOT_MODELLED,
          "A profile's very first run scripts its first “?” rooms (event, event, fight); leave that unknown unless you are sure.",
          "Room types a caller excludes and relics that change “?” outcomes.",
        ],
      };
    case "draw":
      return {
        build: BUILD,
        ruleIds: ["DRAW-1"],
        evidence: ["E6"],
        assumptions: [
          "The draw pile is uniformly shuffled and unknown to you, so every set of drawn cards is equally likely (hypergeometric).",
          "When the draw pile runs out the whole discard pile is shuffled into a new draw pile and the remaining draws come from it.",
          "Copies are counted among the cards still in that pile; cards in your hand, exhausted or retained are not in it.",
        ],
        notModelled: [
          ...COMMON_NOT_MODELLED,
          "Innate, retain, ethereal, exhaust-on-draw, shuffle-triggers, cards that look at or choose from the top of the pile, and orbs.",
          "Cards you will play during the turn that draw more cards (ask again with the new pile).",
        ],
      };
    case "route":
      return {
        build: BUILD,
        ruleIds: [
          "UNK-1",
          "UNK-2",
          "CARD-1",
          "CARD-2",
          "CARD-3",
          "CARD-4",
          "POT-1",
          "POT-5",
          "GOLD-1",
          "ASC-2",
          "TRS-1",
          "REST-1",
        ],
        evidence: ["E1", "E3", "E4", "E6"],
        assumptions: [
          "You type the rooms of the route in the order you would walk them; a “?” is resolved one at a time with the running chances of the “?” room rule, and the chances move after each one whatever it turns into.",
          "Every fight (a monster, an elite, or a “?” that turns into a fight) pays one pack of three cards rolled against the hidden rare-card counter and one potion roll against the hidden potion chance. Elites use the elite rates.",
          "The rare-card counter and the potion chance start from the values you give (or a fresh run) and are carried through the route exactly; “at least one” means in the whole route.",
          "Gold counts fights and treasure rooms only (42–52 per chest; Poverty, A3+, takes 75% of each value, rounded down). Shop spending, event gold and relics that add gold are not included.",
          "A rest site heals 30% of maximum HP, rounded down; the route does not simulate your hit points, so it says how many rests there are, not whether you survive the fights.",
          FLOAT_NOTE,
        ],
        notModelled: [
          ...COMMON_NOT_MODELLED,
          "Your hit points, deck and relics: the route says what the rooms are and what they pay, never how likely you are to win the fights.",
          "A profile's very first run scripts its first “?” rooms (event, event, fight); leave the history empty unless you know it is not your first run.",
          "Boss rooms, the merchant's stock, the contents of events, and the card or relic you would take.",
        ],
      };
    case "shop":
      return {
        build: BUILD,
        ruleIds: ["SHOP-2", "SHOP-3", "SHOP-4", "GOLD-1", "ASC-2", "ASC-4"],
        evidence: ["E1", "E3", "E4", "E6"],
        assumptions: [
          "Card and potion prices are the base price times a uniform ±5% (relics ±15%), rounded to the nearest gold; one class card in each shop is on sale at half price (integer division).",
          "Colorless cards use a 1.15× base (uncommon 86, rare 173). Published ranges round the interval ends half-up; the end point itself has probability zero, so the highest attainable price can be one below the published maximum.",
          "Card removal costs 75 + 25n gold (A6 and above: 100 + 50n) where n is the number of removals already bought.",
          "Combat gold is a uniform whole number in the range; Poverty (A3+) cuts each end to 75% rounded down.",
        ],
        notModelled: [
          ...COMMON_NOT_MODELLED,
          "Relics that change merchant prices (ModifyMerchantPrice), shop-specific events, and the stock itself (which cards appear).",
        ],
      };
  }
}
