import { R, Rational } from "./rational";
import { addMass, at, credibleBand, normalize, type Dist, type WeightedValue } from "./util";

/**
 * Card-reward rarity engine (rules CARD-1..CARD-6, CARD-8 in docs/game/MECHANICS-COVERAGE.md; STS2 main v0.107.1).
 *
 * State: `counter` = number of non-rare cards rolled since the last rare (or since the start of the run). The hidden
 * rarity offset is a pure function of it: offset = min(-5% + growth * counter, +40%), growth = 1 point (A7: 0.5).
 */

export type Rarity = "common" | "uncommon" | "rare";
export type EncounterRoom = "regular" | "elite" | "boss";

export type RewardSource =
  /** Fight/elite/boss reward pack: reads the offset and advances it (CARD-4, CARD-5). */
  | { readonly kind: "encounter"; readonly room: EncounterRoom }
  /** Merchant card: reads the offset, never advances it (CARD-6). */
  | { readonly kind: "shop" }
  /** Events and relic packs (e.g. Orrery): fixed base odds, not cumulative, never advance (CARD-6). */
  | { readonly kind: "base"; readonly table: "regular" | "elite" | "shop" };

export interface RarityRules {
  /** Ascension 7 (Scarcity): lower rare base odds and half the pity growth. */
  readonly scarcity: boolean;
}

export function rarityRulesForAscension(ascension: number): RarityRules {
  return { scarcity: ascension >= 7 };
}

const START_OFFSET = R(-5, 100);
const CAP_OFFSET = R(40, 100);

interface BaseOdds {
  readonly rare: Rational;
  readonly uncommon: Rational;
}

/** CARD-2, CARD-3. `uncommon` is the *listed* uncommon threshold, not the uncommon probability. */
export function baseOdds(table: "regular" | "elite" | "shop", rules: RarityRules): BaseOdds {
  switch (table) {
    case "regular":
      return { rare: rules.scarcity ? R(149, 10000) : R(3, 100), uncommon: R(37, 100) };
    case "elite":
      return { rare: rules.scarcity ? R(5, 100) : R(10, 100), uncommon: R(40, 100) };
    case "shop":
      return { rare: rules.scarcity ? R(45, 1000) : R(9, 100), uncommon: R(37, 100) };
  }
}

export function growthPerNonRare(rules: RarityRules): Rational {
  return rules.scarcity ? R(1, 200) : R(1, 100);
}

/** Largest counter that still changes the offset (45 non-rare cards, or 90 at A7). */
export function maxCounter(rules: RarityRules): number {
  return Number(CAP_OFFSET.sub(START_OFFSET).div(growthPerNonRare(rules)).ceil());
}

/** Counters beyond the cap are equivalent to the cap, so callers may pass any non-negative integer. */
export function clampCounter(counter: number, rules: RarityRules): number {
  if (!Number.isInteger(counter) || counter < 0) {
    throw new RangeError(`counter must be a non-negative integer, got ${String(counter)}`);
  }
  return Math.min(counter, maxCounter(rules));
}

/** The hidden offset after `counter` non-rare cards (CARD-1, CARD-4). */
export function offsetFor(counter: number, rules: RarityRules): Rational {
  const c = clampCounter(counter, rules);
  return START_OFFSET.add(growthPerNonRare(rules).mul(c)).min(CAP_OFFSET);
}

export type RarityPmf = Readonly<Record<Rarity, Rational>>;

const CERTAIN_RARE: RarityPmf = {
  common: Rational.ZERO,
  uncommon: Rational.ZERO,
  rare: Rational.ONE,
};

/** Distribution of the rarity of ONE card rolled from `source` while the counter is `counter`. */
export function cardRarityPmf(
  source: RewardSource,
  counter: number,
  rules: RarityRules,
): RarityPmf {
  switch (source.kind) {
    case "encounter":
      if (source.room === "boss") {
        return CERTAIN_RARE; // CARD-5: the roll ignores the offset
      }
      return shiftedBoundaries(baseOdds(source.room, rules), offsetFor(counter, rules));
    case "shop":
      return shiftedBoundaries(baseOdds("shop", rules), offsetFor(counter, rules));
    case "base": {
      // RollWithBaseOdds: rare if r < baseRare; uncommon if r < baseUncommon (NOT cumulative).
      const b = baseOdds(source.table, rules);
      return {
        rare: b.rare,
        uncommon: b.uncommon.sub(b.rare),
        common: Rational.ONE.sub(b.uncommon),
      };
    }
  }
}

/**
 * CARD-1: with offset o, rare if r < baseRare + o (unclamped); uncommon if r < baseUncommon + (baseRare + o);
 * otherwise common. So the uncommon/common boundary moves with the offset (0 / 35 / 65 % at the -5 start, regular).
 */
function shiftedBoundaries(b: BaseOdds, offset: Rational): RarityPmf {
  const rareThreshold = b.rare.add(offset);
  const uncommonThreshold = b.uncommon.add(rareThreshold);
  const rare = rareThreshold.clamp(0, 1);
  const upToUncommon = uncommonThreshold.clamp(0, 1);
  return { rare, uncommon: upToUncommon.sub(rare), common: Rational.ONE.sub(upToUncommon) };
}

/** Counter after rolling one card (CARD-4/5). Only encounter packs move it. */
export function nextCounter(
  source: RewardSource,
  counter: number,
  rolled: Rarity,
  rules: RarityRules,
): number {
  if (source.kind !== "encounter") {
    return clampCounter(counter, rules);
  }
  return rolled === "rare" ? 0 : Math.min(clampCounter(counter, rules) + 1, maxCounter(rules));
}

export interface PackOutcome {
  readonly rarities: readonly Rarity[];
  readonly endCounter: number;
  readonly probability: Rational;
}

const RARITIES: readonly Rarity[] = ["rare", "uncommon", "common"];

/** Every possible rarity sequence of a pack of `cards` cards rolled one at a time, with exact probabilities. */
export function enumeratePack(
  source: RewardSource,
  startCounter: number,
  cards: number,
  rules: RarityRules,
): PackOutcome[] {
  if (!Number.isInteger(cards) || cards < 0 || cards > 8) {
    throw new RangeError("a reward pack holds 0-8 cards");
  }
  const out: PackOutcome[] = [];
  const walk = (prefix: Rarity[], counter: number, p: Rational): void => {
    if (prefix.length === cards) {
      out.push({ rarities: prefix, endCounter: counter, probability: p });
      return;
    }
    const pmf = cardRarityPmf(source, counter, rules);
    for (const r of RARITIES) {
      const pr = pmf[r];
      if (pr.isZero()) {
        continue;
      }
      walk([...prefix, r], nextCounter(source, counter, r, rules), p.mul(pr));
    }
  };
  walk([], clampCounter(startCounter, rules), Rational.ONE);
  return out;
}

export interface PackSummary {
  readonly atLeastOneRare: Rational;
  readonly expectedRares: Rational;
  /** Expected number of cards of each rarity in the pack (sums to the pack size). */
  readonly expectedByRarity: Readonly<Record<Rarity, Rational>>;
  /** index = number of rares in the pack */
  readonly rareCountPmf: readonly Rational[];
  readonly endCounter: Dist<number>;
}

export function summarizePack(outcomes: readonly PackOutcome[], cards: number): PackSummary {
  const rareCountPmf = Array.from({ length: cards + 1 }, () => Rational.ZERO);
  const endCounter: Dist<number> = new Map();
  let expected = Rational.ZERO;
  const byRarity: Record<Rarity, Rational> = {
    common: Rational.ZERO,
    uncommon: Rational.ZERO,
    rare: Rational.ZERO,
  };
  for (const o of outcomes) {
    const rares = o.rarities.filter((r) => r === "rare").length;
    rareCountPmf[rares] = at(rareCountPmf, rares).add(o.probability);
    expected = expected.add(o.probability.mul(rares));
    addMass(endCounter, o.endCounter, o.probability);
    for (const r of o.rarities) {
      byRarity[r] = byRarity[r].add(o.probability);
    }
  }
  return {
    atLeastOneRare: Rational.ONE.sub(at(rareCountPmf, 0)),
    expectedRares: expected,
    expectedByRarity: byRarity,
    rareCountPmf,
    endCounter,
  };
}

/** Distribution of the counter, e.g. the posterior over "non-rare cards since the last rare". Sums to 1. */
export type CounterDist = Dist<number>;

export function pointMass(counter: number, rules: RarityRules): CounterDist {
  return new Map([[clampCounter(counter, rules), Rational.ONE]]);
}

/** What the player recorded about one pack. Counts are order-free; omit a field when it is unknown. */
export interface PackObservation {
  readonly source: RewardSource;
  /** Cards in the pack (default 3). */
  readonly cards?: number;
  readonly rares?: number;
  readonly uncommons?: number;
}

export interface CounterInference {
  readonly posterior: CounterDist;
  /** Probability of the recorded history under the model; 0 means the history is impossible. */
  readonly evidence: Rational;
  readonly impossible: boolean;
}

function matches(o: PackOutcome, obs: PackObservation): boolean {
  if (obs.rares !== undefined && o.rarities.filter((r) => r === "rare").length !== obs.rares) {
    return false;
  }
  if (
    obs.uncommons !== undefined &&
    o.rarities.filter((r) => r === "uncommon").length !== obs.uncommons
  ) {
    return false;
  }
  return true;
}

/**
 * Exact posterior over the pity counter after a recorded history (a hidden-Markov forward pass). The run starts at
 * counter 0 (offset -5%) by rule, so the posterior is a deterministic function of what was observed and what was not.
 */
export function inferCounter(
  history: readonly PackObservation[],
  rules: RarityRules,
  prior: CounterDist = pointMass(0, rules),
): CounterInference {
  let dist: CounterDist = new Map(prior);
  for (const obs of history) {
    const cards = obs.cards ?? 3;
    const next: CounterDist = new Map();
    for (const [counter, mass] of dist) {
      for (const o of enumeratePack(obs.source, counter, cards, rules)) {
        if (matches(o, obs)) {
          addMass(next, o.endCounter, mass.mul(o.probability));
        }
      }
    }
    dist = next;
  }
  const { dist: posterior, evidence } = normalize(dist);
  return { posterior, evidence, impossible: evidence.isZero() };
}

export interface PackForecast {
  readonly atLeastOneRare: Rational;
  readonly expectedRares: Rational;
  readonly expectedByRarity: Readonly<Record<Rarity, Rational>>;
  readonly rareCountPmf: readonly Rational[];
  /** Spread of P(at least one rare) across the counter posterior. */
  readonly atLeastOneRareBand: {
    readonly min: Rational;
    readonly max: Rational;
    readonly lo: Rational;
    readonly hi: Rational;
  };
  readonly firstCard: RarityPmf;
}

/** Forecast of the next pack when the counter is only known as a distribution. */
export function forecastPack(
  posterior: CounterDist,
  source: RewardSource,
  cards: number,
  rules: RarityRules,
  lowerTail: Rational = R(5, 100),
): PackForecast {
  if (posterior.size === 0) {
    throw new RangeError("forecastPack: empty posterior");
  }
  let atLeast = Rational.ZERO;
  let expected = Rational.ZERO;
  const byRarity: Record<Rarity, Rational> = {
    common: Rational.ZERO,
    uncommon: Rational.ZERO,
    rare: Rational.ZERO,
  };
  const pmf = Array.from({ length: cards + 1 }, () => Rational.ZERO);
  const perCounter: WeightedValue[] = [];
  let first: Record<Rarity, Rational> = {
    common: Rational.ZERO,
    uncommon: Rational.ZERO,
    rare: Rational.ZERO,
  };
  for (const [counter, mass] of posterior) {
    const s = summarizePack(enumeratePack(source, counter, cards, rules), cards);
    atLeast = atLeast.add(mass.mul(s.atLeastOneRare));
    expected = expected.add(mass.mul(s.expectedRares));
    for (const r of RARITIES) {
      byRarity[r] = byRarity[r].add(mass.mul(s.expectedByRarity[r]));
    }
    s.rareCountPmf.forEach((p, i) => {
      pmf[i] = at(pmf, i).add(mass.mul(p));
    });
    perCounter.push({ value: s.atLeastOneRare, weight: mass });
    const c1 = cardRarityPmf(source, counter, rules);
    first = {
      common: first.common.add(mass.mul(c1.common)),
      uncommon: first.uncommon.add(mass.mul(c1.uncommon)),
      rare: first.rare.add(mass.mul(c1.rare)),
    };
  }
  const values = perCounter.map((x) => x.value);
  const band = credibleBand(perCounter, lowerTail);
  return {
    atLeastOneRare: atLeast,
    expectedRares: expected,
    expectedByRarity: byRarity,
    rareCountPmf: pmf,
    atLeastOneRareBand: {
      min: values.reduce((a, b) => a.min(b)),
      max: values.reduce((a, b) => a.max(b)),
      lo: band.lo,
      hi: band.hi,
    },
    firstCard: first,
  };
}

/** The published "pity offset" table: rare chance for the next card after `counter` non-rare cards (CARD-1). */
export function rareChanceAtCounter(
  room: "regular" | "elite",
  counter: number,
  rules: RarityRules,
): Rational {
  return cardRarityPmf({ kind: "encounter", room }, counter, rules).rare;
}

/**
 * Probability that one specific card appears in a pack. Each pack slot first rolls a rarity, then picks uniformly among
 * the eligible cards of that rarity not already in the pack, so the cards of one rarity in a pack form a uniform random
 * subset of that pool: P(card in pack) = E[number of slots with the card's rarity] / pool size (CARD-7).
 * Assumes the pool has at least as many cards as slots of that rarity (always true for 20/35/25 pools and 3 slots).
 */
export function cardAppearanceProbability(
  expectedSlotsOfItsRarity: Rational,
  poolSize: number,
): Rational {
  if (!Number.isInteger(poolSize) || poolSize < 1) {
    throw new RangeError("poolSize must be a positive integer");
  }
  return expectedSlotsOfItsRarity.div(poolSize).min(1);
}
