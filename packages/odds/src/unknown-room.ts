import { R, Rational } from "./rational";
import { addMass, normalize, type Dist } from "./util";

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

/** Posterior over the counters after the recorded "?" rooms of the CURRENT act (counters reset at each act). */
export function inferUnknownState(history: readonly UnknownObservation[]): UnknownInference {
  const states = new Map<string, UnknownState>([[stateKey(UNKNOWN_START), UNKNOWN_START]]);
  let dist: Dist<string> = new Map([[stateKey(UNKNOWN_START), Rational.ONE]]);
  for (const obs of history) {
    const next: Dist<string> = new Map();
    for (const [key, mass] of dist) {
      const s = states.get(key) ?? UNKNOWN_START;
      const pmf = unknownRoomPmf(s);
      for (const outcome of ["fight", "treasure", "shop", "event"] as const) {
        if (obs.outcome !== undefined && obs.outcome !== outcome) {
          continue;
        }
        const p = pmf[outcome];
        if (p.isZero()) {
          continue;
        }
        const ns = nextUnknownState(s, outcome);
        const nk = stateKey(ns);
        states.set(nk, ns);
        addMass(next, nk, mass.mul(p));
      }
    }
    dist = next;
  }
  const { dist: posterior, evidence } = normalize(dist);
  return { posterior, states, evidence, impossible: evidence.isZero() };
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
