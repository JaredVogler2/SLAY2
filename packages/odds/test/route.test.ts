import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  MAX_ROUTE_ROOMS,
  MAX_ROUTE_UNKNOWNS,
  R,
  ROUTE_ROOMS,
  Rational,
  UNKNOWN_START,
  cardRarityPmf,
  combatGoldRange,
  evaluateRoute,
  forecastPack,
  forecastPotions,
  inferPotionCounter,
  inferUnknownState,
  marginalTable,
  nextCounter,
  nextUnknownState,
  pointMass,
  potionRollProbability,
  rarityRulesForAscension,
  treasureGoldRange,
  unknownRoomPmf,
  type RouteRoom,
  type UnknownObservation,
  type UnknownOutcome,
  type UnknownState,
} from "../src/index";

/**
 * Route engine, second and third layer of evidence (the first is the independent Python oracle in golden.test.ts):
 * brute-force enumeration of every world with the single-step primitives, the published "?" table, the potion forecast
 * of the existing engine, and properties that must hold for any route.
 */

const OUTCOMES = ["fight", "treasure", "shop", "event"] as const;
const ONE = Rational.ONE;
const ZERO = Rational.ZERO;

/** Every card, every potion roll and every "?" outcome of the route, one world at a time (no DP, no state merging). */
function bruteRare(
  rooms: readonly RouteRoom[],
  ascension: number,
  counter0: number,
  u0: UnknownState = UNKNOWN_START,
): { any: Rational; expected: Rational } {
  const rules = rarityRulesForAscension(ascension);
  let any = ZERO;
  let expected = ZERO;
  const rollPack = (
    room: "regular" | "elite",
    cardsDone: number,
    counter: number,
    seen: boolean,
    rares: number,
    p: Rational,
    done: (counter: number, seen: boolean, rares: number, p: Rational) => void,
  ): void => {
    if (cardsDone === 3) {
      done(counter, seen, rares, p);
      return;
    }
    const source = { kind: "encounter", room } as const;
    const pmf = cardRarityPmf(source, counter, rules);
    for (const rarity of ["rare", "uncommon", "common"] as const) {
      const pr = pmf[rarity];
      if (pr.isZero()) {
        continue;
      }
      rollPack(
        room,
        cardsDone + 1,
        nextCounter(source, counter, rarity, rules),
        seen || rarity === "rare",
        rares + (rarity === "rare" ? 1 : 0),
        p.mul(pr),
        done,
      );
    }
  };
  const visit = (
    i: number,
    u: UnknownState,
    counter: number,
    seen: boolean,
    rares: number,
    p: Rational,
  ): void => {
    const room = rooms[i];
    if (room === undefined) {
      expected = expected.add(p.mul(rares));
      if (seen) {
        any = any.add(p);
      }
      return;
    }
    if (room === "monster" || room === "elite") {
      rollPack(
        room === "elite" ? "elite" : "regular",
        0,
        counter,
        seen,
        rares,
        p,
        (c, s, r, pp) => {
          visit(i + 1, u, c, s, r, pp);
        },
      );
    } else if (room === "unknown") {
      const pmf = unknownRoomPmf(u);
      for (const outcome of OUTCOMES) {
        const po = pmf[outcome];
        if (po.isZero()) {
          continue;
        }
        const u2 = nextUnknownState(u, outcome);
        if (outcome === "fight") {
          rollPack("regular", 0, counter, seen, rares, p.mul(po), (c, s, r, pp) => {
            visit(i + 1, u2, c, s, r, pp);
          });
        } else {
          visit(i + 1, u2, counter, seen, rares, p.mul(po));
        }
      }
    } else {
      visit(i + 1, u, counter, seen, rares, p);
    }
  };
  visit(0, u0, counter0, false, 0, ONE);
  return { any, expected };
}

function brutePotion(
  rooms: readonly RouteRoom[],
  tenths0: number,
  u0: UnknownState = UNKNOWN_START,
): { any: Rational; expected: Rational } {
  let any = ZERO;
  let expected = ZERO;
  const visit = (i: number, u: UnknownState, tenths: number, seen: boolean, p: Rational): void => {
    const room = rooms[i];
    if (room === undefined) {
      if (seen) {
        any = any.add(p);
      }
      return;
    }
    const fight = (kind: "monster" | "elite", u2: UnknownState, pw: Rational): void => {
      const drop = potionRollProbability(tenths, kind);
      if (!drop.isZero()) {
        expected = expected.add(pw.mul(drop)); // one potion per drop, counted where it happens
        visit(i + 1, u2, tenths - 1, true, pw.mul(drop));
      }
      if (!drop.eq(1)) {
        visit(i + 1, u2, tenths + 1, seen, pw.mul(ONE.sub(drop)));
      }
    };
    if (room === "monster" || room === "elite") {
      fight(room, u, p);
    } else if (room === "unknown") {
      const pmf = unknownRoomPmf(u);
      for (const outcome of OUTCOMES) {
        const po = pmf[outcome];
        if (po.isZero()) {
          continue;
        }
        const u2 = nextUnknownState(u, outcome);
        if (outcome === "fight") {
          fight("monster", u2, p.mul(po));
        } else {
          visit(i + 1, u2, tenths, seen, p.mul(po));
        }
      }
    } else {
      visit(i + 1, u, tenths, seen, p);
    }
  };
  visit(0, u0, tenths0, false, ONE);
  return { any, expected };
}

function bruteOutcomes(
  rooms: number,
  u0: UnknownState = UNKNOWN_START,
): Record<UnknownOutcome, Rational[]> {
  const pmf = Object.fromEntries(
    OUTCOMES.map((o) => [o, Array.from({ length: rooms + 1 }, () => ZERO)]),
  ) as Record<UnknownOutcome, Rational[]>;
  const visit = (
    depth: number,
    u: UnknownState,
    counts: Record<UnknownOutcome, number>,
    p: Rational,
  ): void => {
    if (depth === rooms) {
      for (const o of OUTCOMES) {
        const list = pmf[o];
        list[counts[o]] = (list[counts[o]] ?? ZERO).add(p);
      }
      return;
    }
    const step = unknownRoomPmf(u);
    for (const o of OUTCOMES) {
      if (!step[o].isZero()) {
        visit(depth + 1, nextUnknownState(u, o), { ...counts, [o]: counts[o] + 1 }, p.mul(step[o]));
      }
    }
  };
  visit(0, u0, { fight: 0, treasure: 0, shop: 0, event: 0 }, ONE);
  return pmf;
}

const eq = (a: Rational, b: Rational, what: string): void => {
  expect(a.toString(), what).toBe(b.toString());
};

describe("route engine - brute force over every world", () => {
  const rareRoutes: readonly (readonly RouteRoom[])[] = [
    ["monster"],
    ["elite"],
    ["monster", "monster"],
    ["elite", "monster", "rest", "elite"],
    ["unknown"],
    ["unknown", "elite", "unknown"],
    ["monster", "unknown", "shop", "unknown", "treasure"],
    ["elite", "unknown", "unknown", "rest"],
  ];

  it("rare cards: every route, several counters, both rule sets", () => {
    for (const rooms of rareRoutes) {
      for (const ascension of [0, 7]) {
        for (const counter of [0, 4, 11, 44]) {
          const got = evaluateRoute({
            rooms,
            ascension,
            rareCounter: pointMass(counter, rarityRulesForAscension(ascension)),
          });
          const want = bruteRare(rooms, ascension, counter);
          const label = `${rooms.join(",")} A${String(ascension)} c${String(counter)}`;
          eq(got.cardPacks.atLeastOneRare, want.any, `${label} P(a rare)`);
          eq(got.cardPacks.expectedRares, want.expected, `${label} E[rares]`);
        }
      }
    }
  }, 60_000);

  it("potions: longer routes, several starting chances", () => {
    const routes: readonly (readonly RouteRoom[])[] = [
      ["monster", "monster", "monster", "monster", "monster", "monster"],
      ["elite", "unknown", "elite", "unknown", "monster", "rest", "unknown", "monster"],
      ["unknown", "unknown", "unknown", "unknown", "unknown"],
      [
        "monster",
        "elite",
        "shop",
        "unknown",
        "treasure",
        "unknown",
        "monster",
        "monster",
        "unknown",
      ],
    ];
    for (const rooms of routes) {
      for (const tenths of [-2, 0, 4, 9, 12]) {
        const got = evaluateRoute({
          rooms,
          ascension: 0,
          potionCounter: new Map([[tenths, ONE]]),
        });
        const want = brutePotion(rooms, tenths);
        const label = `${rooms.join(",")} t${String(tenths)}`;
        eq(got.potions.atLeastOne, want.any, `${label} P(a potion)`);
        eq(got.potions.expectedDrops, want.expected, `${label} E[potions]`);
      }
    }
  }, 60_000);

  it('what the "?" rooms turn into: every outcome sequence', () => {
    for (let rooms = 0; rooms <= 6; rooms += 1) {
      const got = evaluateRoute({
        rooms: Array.from({ length: rooms }, () => "unknown" as const),
        ascension: 0,
      });
      const want = bruteOutcomes(rooms);
      for (const o of OUTCOMES) {
        expect(got.unknown.pmf[o].map(String), `${String(rooms)} rooms, ${o}`).toEqual(
          want[o].map(String),
        );
      }
    }
  }, 60_000);

  it('a recorded "?" history is the same as starting from the counters it leaves', () => {
    const history: UnknownObservation[] = [
      { outcome: "event" },
      { outcome: "fight" },
      { outcome: "event" },
    ];
    let u = UNKNOWN_START;
    for (const h of history) {
      u = nextUnknownState(u, h.outcome ?? "event");
    }
    const rooms: RouteRoom[] = ["unknown", "elite", "unknown", "monster"];
    const got = evaluateRoute({
      rooms,
      ascension: 0,
      unknownHistory: history,
      rareCounter: pointMass(6, rarityRulesForAscension(0)),
    });
    const want = bruteRare(rooms, 0, 6, u);
    eq(got.cardPacks.atLeastOneRare, want.any, "P(a rare)");
    eq(got.cardPacks.expectedRares, want.expected, "E[rares]");
    const wantOutcomes = bruteOutcomes(2, u);
    for (const o of OUTCOMES) {
      expect(got.unknown.pmf[o].map(String)).toEqual(wantOutcomes[o].map(String));
    }
  });
});

describe("route engine - agreement with the other engines", () => {
  it('"?" rooms alone reproduce the published table: the expected mix is the sum of the marginals', () => {
    for (let rooms = 1; rooms <= 8; rooms += 1) {
      const table = marginalTable(rooms);
      const got = evaluateRoute({
        rooms: Array.from({ length: rooms }, () => "unknown" as const),
        ascension: 0,
      });
      for (const o of OUTCOMES) {
        const sum = table.reduce((acc, row) => acc.add(row[o]), ZERO);
        eq(got.unknown.expected[o], sum, `${String(rooms)} rooms, ${o}`);
      }
    }
    // the published figures themselves: six "?" rooms hold 139.02 fights per hundred routes
    const six = evaluateRoute({
      rooms: Array.from({ length: 6 }, () => "unknown" as const),
      ascension: 0,
    });
    expect(six.unknown.expected.fight.toFixed(4)).toBe("1.3902");
  });

  it("fights alone reproduce the potion forecast of the potion engine", () => {
    const rooms: RouteRoom[] = ["monster", "elite", "monster", "monster", "elite", "monster"];
    for (const history of [
      [],
      [{ room: "monster", dropped: false }],
      [
        { room: "monster", dropped: true },
        { room: "elite", dropped: false },
      ],
      [{ room: "monster" }, { room: "monster" }, { room: "monster" }],
    ] as const) {
      const posterior = inferPotionCounter(history).posterior;
      const forecast = forecastPotions(
        posterior,
        rooms.map((r) => (r === "elite" ? "elite" : "monster")),
      );
      const got = evaluateRoute({ rooms, ascension: 0, potionCounter: posterior });
      eq(got.potions.expectedDrops, forecast.expectedDrops, "expected drops");
      eq(got.potions.atLeastOne, ONE.sub(forecast.dropCountPmf[0] ?? ZERO), "P(at least one)");
    }
  });

  it("one fight reproduces the pack forecast of the rarity engine, including the published 16.95 %", () => {
    for (const ascension of [0, 7]) {
      const rules = rarityRulesForAscension(ascension);
      for (const counter of [0, 7, 30, 44, 60]) {
        for (const room of ["monster", "elite"] as const) {
          const forecast = forecastPack(
            pointMass(counter, rules),
            { kind: "encounter", room: room === "elite" ? "elite" : "regular" },
            3,
            rules,
          );
          const got = evaluateRoute({
            rooms: [room],
            ascension,
            rareCounter: pointMass(counter, rules),
          });
          eq(
            got.cardPacks.atLeastOneRare,
            forecast.atLeastOneRare,
            `${room} c${String(counter)} A${String(ascension)}`,
          );
          eq(got.cardPacks.expectedRares, forecast.expectedRares, `${room} c${String(counter)} E`);
        }
      }
    }
    // CARD-8: right after a rare, the next elite pack holds a rare with probability 16.95 %, a regular one never does
    expect(
      evaluateRoute({ rooms: ["elite"], ascension: 0 }).cardPacks.atLeastOneRare.toFixed(4),
    ).toBe("0.1695");
    eq(
      evaluateRoute({ rooms: ["monster"], ascension: 0 }).cardPacks.atLeastOneRare,
      ZERO,
      "regular pack after a rare",
    );
  });

  it("gold uses the combat ranges and the treasure rule", () => {
    const r = evaluateRoute({ rooms: ["monster", "elite", "treasure", "rest"], ascension: 0 });
    eq(
      r.gold.expected,
      combatGoldRange("monster", 0)
        .mean.add(combatGoldRange("elite", 0).mean)
        .add(treasureGoldRange(0).mean),
      "A0",
    );
    expect([r.gold.min, r.gold.max]).toEqual([10 + 35 + 42, 20 + 45 + 52]);
    const poor = evaluateRoute({ rooms: ["treasure"], ascension: 3 });
    eq(poor.gold.expected, R(384, 11), "A3 treasure mean");
    expect([poor.gold.min, poor.gold.max]).toEqual([31, 39]);
  });
});

describe("route engine - inputs", () => {
  it("an empty route yields nothing", () => {
    const r = evaluateRoute({ rooms: [], ascension: 0 });
    expect(r.fights.max).toBe(0);
    for (const x of [
      r.cardPacks.expectedRares,
      r.cardPacks.atLeastOneRare,
      r.potions.expectedDrops,
      r.potions.atLeastOne,
      r.gold.expected,
    ]) {
      eq(x, ZERO, "empty");
    }
  });

  it("refuses what cannot exist", () => {
    expect(() => evaluateRoute({ rooms: [], ascension: 11 })).toThrow(RangeError);
    expect(() => evaluateRoute({ rooms: [], ascension: 1.5 })).toThrow(RangeError);
    expect(() =>
      evaluateRoute({
        rooms: Array.from({ length: MAX_ROUTE_ROOMS + 1 }, () => "rest" as const),
        ascension: 0,
      }),
    ).toThrow(RangeError);
    expect(() =>
      evaluateRoute({
        rooms: Array.from({ length: MAX_ROUTE_UNKNOWNS + 1 }, () => "unknown" as const),
        ascension: 0,
      }),
    ).toThrow(RangeError);
    expect(() => evaluateRoute({ rooms: ["boss" as RouteRoom], ascension: 0 })).toThrow(RangeError);
    // seven events in a row cannot happen: the seventh "?" would have needed a negative chance of an event
    expect(() =>
      evaluateRoute({
        rooms: ["unknown"],
        ascension: 0,
        unknownHistory: Array.from({ length: 7 }, () => ({ outcome: "event" as const })),
      }),
    ).toThrow(RangeError);
    expect(
      inferUnknownState(Array.from({ length: 7 }, () => ({ outcome: "event" as const })))
        .impossible,
    ).toBe(true);
    expect(() =>
      evaluateRoute({
        rooms: [],
        ascension: 0,
        unknownHistory: Array.from({ length: 21 }, () => ({})),
      }),
    ).toThrow(RangeError);
  });

  it("is fast enough to run in the browser on the longest route", () => {
    const rooms: RouteRoom[] = [
      ...Array.from({ length: MAX_ROUTE_UNKNOWNS }, () => "unknown" as const),
      ...Array.from({ length: MAX_ROUTE_ROOMS - MAX_ROUTE_UNKNOWNS }, () => "monster" as const),
    ];
    const t0 = performance.now();
    const r = evaluateRoute({ rooms, ascension: 7 });
    const seconds = (performance.now() - t0) / 1000;
    expect(r.fights.max).toBe(MAX_ROUTE_ROOMS);
    expect(seconds).toBeLessThan(20); // measured about one second; the bound only guards against an accidental blow-up
  });
});

describe("route engine - properties", () => {
  const room = fc.constantFrom<RouteRoom>(...ROUTE_ROOMS);
  const route = fc
    .array(room, { maxLength: 9 })
    .filter((r) => r.filter((x) => x === "unknown").length <= 5);

  it("probabilities are probabilities and expectations are consistent", () => {
    fc.assert(
      fc.property(route, fc.constantFrom(0, 3, 7), (rooms, ascension) => {
        const r = evaluateRoute({ rooms, ascension });
        for (const o of OUTCOMES) {
          eq(
            r.unknown.pmf[o].reduce((a, b) => a.add(b), ZERO),
            ONE,
            `${o} sums to 1`,
          );
        }
        const split = OUTCOMES.reduce((a, o) => a.add(r.unknown.expected[o]), ZERO);
        eq(split, R(r.unknown.rooms), 'the four outcomes share the "?" rooms');
        for (const p of [r.cardPacks.atLeastOneRare, r.potions.atLeastOne]) {
          expect(p.ge(0) && p.le(1)).toBe(true);
        }
        expect(r.cardPacks.expectedRares.ge(r.cardPacks.atLeastOneRare)).toBe(true);
        expect(r.potions.expectedDrops.ge(r.potions.atLeastOne)).toBe(true);
        expect(r.potions.expectedDrops.le(r.fights.max)).toBe(true);
        expect(r.cardPacks.expectedRares.le(R(3 * r.fights.max))).toBe(true);
        expect(r.fights.expected.ge(r.fights.min) && r.fights.expected.le(r.fights.max)).toBe(true);
        expect(r.gold.expected.ge(r.gold.min) || r.unknown.rooms > 0).toBe(true);
        expect(r.gold.expected.le(r.gold.max)).toBe(true);
      }),
      { numRuns: 60 },
    );
  });

  it("rooms that move no counter change only their own counts", () => {
    fc.assert(
      fc.property(
        route,
        fc.nat(9),
        fc.constantFrom<RouteRoom>("rest", "shop"),
        (rooms, at, extra) => {
          const base = evaluateRoute({ rooms, ascension: 0 });
          const copy = [...rooms];
          copy.splice(Math.min(at, copy.length), 0, extra);
          const more = evaluateRoute({ rooms: copy, ascension: 0 });
          eq(more.cardPacks.atLeastOneRare, base.cardPacks.atLeastOneRare, "P(a rare)");
          eq(more.cardPacks.expectedRares, base.cardPacks.expectedRares, "E[rares]");
          eq(more.potions.atLeastOne, base.potions.atLeastOne, "P(a potion)");
          eq(more.potions.expectedDrops, base.potions.expectedDrops, "E[potions]");
          eq(more.gold.expected, base.gold.expected, "gold");
          eq(more.fights.expected, base.fights.expected, "fights");
        },
      ),
      { numRuns: 40 },
    );
  });

  it("one more fight never lowers a chance of getting something", () => {
    fc.assert(
      fc.property(route, fc.constantFrom<RouteRoom>("monster", "elite"), (rooms, fight) => {
        const base = evaluateRoute({ rooms, ascension: 0 });
        const more = evaluateRoute({ rooms: [...rooms, fight], ascension: 0 });
        expect(more.cardPacks.atLeastOneRare.ge(base.cardPacks.atLeastOneRare)).toBe(true);
        expect(more.cardPacks.expectedRares.ge(base.cardPacks.expectedRares)).toBe(true);
        expect(more.potions.atLeastOne.ge(base.potions.atLeastOne)).toBe(true);
        expect(more.potions.expectedDrops.ge(base.potions.expectedDrops)).toBe(true);
        expect(more.gold.expected.gt(base.gold.expected)).toBe(true);
      }),
      { numRuns: 40 },
    );
  });
});
