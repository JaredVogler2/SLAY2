import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { CATALOG, getCard, starterDeck } from "@slay2/game-data";
import { Rational } from "@slay2/odds";

import {
  GROUPS,
  handReport,
  profileDeck,
  type DeckEntry,
  type Group,
  type GroupHandOdds,
  type HandReport,
} from "../src/index";

function rowOf(report: HandReport, group: Group): GroupHandOdds {
  const row = report.rows.find((x) => x.group === group);
  if (!row) {
    throw new Error(`no row for ${group}`);
  }
  return row;
}

function entriesOf(ids: readonly { id: string; count: number }[]): DeckEntry[] {
  return ids.map(({ id, count }) => {
    const card = getCard(id);
    if (!card) {
      throw new Error(`unknown card ${id}`);
    }
    return { card, count };
  });
}

/** Independent check: enumerate every k-subset of the deck's individual cards and count those holding a group card. */
function bruteForceAtLeastOne(flags: boolean[], k: number): Rational {
  let hits = 0n;
  let total = 0n;
  const n = flags.length;
  const pick = (start: number, left: number, has: boolean): void => {
    if (left === 0) {
      total += 1n;
      if (has) {
        hits += 1n;
      }
      return;
    }
    for (let i = start; i <= n - left; i += 1) {
      pick(i + 1, left - 1, has || flags[i] === true);
    }
  };
  pick(0, k, false);
  return Rational.of(hits, total);
}

describe("opening-hand report", () => {
  const starter = entriesOf(starterDeck("ironclad"));

  it("matches the textbook values for the Ironclad starter deck", () => {
    const r = handReport(starter);
    const block = rowOf(r, "block");
    const debuff = rowOf(r, "debuff");
    const damage = rowOf(r, "damage");
    expect(r.deckSize).toBe(10);
    expect(block.inDeck).toBe(4);
    // P(no block in 5 of 10 with 4 block cards) = C(6,5)/C(10,5) = 6/252
    expect(block.openingHand.eq(Rational.of(246n, 252n))).toBe(true);
    // Bash is the only Vulnerable source: a 5-card hand holds it with probability exactly 1/2
    expect(debuff.inDeck).toBe(1);
    expect(debuff.openingHand.eq(Rational.of(1n, 2n))).toBe(true);
    // five cards of ten are always seen across two hands
    expect(debuff.firstTwoHands.eq(Rational.of(1n, 1n))).toBe(true);
    // a hand without any damage card is impossible: only 4 of the 10 cards are not damage cards
    expect(damage.openingHand.eq(Rational.of(1n, 1n))).toBe(true);
  });

  it("agrees with exhaustive enumeration of every possible hand", () => {
    const r = handReport(starter);
    const profile = profileDeck(starter);
    for (const row of r.rows) {
      const flags = [
        ...Array.from({ length: row.inDeck }, () => true),
        ...Array.from({ length: profile.size - row.inDeck }, () => false),
      ];
      expect(row.openingHand.eq(bruteForceAtLeastOne(flags, 5)), row.group).toBe(true);
      expect(row.firstTwoHands.eq(bruteForceAtLeastOne(flags, 10)), row.group).toBe(true);
    }
  });

  it("agrees with enumeration on a mixed twelve-card deck and a different hand size", () => {
    const deck = entriesOf([
      { id: "STRIKE_IRONCLAD", count: 4 },
      { id: "DEFEND_IRONCLAD", count: 3 },
      { id: "BASH", count: 1 },
      { id: "POMMEL_STRIKE", count: 2 },
      { id: "SHRUG_IT_OFF", count: 2 },
    ]);
    const r = handReport(deck, 4);
    const profile = profileDeck(deck);
    for (const row of r.rows) {
      const flags = [
        ...Array.from({ length: row.inDeck }, () => true),
        ...Array.from({ length: profile.size - row.inDeck }, () => false),
      ];
      expect(row.openingHand.eq(bruteForceAtLeastOne(flags, 4)), row.group).toBe(true);
      expect(row.firstTwoHands.eq(bruteForceAtLeastOne(flags, 8)), row.group).toBe(true);
    }
  });

  it("sees the whole deck when it is smaller than the draw", () => {
    const tiny = entriesOf([
      { id: "STRIKE_IRONCLAD", count: 2 },
      { id: "DEFEND_IRONCLAD", count: 2 },
    ]);
    const r = handReport(tiny);
    expect(rowOf(r, "block").openingHand.eq(Rational.of(1n, 1n))).toBe(true);
    expect(rowOf(r, "draw").openingHand.eq(Rational.of(0n, 1n))).toBe(true);
  });

  it("rejects impossible hand sizes and states what it does not model", () => {
    expect(() => handReport(starter, 0)).toThrow(RangeError);
    expect(() => handReport(starter, 11)).toThrow(RangeError);
    expect(() => handReport(starter, 2.5)).toThrow(RangeError);
    expect(handReport(starter).assumptions.join(" ")).toMatch(/not modelled/);
  });

  it("is a coherent distribution for any deck (property test)", () => {
    const cards = CATALOG.cards.filter((c) => c.rewardEligible && c.class === "ironclad");
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(fc.integer({ min: 0, max: cards.length - 1 }), fc.integer({ min: 1, max: 3 })),
          { minLength: 1, maxLength: 20 },
        ),
        fc.integer({ min: 1, max: 8 }),
        (picks, hand) => {
          const deck = picks.map(([i, count]) => {
            const card = cards[i];
            if (!card) {
              throw new Error(`card index ${String(i)} out of range`);
            }
            return { card, count };
          });
          const r = handReport(deck, hand);
          for (const row of r.rows) {
            expect(row.openingHand.toNumber()).toBeGreaterThanOrEqual(0);
            expect(row.openingHand.toNumber()).toBeLessThanOrEqual(1);
            expect(row.firstTwoHands.toNumber() + 1e-12).toBeGreaterThanOrEqual(
              row.openingHand.toNumber(),
            );
            expect(row.expectedOpening.toNumber()).toBeLessThanOrEqual(hand + 1e-12);
            if (row.inDeck === 0) {
              expect(row.openingHand.toNumber()).toBe(0);
            }
          }
          expect(r.rows.map((x) => x.group)).toEqual([...GROUPS]);
        },
      ),
      { numRuns: 60 },
    );
  });
});
