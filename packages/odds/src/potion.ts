import { R, Rational } from "./rational";
import { addMass, credibleBand, normalize, type Dist, type WeightedValue } from "./util";

/**
 * Potion-drop engine (POT-1..POT-3). The stored chance `c` starts at 40% and moves by exactly 10 points per eligible
 * fight, so it is always `tenths / 10`; `tenths` is the integer state (can leave [0, 10]: the game never clamps it).
 * Elite fights add +12.5 points to the roll only. Boss fights also roll (RewardsSet), the final boss gives no rewards.
 */

export type PotionRoom = "monster" | "elite" | "boss";

export const POTION_START_TENTHS = 4;
const ELITE_ROLL_BONUS = R(125, 1000);

/** POT-3: rarity of a dropped potion. */
export const POTION_RARITY_PMF = {
  common: R(65, 100),
  uncommon: R(25, 100),
  rare: R(10, 100),
} as const;

/** P(potion reward) for a fight of kind `room` while the stored chance is `tenths / 10`. */
export function potionRollProbability(tenths: number, room: PotionRoom): Rational {
  assertTenths(tenths);
  const bonus = room === "elite" ? ELITE_ROLL_BONUS : Rational.ZERO;
  return R(tenths, 10).add(bonus).clamp(0, 1);
}

function assertTenths(t: number): void {
  if (!Number.isInteger(t)) {
    throw new RangeError("potion counter must be an integer number of tenths");
  }
}

export interface PotionObservation {
  readonly room: PotionRoom;
  /** Did the fight offer a potion? Omit when you did not note it (the posterior then spreads over both). */
  readonly dropped?: boolean;
  /** A relic forced the drop (Hook.ShouldForcePotionReward): the roll is skipped but the counter still falls in v0.107.1. */
  readonly forced?: boolean;
}

export type PotionCounterDist = Dist<number>;

export function potionPointMass(tenths: number = POTION_START_TENTHS): PotionCounterDist {
  return new Map([[tenths, Rational.ONE]]);
}

export interface PotionInference {
  readonly posterior: PotionCounterDist;
  readonly evidence: Rational;
  readonly impossible: boolean;
}

/** Exact forward pass over the stored potion chance. */
export function inferPotionCounter(
  history: readonly PotionObservation[],
  prior: PotionCounterDist = potionPointMass(),
): PotionInference {
  let dist: PotionCounterDist = new Map(prior);
  for (const obs of history) {
    const next: PotionCounterDist = new Map();
    for (const [tenths, mass] of dist) {
      const pDrop = obs.forced === true ? Rational.ONE : potionRollProbability(tenths, obs.room);
      if (obs.dropped !== false) {
        addMass(next, tenths - 1, mass.mul(pDrop));
      }
      if (obs.dropped !== true && obs.forced !== true) {
        addMass(next, tenths + 1, mass.mul(Rational.ONE.sub(pDrop)));
      }
    }
    dist = next;
  }
  const { dist: posterior, evidence } = normalize(dist);
  return { posterior, evidence, impossible: evidence.isZero() };
}

export interface PotionForecast {
  readonly nextDropProbability: Rational;
  readonly band: {
    readonly min: Rational;
    readonly max: Rational;
    readonly lo: Rational;
    readonly hi: Rational;
  };
  /** index = number of drops among the `upcoming` fights */
  readonly dropCountPmf: readonly Rational[];
  readonly expectedDrops: Rational;
  readonly counterAfter: PotionCounterDist;
}

/** Forecast over a sequence of upcoming fights, exact, marginalising over the posterior. */
export function forecastPotions(
  posterior: PotionCounterDist,
  upcoming: readonly PotionRoom[],
  lowerTail: Rational = R(5, 100),
): PotionForecast {
  if (upcoming.length === 0) {
    throw new RangeError("forecastPotions: at least one upcoming fight is required");
  }
  const first = upcoming[0] ?? "monster";
  let nextDrop = Rational.ZERO;
  const perCounter: WeightedValue[] = [];
  for (const [tenths, mass] of posterior) {
    const p = potionRollProbability(tenths, first);
    nextDrop = nextDrop.add(mass.mul(p));
    perCounter.push({ value: p, weight: mass });
  }
  // joint (counter, drops so far) distribution
  let state = new Map<string, { tenths: number; drops: number; mass: Rational }>();
  for (const [tenths, mass] of posterior) {
    state.set(`${String(tenths)}|0`, { tenths, drops: 0, mass });
  }
  for (const room of upcoming) {
    const next = new Map<string, { tenths: number; drops: number; mass: Rational }>();
    const put = (tenths: number, drops: number, mass: Rational): void => {
      if (mass.isZero()) {
        return;
      }
      const key = `${String(tenths)}|${String(drops)}`;
      const cur = next.get(key);
      next.set(key, { tenths, drops, mass: cur ? cur.mass.add(mass) : mass });
    };
    for (const { tenths, drops, mass } of state.values()) {
      const p = potionRollProbability(tenths, room);
      put(tenths - 1, drops + 1, mass.mul(p));
      put(tenths + 1, drops, mass.mul(Rational.ONE.sub(p)));
    }
    state = next;
  }
  const pmf = Array.from({ length: upcoming.length + 1 }, () => Rational.ZERO);
  const counterAfter: PotionCounterDist = new Map();
  let expected = Rational.ZERO;
  for (const { tenths, drops, mass } of state.values()) {
    pmf[drops] = (pmf[drops] ?? Rational.ZERO).add(mass);
    expected = expected.add(mass.mul(drops));
    addMass(counterAfter, tenths, mass);
  }
  const values = perCounter.map((x) => x.value);
  const band = credibleBand(perCounter, lowerTail);
  return {
    nextDropProbability: nextDrop,
    band: {
      min: values.reduce((a, b) => a.min(b)),
      max: values.reduce((a, b) => a.max(b)),
      lo: band.lo,
      hi: band.hi,
    },
    dropCountPmf: pmf,
    expectedDrops: expected,
    counterAfter,
  };
}
