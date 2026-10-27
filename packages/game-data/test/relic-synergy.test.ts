import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  MECHANIC_IDS,
  RELIC_CATALOG,
  RELIC_SYNERGY,
  getRelic,
  hasRelicTags,
  relicEffects,
  relicSupply,
  relicTags,
  resolveRelics,
} from "../src";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

describe("the relic synergy tags (SLAY2's judgement of what a relic provides to a deck)", () => {
  it("are the file they say they are: the hash covers the relics", () => {
    const digest = createHash("sha256")
      .update(canonical({ relics: RELIC_SYNERGY.relics }))
      .digest("hex");
    expect(digest).toBe(RELIC_SYNERGY.sha256);
  });

  it("name only relics of the catalog, only mechanics of the card table, and no starting relic", () => {
    for (const [id, tags] of Object.entries(RELIC_SYNERGY.relics)) {
      const relic = getRelic(id);
      expect(relic, id).toBeDefined();
      expect(
        relic?.rarity,
        `${id} is a starting relic: the card table's innate supply counts it`,
      ).not.toBe("starter");
      expect(Object.keys(tags), id).toEqual(["g"]);
      for (const m of Object.keys(tags.g)) {
        expect(MECHANIC_IDS as readonly string[], `${id}.${m}`).toContain(m);
      }
    }
  });

  it("tag the relics the two readings and their reconciliation say they do (the counts are the file's own)", () => {
    const n = Object.keys(RELIC_SYNERGY.relics).length;
    const reconciliation = RELIC_SYNERGY.provenance.reconciliation as Record<string, number>;
    expect(reconciliation.tagged).toBe(n);
    expect(reconciliation.relics).toBe(RELIC_CATALOG.relics.length);
    expect(n).toBeGreaterThan(50);
    expect(n).toBeLessThan(RELIC_CATALOG.relics.length / 2);
  });

  it("say what well-known relics provide, read from what the relics do", () => {
    const gives = (id: string) => relicTags(id).gives;
    expect(gives("VAJRA").strength).toBeGreaterThan(0);
    expect(gives("ODDLY_SMOOTH_STONE").dexterity).toBeGreaterThan(0);
    expect(gives("DATA_DISK").focus).toBeGreaterThan(0);
    expect(gives("BAG_OF_MARBLES").vulnerable).toBeGreaterThan(0);
    expect(gives("RED_MASK").weak).toBeGreaterThan(0);
    expect(gives("TWISTED_FUNNEL").poison).toBeGreaterThan(0);
    expect(gives("NINJA_SCROLL").shiv).toBeGreaterThan(0);
    expect(gives("SYMBIOTIC_VIRUS").orb).toBeGreaterThan(0);
    expect(gives("LUNAR_PASTRY").star).toBeGreaterThan(0);
    expect(gives("FUNERARY_MASK").soul).toBeGreaterThan(0);
    expect(gives("LANTERN").energy).toBeGreaterThan(0);
    expect(gives("BAG_OF_PREPARATION").draw).toBeGreaterThan(0);
    // a relic that takes the mechanic away is written negative
    expect(gives("BIG_MUSHROOM").draw).toBeLessThan(0);
  });

  it("leave out the relics that say nothing about a deck's mechanics, and the ones that cannot supply what they multiply", () => {
    for (const id of [
      "AMETHYST_AUBERGINE", // gold
      "BURNING_BLOOD", // a starting relic
      "SNECKO_SKULL", // adds to Poison applications it cannot make
      "RUINED_HELMET", // doubles Strength it cannot supply
      "ORICHALCUM", // Block at the end of a turn that has none
    ]) {
      expect(hasRelicTags(id), id).toBe(false);
      expect(relicTags(id).gives, id).toEqual({});
    }
  });

  it("read nothing from an id that only exists on every object (constructor, __proto__ ...)", () => {
    for (const id of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
      expect(hasRelicTags(id), id).toBe(false);
      expect(relicTags(id).gives, id).toEqual({});
      expect(relicEffects(id), id).toEqual({ provides: [], takesAway: [] });
    }
  });

  it("say what a relic provides and what it takes away, from the sign of what the table wrote", () => {
    expect(relicEffects("VAJRA")).toEqual({ provides: ["strength"], takesAway: [] });
    expect(relicEffects("BIG_MUSHROOM")).toEqual({ provides: [], takesAway: ["draw"] });
    expect(relicEffects("AMETHYST_AUBERGINE")).toEqual({ provides: [], takesAway: [] });
    // every written entry has an effect, and the only one that takes a mechanic away is the one the table says
    const taking = Object.keys(RELIC_SYNERGY.relics).filter(
      (id) => relicEffects(id).takesAway.length > 0,
    );
    expect(taking).toEqual(["BIG_MUSHROOM"]);
    for (const id of Object.keys(RELIC_SYNERGY.relics)) {
      const { provides, takesAway } = relicEffects(id);
      expect(provides.length + takesAway.length, id).toBeGreaterThan(0);
    }
  });

  it("add up what the relics provide, each relic once, and ignore an id the catalog does not know", () => {
    const one = relicSupply(["VAJRA"]);
    expect(one.strength).toBe(relicTags("VAJRA").gives.strength);
    expect(relicSupply(["VAJRA", "VAJRA"])).toEqual(one);
    expect(relicSupply(["VAJRA", "NOT_A_RELIC"])).toEqual(one);
    expect(relicSupply([]).strength).toBe(0);
    const both = relicSupply(["VAJRA", "SWORD_OF_JADE"]);
    expect(both.strength).toBe(
      (relicTags("VAJRA").gives.strength ?? 0) + (relicTags("SWORD_OF_JADE").gives.strength ?? 0),
    );
    expect(resolveRelics(["VAJRA", "NOT_A_RELIC", "VAJRA"])).toEqual({
      known: ["VAJRA"],
      unknown: ["NOT_A_RELIC"],
    });
  });
});
