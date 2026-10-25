import {
  choose,
  hypergeometricAtLeast,
  hypergeometricDistribution,
  hypergeometricMean,
  assertCount,
} from "./combinatorics";
import { Rational } from "./rational";

/**
 * Draw mathematics (DRAW-1): exact hypergeometric probabilities for a uniformly shuffled draw pile. Valid only while
 * the pile is not reshuffled during the draw; `nextHandWithReshuffle` handles the one reshuffle case that matters
 * between turns. Retain, innate, ethereal, exhaust, shuffle-triggers and orbs are NOT modelled.
 */
export interface DrawQuery {
  /** Cards left in the draw pile. */
  readonly pile: number;
  /** Copies of the card (or category) you care about inside that pile. */
  readonly targets: number;
  /** Cards drawn. */
  readonly draws: number;
}

export function drawAtLeast(q: DrawQuery, need = 1): Rational {
  validate(q);
  return hypergeometricAtLeast(q.pile, q.targets, q.draws, need);
}

export function drawDistribution(q: DrawQuery): Rational[] {
  validate(q);
  return hypergeometricDistribution(q.pile, q.targets, q.draws);
}

export function drawMean(q: DrawQuery): Rational {
  validate(q);
  return hypergeometricMean(q.pile, q.targets, q.draws);
}

function validate(q: DrawQuery): void {
  assertCount(q.pile, "pile");
  assertCount(q.targets, "targets");
  assertCount(q.draws, "draws");
  if (q.targets > q.pile) {
    throw new RangeError("targets cannot exceed the cards in the pile");
  }
  if (q.draws > q.pile) {
    throw new RangeError("cannot draw more cards than the pile holds (use nextHandWithReshuffle)");
  }
}

export interface GroupNeed {
  /** Copies of this group in the pile. */
  readonly count: number;
  /** Minimum number you want to draw. */
  readonly need: number;
}

/** P(draw at least `need_i` of every group) from one pile (multivariate hypergeometric; groups are disjoint). */
export function drawJointAtLeast(
  pile: number,
  draws: number,
  groups: readonly GroupNeed[],
): Rational {
  assertCount(pile, "pile");
  assertCount(draws, "draws");
  const total = groups.reduce((a, g) => a + g.count, 0);
  if (total > pile || draws > pile) {
    throw new RangeError("groups and draws cannot exceed the pile");
  }
  const rest = pile - total;
  const denominator = choose(pile, draws);
  let favourable = 0n;
  const walk = (i: number, left: number, ways: bigint): void => {
    if (i === groups.length) {
      if (left <= rest) {
        favourable += ways * choose(rest, left);
      }
      return;
    }
    const g = groups[i];
    if (g === undefined) {
      return;
    }
    for (let x = g.need; x <= Math.min(g.count, left); x += 1) {
      walk(i + 1, left - x, ways * choose(g.count, x));
    }
  };
  walk(0, draws, 1n);
  return Rational.of(favourable, denominator);
}

export interface ReshuffleQuery {
  readonly drawPile: number;
  readonly targetsInDrawPile: number;
  /** Cards that will be shuffled into a new draw pile when the old one runs out (the discard pile at that moment). */
  readonly discardPile: number;
  readonly targetsInDiscard: number;
  readonly draws: number;
}

/**
 * Probability of drawing at least `need` copies when the draw may run past the end of the draw pile: the remaining
 * draw pile is drawn first, then the discard pile is shuffled and the remaining draws come from it.
 */
export function nextHandWithReshuffle(q: ReshuffleQuery, need = 1): Rational {
  assertCount(q.drawPile, "drawPile");
  assertCount(q.discardPile, "discardPile");
  if (q.targetsInDrawPile > q.drawPile || q.targetsInDiscard > q.discardPile) {
    throw new RangeError("targets cannot exceed their pile");
  }
  if (q.draws <= q.drawPile) {
    return hypergeometricAtLeast(q.drawPile, q.targetsInDrawPile, q.draws, need);
  }
  const fromDiscard = q.draws - q.drawPile;
  if (fromDiscard > q.discardPile) {
    throw new RangeError("not enough cards in the draw and discard piles for this many draws");
  }
  // every card of the old draw pile is drawn for certain; the rest come from the reshuffled discard pile
  const guaranteed = q.targetsInDrawPile;
  const stillNeeded = Math.max(0, need - guaranteed);
  return hypergeometricAtLeast(q.discardPile, q.targetsInDiscard, fromDiscard, stillNeeded);
}
