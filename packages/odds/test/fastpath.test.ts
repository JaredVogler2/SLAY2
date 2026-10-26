import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  Rational,
  UNKNOWN_START,
  enumeratePack,
  forecastPack,
  inferCounter,
  inferUnknownState,
  nextUnknownState,
  stateKey,
  unknownRoomPmf,
  MAX_UNKNOWN_ROOMS_PER_ACT,
  type UnknownObservation,
  type UnknownState,
  pointMass,
  positionMarginals,
  rarityRulesForAscension,
  summarizePack,
  type CounterDist,
  type PackObservation,
  type RarityRules,
  type RewardSource,
} from "../src/index";
import { addMass, normalize } from "../src/util";

/**
 * The shipped inference and forecast run on integers over a common denominator (so a long, vague history cannot be
 * used to burn CPU). These tests keep the original gcd-based rational implementations as an in-test oracle and require
 * bit-identical answers.
 */
function referenceInfer(history: readonly PackObservation[], rules: RarityRules) {
  let dist: CounterDist = pointMass(0, rules);
  for (const obs of history) {
    const cards = obs.cards ?? 3;
    const next: CounterDist = new Map();
    for (const [counter, mass] of dist) {
      for (const o of enumeratePack(obs.source, counter, cards, rules)) {
        const rares = o.rarities.filter((r) => r === "rare").length;
        const uncommons = o.rarities.filter((r) => r === "uncommon").length;
        if (
          (obs.rares !== undefined && rares !== obs.rares) ||
          (obs.uncommons !== undefined && uncommons !== obs.uncommons)
        ) {
          continue;
        }
        addMass(next, o.endCounter, mass.mul(o.probability));
      }
    }
    dist = next;
  }
  return normalize(dist);
}

function referenceForecast(
  posterior: CounterDist,
  source: RewardSource,
  cards: number,
  rules: RarityRules,
) {
  let atLeast = Rational.ZERO;
  let expected = Rational.ZERO;
  const slots = Array.from({ length: cards }, () => ({
    common: Rational.ZERO,
    uncommon: Rational.ZERO,
    rare: Rational.ZERO,
  }));
  const byRarity = { common: Rational.ZERO, uncommon: Rational.ZERO, rare: Rational.ZERO };
  for (const [counter, mass] of posterior) {
    const outcomes = enumeratePack(source, counter, cards, rules);
    const s = summarizePack(outcomes, cards);
    atLeast = atLeast.add(mass.mul(s.atLeastOneRare));
    expected = expected.add(mass.mul(s.expectedRares));
    for (const r of ["common", "uncommon", "rare"] as const) {
      byRarity[r] = byRarity[r].add(mass.mul(s.expectedByRarity[r]));
    }
    for (const o of outcomes) {
      o.rarities.forEach((r, i) => {
        const slot = slots[i];
        if (slot) {
          slot[r] = slot[r].add(mass.mul(o.probability));
        }
      });
    }
  }
  return { atLeast, expected, byRarity, slots };
}

const source = fc.oneof(
  fc.constantFrom<RewardSource>(
    { kind: "encounter", room: "regular" },
    { kind: "encounter", room: "elite" },
    { kind: "encounter", room: "boss" },
    { kind: "shop" },
    { kind: "base", table: "regular" },
  ),
);

const observation = fc.record(
  {
    source,
    cards: fc.integer({ min: 1, max: 5 }),
    rares: fc.integer({ min: 0, max: 3 }),
    uncommons: fc.integer({ min: 0, max: 3 }),
  },
  { requiredKeys: ["source"] },
);

describe("integer fast paths agree with the rational reference", () => {
  it("inferCounter: same posterior and same evidence for any history, at both rule sets", () => {
    fc.assert(
      fc.property(fc.array(observation, { maxLength: 7 }), fc.boolean(), (history, scarcity) => {
        const rules = { scarcity };
        const fast = inferCounter(history, rules);
        const ref = referenceInfer(history, rules);
        expect(fast.evidence.eq(ref.evidence)).toBe(true);
        expect(fast.impossible).toBe(ref.evidence.isZero());
        expect([...fast.posterior.keys()].sort((a, b) => a - b)).toEqual(
          [...ref.dist.keys()].sort((a, b) => a - b),
        );
        for (const [counter, p] of ref.dist) {
          expect(fast.posterior.get(counter)?.eq(p), `counter ${String(counter)}`).toBe(true);
        }
      }),
      { numRuns: 150 },
    );
  });

  it("forecastPack and positionMarginals: same sums for any posterior and any pack", () => {
    fc.assert(
      fc.property(
        fc.array(observation, { maxLength: 5 }),
        fc.boolean(),
        source,
        fc.integer({ min: 1, max: 5 }),
        (history, scarcity, next, cards) => {
          const rules = { scarcity };
          const inf = inferCounter(history, rules);
          fc.pre(!inf.impossible);
          const ref = referenceForecast(inf.posterior, next, cards, rules);
          const fast = forecastPack(inf.posterior, next, cards, rules);
          expect(fast.atLeastOneRare.eq(ref.atLeast)).toBe(true);
          expect(fast.expectedRares.eq(ref.expected)).toBe(true);
          for (const r of ["common", "uncommon", "rare"] as const) {
            expect(fast.expectedByRarity[r].eq(ref.byRarity[r]), r).toBe(true);
          }
          const slots = positionMarginals(inf.posterior, next, cards, rules);
          slots.forEach((slot, i) => {
            for (const r of ["common", "uncommon", "rare"] as const) {
              expect(slot[r].eq(ref.slots[i]?.[r] ?? Rational.ZERO), `slot ${String(i)} ${r}`).toBe(
                true,
              );
            }
          });
          expect(fast.rareCountPmf.reduce((a, b) => a.add(b), Rational.ZERO).eq(1)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

function referenceUnknown(history: readonly UnknownObservation[]) {
  const states = new Map<string, UnknownState>([[stateKey(UNKNOWN_START), UNKNOWN_START]]);
  let dist: CounterLike = new Map([[stateKey(UNKNOWN_START), Rational.ONE]]);
  for (const obs of history) {
    const next: CounterLike = new Map();
    for (const [key, mass] of dist) {
      const st = states.get(key) ?? UNKNOWN_START;
      const pmf = unknownRoomPmf(st);
      for (const outcome of ["fight", "treasure", "shop", "event"] as const) {
        if ((obs.outcome !== undefined && obs.outcome !== outcome) || pmf[outcome].isZero()) {
          continue;
        }
        const ns = nextUnknownState(st, outcome);
        states.set(stateKey(ns), ns);
        addMass(next, stateKey(ns), mass.mul(pmf[outcome]));
      }
    }
    dist = next;
  }
  return normalize(dist);
}
type CounterLike = Map<string, Rational>;

describe("the '?' room inference agrees with its rational reference", () => {
  it("any history of up to a full act, with known and unknown outcomes", () => {
    const obs = fc
      .record(
        { outcome: fc.constantFrom("fight", "treasure", "shop", "event", undefined) },
        { requiredKeys: [] },
      )
      .map((o) => (o.outcome === undefined ? {} : { outcome: o.outcome }));
    fc.assert(
      fc.property(fc.array(obs, { maxLength: 12 }), (history) => {
        const fast = inferUnknownState(history);
        const ref = referenceUnknown(history);
        expect(fast.evidence.eq(ref.evidence)).toBe(true);
        expect(fast.impossible).toBe(ref.evidence.isZero());
        expect([...fast.posterior.keys()].sort()).toEqual([...ref.dist.keys()].sort());
        for (const [key, p] of ref.dist) {
          expect(fast.posterior.get(key)?.eq(p), key).toBe(true);
        }
      }),
      { numRuns: 150 },
    );
  });

  it("refuses a history longer than any act instead of computing for minutes", () => {
    expect(() =>
      inferUnknownState(Array.from({ length: MAX_UNKNOWN_ROOMS_PER_ACT + 1 }, () => ({}))),
    ).toThrow(RangeError);
    const started = performance.now();
    inferUnknownState(Array.from({ length: MAX_UNKNOWN_ROOMS_PER_ACT }, () => ({})));
    expect(performance.now() - started).toBeLessThan(3000);
  });
});

describe("a long vague history cannot be used to burn CPU", () => {
  it("100 packs of unknown content at Ascension 7 (3 minutes before the rewrite) answers in well under 5 s", () => {
    const rules = rarityRulesForAscension(7);
    const history: PackObservation[] = Array.from({ length: 100 }, (_, i) => ({
      source: { kind: "encounter", room: i % 5 === 4 ? "elite" : "regular" },
    }));
    const started = performance.now();
    const inf = inferCounter(history, rules);
    forecastPack(inf.posterior, { kind: "encounter", room: "regular" }, 3, rules);
    positionMarginals(inf.posterior, { kind: "encounter", room: "regular" }, 3, rules);
    const ms = performance.now() - started;
    expect(inf.impossible).toBe(false);
    expect(ms).toBeLessThan(5000);
  });
});
