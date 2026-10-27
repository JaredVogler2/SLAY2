import { describe, expect, it } from "vitest";

import {
  PLAYABLE_CLASSES,
  RELIC_CATALOG,
  RELIC_POOLS,
  RELIC_RARITIES,
  characterFacts,
  getRelic,
  searchRelics,
} from "../src/index";

describe("relic catalog integrity", () => {
  it("has 296 unique relics for build 0.107.1 and a content hash", () => {
    expect(RELIC_CATALOG.build).toBe("sts2-main-0.107.1");
    expect(RELIC_CATALOG.relics).toHaveLength(296);
    expect(new Set(RELIC_CATALOG.relics.map((r) => r.id)).size).toBe(296);
    expect(new Set(RELIC_CATALOG.relics.map((r) => r.name)).size).toBe(296);
    expect(RELIC_CATALOG.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stores facts only: an id, a name, a tier and the pools, nothing about what a relic does", () => {
    for (const r of RELIC_CATALOG.relics) {
      expect(Object.keys(r).sort(), r.id).toEqual(["id", "name", "pools", "rarity"]);
    }
  });

  it("names the two third-party sources by pinned SHA", () => {
    expect(RELIC_CATALOG.provenance.sources.map((s) => s.id).sort()).toEqual([
      "spire-archive",
      "sts2-rl-agent",
    ]);
    for (const s of RELIC_CATALOG.provenance.sources) {
      expect(s.sha).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it("counts the tiers and the pools of the build", () => {
    const byRarity = Object.fromEntries(
      RELIC_RARITIES.map((t) => [t, RELIC_CATALOG.relics.filter((r) => r.rarity === t).length]),
    );
    expect(byRarity).toEqual({
      starter: 10,
      common: 30,
      uncommon: 40,
      rare: 50,
      shop: 30,
      ancient: 100,
      event: 35,
      none: 1,
    });
    const byPool = Object.fromEntries(
      RELIC_POOLS.map((p) => [p, RELIC_CATALOG.relics.filter((r) => r.pools.includes(p)).length]),
    );
    expect(byPool).toEqual({
      ironclad: 8,
      silent: 8,
      regent: 8,
      necrobinder: 8,
      defect: 8,
      shared: 118,
      event: 140,
      fallback: 1,
    });
  });

  it("lists each class's starting relic as a starter in the class's own pool", () => {
    for (const cls of PLAYABLE_CLASSES) {
      for (const start of characterFacts(cls).startingRelics) {
        const relic = getRelic(start.id);
        expect(relic, `${cls} ${start.id}`).toBeDefined();
        expect(relic?.rarity).toBe("starter");
        expect(relic?.pools).toContain(cls);
        expect(relic?.name).toBe(start.name);
      }
    }
  });
});

describe("relic search", () => {
  it("finds a relic by name, by id and by a few letters of it", () => {
    expect(searchRelics("Anchor")[0]?.id).toBe("ANCHOR");
    expect(searchRelics("art of war")[0]?.id).toBe("ART_OF_WAR");
    expect(searchRelics("akab")[0]?.id).toBe("AKABEKO");
    expect(searchRelics("zzzzqq")).toEqual([]);
  });

  it("filters by pool and tier and lists in name order for an empty query", () => {
    const iron = searchRelics("", { pools: ["ironclad"], limit: 50 });
    expect(iron).toHaveLength(8);
    expect(iron.map((r) => r.name)).toEqual(iron.map((r) => r.name).toSorted());
    const rare = searchRelics("", { rarities: ["rare"], limit: 100 });
    expect(rare).toHaveLength(50);
    expect(rare.every((r) => r.rarity === "rare")).toBe(true);
  });
});
