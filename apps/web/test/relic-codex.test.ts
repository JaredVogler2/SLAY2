import { RELIC_CATALOG } from "@slay2/game-data";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_RELIC_QUERY,
  RELIC_POOL_FILTERS,
  filterRelics,
  relicCounts,
  type RelicQuery,
} from "@/lib/relic-codex";

const q = (over: Partial<RelicQuery>): RelicQuery => ({ ...DEFAULT_RELIC_QUERY, ...over });

describe("relic codex filtering", () => {
  it("lists every relic once under 'all' and counts each pool the way its filter shows it", () => {
    const counts = relicCounts();
    expect(counts.all).toBe(RELIC_CATALOG.relics.length);
    expect(filterRelics(q({})).length).toBe(counts.all);
    for (const pool of RELIC_POOL_FILTERS) {
      expect(filterRelics(q({ pool })).length, pool).toBe(counts[pool]);
    }
    // the three relics that are in both the shared and the event pool show under both filters
    expect(counts.shared + counts.event + 5 * 8 + 1 - 3).toBe(counts.all);
  });

  it("shows a class pool's own relics only", () => {
    const iron = filterRelics(q({ pool: "ironclad" }));
    expect(iron).toHaveLength(8);
    expect(iron.every((r) => r.pools.includes("ironclad"))).toBe(true);
  });

  it("ranks an exact name first and finds a relic by a fragment", () => {
    expect(filterRelics(q({ text: "anchor" }))[0]?.id).toBe("ANCHOR");
    const fragment = filterRelics(q({ text: "akab" }));
    expect(fragment[0]?.id).toBe("AKABEKO");
  });

  it("returns nothing for a nonsense query instead of everything", () => {
    expect(filterRelics(q({ text: "zzzzqqqq" }))).toEqual([]);
  });

  it("combines pool, rarity and text with AND, and sorts by name or by tier", () => {
    const rare = filterRelics(q({ rarity: "rare", pool: "shared" }));
    expect(rare.length).toBeGreaterThan(0);
    expect(rare.every((r) => r.rarity === "rare" && r.pools.includes("shared"))).toBe(true);
    const byName = filterRelics(q({ sort: "name" })).map((r) => r.name);
    expect(byName).toEqual([...byName].sort((a, b) => a.localeCompare(b)));
    const byTier = filterRelics(q({ sort: "rarity" }));
    expect(byTier[0]?.rarity).toBe("starter");
    expect(byTier.at(-1)?.rarity).toBe("none");
  });
});
