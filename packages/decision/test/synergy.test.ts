import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  CATALOG,
  MECHANIC_IDS,
  PLAYABLE_CLASSES,
  getCard,
  rewardPool,
  synergyTags,
  type CardEntry,
} from "@slay2/game-data";

import {
  FUTURE_SUPPORT,
  MAX_DEPENDENCE,
  PART_WEIGHT,
  engineValue,
  enginesOf,
  explainAddition,
  fitOf,
  needsOf,
  profileDeck,
  realizedOf,
  saturation,
  supplyOf,
  synergyOf,
  type DeckEntry,
} from "../src";

function card(id: string): CardEntry {
  const c = getCard(id);
  if (!c) throw new Error(`no card ${id}`);
  return c;
}

function deck(...rows: [string, number][]): DeckEntry[] {
  return rows.map(([id, count]) => ({ card: card(id), count }));
}

const mechanic = fc.constantFrom(...MECHANIC_IDS);
const classPool = fc.constantFrom(...PLAYABLE_CLASSES).chain((cls) =>
  fc.record({
    cls: fc.constant(cls),
    cards: fc.array(fc.constantFrom(...rewardPool(cls)), { minLength: 0, maxLength: 18 }),
    extra: fc.constantFrom(...rewardPool(cls)),
    act: fc.constantFrom(0 as const, 1 as const, 2 as const),
  }),
);

function entriesOf(cards: readonly CardEntry[]): DeckEntry[] {
  const counts = new Map<string, DeckEntry>();
  for (const c of cards) {
    const hit = counts.get(c.id);
    counts.set(c.id, { card: c, count: (hit?.count ?? 0) + 1 });
  }
  return [...counts.values()];
}

describe("synergy: the parts", () => {
  it("saturation rises with supply, starts at zero, and stays below one", () => {
    fc.assert(
      fc.property(
        mechanic,
        fc.double({ min: 0, max: 60, noNaN: true }),
        fc.double({ min: 0, max: 60, noNaN: true }),
        (m, a, b) => {
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          expect(saturation(m, lo)).toBeLessThanOrEqual(saturation(m, hi));
          expect(saturation(m, 0)).toBe(0);
          expect(saturation(m, hi)).toBeLessThan(1 + 1e-12);
        },
      ),
    );
    // a negative supply (a card that takes a mechanic away) counts as none, never as a debt
    expect(saturation("focus", -3)).toBe(0);
  });

  it("a card is fully covered when it needs nothing, and never gains from less supply", () => {
    fc.assert(
      fc.property(
        classPool,
        mechanic,
        fc.integer({ min: 1, max: 6 }),
        ({ cards, extra }, m, more) => {
          const base = supplyOf(entriesOf(cards));
          const richer = { ...base, [m]: base[m] + more };
          expect(fitOf(extra, richer)).toBeGreaterThanOrEqual(fitOf(extra, base) - 1e-12);
          if (needsOf(extra).total === 0) expect(fitOf(extra, base)).toBe(1);
        },
      ),
    );
  });

  it("holds back at most 70 % of a rating, never adds to it by needs alone, and credits only scalers", () => {
    fc.assert(
      fc.property(classPool, ({ cards, extra, act }) => {
        const r = realizedOf(extra, supplyOf(entriesOf(cards)), act);
        expect(r.heldBack).toBeGreaterThanOrEqual(0);
        expect(r.heldBack).toBeLessThanOrEqual(MAX_DEPENDENCE + 1e-12);
        expect(r.value).toBeCloseTo(r.prior * (1 - r.heldBack) * (1 + r.scaler), 9);
        expect(r.scaler).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("expects less of the support to be missing in the early acts than in the late ones", () => {
    expect(FUTURE_SUPPORT[0]).toBeGreaterThan(FUTURE_SUPPORT[1]);
    expect(FUTURE_SUPPORT[1]).toBeGreaterThan(FUTURE_SUPPORT[2]);
    const lonely = deck(["FEEL_NO_PAIN", 1]);
    const held = (act: 0 | 1 | 2) =>
      realizedOf(card("FEEL_NO_PAIN"), supplyOf(lonely), act).heldBack;
    expect(held(0)).toBeLessThan(held(1));
    expect(held(1)).toBeLessThan(held(2));
  });

  // the formula is tested as first judged (`weighted` false): the page's index keeps `PART_WEIGHT.engines` of it, which is 0 (ADR-050
  // addendum D), so the weighted value would be 0 everywhere and the test would say nothing about the formula (addendum C, rule 2)
  it("an engine needs both sides: sources alone and payoffs alone are worth nothing", () => {
    expect(engineValue("exhaust", 6, 0, false)).toBe(0);
    expect(engineValue("exhaust", 0, 6, false)).toBe(0);
    expect(engineValue("exhaust", 4, 3, false)).toBeGreaterThan(0);
    expect(engineValue("exhaust", 4, 6, false)).toBeGreaterThan(
      engineValue("exhaust", 4, 3, false),
    );
    expect(engineValue("exhaust", 8, 6, false)).toBeGreaterThan(
      engineValue("exhaust", 4, 6, false),
    );
  });

  it("the index counts what it keeps of the first-judged engine, no more: PART_WEIGHT.engines of it", () => {
    for (const [supply, payoff] of [
      [4, 3],
      [4, 6],
      [8, 6],
    ] as const) {
      expect(engineValue("exhaust", supply, payoff)).toBeCloseTo(
        PART_WEIGHT.engines * engineValue("exhaust", supply, payoff, false),
        12,
      );
    }
  });
});

describe("synergy: adding a card", () => {
  it("is explained exactly by its own needs, what it supplies to the others and the engines it changes", () => {
    fc.assert(
      fc.property(classPool, ({ cards, extra, act }) => {
        const entries = entriesOf(cards);
        const withIt = entriesOf([...cards, extra]);
        const ex = explainAddition(entries, extra, act, withIt);
        const whole = synergyOf(withIt, act) - synergyOf(entries, act);
        expect(ex.own.delta + ex.support.delta + ex.engines.delta).toBeCloseTo(whole, 8);
        // the deck profile carries the same number the terms use
        expect(profileDeck(withIt, act).synergy - profileDeck(entries, act).synergy).toBeCloseTo(
          whole,
          8,
        );
      }),
      { numRuns: 300 },
    );
  });

  it("adds up even when an engine changes by less than the amount that is listed (a case that failed one run in twenty)", () => {
    const cards = [
      "DECISIONS_DECISIONS",
      "BLACK_HOLE",
      "ASTRAL_PULSE",
      "BIG_BANG",
      "STARDUST",
      "BLACK_HOLE",
    ].map(card);
    const extra = card("ASTRAL_PULSE");
    const entries = entriesOf(cards);
    const withIt = entriesOf([...cards, extra]);
    const ex = explainAddition(entries, extra, 0, withIt);
    const whole = synergyOf(withIt, 0) - synergyOf(entries, 0);
    expect(ex.own.delta + ex.support.delta + ex.engines.delta).toBeCloseTo(whole, 10);
  });

  it("supplying a mechanic never lowers a card that needs it", () => {
    fc.assert(
      fc.property(classPool, ({ cards, act }) => {
        const entries = entriesOf(cards);
        for (const m of MECHANIC_IDS) {
          const sources = CATALOG.cards.filter(
            (c) => (synergyTags(c).gives[m] ?? 0) > 0 && (synergyTags(c).gives[m] ?? 0) > 0,
          );
          const src = sources[0];
          if (!src) continue;
          const after = entriesOf([...cards, src]);
          const before = supplyOf(entries);
          const richer = supplyOf(after);
          for (const { card: d } of entries) {
            if ((synergyTags(d).wants[m] ?? 0) > 0) {
              expect(realizedOf(d, richer, act).value).toBeGreaterThanOrEqual(
                realizedOf(d, before, act).value - 1e-9,
              );
            }
          }
        }
      }),
      { numRuns: 25 },
    );
  });

  it("is the same whatever order the deck is listed in", () => {
    fc.assert(
      fc.property(classPool, ({ cards, act }) => {
        const entries = entriesOf(cards);
        const reversed = [...entries].reverse();
        expect(synergyOf(reversed, act)).toBeCloseTo(synergyOf(entries, act), 10);
        for (const m of MECHANIC_IDS) {
          expect(enginesOf(reversed)[m]).toBeCloseTo(enginesOf(entries)[m], 10);
        }
      }),
    );
  });

  it("values a plain card in a plain deck at nothing", () => {
    const entries = deck(
      ["STRIKE_SILENT", 5],
      ["DEFEND_SILENT", 5],
      ["NEUTRALIZE", 1],
      ["SURVIVOR", 1],
    );
    const ex = explainAddition(
      entries,
      card("SLICE"),
      0,
      deck(
        ["STRIKE_SILENT", 5],
        ["DEFEND_SILENT", 5],
        ["NEUTRALIZE", 1],
        ["SURVIVOR", 1],
        ["SLICE", 1],
      ),
    );
    expect(ex.own.delta + ex.support.delta + ex.engines.delta).toBeCloseTo(0, 6);
  });

  it("splits a repeated card's copies correctly (a second copy is added once)", () => {
    const one = deck(["INFLAME", 1], ["TWIN_STRIKE", 1], ["STRIKE_IRONCLAD", 5]);
    const two = deck(["INFLAME", 2], ["TWIN_STRIKE", 1], ["STRIKE_IRONCLAD", 5]);
    const ex = explainAddition(one, card("INFLAME"), 0, two);
    expect(ex.own.delta + ex.support.delta + ex.engines.delta).toBeCloseTo(
      synergyOf(two, 0) - synergyOf(one, 0),
      9,
    );
  });
});
