/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any --
   these tests read untyped JSON responses on purpose: the HTTP contract is what is under test */
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { evaluateRoute, pointMass, rarityRulesForAscension } from "@slay2/odds";

import { POST as odds } from "@/app/api/v1/odds/route";

function post(body: unknown): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `10.1.${String(Math.floor(Math.random() * 250))}.${String(Math.floor(Math.random() * 250))}`,
    },
    body: JSON.stringify(body),
  });
}

async function json(res: Response): Promise<any> {
  return res.json();
}

const ROUTE = {
  calculator: "route",
  build: "sts2-main-0.107.1",
  ascension: 0,
  routes: [
    { rooms: ["monster", "unknown", "monster", "elite", "rest"] },
    { name: "Quiet", rooms: ["monster", "unknown", "unknown", "rest", "elite"] },
  ],
  unknownHistory: [],
  counter: 0,
  potionTenths: 4,
} as const;

describe("POST /api/v1/odds {calculator:'route'}", () => {
  it("answers with the engine's exact numbers for every route, named", async () => {
    const res = await odds(post(ROUTE));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toMatchObject({ calculator: "route", method: "exact", ascension: 0 });
    expect(body.routes.map((r: { name: string }) => r.name)).toEqual(["A", "Quiet"]);
    expect(body.provenance.ruleIds).toContain("TRS-1");
    for (const [i, route] of ROUTE.routes.entries()) {
      const direct = evaluateRoute({
        rooms: route.rooms,
        ascension: 0,
        rareCounter: pointMass(0, rarityRulesForAscension(0)),
      });
      const report = body.routes[i].report;
      expect(report.fights.expected).toMatchObject({
        n: direct.fights.expected.n.toString(),
        d: direct.fights.expected.d.toString(),
      });
      expect(report.cardPacks.atLeastOneRare.d).toBe(direct.cardPacks.atLeastOneRare.d.toString());
      expect(report.cardPacks.atLeastOneRare.n).toBe(direct.cardPacks.atLeastOneRare.n.toString());
      expect(report.counts).toEqual(direct.counts);
    }
  });

  it("takes histories in place of counters", async () => {
    const res = await odds(
      post({
        ...ROUTE,
        counter: undefined,
        potionTenths: undefined,
        packHistory: [
          { source: "regular", rares: 0 },
          { source: "regular", rares: 0 },
          { source: "regular", rares: 0 },
        ],
        potionHistory: [{ room: "monster", dropped: false }],
        unknownHistory: [{ outcome: "event" }, {}],
      }),
    );
    expect(res.status).toBe(200);
  });

  it.each([
    ["neither a counter nor a pack history", { counter: undefined }],
    ["both a counter and a pack history", { packHistory: [] }],
    ["neither a potion chance nor a potion history", { potionTenths: undefined }],
    ["both a potion chance and a potion history", { potionHistory: [] }],
    ["no unknown-room history", { unknownHistory: undefined }],
    ["no routes", { routes: [] }],
    ["four routes", { routes: [{ rooms: [] }, { rooms: [] }, { rooms: [] }, { rooms: [] }] }],
    ["an unknown room type", { routes: [{ rooms: ["boss"] }] }],
    [
      "a route longer than an act",
      { routes: [{ rooms: Array.from({ length: 21 }, () => "rest") }] },
    ],
    ["a stray field", { secret: 1 }],
    ["a name that is only spaces", { routes: [{ name: "   ", rooms: [] }] }],
    ["a negative counter", { counter: -1 }],
    ["an Ascension 11", { ascension: 11 }],
  ])("refuses %s with a 400", async (_what, patch) => {
    const res = await odds(post({ ...ROUTE, ...patch }));
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe("invalid_request");
  });

  it("refuses a history that cannot happen with a 422, never a guess", async () => {
    const events = Array.from({ length: 7 }, () => ({ outcome: "event" }));
    for (const patch of [
      { unknownHistory: events },
      { counter: undefined, packHistory: [{ source: "regular", rares: 1 }] },
    ]) {
      const res = await odds(post({ ...ROUTE, ...patch }));
      expect(res.status).toBe(422);
      expect((await json(res)).error.code).toBe("impossible_history");
    }
  });

  it("refuses the beta build like every other calculator", async () => {
    const res = await odds(post({ ...ROUTE, build: "sts2-beta-0.111.0" }));
    expect(res.status).toBe(422);
    expect((await json(res)).error.code).toBe("unsupported_build");
  });

  it("the longest request the schema allows is answered in bounded time", async () => {
    const rooms = [
      ...Array.from({ length: 12 }, () => "unknown"),
      ...Array.from({ length: 8 }, () => "monster"),
    ];
    const t0 = performance.now();
    const res = await odds(
      post({ ...ROUTE, ascension: 7, routes: [{ rooms }, { rooms }, { rooms }] }),
    );
    const seconds = (performance.now() - t0) / 1000;
    expect(res.status).toBe(200);
    expect(seconds).toBeLessThan(30); // measured near three seconds; the bound only guards against a blow-up
  }, 60_000);
});
