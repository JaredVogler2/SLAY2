import { CATALOG } from "@slay2/game-data";
import { describe, expect, it } from "vitest";

import {
  CODEX_CLASSES,
  DEFAULT_QUERY,
  codexClassOf,
  codexCounts,
  codexRoles,
  filterCodex,
  type CodexQuery,
} from "@/lib/codex";

const q = (over: Partial<CodexQuery>): CodexQuery => ({ ...DEFAULT_QUERY, cls: "all", ...over });

describe("codex filtering", () => {
  it("partitions the whole catalog into the codex classes (nothing lost, nothing counted twice)", () => {
    const counts = codexCounts();
    expect(counts.all).toBe(CATALOG.cards.length);
    expect(CODEX_CLASSES.reduce((sum, c) => sum + counts[c], 0)).toBe(counts.all);
    for (const c of CODEX_CLASSES) {
      expect(filterCodex(q({ cls: c })).length, c).toBe(counts[c]);
    }
    expect(filterCodex(q({})).length).toBe(counts.all);
  });

  it("puts curses, statuses and tokens under 'other', never under a playable class", () => {
    const other = filterCodex(q({ cls: "other" }));
    expect(other.length).toBeGreaterThan(0);
    expect(other.every((c) => codexClassOf(c) === "other")).toBe(true);
    expect(filterCodex(q({ cls: "ironclad" })).every((c) => c.class === "ironclad")).toBe(true);
  });

  it("ranks an exact name first, then prefixes, and finds a card by a fragment", () => {
    const hits = filterCodex(q({ text: "bash" }));
    expect(hits[0]?.id).toBe("BASH");
    const fragment = filterCodex(q({ text: "strik" }));
    expect(fragment.length).toBeGreaterThan(2);
    expect(fragment.every((c) => /strik/i.test(c.name))).toBe(true);
  });

  it("returns nothing for a nonsense query instead of everything", () => {
    expect(filterCodex(q({ text: "zzzzqqqq" }))).toEqual([]);
  });

  it("combines class, rarity, type, role and reward-pool filters with AND", () => {
    const rares = filterCodex(q({ cls: "ironclad", rarity: "rare" }));
    expect(rares.length).toBeGreaterThan(0);
    expect(rares.every((c) => c.class === "ironclad" && c.rarity === "rare")).toBe(true);
    const powers = filterCodex(q({ cls: "ironclad", type: "power" }));
    expect(powers.every((c) => c.type === "power")).toBe(true);
    const block = filterCodex(q({ cls: "silent", role: "block" }));
    expect(block.length).toBeGreaterThan(0);
    expect(block.every((c) => c.roles.includes("block"))).toBe(true);
    const pool = filterCodex(q({ cls: "defect", rewardPoolOnly: true }));
    expect(pool.every((c) => c.rewardEligible)).toBe(true);
    expect(pool.length).toBeLessThan(filterCodex(q({ cls: "defect" })).length);
  });

  it("sorts by name, by cost (X after the numbers, unplayable last) and by rarity", () => {
    const byName = filterCodex(q({ cls: "silent", sort: "name" })).map((c) => c.name);
    expect(byName).toEqual([...byName].sort((a, b) => a.localeCompare(b)));
    const costs = filterCodex(q({ cls: "ironclad", sort: "cost" })).map((c) => c.cost);
    const key = (c: number | "X" | null): number => (c === null ? 100 : c === "X" ? 50 : c);
    expect(costs.map(key)).toEqual([...costs.map(key)].sort((a, b) => a - b));
    const order = ["basic", "common", "uncommon", "rare"];
    const rarities = filterCodex(q({ cls: "ironclad", sort: "rarity" })).map((c) =>
      order.indexOf(c.rarity),
    );
    const known = rarities.filter((r) => r >= 0);
    expect(known).toEqual([...known].sort((a, b) => a - b));
  });

  it("is deterministic", () => {
    const a = filterCodex(q({ text: "strike", sort: "cost" })).map((c) => c.id);
    const b = filterCodex(q({ text: "strike", sort: "cost" })).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it("offers only roles that enough cards carry, most common first", () => {
    const roles = codexRoles();
    expect(roles.length).toBeGreaterThan(8);
    expect(roles).toContain("damage");
    expect(new Set(roles).size).toBe(roles.length);
  });
});
