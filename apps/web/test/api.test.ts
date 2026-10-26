/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any --
   these tests read untyped JSON responses on purpose: the HTTP contract is what is under test */
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { rateLimit } from "@/lib/api";
import { POST as odds } from "@/app/api/v1/odds/route";
import { POST as recommend } from "@/app/api/v1/recommend/route";
import { GET as health } from "@/app/api/v1/health/route";
import { GET as capabilities } from "@/app/api/v1/capabilities/route";
import { GET as manifest } from "@/app/api/v1/manifest/route";
import { GET as catalog } from "@/app/api/v1/catalog/cards/route";
import { GET as experiments } from "@/app/api/v1/experiments/route";

function post(body: unknown, init: { type?: string; raw?: string; ip?: string } = {}): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: {
      "content-type": init.type ?? "application/json",
      "x-forwarded-for":
        init.ip ??
        `10.0.${String(Math.floor(Math.random() * 250))}.${String(Math.floor(Math.random() * 250))}`,
    },
    body: init.raw ?? JSON.stringify(body),
  });
}

async function json(res: Response): Promise<any> {
  return res.json();
}

const RARITY = {
  calculator: "rarity",
  build: "sts2-main-0.107.1",
  ascension: 0,
  source: "regular",
} as const;

describe("GET endpoints", () => {
  it("health reports the supported build and methods", async () => {
    const body = await json(health());
    expect(body).toMatchObject({
      status: "ok",
      schema: 1,
      supportedBuilds: ["sts2-main-0.107.1"],
      methods: ["exact", "heuristic"],
    });
  });

  it("capabilities states coverage with statuses, never blanket support", async () => {
    const res = capabilities();
    expect(res.headers.get("cache-control")).toContain("max-age");
    const body = await json(res);
    expect(body.modes).toEqual({ solo: "supported", coop: "unsupported" });
    expect(body.ascension.max).toBe(10);
    expect(body.acts).toBe(3);
    expect(body.builds.find((b: { id: string }) => b.id === "sts2-beta-0.111.0").support).toBe(
      "unsupported",
    );
    expect(body.characters).toHaveLength(5);
    for (const c of body.characters) {
      expect(c.cardAdvisor.status).toBe("heuristic-v0");
      expect(c.cardAdvisor.calibrated).toBe(false);
      expect(c.cardAdvisor.roleTagCoverage.share).toBeGreaterThan(0.3);
    }
    const planned = body.features
      .filter((f: { status: string }) => f.status === "planned")
      .map((f: { id: string }) => f.id);
    expect(planned).toContain("advisor.combat");
  });

  it("manifest exposes the catalog hash and the beta flag", async () => {
    const body = await json(manifest());
    expect(body.build.steamBuildId).toBe("23811903");
    expect(body.data.cardCatalog.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(body.data.cardCatalog.cards).toBe(577);
    expect(body.updateFlags.betaBuild.support).toBe("unsupported");
  });

  it("catalog search validates its parameters", async () => {
    const ok = await json(
      await catalog(new Request("http://localhost/api/v1/catalog/cards?q=bash&limit=3")),
    );
    expect(ok.cards[0].id).toBe("BASH");
    expect(ok.cards.length).toBeLessThanOrEqual(3);
    const bad = await catalog(new Request("http://localhost/api/v1/catalog/cards?limit=500"));
    expect(bad.status).toBe(400);
    expect((await json(bad)).error.code).toBe("invalid_request");
    expect(
      (await catalog(new Request("http://localhost/api/v1/catalog/cards?class=watcher"))).status,
    ).toBe(400);
  });

  it("experiments returns only real, checksummed reports", async () => {
    const body = await json(experiments());
    expect(body.reports.length).toBeGreaterThan(0);
    for (const r of body.reports) {
      expect(r.contentSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(r.simulator.parityWithLiveGame).toBe("UNVERIFIED");
      expect(r.completed).toBeGreaterThan(0);
      expect(r.role).toMatch(/development|held-out/);
    }
    expect(body.simulatorGaps.map((g: { id: string }) => g.id)).toContain(
      "G1-double-boss-not-entered",
    );
  });
});

describe("POST /api/v1/odds", () => {
  it("returns exact rarity odds that match the published figures", async () => {
    const res = await odds(post({ ...RARITY, counter: 0 }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.method).toBe("exact");
    expect(body.atLeastOneRare).toMatchObject({ n: "0", d: "1", approx: 0 });
    expect(body.firstCard.uncommon.approx).toBeCloseTo(0.35, 12);
    const elite = await json(await odds(post({ ...RARITY, source: "elite", counter: 0 })));
    expect((elite.atLeastOneRare.approx * 100).toFixed(2)).toBe("16.95");
    expect(elite.provenance.ruleIds).toContain("CARD-1");
  });

  it("infers the counter from a history, exactly", async () => {
    const body = await json(
      await odds(
        post({
          ...RARITY,
          history: [
            { source: "regular", rares: 0 },
            { source: "regular", rares: 0 },
          ],
        }),
      ),
    );
    expect(body.counterKnowledge).toBe("history");
    expect(body.posterior).toEqual([{ value: 6, probability: { n: "1", d: "1", approx: 1 } }]);
  });

  it("answers potion, '?' room, draw, price, removal and gold questions", async () => {
    const potion = await json(
      await odds(
        post({
          calculator: "potion",
          build: "sts2-main-0.107.1",
          history: [{ room: "monster", dropped: false }],
          upcoming: ["monster", "elite"],
        }),
      ),
    );
    expect(potion.nextDrop.monster.approx).toBeCloseTo(0.5, 12);
    const room = await json(
      await odds(post({ calculator: "unknown_room", build: "sts2-main-0.107.1" })),
    );
    expect(room.next.event.approx).toBeCloseTo(0.85, 12);
    const draw = await json(
      await odds(post({ calculator: "draw", pile: 10, targets: 1, draws: 5 })),
    );
    expect(draw.probability.approx).toBeCloseTo(0.5, 12);
    const reshuffle = await json(
      await odds(
        post({
          calculator: "draw",
          pile: 3,
          targets: 1,
          draws: 5,
          discard: { size: 20, targets: 2 },
        }),
      ),
    );
    expect(reshuffle.probability.approx).toBe(1);
    const price = await json(
      await odds(
        post({
          calculator: "price",
          build: "sts2-main-0.107.1",
          item: { kind: "card", rarity: "common" },
        }),
      ),
    );
    expect([price.min, price.max]).toEqual([48, 52]);
    expect(
      (await json(await odds(post({ calculator: "removal", ascension: 6, removals: 2 })))).cost,
    ).toBe(200);
    expect(
      await json(await odds(post({ calculator: "gold", ascension: 3, room: "elite" }))),
    ).toMatchObject({ min: 26, max: 33 });
  });

  it("rejects malformed input with the documented 400 envelope", async () => {
    const res = await odds(post({ ...RARITY, ascension: 11, counter: 3 }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.details[0].path).toBe("ascension");
    expect((await odds(post({ calculator: "nope" }))).status).toBe(400);
    expect((await odds(post({ ...RARITY, counter: 1, history: [] }))).status).toBe(400);
    expect((await odds(post({ ...RARITY, counter: 1, hacker: true }))).status).toBe(400);
    expect((await odds(post({ calculator: "draw", pile: 5, targets: 9, draws: 1 }))).status).toBe(
      400,
    );
    expect((await odds(post({ calculator: "draw", pile: 5, targets: 1, draws: 9 }))).status).toBe(
      400,
    );
  });

  it("returns 422 for unsupported builds and impossible histories", async () => {
    const beta = await odds(post({ ...RARITY, build: "sts2-beta-0.111.0", counter: 0 }));
    expect(beta.status).toBe(422);
    expect((await json(beta)).error.code).toBe("unsupported_build");
    const impossible = await odds(post({ ...RARITY, history: [{ source: "regular", rares: 1 }] }));
    expect(impossible.status).toBe(422);
    expect((await json(impossible)).error.code).toBe("impossible_history");
  });

  it("enforces content type, JSON syntax and the body size cap", async () => {
    expect((await odds(post({}, { type: "text/plain", raw: "x" }))).status).toBe(415);
    expect((await odds(post({}, { raw: "{not json" }))).status).toBe(400);
    const big = await odds(post({}, { raw: JSON.stringify({ pad: "x".repeat(70_000) }) }));
    expect(big.status).toBe(413);
    expect((await json(big)).error.code).toBe("payload_too_large");
  });
});

describe("POST /api/v1/recommend", () => {
  const request = {
    build: "sts2-main-0.107.1",
    character: "ironclad",
    ascension: 0,
    actIndex: 0,
    deck: [
      { id: "STRIKE_IRONCLAD", count: 5 },
      { id: "DEFEND_IRONCLAD", count: 4 },
      { id: "BASH", count: 1 },
    ],
    offered: ["POMMEL_STRIKE", "INFLAME", "OFFERING"],
    source: "regular",
    riskPreference: "balanced",
  };

  it("returns a labelled heuristic recommendation with only legal actions", async () => {
    const res = await recommend(post(request));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toMatchObject({
      method: "heuristic",
      calibrated: false,
      policyVersion: "draft-heuristic-v0",
    });
    expect(body.legalActions).toHaveLength(4);
  });

  it("maps validation and build errors", async () => {
    const bad = await recommend(post({ ...request, offered: ["NOT_A_CARD"] }));
    expect(bad.status).toBe(400);
    expect((await json(bad)).error.details[0].path).toBe("offered");
    expect((await recommend(post({ ...request, build: "sts2-beta-0.111.0" }))).status).toBe(422);
    expect((await recommend(post({ ...request, extra: 1 }))).status).toBe(400);
  });
});

describe("rate limiter", () => {
  it("allows a burst, then refuses, then refills", () => {
    const t0 = 1_000_000;
    let allowed = 0;
    for (let i = 0; i < 20; i += 1) {
      if (rateLimit("t", 10, t0)) allowed += 1;
    }
    expect(allowed).toBe(10);
    expect(rateLimit("t", 10, t0 + 30_000)).toBe(true);
  });
});
