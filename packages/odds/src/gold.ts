import { R, Rational } from "./rational";

/** GOLD-1 and ASC-2: combat gold is a uniform integer in [min, max]; Poverty (A3+) truncates 75% of each end. */
export type GoldRoom = "monster" | "elite" | "boss";

const BASE_RANGE: Readonly<Record<GoldRoom, readonly [number, number]>> = {
  monster: [10, 20],
  elite: [35, 45],
  boss: [100, 100],
};

export interface GoldRange {
  readonly min: number;
  readonly max: number;
  readonly mean: Rational;
}

export function combatGoldRange(room: GoldRoom, ascension: number): GoldRange {
  const [lo, hi] = BASE_RANGE[room];
  const poverty = ascension >= 3;
  const scale = (x: number): number => (poverty ? Math.floor((x * 3) / 4) : x);
  const min = scale(lo);
  const max = scale(hi);
  return { min, max, mean: R(min + max, 2) };
}

/** P(gold = g) for a combat of this kind. */
export function combatGoldPmf(room: GoldRoom, ascension: number): Map<number, Rational> {
  const { min, max } = combatGoldRange(room, ascension);
  const out = new Map<number, Rational>();
  for (let g = min; g <= max; g += 1) {
    out.set(g, R(1, max - min + 1));
  }
  return out;
}

/**
 * TRS-1: a treasure room pays a whole number drawn uniformly from 42 to 52. Poverty (A3+) multiplies the value drawn by
 * 0.75 and truncates it, so, unlike combat gold, the ends are not scaled and the result is not uniform (31 to 39).
 */
export function treasureGoldPmf(ascension: number): Map<number, Rational> {
  const out = new Map<number, Rational>();
  for (let rolled = 42; rolled <= 52; rolled += 1) {
    const gold = ascension >= 3 ? Math.floor((rolled * 3) / 4) : rolled;
    out.set(gold, (out.get(gold) ?? Rational.ZERO).add(R(1, 11)));
  }
  return out;
}

export function treasureGoldRange(ascension: number): GoldRange {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let mean = Rational.ZERO;
  for (const [gold, p] of treasureGoldPmf(ascension)) {
    min = Math.min(min, gold);
    max = Math.max(max, gold);
    mean = mean.add(p.mul(gold));
  }
  return { min, max, mean };
}
