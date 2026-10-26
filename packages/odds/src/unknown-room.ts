import { R, Rational } from "./rational";
import type { Dist } from "./util";

/**
 * "?" room engine (UNK-1, UNK-2). One roll r ~ U[0,1] is scanned against cumulative counters in the order
 * fight -> treasure -> shop (elite is disabled at -1); anything left over is an event. After the roll the rolled
 * type resets to its base and every other enabled type gains +base. Counters reset to base at the start of each act.
 *
 * State: the multiplier (k) of each base, i.e. current counter = k * base, k >= 1.
 */

export type UnknownOutcome = "fight" | "treasure" | "shop" | "event";

const BASE = { fight: R(1, 10), treasure: R(1, 50), shop: R(3, 100) } as const;

export interface UnknownState {
  readonly fight: number;
  readonly treasure: number;
  readonly shop: number;
}

export const UNKNOWN_START: UnknownState = { fight: 1, treasure: 1, shop: 1 };

export function stateKey(s: UnknownState): string {
  return `${String(s.fight)},${String(s.treasure)},${String(s.shop)}`;
}

export type UnknownPmf = Readonly<Record<UnknownOutcome, Rational>>;

/** UNK-1: probabilities of the four outcomes for the current counters. */
export function unknownRoomPmf(s: UnknownState): UnknownPmf {
  const fight = BASE.fight.mul(s.fight).clamp(0, 1);
  const upToTreasure = fight.add(BASE.treasure.mul(s.treasure)).clamp(0, 1);
  const upToShop = upToTreasure.add(BASE.shop.mul(s.shop)).clamp(0, 1);
  return {
    fight,
    treasure: upToTreasure.sub(fight),
    shop: upToShop.sub(upToTreasure),
    event: Rational.ONE.sub(upToShop),
  };
}

/** UNK-2. */
export function nextUnknownState(s: UnknownState, outcome: UnknownOutcome): UnknownState {
  return {
    fight: outcome === "fight" ? 1 : s.fight + 1,
    treasure: outcome === "treasure" ? 1 : s.treasure + 1,
    shop: outcome === "shop" ? 1 : s.shop + 1,
  };
}

export interface UnknownObservation {
  /** What the "?" turned into; omit if unknown. */
  readonly outcome?: UnknownOutcome;
}

export interface UnknownInference {
  readonly posterior: Dist<string>;
  readonly states: ReadonlyMap<string, UnknownState>;
  readonly evidence: Rational;
  readonly impossible: boolean;
}

/**
 * An act has fewer than 20 "?" rooms (the map is about 15 rows tall), so a longer history is not a real act. The bound
 * also keeps the all-outcomes-unknown inference cheap, which matters because the API takes the history from strangers.
 */
export const MAX_UNKNOWN_ROOMS_PER_ACT = 20;

/**
 * Every probability here is a whole number of percent (1/10, 1/50 and 3/100 per counter step), so masses are exact
 * integers over 100^n. Order: fight, treasure, shop, event.
 */
export function unknownPercentPmf(s: UnknownState): readonly [bigint, bigint, bigint, bigint] {
  const cap = (x: bigint): bigint => (x > 100n ? 100n : x);
  const fight = cap(10n * BigInt(s.fight));
  const toTreasure = cap(fight + 2n * BigInt(s.treasure));
  const toShop = cap(toTreasure + 3n * BigInt(s.shop));
  return [fight, toTreasure - fight, toShop - toTreasure, 100n - toShop];
}

const OUTCOMES = ["fight", "treasure", "shop", "event"] as const;

/** Posterior over the counters after the recorded "?" rooms of the CURRENT act (counters reset at each act). */
export function inferUnknownState(history: readonly UnknownObservation[]): UnknownInference {
  if (history.length > MAX_UNKNOWN_ROOMS_PER_ACT) {
    throw new RangeError(`an act has at most ${String(MAX_UNKNOWN_ROOMS_PER_ACT)} "?" rooms`);
  }
  const states = new Map<string, UnknownState>([[stateKey(UNKNOWN_START), UNKNOWN_START]]);
  let masses = new Map<string, bigint>([[stateKey(UNKNOWN_START), 1n]]);
  for (const obs of history) {
    const next = new Map<string, bigint>();
    for (const [key, mass] of masses) {
      const s = states.get(key) ?? UNKNOWN_START;
      const pct = unknownPercentPmf(s);
      OUTCOMES.forEach((outcome, i) => {
        const p = pct[i];
        if ((obs.outcome !== undefined && obs.outcome !== outcome) || p === undefined || p === 0n) {
          return;
        }
        const ns = nextUnknownState(s, outcome);
        const nk = stateKey(ns);
        states.set(nk, ns);
        next.set(nk, (next.get(nk) ?? 0n) + mass * p);
      });
    }
    masses = next;
  }
  let total = 0n;
  for (const m of masses.values()) {
    total += m;
  }
  const posterior: Dist<string> = new Map();
  for (const [key, m] of masses) {
    posterior.set(key, Rational.of(m, total));
  }
  const evidence =
    total === 0n ? Rational.ZERO : Rational.of(total, 100n ** BigInt(history.length));
  return { posterior, states, evidence, impossible: total === 0n };
}

/** Marginal outcome distribution of the NEXT "?" given the posterior. */
export function forecastUnknownRoom(inference: UnknownInference): UnknownPmf {
  let fight = Rational.ZERO;
  let treasure = Rational.ZERO;
  let shop = Rational.ZERO;
  let event = Rational.ZERO;
  for (const [key, mass] of inference.posterior) {
    const s = inference.states.get(key) ?? UNKNOWN_START;
    const p = unknownRoomPmf(s);
    fight = fight.add(mass.mul(p.fight));
    treasure = treasure.add(mass.mul(p.treasure));
    shop = shop.add(mass.mul(p.shop));
    event = event.add(mass.mul(p.event));
  }
  return { fight, treasure, shop, event };
}

/** Marginal mix of the n-th "?" of an act, n = 1..rooms, nothing observed (the published table). */
export function marginalTable(rooms: number): UnknownPmf[] {
  const out: UnknownPmf[] = [];
  for (let n = 1; n <= rooms; n += 1) {
    out.push(forecastUnknownRoom(inferUnknownState(Array.from({ length: n - 1 }, () => ({})))));
  }
  return out;
}
