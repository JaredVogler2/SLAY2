import { GROUPS, type DeckProfile, type Group } from "./profile";

/**
 * The deck-quality index (v2). Every number here is a hand-set heuristic weight (see docs/methods): the structure follows
 * widely shared deck-building principles (thin decks of better cards, cover the roles a run needs by act, keep the energy
 * curve payable, and let cards that need partners count only as far as the deck supplies them: `synergy`), but the
 * weights have NOT been fitted to outcomes. The index is unit-less "points"; only differences between options are
 * meaningful.
 */
export interface Weights {
  readonly quality: number;
  readonly coverage: Readonly<Record<Group, number>>;
  readonly curve: number;
  /** index points each card costs once the deck is past `sizeFrom` cards (the price of a slot) */
  readonly size: number;
  /** the deck size past which every added card pays the price of a slot */
  readonly sizeFrom: number;
  readonly synergy: number;
}

/**
 * The price of a slot (ADR-065). Every card in a deck makes each of the others show up less often, so from the card after the
 * SIZE_FROM-th on, each card added costs SIZE_PRICE index points, which it has to earn (through its quality, the roles it covers or the
 * cards it works with) to beat skipping. Version 1 charged 0.6 points from the 31st card on; that almost never beat a card's own gain,
 * and the pilot that played card rewards by the index skipped 0.2 % of them. Both numbers are judgements: the simulated runs say that
 * skipping more wins more games (ADR-061, ADR-062), not how much more, and the registered check of this price (ADR-065) asks only that
 * it does no harm where the simulation can see it.
 */
export const SIZE_FROM = 20;
export const SIZE_PRICE = 1;

/** The numbers of version 1 of the index, which every simulated game of ADR-050 to ADR-062 that played on the index used. */
export const LEGACY_SIZE_FROM = 30;
export const LEGACY_SIZE_PRICE = 0.6;

/** Saturation constants: how many cards of a group make the group "covered" (63 % of full credit). */
export const COVERAGE_SCALE: Readonly<Record<Group, number>> = {
  damage: 7,
  aoe: 1.5,
  block: 6,
  scaling: 2,
  draw: 2,
  energy: 1.5,
  debuff: 2,
};

const COVERAGE_BY_ACT: Readonly<Record<Group, readonly [number, number, number]>> = {
  damage: [7, 5, 5],
  aoe: [2, 6, 6],
  block: [6, 7, 7],
  scaling: [2, 6, 9],
  draw: [3, 4, 4],
  energy: [3, 3, 3],
  debuff: [2.5, 3, 3],
};

const RISK_MULTIPLIERS: Readonly<
  Record<"safe" | "balanced" | "aggressive", Partial<Record<Group, number>>>
> = {
  safe: { block: 1.3, scaling: 0.9, damage: 0.95 },
  balanced: {},
  aggressive: { damage: 1.25, aoe: 1.1, block: 0.8, scaling: 1.1 },
};

export function baseWeights(
  actIndex: 0 | 1 | 2,
  risk: "safe" | "balanced" | "aggressive",
): Weights {
  const coverage = Object.fromEntries(
    GROUPS.map((g) => [g, COVERAGE_BY_ACT[g][actIndex] * (RISK_MULTIPLIERS[risk][g] ?? 1)]),
  ) as Record<Group, number>;
  return { quality: 1, coverage, curve: 6, size: SIZE_PRICE, sizeFrom: SIZE_FROM, synergy: 1 };
}

export interface Terms {
  readonly quality: number;
  readonly coverage: Readonly<Record<Group, number>>;
  readonly curve: number;
  readonly size: number;
  readonly synergy: number;
}

function saturate(n: number, k: number): number {
  return 1 - Math.exp(-n / k);
}

export function scoreTerms(p: DeckProfile, w: Weights): Terms {
  const coverage = Object.fromEntries(
    GROUPS.map((g) => [g, w.coverage[g] * saturate(p.groups[g], COVERAGE_SCALE[g])]),
  ) as Record<Group, number>;
  const curve = -(
    w.curve * Math.max(0, p.averageEnergyCost - 1.3) +
    0.8 * Math.max(0, p.highCostCount - 2)
  );
  const size = -(w.size * Math.max(0, p.size - w.sizeFrom));
  const synergy = w.synergy * p.synergy;
  return { quality: w.quality * p.meanPrior, coverage, curve, size, synergy };
}

export function total(t: Terms): number {
  return (
    t.quality + GROUPS.reduce((acc, g) => acc + t.coverage[g], 0) + t.curve + t.size + t.synergy
  );
}
