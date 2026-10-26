import { combatGoldRange, treasureGoldRange } from "./gold";
import { type PotionCounterDist, POTION_START_TENTHS, potionRollProbability } from "./potion";
import {
  type CounterDist,
  enumeratePack,
  pointMass,
  type RarityRules,
  rarityRulesForAscension,
} from "./rarity";
import { Rational } from "./rational";
import {
  inferUnknownState,
  MAX_UNKNOWN_ROOMS_PER_ACT,
  nextUnknownState,
  UNKNOWN_START,
  unknownPercentPmf,
  type UnknownObservation,
  type UnknownOutcome,
  type UnknownState,
} from "./unknown-room";

/**
 * Route engine (rules UNK-1, UNK-2, CARD-1..5, POT-1, POT-5, GOLD-1, ASC-2, TRS-1; docs/game/MECHANICS-COVERAGE.md).
 *
 * A route is the list of rooms a player is considering walking through, in order. Everything the rooms do to the hidden
 * counters is a Markov chain, so the answers are exact: the "?" counters move only at "?" rooms, the rare-card counter and
 * the potion counter move only at fights, and a "?" is a fight with a probability that depends on the "?" counters. The
 * walk below carries the joint distribution of (unknown counters, one side counter, "has it happened yet") as integers over
 * one common denominator, once for the rare-card counter and once for the potion counter, and never divides until the end.
 */

export const ROUTE_ROOMS = ["monster", "elite", "unknown", "rest", "shop", "treasure"] as const;
export type RouteRoom = (typeof ROUTE_ROOMS)[number];

/** An act has at most 17 floors (MAP-1) and 14 "?" rooms (MAP-4); a route is part of one act. */
export const MAX_ROUTE_ROOMS = 20;
export const MAX_ROUTE_UNKNOWNS = 12;

export interface RouteInput {
  readonly rooms: readonly RouteRoom[];
  readonly ascension: number;
  /** The "?" rooms already resolved in this act, in order (counters reset every act). Default: none. */
  readonly unknownHistory?: readonly UnknownObservation[];
  /** Distribution of the hidden rare-card counter before the first room. Default: a counter of 0. */
  readonly rareCounter?: CounterDist;
  /** Distribution of the hidden potion counter (tenths) before the first room. Default: the start of a run. */
  readonly potionCounter?: PotionCounterDist;
}

export interface OutcomeCounts {
  readonly expected: Readonly<Record<UnknownOutcome, Rational>>;
  /** pmf[outcome][k] = P(exactly k of the route's "?" rooms turn into that outcome) */
  readonly pmf: Readonly<Record<UnknownOutcome, readonly Rational[]>>;
}

export interface RouteReport {
  readonly rooms: readonly RouteRoom[];
  /** Rooms of each kind as typed (a "?" is counted as "unknown"). */
  readonly counts: Readonly<Record<RouteRoom, number>>;
  readonly unknown: OutcomeCounts & { readonly rooms: number };
  /** Fights = monsters + elites + the "?" rooms that turn into fights. */
  readonly fights: {
    readonly certain: number;
    readonly expected: Rational;
    readonly min: number;
    readonly max: number;
  };
  /** One card pack per fight (3 cards, regular or elite odds, CARD-1..5). */
  readonly cardPacks: { readonly expectedRares: Rational; readonly atLeastOneRare: Rational };
  /** One potion roll per fight (POT-1). */
  readonly potions: { readonly expectedDrops: Rational; readonly atLeastOne: Rational };
  /** Gold paid by fights and treasure rooms (shop spending and event gold are not part of it). */
  readonly gold: {
    readonly fromFights: Rational;
    readonly fromTreasure: Rational;
    readonly expected: Rational;
    readonly min: number;
    readonly max: number;
  };
  /** Relics: one per elite, one per treasure room (TRS-1), including the "?" rooms that turn into treasure rooms. */
  readonly relics: { readonly elites: number; readonly expectedTreasure: Rational };
  readonly shops: { readonly certain: number; readonly expected: Rational };
  readonly rests: number;
}

const OUTCOMES = ["fight", "treasure", "shop", "event"] as const;

// ------------------------------------------------------------------------------------------------ small helpers

function gcd(a: bigint, b: bigint): bigint {
  return b === 0n ? a : gcd(b, a % b);
}

function lcm(a: bigint, b: bigint): bigint {
  return (a / gcd(a, b)) * b;
}

/** A distribution as integers over one common denominator. */
function integerMasses<K>(dist: ReadonlyMap<K, Rational>): { den: bigint; masses: Map<K, bigint> } {
  let den = 1n;
  for (const m of dist.values()) {
    den = lcm(den, m.d);
  }
  const masses = new Map<K, bigint>();
  for (const [k, m] of dist) {
    masses.set(k, (m.n * den) / m.d);
  }
  return { den, masses };
}

function put(map: Map<number, bigint>, key: number, mass: bigint): void {
  map.set(key, (map.get(key) ?? 0n) + mass);
}

// ------------------------------------------------------------------------------------------------ "?" counters

/** Counters are small (a route plus its history stays far below 64), so a state packs into 18 bits. */
function packUnknown(s: UnknownState): number {
  if (s.fight > 63 || s.treasure > 63 || s.shop > 63) {
    throw new RangeError("unknown-room counters out of range");
  }
  return (s.fight << 12) | (s.treasure << 6) | s.shop;
}

function unpackUnknown(u: number): UnknownState {
  return { fight: (u >> 12) & 63, treasure: (u >> 6) & 63, shop: u & 63 };
}

interface UnknownStep {
  /** [fight, treasure, shop, event] in whole percent */
  readonly pct: readonly [bigint, bigint, bigint, bigint];
  /** packed state after each outcome */
  readonly next: readonly [number, number, number, number];
}

const unknownSteps = new Map<number, UnknownStep>();

function unknownStep(u: number): UnknownStep {
  const hit = unknownSteps.get(u);
  if (hit) {
    return hit;
  }
  const s = unpackUnknown(u);
  const step: UnknownStep = {
    pct: unknownPercentPmf(s),
    next: [
      packUnknown(nextUnknownState(s, "fight")),
      packUnknown(nextUnknownState(s, "treasure")),
      packUnknown(nextUnknownState(s, "shop")),
      packUnknown(nextUnknownState(s, "event")),
    ],
  };
  unknownSteps.set(u, step);
  return step;
}

/** Exact distribution over how many of the route's "?" rooms turn into each outcome. */
function outcomeCounts(
  unknownRooms: number,
  start: { den: bigint; masses: ReadonlyMap<number, bigint> },
): OutcomeCounts {
  const pmf = {} as Record<UnknownOutcome, Rational[]>;
  const expected = {} as Record<UnknownOutcome, Rational>;
  OUTCOMES.forEach((outcome, which) => {
    let states = new Map<number, bigint>();
    for (const [u, mass] of start.masses) {
      put(states, u << 6, mass);
    }
    for (let room = 0; room < unknownRooms; room += 1) {
      const next = new Map<number, bigint>();
      for (const [key, mass] of states) {
        const count = key & 63;
        const step = unknownStep(key >> 6);
        for (let i = 0; i < 4; i += 1) {
          const weight = step.pct[i] ?? 0n;
          if (weight > 0n) {
            put(next, ((step.next[i] ?? 0) << 6) | (count + (i === which ? 1 : 0)), mass * weight);
          }
        }
      }
      states = next;
    }
    const whole = start.den * 100n ** BigInt(unknownRooms);
    const counts = Array.from({ length: unknownRooms + 1 }, () => 0n);
    for (const [key, mass] of states) {
      const k = key & 63;
      counts[k] = (counts[k] ?? 0n) + mass;
    }
    pmf[outcome] = counts.map((c) => Rational.of(c, whole));
    let mean = Rational.ZERO;
    pmf[outcome].forEach((p, k) => {
      mean = mean.add(p.mul(k));
    });
    expected[outcome] = mean;
  });
  return { expected, pmf };
}

// ------------------------------------------------------------------------------------------------ side processes

type FightKind = "regular" | "elite";

interface SideStep {
  readonly next: number;
  /** Did this fight produce at least one hit (a rare card, a potion)? */
  readonly hit: boolean;
  readonly weight: bigint;
}

/** What one fight does to a counter that only fights move, and what it yields. */
interface FightProcess {
  /** Every weight below is a whole number over `den`. */
  readonly den: bigint;
  /** Added to a raw counter value to give a slot in 0..255. */
  readonly offset: number;
  steps(kind: FightKind, raw: number): readonly SideStep[];
  /** Expected number of hits of one fight, as a numerator over `den`. */
  expected(kind: FightKind, raw: number): bigint;
}

const PACK_CARDS = 3;
const PACK_DEN = 10_000n ** BigInt(PACK_CARDS);

/** CARD-1..4: three cards, rolled one after another, against the rare-card counter. */
function packProcess(rules: RarityRules): FightProcess {
  const table = new Map<string, { steps: SideStep[]; expected: bigint }>();
  const entry = (kind: FightKind, raw: number): { steps: SideStep[]; expected: bigint } => {
    const key = `${kind}|${String(raw)}`;
    const hit = table.get(key);
    if (hit) {
      return hit;
    }
    const merged = new Map<string, SideStep>();
    let expected = 0n;
    for (const outcome of enumeratePack(
      { kind: "encounter", room: kind },
      raw,
      PACK_CARDS,
      rules,
    )) {
      const weight = outcome.probability.mul(PACK_DEN);
      if (weight.d !== 1n) {
        throw new Error(
          "rarity probabilities are no longer whole units of 1/10000; update PACK_DEN",
        );
      }
      const rares = outcome.rarities.filter((r) => r === "rare").length;
      expected += weight.n * BigInt(rares);
      const k = `${String(outcome.endCounter)}|${String(rares > 0)}`;
      const prev = merged.get(k);
      merged.set(k, {
        next: outcome.endCounter,
        hit: rares > 0,
        weight: (prev?.weight ?? 0n) + weight.n,
      });
    }
    const made = { steps: [...merged.values()], expected };
    table.set(key, made);
    return made;
  };
  return {
    den: PACK_DEN,
    offset: 0,
    steps: (kind, raw) => entry(kind, raw).steps,
    expected: (kind, raw) => entry(kind, raw).expected,
  };
}

const POTION_DEN = 1000n;
const POTION_OFFSET = 64;

/** POT-1: the roll is `tenths / 10` (+12.5 points for an elite); a drop lowers the stored chance by one tenth, a miss raises it. */
function potionProcess(): FightProcess {
  const roll = (kind: FightKind, tenths: number): bigint => {
    const p = potionRollProbability(tenths, kind === "elite" ? "elite" : "monster").mul(POTION_DEN);
    if (p.d !== 1n) {
      throw new Error(
        "potion probabilities are no longer whole units of 1/1000; update POTION_DEN",
      );
    }
    return p.n;
  };
  return {
    den: POTION_DEN,
    offset: POTION_OFFSET,
    steps: (kind, raw) => {
      const drop = roll(kind, raw);
      const out: SideStep[] = [];
      if (drop > 0n) {
        out.push({ next: raw - 1, hit: true, weight: drop });
      }
      if (drop < POTION_DEN) {
        out.push({ next: raw + 1, hit: false, weight: POTION_DEN - drop });
      }
      return out;
    },
    expected: (kind, raw) => roll(kind, raw),
  };
}

// ------------------------------------------------------------------------------------------------ the walk

/** key = unknown state (18 bits) | side-counter slot (8 bits) | "already hit" flag (1 bit): 27 bits, an exact integer in a double. */
function packKey(u: number, slot: number, flag: number): number {
  if (slot < 0 || slot > 255) {
    throw new RangeError("counter out of range");
  }
  return (u << 9) | (slot << 1) | flag;
}

interface WalkResult {
  readonly atLeastOne: Rational;
  readonly expected: Rational;
}

/**
 * Walks the route once for one side counter. Fights roll `proc` against the side counter; a "?" is a fight with the
 * probability its counters give, and every "?" moves the unknown counters whatever it turns into.
 */
function walk(
  rooms: readonly RouteRoom[],
  unknownStart: { den: bigint; masses: ReadonlyMap<number, bigint> },
  sideStart: { den: bigint; masses: ReadonlyMap<number, bigint> },
  proc: FightProcess,
): WalkResult {
  let den = unknownStart.den * sideStart.den;
  let states = new Map<number, bigint>();
  for (const [u, mu] of unknownStart.masses) {
    for (const [raw, ms] of sideStart.masses) {
      put(states, packKey(u, raw + proc.offset, 0), mu * ms);
    }
  }
  let expected = 0n; // numerator over `den`
  for (const room of rooms) {
    if (room === "monster" || room === "elite") {
      const kind: FightKind = room === "elite" ? "elite" : "regular";
      const next = new Map<number, bigint>();
      let gained = 0n;
      for (const [key, mass] of states) {
        const u = key >> 9;
        const flag = key & 1;
        const raw = ((key >> 1) & 255) - proc.offset;
        gained += mass * proc.expected(kind, raw);
        for (const step of proc.steps(kind, raw)) {
          put(next, packKey(u, step.next + proc.offset, step.hit ? 1 : flag), mass * step.weight);
        }
      }
      expected = expected * proc.den + gained;
      den *= proc.den;
      states = next;
    } else if (room === "unknown") {
      const whole = 100n * proc.den;
      const next = new Map<number, bigint>();
      let gained = 0n;
      for (const [key, mass] of states) {
        const u = key >> 9;
        const slot = (key >> 1) & 255;
        const flag = key & 1;
        const raw = slot - proc.offset;
        const step = unknownStep(u);
        const pFight = step.pct[0];
        if (pFight > 0n) {
          const after = step.next[0];
          gained += mass * pFight * proc.expected("regular", raw);
          for (const s of proc.steps("regular", raw)) {
            put(
              next,
              packKey(after, s.next + proc.offset, s.hit ? 1 : flag),
              mass * pFight * s.weight,
            );
          }
        }
        for (let i = 1; i < 4; i += 1) {
          const weight = step.pct[i] ?? 0n;
          if (weight > 0n) {
            put(next, packKey(step.next[i] ?? 0, slot, flag), mass * weight * proc.den);
          }
        }
      }
      expected = expected * whole + gained;
      den *= whole;
      states = next;
    }
    // rest, shop and treasure rooms move none of these counters
  }
  let flagged = 0n;
  for (const [key, mass] of states) {
    if ((key & 1) === 1) {
      flagged += mass;
    }
  }
  return { atLeastOne: Rational.of(flagged, den), expected: Rational.of(expected, den) };
}

// ------------------------------------------------------------------------------------------------ the report

function validate(input: RouteInput): void {
  if (!Number.isInteger(input.ascension) || input.ascension < 0 || input.ascension > 10) {
    throw new RangeError("ascension must be a whole number from 0 to 10");
  }
  if (input.rooms.length > MAX_ROUTE_ROOMS) {
    throw new RangeError(`a route has at most ${String(MAX_ROUTE_ROOMS)} rooms`);
  }
  for (const room of input.rooms) {
    if (!ROUTE_ROOMS.includes(room)) {
      throw new RangeError(`unknown room type ${room}`);
    }
  }
  const unknownRooms = input.rooms.filter((r) => r === "unknown").length;
  if (unknownRooms > MAX_ROUTE_UNKNOWNS) {
    throw new RangeError(`a route has at most ${String(MAX_ROUTE_UNKNOWNS)} "?" rooms`);
  }
  if ((input.unknownHistory?.length ?? 0) > MAX_UNKNOWN_ROOMS_PER_ACT) {
    throw new RangeError(`an act has at most ${String(MAX_UNKNOWN_ROOMS_PER_ACT)} "?" rooms`);
  }
}

/** Exact answers for one route. Throws `RangeError` for a route or a history that cannot exist. */
export function evaluateRoute(input: RouteInput): RouteReport {
  validate(input);
  const rooms = [...input.rooms];
  const rules = rarityRulesForAscension(input.ascension);

  const inference = inferUnknownState(input.unknownHistory ?? []);
  if (inference.impossible) {
    throw new RangeError('the recorded "?" history cannot happen under the rules');
  }
  const unknownMasses = new Map<number, Rational>();
  for (const [key, mass] of inference.posterior) {
    const state = inference.states.get(key) ?? UNKNOWN_START;
    const u = packUnknown(state);
    unknownMasses.set(u, (unknownMasses.get(u) ?? Rational.ZERO).add(mass));
  }
  const unknownStart = integerMasses(unknownMasses);
  const rareStart = integerMasses(input.rareCounter ?? pointMass(0, rules));
  const potionStart = integerMasses(
    input.potionCounter ?? new Map([[POTION_START_TENTHS, Rational.ONE]]),
  );

  const counts = Object.fromEntries(
    ROUTE_ROOMS.map((r) => [r, rooms.filter((x) => x === r).length]),
  ) as Record<RouteRoom, number>;
  const unknownRooms = counts.unknown;
  const outcomes = outcomeCounts(unknownRooms, unknownStart);
  const rare = walk(rooms, unknownStart, rareStart, packProcess(rules));
  const potion = walk(rooms, unknownStart, potionStart, potionProcess());

  const certainFights = counts.monster + counts.elite;
  const monsterGold = combatGoldRange("monster", input.ascension);
  const eliteGold = combatGoldRange("elite", input.ascension);
  const treasureGold = treasureGoldRange(input.ascension);
  const expectedFights = outcomes.expected.fight.add(certainFights);
  const expectedTreasure = outcomes.expected.treasure.add(counts.treasure);
  const fromFights = monsterGold.mean
    .mul(outcomes.expected.fight.add(counts.monster))
    .add(eliteGold.mean.mul(counts.elite));
  const fromTreasure = treasureGold.mean.mul(expectedTreasure);

  return {
    rooms,
    counts,
    unknown: { rooms: unknownRooms, ...outcomes },
    fights: {
      certain: certainFights,
      expected: expectedFights,
      min: certainFights,
      max: certainFights + unknownRooms,
    },
    cardPacks: { expectedRares: rare.expected, atLeastOneRare: rare.atLeastOne },
    potions: { expectedDrops: potion.expected, atLeastOne: potion.atLeastOne },
    gold: {
      fromFights,
      fromTreasure,
      expected: fromFights.add(fromTreasure),
      min:
        monsterGold.min * counts.monster +
        eliteGold.min * counts.elite +
        treasureGold.min * counts.treasure,
      max:
        monsterGold.max * counts.monster +
        eliteGold.max * counts.elite +
        treasureGold.max * counts.treasure +
        Math.max(monsterGold.max, treasureGold.max) * unknownRooms,
    },
    relics: { elites: counts.elite, expectedTreasure },
    shops: { certain: counts.shop, expected: outcomes.expected.shop.add(counts.shop) },
    rests: counts.rest,
  };
}
