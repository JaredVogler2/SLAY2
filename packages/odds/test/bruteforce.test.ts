import { describe, expect, it } from "vitest";

import {
  Rational,
  at,
  cardRarityPmf,
  drawAtLeast,
  drawDistribution,
  drawJointAtLeast,
  forecastPotions,
  forecastUnknownRoom,
  inferCounter,
  inferPotionCounter,
  inferUnknownState,
  nextHandWithReshuffle,
  potionRollProbability,
  unknownRoomPmf,
  type PackObservation,
  type PotionObservation,
  type Rarity,
  type RarityRules,
  type RewardSource,
  type UnknownObservation,
  type UnknownOutcome,
} from "../src/index";

/**
 * Brute force: enumerate EVERY world explicitly (subsets, permutations, outcome paths) and count, then require the
 * closed-form / dynamic-programming engines to agree exactly. These tests share no code with the engines.
 */

function* subsets(n: number, k: number, start = 0, chosen: number[] = []): Generator<number[]> {
  if (chosen.length === k) {
    yield chosen;
    return;
  }
  for (let i = start; i < n; i += 1) {
    yield* subsets(n, k, i + 1, [...chosen, i]);
  }
}

function* permutations<T>(items: readonly T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield [...items];
    return;
  }
  for (let i = 0; i < items.length; i += 1) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) {
      yield [items[i] as T, ...p];
    }
  }
}

describe("hypergeometric vs explicit subset enumeration", () => {
  it("matches for every (pile <= 12, targets, draws)", () => {
    for (let pile = 0; pile <= 12; pile += 1) {
      for (let targets = 0; targets <= pile; targets += 1) {
        for (let draws = 0; draws <= pile; draws += 1) {
          const counts = Array.from({ length: Math.min(targets, draws) + 1 }, () => 0);
          let total = 0;
          for (const s of subsets(pile, draws)) {
            const hit = s.filter((i) => i < targets).length;
            counts[hit] = (counts[hit] ?? 0) + 1;
            total += 1;
          }
          const pmf = drawDistribution({ pile, targets, draws });
          pmf.forEach((p, x) => {
            expect(
              p.eq(Rational.of(counts[x] ?? 0, total)),
              `pile=${String(pile)} targets=${String(targets)} draws=${String(draws)} x=${String(x)}`,
            ).toBe(true);
          });
        }
      }
    }
  });

  it("joint draws match explicit enumeration over two and three groups", () => {
    const cases: { pile: number; draws: number; groups: { count: number; need: number }[] }[] = [
      {
        pile: 10,
        draws: 4,
        groups: [
          { count: 3, need: 1 },
          { count: 2, need: 1 },
        ],
      },
      {
        pile: 11,
        draws: 5,
        groups: [
          { count: 4, need: 2 },
          { count: 3, need: 1 },
        ],
      },
      {
        pile: 12,
        draws: 5,
        groups: [
          { count: 3, need: 1 },
          { count: 3, need: 1 },
          { count: 3, need: 1 },
        ],
      },
      {
        pile: 9,
        draws: 3,
        groups: [
          { count: 2, need: 0 },
          { count: 4, need: 2 },
        ],
      },
    ];
    for (const c of cases) {
      let good = 0;
      let total = 0;
      const bounds = c.groups.reduce<number[]>(
        (acc, g) => [...acc, (acc[acc.length - 1] ?? 0) + g.count],
        [0],
      );
      for (const s of subsets(c.pile, c.draws)) {
        total += 1;
        const ok = c.groups.every(
          (g, gi) =>
            s.filter((i) => i >= (bounds[gi] ?? 0) && i < (bounds[gi + 1] ?? 0)).length >= g.need,
        );
        good += ok ? 1 : 0;
      }
      expect(drawJointAtLeast(c.pile, c.draws, c.groups).eq(Rational.of(good, total))).toBe(true);
    }
  });
});

describe("reshuffle draws vs explicit permutation enumeration", () => {
  it("draws the rest of the draw pile first, then a uniformly shuffled discard pile", () => {
    const cases = [
      { drawPile: 2, targetsInDrawPile: 1, discardPile: 5, targetsInDiscard: 2, draws: 5, need: 1 },
      { drawPile: 2, targetsInDrawPile: 0, discardPile: 5, targetsInDiscard: 2, draws: 5, need: 1 },
      { drawPile: 1, targetsInDrawPile: 1, discardPile: 5, targetsInDiscard: 3, draws: 4, need: 2 },
      { drawPile: 0, targetsInDrawPile: 0, discardPile: 6, targetsInDiscard: 1, draws: 5, need: 1 },
      { drawPile: 3, targetsInDrawPile: 2, discardPile: 4, targetsInDiscard: 4, draws: 5, need: 3 },
    ];
    for (const c of cases) {
      const discard = Array.from({ length: c.discardPile }, (_, i) => i < c.targetsInDiscard);
      let good = 0;
      let total = 0;
      for (const perm of permutations(discard)) {
        total += 1;
        const fromDiscard = perm.slice(0, c.draws - c.drawPile).filter(Boolean).length;
        good += c.targetsInDrawPile + fromDiscard >= c.need ? 1 : 0;
      }
      expect(nextHandWithReshuffle(c, c.need).eq(Rational.of(good, total)), JSON.stringify(c)).toBe(
        true,
      );
    }
  });

  it("agrees with the plain tail when no reshuffle is needed", () => {
    const r = nextHandWithReshuffle(
      { drawPile: 10, targetsInDrawPile: 3, discardPile: 0, targetsInDiscard: 0, draws: 5 },
      1,
    );
    expect(r.eq(drawAtLeast({ pile: 10, targets: 3, draws: 5 }, 1))).toBe(true);
  });
});

describe("potion posterior vs explicit outcome-path enumeration", () => {
  it("matches for every observation pattern of length <= 6", () => {
    const rooms = ["monster", "elite", "boss"] as const;
    const options = [undefined, true, false] as const;
    const patterns: PotionObservation[][] = [];
    const build = (prefix: PotionObservation[], depth: number): void => {
      patterns.push(prefix);
      if (depth === 0) {
        return;
      }
      for (const room of rooms.slice(0, 2)) {
        for (const dropped of options) {
          build([...prefix, dropped === undefined ? { room } : { room, dropped }], depth - 1);
        }
      }
    };
    build([], 4);
    expect(patterns.length).toBeGreaterThan(300);
    for (const history of patterns) {
      // explicit paths: every true outcome sequence consistent with the observation
      let evidence = Rational.ZERO;
      const after = new Map<number, Rational>();
      const walk = (i: number, tenths: number, p: Rational): void => {
        if (i === history.length) {
          evidence = evidence.add(p);
          after.set(tenths, (after.get(tenths) ?? Rational.ZERO).add(p));
          return;
        }
        const obs = at(history, i);
        const pDrop = potionRollProbability(tenths, obs.room);
        for (const dropped of [true, false]) {
          if (obs.dropped !== undefined && obs.dropped !== dropped) {
            continue;
          }
          const step = dropped ? pDrop : Rational.ONE.sub(pDrop);
          if (!step.isZero()) {
            walk(i + 1, tenths + (dropped ? -1 : 1), p.mul(step));
          }
        }
      };
      walk(0, 4, Rational.ONE);
      const inf = inferPotionCounter(history);
      expect(inf.evidence.eq(evidence), JSON.stringify(history)).toBe(true);
      if (!evidence.isZero()) {
        for (const [t, mass] of after) {
          expect(inf.posterior.get(t)?.eq(mass.div(evidence)), JSON.stringify(history)).toBe(true);
        }
        // forecast over two more fights equals explicit enumeration of the 4 futures
        const f = forecastPotions(inf.posterior, ["elite", "monster"]);
        let expected = Rational.ZERO;
        for (const [t, mass] of inf.posterior) {
          const p1 = potionRollProbability(t, "elite");
          const pDrop2 = p1
            .mul(potionRollProbability(t - 1, "monster"))
            .add(Rational.ONE.sub(p1).mul(potionRollProbability(t + 1, "monster")));
          expected = expected.add(mass.mul(p1.add(pDrop2)));
        }
        expect(f.expectedDrops.eq(expected)).toBe(true);
      }
    }
  });
});

describe("'?' room posterior vs explicit outcome-path enumeration", () => {
  it("matches for every observation pattern of length <= 5", () => {
    const outcomes: UnknownOutcome[] = ["fight", "treasure", "shop", "event"];
    const patterns: UnknownObservation[][] = [];
    const build = (prefix: UnknownObservation[], depth: number): void => {
      patterns.push(prefix);
      if (depth === 0) {
        return;
      }
      build([...prefix, {}], depth - 1);
      for (const outcome of outcomes) {
        build([...prefix, { outcome }], depth - 1);
      }
    };
    build([], 4);
    for (const history of patterns) {
      let evidence = Rational.ZERO;
      let next = {
        fight: Rational.ZERO,
        treasure: Rational.ZERO,
        shop: Rational.ZERO,
        event: Rational.ZERO,
      };
      const walk = (i: number, f: number, t: number, s: number, p: Rational): void => {
        if (i === history.length) {
          evidence = evidence.add(p);
          const pmf = unknownRoomPmf({ fight: f, treasure: t, shop: s });
          next = {
            fight: next.fight.add(p.mul(pmf.fight)),
            treasure: next.treasure.add(p.mul(pmf.treasure)),
            shop: next.shop.add(p.mul(pmf.shop)),
            event: next.event.add(p.mul(pmf.event)),
          };
          return;
        }
        const obs = at(history, i);
        const pmf = unknownRoomPmf({ fight: f, treasure: t, shop: s });
        for (const o of outcomes) {
          if ((obs.outcome !== undefined && obs.outcome !== o) || pmf[o].isZero()) {
            continue;
          }
          walk(
            i + 1,
            o === "fight" ? 1 : f + 1,
            o === "treasure" ? 1 : t + 1,
            o === "shop" ? 1 : s + 1,
            p.mul(pmf[o]),
          );
        }
      };
      walk(0, 1, 1, 1, Rational.ONE);
      const inf = inferUnknownState(history);
      expect(inf.evidence.eq(evidence), JSON.stringify(history)).toBe(true);
      if (!evidence.isZero()) {
        const got = forecastUnknownRoom(inf);
        for (const o of outcomes) {
          expect(got[o].eq(next[o].div(evidence)), `${JSON.stringify(history)} ${o}`).toBe(true);
        }
      }
    }
  });
});

describe("card-counter posterior vs explicit card-by-card path enumeration", () => {
  const regular: RewardSource = { kind: "encounter", room: "regular" };
  const elite: RewardSource = { kind: "encounter", room: "elite" };
  const shop: RewardSource = { kind: "shop" };
  const rarities: Rarity[] = ["rare", "uncommon", "common"];

  function brute(
    history: readonly PackObservation[],
    rules: RarityRules,
  ): { evidence: Rational; posterior: Map<number, Rational> } {
    const out = new Map<number, Rational>();
    let evidence = Rational.ZERO;
    const walkPack = (packIndex: number, counter: number, p: Rational): void => {
      if (packIndex === history.length) {
        evidence = evidence.add(p);
        out.set(counter, (out.get(counter) ?? Rational.ZERO).add(p));
        return;
      }
      const obs = at(history, packIndex);
      const cards = obs.cards ?? 3;
      const walkCard = (i: number, c: number, q: Rational, seq: Rarity[]): void => {
        if (i === cards) {
          const rares = seq.filter((r) => r === "rare").length;
          const uncommons = seq.filter((r) => r === "uncommon").length;
          if (
            (obs.rares === undefined || obs.rares === rares) &&
            (obs.uncommons === undefined || obs.uncommons === uncommons)
          ) {
            walkPack(packIndex + 1, c, q);
          }
          return;
        }
        const pmf = cardRarityPmf(obs.source, c, rules);
        for (const r of rarities) {
          if (pmf[r].isZero()) {
            continue;
          }
          const advance = obs.source.kind === "encounter";
          const nc = !advance ? c : r === "rare" ? 0 : Math.min(c + 1, rules.scarcity ? 90 : 45);
          walkCard(i + 1, nc, q.mul(pmf[r]), [...seq, r]);
        }
      };
      walkCard(0, counter, p, []);
    };
    walkPack(0, 0, Rational.ONE);
    return { evidence, posterior: out };
  }

  it("matches for assorted histories at A0 and A7", () => {
    const histories: PackObservation[][] = [
      [],
      [{ source: regular }],
      [
        { source: regular, rares: 0 },
        { source: regular, rares: 0 },
      ],
      [
        { source: regular, rares: 0 },
        { source: elite, rares: 1 },
      ],
      [{ source: elite }, { source: regular, rares: 0 }, { source: shop, cards: 2, rares: 0 }],
      [
        { source: regular, rares: 0, uncommons: 1 },
        { source: regular, rares: 0, uncommons: 2 },
        { source: elite },
      ],
      [
        { source: regular, cards: 4 },
        { source: regular, cards: 1, rares: 0 },
        { source: elite, rares: 0 },
      ],
    ];
    for (const sc of [false, true]) {
      for (const h of histories) {
        const rules = { scarcity: sc };
        const want = brute(h, rules);
        const got = inferCounter(h, rules);
        expect(got.evidence.eq(want.evidence), JSON.stringify(h)).toBe(true);
        if (!want.evidence.isZero()) {
          expect(got.posterior.size).toBe(want.posterior.size);
          for (const [k, mass] of want.posterior) {
            expect(
              got.posterior.get(k)?.eq(mass.div(want.evidence)),
              `${JSON.stringify(h)} counter ${String(k)}`,
            ).toBe(true);
          }
        }
      }
    }
  });
});
