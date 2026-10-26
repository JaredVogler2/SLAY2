import { drawAtLeast, drawMean, type Rational } from "@slay2/odds";

import { GROUPS, profileDeck, type DeckEntry, type Group } from "./profile";

/** What a role group means to a player, in the words the interface shows. */
export const GROUP_LABEL: Readonly<Record<Group, string>> = {
  damage: "Damage",
  aoe: "Damage to all enemies",
  block: "Block",
  scaling: "Scaling / engine",
  draw: "Card draw",
  energy: "Energy",
  debuff: "Vulnerable / Weak / poison",
};

export interface GroupHandOdds {
  readonly group: Group;
  readonly label: string;
  /** Copies of this group in the whole deck. */
  readonly inDeck: number;
  /** P(at least one in the opening hand). */
  readonly openingHand: Rational;
  /** P(at least one in the first two hands combined). */
  readonly firstTwoHands: Rational;
  /** Expected number in the opening hand. */
  readonly expectedOpening: Rational;
}

export interface HandReport {
  readonly deckSize: number;
  readonly handSize: number;
  readonly rows: readonly GroupHandOdds[];
  readonly assumptions: readonly string[];
}

export const HAND_ASSUMPTIONS = [
  "A uniformly shuffled draw pile and a five-card hand (change the hand size for relics that alter it).",
  "The first two hands are the first 2 x hand-size cards of one shuffle; when the deck is smaller than that, every card is seen.",
  "Innate, retain, ethereal, exhaust, draw-on-play and relics such as Bag of Preparation are not modelled.",
  "A card counts for every group its role tags put it in, so group rows overlap and do not sum to the deck size.",
] as const;

/**
 * Exact opening-hand odds for each role group of the deck (hypergeometric). The groups are the same role tags the
 * advisor reads, so what you see here is what the advisor is reasoning about.
 */
export function handReport(entries: readonly DeckEntry[], handSize = 5): HandReport {
  if (!Number.isInteger(handSize) || handSize < 1 || handSize > 10) {
    throw new RangeError("hand size must be an integer from 1 to 10");
  }
  const profile = profileDeck(entries);
  const n = profile.size;
  const opening = Math.min(handSize, n);
  const firstTwo = Math.min(2 * handSize, n);
  const rows: GroupHandOdds[] = GROUPS.map((group) => {
    const g = profile.groups[group];
    return {
      group,
      label: GROUP_LABEL[group],
      inDeck: g,
      openingHand: drawAtLeast({ pile: n, targets: g, draws: opening }, 1),
      firstTwoHands: drawAtLeast({ pile: n, targets: g, draws: firstTwo }, 1),
      expectedOpening: drawMean({ pile: n, targets: g, draws: opening }),
    };
  });
  return { deckSize: n, handSize, rows, assumptions: HAND_ASSUMPTIONS };
}
