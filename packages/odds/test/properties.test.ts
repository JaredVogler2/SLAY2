import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  Rational,
  at,
  cardAppearanceProbability,
  cardRarityPmf,
  choose,
  combatGoldPmf,
  drawAtLeast,
  drawDistribution,
  drawJointAtLeast,
  drawMean,
  enumeratePack,
  forecastPack,
  forecastPotions,
  forecastUnknownRoom,
  inferCounter,
  inferPotionCounter,
  inferUnknownState,
  maxCounter,
  nextHandWithReshuffle,
  offsetFor,
  positionMarginals,
  potionRollProbability,
  priceDistribution,
  summarizePack,
  unknownRoomPmf,
  type PackObservation,
  type PotionObservation,
  type PotionRoom,
  type RarityRules,
  type RewardSource,
  type UnknownObservation,
  type UnknownOutcome,
} from "../src/index";

const rules = (scarcity: boolean): RarityRules => ({ scarcity });
const arbScarcity = fc.boolean();
const arbSource: fc.Arbitrary<RewardSource> = fc.oneof(
  fc.constantFrom<RewardSource>(
    { kind: "encounter", room: "regular" },
    { kind: "encounter", room: "elite" },
    { kind: "encounter", room: "boss" },
    { kind: "shop" },
    { kind: "base", table: "regular" },
    { kind: "base", table: "elite" },
    { kind: "base", table: "shop" },
  ),
);
const arbCounter = fc.integer({ min: 0, max: 130 });
const arbRoom: fc.Arbitrary<PotionRoom> = fc.constantFrom("monster", "elite", "boss");
const arbEncounter: fc.Arbitrary<RewardSource> = fc.constantFrom<RewardSource>(
  { kind: "encounter", room: "regular" },
  { kind: "encounter", room: "elite" },
);

const sumAll = (xs: Iterable<Rational>): Rational =>
  [...xs].reduce((a, b) => a.add(b), Rational.ZERO);

describe("rarity engine properties", () => {
  it("every single-card rarity distribution is a probability distribution", () => {
    fc.assert(
      fc.property(arbSource, arbCounter, arbScarcity, (src, k, sc) => {
        const pmf = cardRarityPmf(src, k, rules(sc));
        for (const r of ["common", "uncommon", "rare"] as const) {
          expect(pmf[r].ge(0) && pmf[r].le(1)).toBe(true);
        }
        expect(pmf.common.add(pmf.uncommon).add(pmf.rare).eq(1)).toBe(true);
      }),
      { numRuns: 400 },
    );
  });

  it("the offset is -5 points at the start, rises 1 point per non-rare card (0.5 at A7) and stops at +40", () => {
    expect(offsetFor(0, rules(false)).eq(Rational.parse("-0.05"))).toBe(true);
    expect(offsetFor(5, rules(false)).eq(0)).toBe(true);
    expect(offsetFor(45, rules(false)).eq(Rational.parse("0.40"))).toBe(true);
    expect(offsetFor(10_000, rules(false)).eq(Rational.parse("0.40"))).toBe(true);
    expect(offsetFor(10, rules(true)).eq(0)).toBe(true);
    expect(offsetFor(90, rules(true)).eq(Rational.parse("0.40"))).toBe(true);
    expect(maxCounter(rules(false))).toBe(45);
    expect(maxCounter(rules(true))).toBe(90);
  });

  it("rare chance never decreases as the counter grows, and A7 never beats A0", () => {
    fc.assert(
      fc.property(arbEncounter, arbCounter, (src, k) => {
        const a0 = cardRarityPmf(src, k, rules(false)).rare;
        const a0next = cardRarityPmf(src, k + 1, rules(false)).rare;
        const a7 = cardRarityPmf(src, k, rules(true)).rare;
        expect(a0next.ge(a0)).toBe(true);
        expect(a7.le(a0)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it("pack outcomes are exhaustive and exclusive; end-counter mass sums to one", () => {
    fc.assert(
      fc.property(
        arbSource,
        arbCounter,
        arbScarcity,
        fc.integer({ min: 0, max: 4 }),
        (src, k, sc, cards) => {
          const outs = enumeratePack(src, k, cards, rules(sc));
          expect(sumAll(outs.map((o) => o.probability)).eq(1)).toBe(true);
          const s = summarizePack(outs, cards);
          expect(sumAll(s.rareCountPmf).eq(1)).toBe(true);
          expect(sumAll(s.endCounter.values()).eq(1)).toBe(true);
          expect(s.atLeastOneRare.ge(0) && s.atLeastOneRare.le(1)).toBe(true);
          const mean = s.rareCountPmf.reduce((acc, p, i) => acc.add(p.mul(i)), Rational.ZERO);
          expect(s.expectedRares.eq(mean)).toBe(true);
        },
      ),
      { numRuns: 120 },
    );
  });

  it("boss packs are three rares and reset the counter; shop and base packs never move it", () => {
    const boss = summarizePack(
      enumeratePack({ kind: "encounter", room: "boss" }, 17, 3, rules(false)),
      3,
    );
    expect(boss.atLeastOneRare.eq(1)).toBe(true);
    expect(boss.rareCountPmf[3]?.eq(1)).toBe(true);
    expect([...boss.endCounter.keys()]).toEqual([0]);
    fc.assert(
      fc.property(arbCounter, arbScarcity, (k, sc) => {
        for (const src of [{ kind: "shop" }, { kind: "base", table: "elite" }] as RewardSource[]) {
          const s = summarizePack(enumeratePack(src, k, 5, rules(sc)), 5);
          expect([...s.endCounter.keys()]).toEqual([Math.min(k, maxCounter(rules(sc)))]);
        }
      }),
      { numRuns: 80 },
    );
  });

  it("P(at least one rare in a pack) never decreases with the starting counter", () => {
    fc.assert(
      fc.property(arbEncounter, arbScarcity, fc.integer({ min: 0, max: 100 }), (src, sc, k) => {
        const f = (kk: number): Rational =>
          summarizePack(enumeratePack(src, kk, 3, rules(sc)), 3).atLeastOneRare;
        expect(f(k + 1).ge(f(k))).toBe(true);
      }),
      { numRuns: 120 },
    );
  });
});

describe("rarity inference properties", () => {
  const arbObs: fc.Arbitrary<PackObservation> = fc.record(
    {
      source: arbEncounter,
      rares: fc.integer({ min: 0, max: 3 }),
    },
    { requiredKeys: ["source"] },
  );

  it("posteriors are probability distributions whenever the history is possible", () => {
    fc.assert(
      fc.property(fc.array(arbObs, { maxLength: 7 }), arbScarcity, (history, sc) => {
        const inf = inferCounter(history, rules(sc));
        if (inf.impossible) {
          expect(inf.posterior.size).toBe(0);
          expect(inf.evidence.isZero()).toBe(true);
          return;
        }
        expect(sumAll(inf.posterior.values()).eq(1)).toBe(true);
        expect(inf.evidence.gt(0) && inf.evidence.le(1)).toBe(true);
        const f = forecastPack(inf.posterior, { kind: "encounter", room: "regular" }, 3, rules(sc));
        expect(sumAll(f.rareCountPmf).eq(1)).toBe(true);
        expect(
          f.atLeastOneRareBand.min.le(f.atLeastOneRare) &&
            f.atLeastOneRare.le(f.atLeastOneRareBand.max),
        ).toBe(true);
        expect(
          f.atLeastOneRareBand.lo.ge(f.atLeastOneRareBand.min) &&
            f.atLeastOneRareBand.hi.le(f.atLeastOneRareBand.max),
        ).toBe(true);
      }),
      { numRuns: 120 },
    );
  });

  it("a run that has shown no rare for a long time makes a rare pack likelier", () => {
    const dry = (n: number): Rational =>
      forecastPack(
        inferCounter(
          Array.from({ length: n }, () => ({
            source: { kind: "encounter", room: "regular" } as const,
            rares: 0,
          })),
          rules(false),
        ).posterior,
        { kind: "encounter", room: "regular" },
        3,
        rules(false),
      ).atLeastOneRare;
    let previous = dry(0);
    for (let n = 1; n <= 15; n += 1) {
      const current = dry(n);
      expect(current.ge(previous)).toBe(true);
      previous = current;
    }
    expect(dry(15).gt(dry(0))).toBe(true);
  });

  it("flags impossible histories instead of inventing a posterior", () => {
    const inf = inferCounter(
      [{ source: { kind: "encounter", room: "regular" }, rares: 1 }],
      rules(false),
    );
    expect(inf.impossible).toBe(true);
    expect(inf.posterior.size).toBe(0);
  });
});

describe("potion engine properties", () => {
  const arbObs: fc.Arbitrary<PotionObservation> = fc.record(
    { room: arbRoom, dropped: fc.boolean(), forced: fc.boolean() },
    { requiredKeys: ["room"] },
  );

  it("roll probability is the stored chance (+12.5 points for elites), clamped to [0, 1]", () => {
    expect(potionRollProbability(4, "monster").eq(Rational.parse("0.4"))).toBe(true);
    expect(potionRollProbability(4, "elite").eq(Rational.parse("0.525"))).toBe(true);
    expect(potionRollProbability(4, "boss").eq(Rational.parse("0.4"))).toBe(true);
    expect(potionRollProbability(-3, "monster").isZero()).toBe(true);
    expect(potionRollProbability(14, "elite").eq(1)).toBe(true);
  });

  it("posteriors and forecasts are distributions", () => {
    fc.assert(
      fc.property(
        fc.array(arbObs, { maxLength: 9 }),
        fc.array(arbRoom, { minLength: 1, maxLength: 5 }),
        (history, upcoming) => {
          const inf = inferPotionCounter(history);
          if (inf.impossible) {
            return;
          }
          expect(sumAll(inf.posterior.values()).eq(1)).toBe(true);
          const f = forecastPotions(inf.posterior, upcoming);
          expect(sumAll(f.dropCountPmf).eq(1)).toBe(true);
          expect(sumAll(f.counterAfter.values()).eq(1)).toBe(true);
          expect(
            f.expectedDrops.eq(f.dropCountPmf.reduce((a, p, i) => a.add(p.mul(i)), Rational.ZERO)),
          ).toBe(true);
          expect(f.band.min.le(f.nextDropProbability) && f.nextDropProbability.le(f.band.max)).toBe(
            true,
          );
        },
      ),
      { numRuns: 120 },
    );
  });

  it("a long run of ordinary fights converges to the documented 50% target (E1 comment: targetOdds = 0.5)", () => {
    const f = forecastPotions(
      inferPotionCounter([]).posterior,
      Array.from({ length: 200 }, () => "monster" as const),
    );
    const rate = f.expectedDrops.toNumber() / 200;
    expect(rate).toBeGreaterThan(0.47);
    expect(rate).toBeLessThan(0.53);
  });

  it("a miss raises the next chance by 10 points and a drop lowers it by 10", () => {
    const miss = inferPotionCounter([{ room: "monster", dropped: false }]);
    expect(
      forecastPotions(miss.posterior, ["monster"]).nextDropProbability.eq(Rational.parse("0.5")),
    ).toBe(true);
    const drop = inferPotionCounter([{ room: "monster", dropped: true }]);
    expect(
      forecastPotions(drop.posterior, ["monster"]).nextDropProbability.eq(Rational.parse("0.3")),
    ).toBe(true);
    // a drop on an elite lowers the stored value by 10 points, not by the elite bonus
    const elite = inferPotionCounter([{ room: "elite", dropped: true }]);
    expect(
      forecastPotions(elite.posterior, ["monster"]).nextDropProbability.eq(Rational.parse("0.3")),
    ).toBe(true);
    // forced drops still decrement in v0.107.1
    const forced = inferPotionCounter([{ room: "monster", forced: true }]);
    expect(
      forecastPotions(forced.posterior, ["monster"]).nextDropProbability.eq(Rational.parse("0.3")),
    ).toBe(true);
  });

  it("never clamps the stored chance, but ordinary play cannot leave [0, 1]: only forced drops go below zero", () => {
    // six misses in a row walk the stored chance 40% -> 100%; from there a drop is certain, so a 7th miss is impossible
    const six = inferPotionCounter(
      Array.from({ length: 6 }, () => ({ room: "monster" as const, dropped: false })),
    );
    expect([...six.posterior.keys()]).toEqual([10]);
    expect(forecastPotions(six.posterior, ["monster"]).nextDropProbability.eq(1)).toBe(true);
    expect(
      inferPotionCounter(
        Array.from({ length: 7 }, () => ({ room: "monster" as const, dropped: false })),
      ).impossible,
    ).toBe(true);
    // four drops reach 0%; a fifth ordinary drop is impossible
    const four = inferPotionCounter(
      Array.from({ length: 4 }, () => ({ room: "monster" as const, dropped: true })),
    );
    expect([...four.posterior.keys()]).toEqual([0]);
    expect(
      inferPotionCounter(
        Array.from({ length: 5 }, () => ({ room: "monster" as const, dropped: true })),
      ).impossible,
    ).toBe(true);
    // forced drops (e.g. White Beast Statue on main v0.107.1) still decrement and can push the stored value below zero
    const forced = inferPotionCounter(
      Array.from({ length: 6 }, () => ({ room: "monster" as const, forced: true })),
    );
    expect([...forced.posterior.keys()]).toEqual([-2]);
    expect(forecastPotions(forced.posterior, ["monster"]).nextDropProbability.isZero()).toBe(true);
  });
});

describe("'?' room properties", () => {
  const arbOutcome = fc.constantFrom<UnknownOutcome>("fight", "treasure", "shop", "event");
  const arbObs: fc.Arbitrary<UnknownObservation> = fc.oneof(
    fc.constant<UnknownObservation>({}),
    arbOutcome.map((outcome) => ({ outcome })),
  );

  it("outcome probabilities form a distribution for any counters", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 1, max: 40 }),
        (fight, treasure, shop) => {
          const p = unknownRoomPmf({ fight, treasure, shop });
          expect(sumAll(Object.values(p)).eq(1)).toBe(true);
          for (const v of Object.values(p)) {
            expect(v.ge(0)).toBe(true);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("starts at 10% fight, 2% treasure, 3% shop, 85% event", () => {
    const p = unknownRoomPmf({ fight: 1, treasure: 1, shop: 1 });
    expect([p.fight, p.treasure, p.shop, p.event].map((x) => x.toPercent(0))).toEqual([
      "10%",
      "2%",
      "3%",
      "85%",
    ]);
  });

  it("posteriors and forecasts are distributions", () => {
    fc.assert(
      fc.property(fc.array(arbObs, { maxLength: 6 }), (history) => {
        const inf = inferUnknownState(history);
        if (inf.impossible) {
          return;
        }
        expect(sumAll(inf.posterior.values()).eq(1)).toBe(true);
        const f = forecastUnknownRoom(inf);
        expect(sumAll(Object.values(f)).eq(1)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("a shop seen resets only the shop counter", () => {
    const inf = inferUnknownState([{ outcome: "shop" }]);
    const f = forecastUnknownRoom(inf);
    const fresh = unknownRoomPmf({ fight: 2, treasure: 2, shop: 1 });
    expect(
      f.fight.eq(fresh.fight) &&
        f.treasure.eq(fresh.treasure) &&
        f.shop.eq(fresh.shop) &&
        f.event.eq(fresh.event),
    ).toBe(true);
  });
});

describe("draw engine properties", () => {
  const arbQuery = fc
    .tuple(
      fc.integer({ min: 0, max: 60 }),
      fc.integer({ min: 0, max: 60 }),
      fc.integer({ min: 0, max: 60 }),
    )
    .filter(([n, k, d]) => k <= n && d <= n)
    .map(([pile, targets, draws]) => ({ pile, targets, draws }));

  it("hypergeometric PMFs sum to one and have the right mean", () => {
    fc.assert(
      fc.property(arbQuery, (q) => {
        const pmf = drawDistribution(q);
        expect(sumAll(pmf).eq(1)).toBe(true);
        expect(pmf.reduce((a, p, i) => a.add(p.mul(i)), Rational.ZERO).eq(drawMean(q))).toBe(true);
        if (q.pile > 0) {
          const closed = Rational.ONE.sub(
            Rational.of(choose(q.pile - q.targets, q.draws), choose(q.pile, q.draws)),
          );
          expect(drawAtLeast(q, 1).eq(closed)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("a single-group joint draw equals the hypergeometric tail", () => {
    fc.assert(
      fc.property(arbQuery, fc.integer({ min: 0, max: 5 }), (q, need) => {
        const joint = drawJointAtLeast(q.pile, q.draws, [{ count: q.targets, need }]);
        expect(joint.eq(drawAtLeast(q, need))).toBe(true);
      }),
      { numRuns: 150 },
    );
  });

  it("a reshuffle query that never reaches the discard pile equals the plain draw", () => {
    fc.assert(
      fc.property(arbQuery, fc.integer({ min: 0, max: 20 }), (q, discard) => {
        const r = nextHandWithReshuffle(
          {
            drawPile: q.pile,
            targetsInDrawPile: q.targets,
            discardPile: discard,
            targetsInDiscard: Math.min(discard, 2),
            draws: q.draws,
          },
          1,
        );
        expect(r.eq(drawAtLeast(q, 1))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("rejects impossible questions", () => {
    expect(() => drawAtLeast({ pile: 5, targets: 6, draws: 1 })).toThrow(RangeError);
    expect(() => drawAtLeast({ pile: 5, targets: 1, draws: 6 })).toThrow(RangeError);
    expect(() => drawAtLeast({ pile: 5, targets: 1, draws: -1 })).toThrow(RangeError);
    expect(() => drawAtLeast({ pile: 5.5, targets: 1, draws: 1 })).toThrow(RangeError);
  });
});

describe("price and gold properties", () => {
  it("price PMFs sum to one and are symmetric around the base price (full price)", () => {
    for (const item of [
      { kind: "card", rarity: "common" },
      { kind: "card", rarity: "uncommon" },
      { kind: "card", rarity: "rare" },
      { kind: "relic", rarity: "rare" },
      { kind: "potion", rarity: "uncommon" },
    ] as const) {
      const d = priceDistribution(item);
      expect(sumAll(d.pmf.values()).eq(1)).toBe(true);
      const base = { common: 50, uncommon: 75, rare: 150 }[
        item.rarity === "rare" && item.kind === "relic" ? "rare" : item.rarity
      ];
      if (item.kind === "card") {
        expect(d.mean.eq(base)).toBe(true);
      }
    }
  });

  it("gold PMFs are uniform integer ranges that sum to one", () => {
    for (const room of ["monster", "elite", "boss"] as const) {
      for (const asc of [0, 3, 10]) {
        const pmf = combatGoldPmf(room, asc);
        expect(sumAll(pmf.values()).eq(1)).toBe(true);
        expect(new Set([...pmf.values()].map(String)).size).toBe(1);
      }
    }
  });

  it("at() is bounds-checked", () => {
    expect(at([1, 2, 3], 1)).toBe(2);
    expect(() => at([1], 3)).toThrow(RangeError);
  });
});

describe("expected rarity counts and card appearance", () => {
  it("expected counts by rarity sum to the pack size and match the rare-count PMF", () => {
    fc.assert(
      fc.property(
        arbSource,
        arbCounter,
        arbScarcity,
        fc.integer({ min: 1, max: 5 }),
        (src, k, sc, cards) => {
          const s = summarizePack(enumeratePack(src, k, cards, rules(sc)), cards);
          const total = s.expectedByRarity.common
            .add(s.expectedByRarity.uncommon)
            .add(s.expectedByRarity.rare);
          expect(total.eq(cards)).toBe(true);
          expect(s.expectedByRarity.rare.eq(s.expectedRares)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("a specific card's chance is the expected slots of its rarity over the pool size", () => {
    const s = summarizePack(
      enumeratePack({ kind: "encounter", room: "regular" }, 45, 3, rules(false)),
      3,
    );
    // At the cap a regular slot is 43% rare, and a rare resets the chance to 0 for the rest of the pack:
    // E[rares] = p + (1 - p) * (p + (1 - p) * p) with p = 43/100.
    const p = Rational.of(43, 100);
    const q = Rational.ONE.sub(p);
    const expected = p.add(q.mul(p.add(q.mul(p))));
    expect(s.expectedByRarity.rare.eq(expected)).toBe(true);
    expect(cardAppearanceProbability(s.expectedByRarity.rare, 25).eq(expected.div(25))).toBe(true);
    expect(() => cardAppearanceProbability(Rational.ONE, 0)).toThrow(RangeError);
    expect(cardAppearanceProbability(Rational.of(5), 2).eq(1)).toBe(true);
  });

  it("matches explicit subset enumeration for a boss pack (3 distinct rares drawn from 25)", () => {
    const s = summarizePack(
      enumeratePack({ kind: "encounter", room: "boss" }, 0, 3, rules(false)),
      3,
    );
    // P(a given rare is among 3 distinct picks from 25) = 3/25
    expect(cardAppearanceProbability(s.expectedByRarity.rare, 25).eq(Rational.of(3, 25))).toBe(
      true,
    );
  });
});

describe("position marginals", () => {
  it("each slot is a distribution; the first slot equals the single-card PMF; rare slots add up to the expected rares", () => {
    fc.assert(
      fc.property(
        arbEncounter,
        arbCounter,
        arbScarcity,
        fc.integer({ min: 1, max: 5 }),
        (src, k, sc, cards) => {
          const r = rules(sc);
          const marg = positionMarginals(
            new Map([[Math.min(k, maxCounter(r)), Rational.ONE]]),
            src,
            cards,
            r,
          );
          expect(marg).toHaveLength(cards);
          for (const slot of marg) {
            expect(slot.common.add(slot.uncommon).add(slot.rare).eq(1)).toBe(true);
          }
          const first = cardRarityPmf(src, k, r);
          expect(marg[0]?.rare.eq(first.rare)).toBe(true);
          expect(marg[0]?.uncommon.eq(first.uncommon)).toBe(true);
          const summary = summarizePack(enumeratePack(src, k, cards, r), cards);
          expect(sumAll(marg.map((m) => m.rare)).eq(summary.expectedRares)).toBe(true);
        },
      ),
      { numRuns: 80 },
    );
  });
});
