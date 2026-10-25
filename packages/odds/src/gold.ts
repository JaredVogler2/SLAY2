import type { Rational } from "./rational";
import { R } from "./rational";

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
