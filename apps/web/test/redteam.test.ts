/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any --
   the HTTP contract is under test: responses are read as untyped JSON on purpose */
// @vitest-environment node
//
// Red-team regression suite (prompts/11, docs/ADVERSARIAL-AUDIT.md). Every case is an attack or a trap that was tried
// against the running code; the ids (RT-<campaign>-<n>) match the findings table in the audit document.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { UnsupportedBuildError } from "@slay2/game-schema";
import { evaluateDraft } from "@slay2/decision";
import { starterDeck } from "@slay2/game-data";

import { GET as capabilities } from "@/app/api/v1/capabilities/route";
import { POST as odds } from "@/app/api/v1/odds/route";
import { POST as recommend } from "@/app/api/v1/recommend/route";
import { MAX_BODY_BYTES } from "@/lib/api";
import { MAX_IMPORT_BYTES, newRun, parseRunState } from "@/lib/run-state";

let counter = 0;
function post(
  body: unknown,
  init: { type?: string; raw?: string; ip?: string; headers?: Record<string, string> } = {},
): Request {
  counter += 1;
  return new Request("http://localhost/api", {
    method: "POST",
    headers: {
      "content-type": init.type ?? "application/json",
      "x-forwarded-for":
        init.ip ??
        `10.${String(counter % 250)}.${String(Math.floor(counter / 250) % 250)}.${String(Math.floor(counter / 62500) % 250)}`,
      ...(init.headers ?? {}),
    },
    body: init.raw ?? JSON.stringify(body),
  });
}
const json = async (res: Response): Promise<any> => res.json();
// Reads a property no code ever sets: a polluted Object.prototype would make it visible on every plain object.
const prototypeProbe = (): unknown => {
  const plain: { polluted?: unknown } = {};
  return plain.polluted;
};

const MAIN = "sts2-main-0.107.1";
const BETA = "sts2-beta-0.111.0";
const RARITY = { calculator: "rarity", build: MAIN, ascension: 0, source: "regular", counter: 0 };
const REC = {
  build: MAIN,
  character: "ironclad",
  ascension: 0,
  actIndex: 0,
  deck: starterDeck("ironclad"),
  offered: ["POMMEL_STRIKE", "SHRUG_IT_OFF", "INFLAME"],
  source: "regular",
  riskPreference: "balanced",
};

describe("campaign 1 - Slay the Spire 1 confusion is refused, not translated", () => {
  it.each([11, 12, 15, 19, 20, -1, 10.5, "10", null, 1e9])(
    "RT-1-01 ascension %j is not an STS2 ascension",
    async (asc) => {
      for (const handler of [
        () => odds(post({ ...RARITY, ascension: asc })),
        () => recommend(post({ ...REC, ascension: asc })),
      ]) {
        const res = await handler();
        expect(res.status).toBe(400);
        expect((await json(res)).error.code).toBe("invalid_request");
      }
    },
  );

  it.each([3, 4, -1, 1.5, "2", null])("RT-1-02 act index %j (there is no Act 4)", async (act) => {
    const res = await recommend(post({ ...REC, actIndex: act }));
    expect(res.status).toBe(400);
  });

  it.each(["watcher", "Watcher", "ironclad ", "", null, "silent;drop table", "heart", 7])(
    "RT-1-03 character %j",
    async (c) => {
      expect((await recommend(post({ ...REC, character: c }))).status).toBe(400);
    },
  );

  it.each(["ironclad", "silent", "regent", "necrobinder", "defect"])(
    "RT-1-04 the five real characters work: %s",
    async (c) => {
      const res = await recommend(
        post({ ...REC, character: c, deck: starterDeck(c as never), offered: [] }),
      );
      // an empty offer is a validation error (nothing to rank), but the character itself is accepted
      expect(
        (await json(res)).error.details?.some((d: any) => d.path === "character") ?? false,
      ).toBe(false);
    },
  );

  it.each([
    "Strike_R",
    "STRIKE_R",
    "CORRUPT_HEART",
    "Bash",
    "HEART_OF_IRON",
    "BURNING_BLOOD",
    "../../etc/passwd",
    "ЅТRIKE",
  ])("RT-1-05 card id %j from another game or another type is not an STS2 card", async (id) => {
    const res = await recommend(post({ ...REC, offered: [id] }));
    expect(res.status).toBe(400);
  });

  it.each(["sts1-2.3", "", "STS2-MAIN-0.107.1", "sts2-main-0.99.1", "sts2-main-0.107.1\u0000"])(
    "RT-1-06 build id %j",
    async (b) => {
      expect((await odds(post({ ...RARITY, build: b }))).status).toBe(400);
    },
  );

  it("RT-1-07 the public capability statement never claims Heart, Act 4, keys or A20", async () => {
    const body = await json(capabilities());
    expect(body.acts).toBe(3);
    expect(body.ascension).toMatchObject({ min: 0, max: 10 });
    const ids = body.features
      .map((f: { id: string }) => f.id)
      .join(" ")
      .toLowerCase();
    for (const forbidden of ["heart", "act4", "act-4", "key", "a20"]) {
      expect(ids).not.toContain(forbidden);
    }
    expect(body.modes.coop).toBe("unsupported");
  });
});

describe("campaign 2 - patch contamination: an unverified build is refused everywhere", () => {
  const stateful = [
    { calculator: "rarity", ascension: 0, source: "regular", counter: 0 },
    { calculator: "potion", history: [] },
    { calculator: "unknown_room", history: [] },
    { calculator: "price", item: { kind: "card", rarity: "common" } },
    { calculator: "removal", ascension: 0, removals: 1 },
    { calculator: "gold", ascension: 0, room: "monster" },
    {
      calculator: "route",
      ascension: 0,
      routes: [{ rooms: ["monster"] }],
      unknownHistory: [],
      counter: 0,
      potionTenths: 4,
    },
  ];
  it.each(stateful.map((s) => [s.calculator, s]))(
    "RT-2-01 beta build refused by the %s calculator",
    async (_name, body) => {
      const res = await odds(post({ ...(body as object), build: BETA }));
      expect(res.status).toBe(422);
      expect((await json(res)).error.code).toBe("unsupported_build");
    },
  );

  it("RT-2-04 build-dependent calculators cannot be asked without naming the build", async () => {
    // removal prices and combat gold depend on the patch; before the fix they had no build field and ignored the beta
    expect((await odds(post({ calculator: "removal", ascension: 0, removals: 1 }))).status).toBe(
      400,
    );
    expect((await odds(post({ calculator: "gold", ascension: 0, room: "monster" }))).status).toBe(
      400,
    );
    const ok = await json(
      await odds(post({ calculator: "gold", build: MAIN, ascension: 0, room: "monster" })),
    );
    expect(ok.build).toBe(MAIN);
  });

  it("RT-2-02 the advisor refuses the beta build and says why", async () => {
    const res = await recommend(post({ ...REC, build: BETA }));
    expect(res.status).toBe(422);
    expect((await json(res)).error.message).toMatch(/not verified/i);
    expect(() => evaluateDraft({ ...REC, build: BETA })).toThrow(UnsupportedBuildError);
  });

  it("RT-2-03 a saved run from the beta build can be loaded but is never advised on", () => {
    const run = { ...newRun("ironclad"), build: BETA };
    const parsed = parseRunState(JSON.stringify(run));
    expect(parsed.ok).toBe(true);
    expect(() => evaluateDraft({ ...REC, build: BETA })).toThrow(UnsupportedBuildError);
  });
});

describe("campaign 3 - no certainty without evidence", () => {
  it("RT-3-01 a stateful calculator will not silently assume the start of the run", async () => {
    // before the fix these returned HTTP 200 with a confident "0 % chance of a rare" for a run of unknown progress
    const noEvidence = { calculator: "rarity", build: MAIN, ascension: 0, source: "regular" };
    const res = await odds(post(noEvidence));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await json(res))).toMatch(/counter|history/);
    expect((await odds(post({ calculator: "potion", build: MAIN }))).status).toBe(400);
    expect((await odds(post({ calculator: "unknown_room", build: MAIN }))).status).toBe(400);
  });

  it("RT-3-02 an explicit empty history is the documented way to say 'first reward of the run' and is echoed back", async () => {
    const body = await json(
      await odds(
        post({ calculator: "rarity", build: MAIN, ascension: 0, source: "regular", history: [] }),
      ),
    );
    expect(body.counterKnowledge).toBe("history");
    expect(body.provenance.assumptions.join(" ")).toMatch(/first reward/i);
    expect(body.evidence).toMatchObject({ kind: "history", observations: 0 });
  });

  it("RT-3-03 an impossible history is a 422 with no number", async () => {
    const res = await odds(
      post({
        calculator: "rarity",
        build: MAIN,
        ascension: 0,
        source: "regular",
        history: [{ source: "regular", rares: 1 }],
      }),
    );
    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.error.code).toBe("impossible_history");
    expect(JSON.stringify(body)).not.toMatch(/approx/);
  });

  it("RT-3-04 the counter and a history cannot both be supplied", async () => {
    expect((await odds(post({ ...RARITY, history: [] }))).status).toBe(400);
  });

  it("RT-3-05 more targets than cards in the pile is rejected, not clamped", async () => {
    const res = await odds(post({ calculator: "draw", pile: 10, targets: 11, draws: 5 }));
    expect(res.status).toBe(400);
  });

  it("RT-3-06 needing more copies than are drawn is exactly zero (never NaN)", async () => {
    const body = await json(
      await odds(post({ calculator: "draw", pile: 10, targets: 4, draws: 3, need: 4 })),
    );
    expect(body.probability).toMatchObject({ n: "0", d: "1", approx: 0 });
  });

  it("RT-3-07 the advisor never reports a win probability and always says it is not calibrated", async () => {
    const body = await json(await recommend(post(REC)));
    expect(body.method).toBe("heuristic");
    expect(body.calibrated).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(
      /winProbability|winRate|probabilityEstimate|chanceToWin/i,
    );
  });

  it("RT-3-08 the advisor lists what it does not model, including class-unique resources", async () => {
    for (const [character, term] of [
      ["regent", /Stars|Forge/],
      ["necrobinder", /Osty|Souls|Doom/],
      ["defect", /orb|Focus/i],
      ["silent", /Sly|poison/i],
    ] as const) {
      const body = await json(
        await recommend(
          post({
            ...REC,
            character,
            deck: starterDeck(character),
            offered: [starterDeck(character)[0]?.id ?? "BASH"],
          }),
        ),
      );
      expect(body.notModelled.join(" "), character).toMatch(term);
    }
  });
});

describe("campaign 10 - hostile input", () => {
  it("RT-10-01 wrong content type is 415 and an unparseable body is 400", async () => {
    expect(
      (await odds(post(null, { type: "text/plain", raw: JSON.stringify(RARITY) }))).status,
    ).toBe(415);
    expect((await odds(post(null, { raw: "{not json" }))).status).toBe(400);
    expect((await odds(post(null, { raw: "" }))).status).toBe(400);
  });

  it("RT-10-02 an oversized body is 413 whether or not the length is declared", async () => {
    const big = JSON.stringify({ ...RARITY, pad: "x".repeat(MAX_BODY_BYTES) });
    expect(
      (await odds(post(null, { raw: big, headers: { "content-length": String(big.length) } })))
        .status,
    ).toBe(413);
    expect((await odds(post(null, { raw: big }))).status).toBe(413);
  });

  it("RT-10-03 prototype pollution through __proto__ / constructor is inert", async () => {
    for (const raw of [
      '{"__proto__":{"polluted":true},"calculator":"rarity"}',
      '{"constructor":{"prototype":{"polluted":true}}}',
    ]) {
      expect((await odds(post(null, { raw }))).status).toBe(400);
    }
    expect(prototypeProbe()).toBeUndefined();
    expect(parseRunState('{"__proto__":{"polluted":true}}').ok).toBe(false);
    expect(prototypeProbe()).toBeUndefined();
  });

  it("RT-10-04 absurd nesting and magnitudes are 400, never a crash", async () => {
    expect((await odds(post(null, { raw: "[".repeat(30000) + "]".repeat(30000) }))).status).toBe(
      400,
    );
    expect((await odds(post({ ...RARITY, counter: 1e308 }))).status).toBe(400);
    expect((await odds(post({ ...RARITY, counter: -1 }))).status).toBe(400);
    expect((await odds(post({ calculator: "draw", pile: 1e9, targets: 1, draws: 1 }))).status).toBe(
      400,
    );
  });

  it("RT-10-05 error messages do not echo a huge hostile input back", async () => {
    const hostile = "<script>alert(1)</script>".repeat(400);
    const res = await recommend(post({ ...REC, offered: [hostile] }));
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(JSON.stringify(await json(res)).length).toBeLessThan(2000);
  });

  it("RT-10-06 one client cannot exhaust the service, and others are unaffected", async () => {
    const flood = Array.from({ length: 160 }, () =>
      odds(post({ ...RARITY }, { ip: "203.0.113.9" })),
    );
    const statuses = (await Promise.all(flood)).map((r) => r.status);
    expect(statuses).toContain(429);
    expect((await odds(post({ ...RARITY }, { ip: "203.0.113.10" }))).status).toBe(200);
  });

  it("RT-10-07 the worst legal requests answer quickly (no expensive-request denial of service)", async () => {
    const heavy = [
      {
        calculator: "rarity",
        build: MAIN,
        ascension: 7,
        source: "regular",
        history: Array.from({ length: 100 }, (_, i) => ({
          source: i % 5 === 4 ? "elite" : "regular",
          rares: i % 7 === 6 ? 1 : 0,
        })),
      },
      {
        calculator: "potion",
        build: MAIN,
        history: Array.from({ length: 200 }, () => ({ room: "monster", dropped: false })),
        upcoming: Array.from({ length: 30 }, () => "elite"),
      },
      { calculator: "unknown_room", build: MAIN, history: Array.from({ length: 20 }, () => ({})) },
      { calculator: "draw", pile: 200, targets: 100, draws: 100, need: 50 },
      {
        calculator: "draw",
        pile: 200,
        targets: 60,
        draws: 150,
        need: 20,
        discard: { size: 200, targets: 60 },
      },
    ];
    for (const body of heavy) {
      const started = performance.now();
      const res = await odds(post(body));
      const ms = performance.now() - started;
      expect([200, 400, 422], JSON.stringify(body).slice(0, 60)).toContain(res.status);
      expect(ms, JSON.stringify(body).slice(0, 60)).toBeLessThan(1500);
    }
  });

  it("RT-10-13 a '?' history longer than any act is refused (it took ~17 s to answer at 60 entries before the cap)", async () => {
    const res = await odds(
      post({
        calculator: "unknown_room",
        build: MAIN,
        history: Array.from({ length: 60 }, () => ({})),
      }),
    );
    expect(res.status).toBe(400);
    const run = { ...newRun("ironclad"), unknownRooms: Array.from({ length: 60 }, () => ({})) };
    expect(parseRunState(JSON.stringify(run)).ok).toBe(false);
  });

  it("RT-10-08 fuzz: arbitrary JSON into the odds endpoint never produces a 5xx or a non-JSON body", async () => {
    await fc.assert(
      fc.asyncProperty(fc.jsonValue(), async (value) => {
        const res = await odds(post(value));
        expect([200, 400, 413, 415, 422, 429]).toContain(res.status);
        await res.json();
      }),
      { numRuns: 300 },
    );
  });

  it("RT-10-09 fuzz: near-valid advisor requests with one corrupted field are rejected or answered, never a 5xx", async () => {
    const corrupt = fc.record({
      field: fc.constantFrom(
        "character",
        "ascension",
        "actIndex",
        "deck",
        "offered",
        "source",
        "riskPreference",
        "build",
      ),
      value: fc.oneof(
        fc.jsonValue(),
        fc.constant(undefined),
        fc.string({ maxLength: 40 }),
        fc.integer(),
      ),
    });
    await fc.assert(
      fc.asyncProperty(corrupt, async ({ field, value }) => {
        const body: Record<string, unknown> =
          value === undefined
            ? Object.fromEntries(Object.entries(REC).filter(([key]) => key !== field))
            : { ...REC, [field]: value };
        const res = await recommend(post(body));
        expect([200, 400, 413, 415, 422, 429]).toContain(res.status);
        await res.json();
      }),
      { numRuns: 300 },
    );
  });

  it("RT-10-10 fuzz: an imported run file is parsed or rejected, never throws, never mutates prototypes", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.jsonValue().map((v) => JSON.stringify(v)),
        ),
        (text) => {
          const result = parseRunState(text);
          expect(typeof result.ok).toBe("boolean");
          expect(prototypeProbe()).toBeUndefined();
        },
      ),
      { numRuns: 500 },
    );
  });

  it("RT-10-11 a run file with hostile text in an id field is rejected before it can reach the page or a file name", () => {
    const run = newRun("ironclad");
    for (const bad of [
      { ...run, id: "<img src=x onerror=alert(1)>" },
      { ...run, id: "../../../../etc/passwd" },
      { ...run, deck: [{ id: "<script>", count: 1 }] },
      {
        ...run,
        packs: [
          { at: "x".repeat(100), source: "regular", actIndex: 0, offered: ["BASH"], picked: null },
        ],
      },
    ]) {
      expect(parseRunState(JSON.stringify(bad)).ok).toBe(false);
    }
  });

  it("RT-10-12 an import above the size cap is rejected without being parsed", () => {
    const text = JSON.stringify({ ...newRun("ironclad"), pad: "x".repeat(MAX_IMPORT_BYTES) });
    expect(parseRunState(text).ok).toBe(false);
  });
});
