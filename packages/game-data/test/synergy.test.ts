import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  CATALOG,
  MECHANIC_IDS,
  MECHANICS,
  PLAYABLE_CLASSES,
  SYNERGY,
  getCard,
  benefitsFrom,
  hasWrittenTags,
  rewardPool,
  synergyTags,
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

function tags(id: string) {
  const card = getCard(id);
  if (!card) throw new Error(`no card ${id}`);
  return synergyTags(card);
}

describe("the synergy tags (SLAY2's judgement of how cards work together)", () => {
  it("are the file they say they are: the hash covers the mechanics and the cards", () => {
    const digest = createHash("sha256")
      .update(canonical({ mechanics: SYNERGY.mechanics, cards: SYNERGY.cards }))
      .digest("hex");
    expect(digest).toBe(SYNERGY.sha256);
  });

  it("name only cards the catalog has, and only mechanics of the vocabulary", () => {
    const ids = new Set(CATALOG.cards.map((c) => c.id));
    const unknown = Object.keys(SYNERGY.cards).filter((id) => !ids.has(id));
    expect(unknown).toEqual([]);
    expect(Object.keys(MECHANICS).sort()).toEqual([...MECHANIC_IDS].sort());
  });

  it("cover most of every class's reward cards (the rest are plain: attacks, blocks and stats)", () => {
    for (const cls of PLAYABLE_CLASSES) {
      const pool = rewardPool(cls);
      const written = pool.filter((c) => hasWrittenTags(c.id)).length;
      expect(
        written / pool.length,
        `${cls}: ${String(written)} of ${String(pool.length)}`,
      ).toBeGreaterThan(0.7);
    }
  });

  it("leave no mechanic without a card that provides it and a card that depends on it", () => {
    for (const m of MECHANIC_IDS) {
      const givers = CATALOG.cards.filter((c) => (synergyTags(c).gives[m] ?? 0) > 0);
      const takers = CATALOG.cards.filter((c) => (synergyTags(c).wants[m] ?? 0) > 0);
      expect(givers.length, `${m} has no source`).toBeGreaterThan(0);
      // a scaler (Strength, Dexterity, Focus) is a payoff for a whole kind of card, not for a few listed ones
      const scales = CATALOG.cards.filter((c) =>
        (benefitsFrom(c) as readonly string[]).includes(m),
      );
      expect(takers.length + scales.length, `${m} has no payoff`).toBeGreaterThan(0);
    }
  });

  it("count what the catalog says by itself: types, costs, names, keywords and the block role", () => {
    expect(tags("STRIKE_IRONCLAD").gives).toMatchObject({ attack: 1, cheap: 1, strike: 1 });
    expect(tags("DEFEND_IRONCLAD").gives).toMatchObject({ skill: 1, cheap: 1, block: 1 });
    expect(tags("INFLAME").gives).toMatchObject({ power: 1, strength: 2 });
    expect(tags("IMPERVIOUS").gives.exhaust).toBeGreaterThanOrEqual(1);
    expect(tags("DEFILE").gives.ethereal).toBeGreaterThanOrEqual(1);
    expect(tags("FLICK_FLACK").wants.discard).toBeGreaterThanOrEqual(2);
    // free cards are free and cheap; an X-cost card is neither (its cost is whatever energy is left)
    expect(tags("SLICE").gives).toMatchObject({ zero_cost: 1, cheap: 1 });
    expect(tags("WHIRLWIND").gives.cheap).toBeUndefined();
    // an unplayable card is not a cheap card
    expect(tags("WOUND").gives.cheap).toBeUndefined();
  });

  it("say who a scaler helps: attacks, cards that give Block, orb cards, and not a card that already needs it", () => {
    const benefits = (id: string) => {
      const c = getCard(id);
      if (!c) throw new Error(`no card ${id}`);
      return benefitsFrom(c);
    };
    expect(benefits("STRIKE_IRONCLAD")).toEqual(["strength"]);
    expect(benefits("DEFEND_IRONCLAD")).toEqual(["dexterity"]);
    expect(benefits("BALL_LIGHTNING")).toEqual(["strength", "focus"]);
    // a multi-hit attack lists Strength as a need, so it is not counted twice
    expect(benefits("TWIN_STRIKE")).toEqual([]);
    expect(benefits("INFLAME")).toEqual([]);
  });

  it("agree with what the cards are known to do (spot facts, one per mechanic that matters)", () => {
    const wants = (id: string, m: (typeof MECHANIC_IDS)[number]) => tags(id).wants[m] ?? 0;
    const gives = (id: string, m: (typeof MECHANIC_IDS)[number]) => tags(id).gives[m] ?? 0;
    // Ironclad
    expect(wants("FEEL_NO_PAIN", "exhaust")).toBe(3);
    expect(wants("DARK_EMBRACE", "exhaust")).toBe(3);
    expect(gives("BURNING_PACT", "exhaust")).toBeGreaterThanOrEqual(2);
    expect(wants("BODY_SLAM", "block")).toBe(3);
    expect(wants("JUGGERNAUT", "block")).toBe(3);
    expect(gives("INFLAME", "strength")).toBeGreaterThanOrEqual(2);
    expect(wants("TWIN_STRIKE", "strength")).toBeGreaterThanOrEqual(2);
    expect(wants("PERFECTED_STRIKE", "strike")).toBe(3);
    // Silent
    expect(wants("ACCURACY", "shiv")).toBe(3);
    expect(gives("BLADE_DANCE", "shiv")).toBe(3);
    expect(gives("NOXIOUS_FUMES", "poison")).toBe(3);
    expect(wants("OUTBREAK", "poison")).toBe(3);
    expect(wants("MEMENTO_MORI", "discard")).toBe(3);
    // Regent
    expect(gives("FURNACE", "forge")).toBe(3);
    expect(wants("PARRY", "forge")).toBe(3);
    expect(gives("GENESIS", "star")).toBe(3);
    expect(wants("COMET", "star")).toBe(3);
    expect(wants("PILLAR_OF_CREATION", "create")).toBe(3);
    // Necrobinder
    expect(gives("REANIMATE", "osty")).toBe(3);
    expect(wants("FLATTEN", "osty")).toBe(3);
    expect(gives("COUNTDOWN", "doom")).toBe(3);
    expect(wants("TIMES_UP", "doom")).toBe(3);
    expect(wants("PULL_FROM_BELOW", "ethereal")).toBe(3);
    // Defect
    expect(gives("DEFRAGMENT", "focus")).toBe(3);
    expect(wants("LOOP", "orb")).toBe(3);
    expect(gives("SPINNER", "orb")).toBe(3);
    expect(wants("STORM", "power")).toBe(3);
    // a card that takes a mechanic away says so
    expect(gives("HYPERBEAM", "focus")).toBeLessThan(0);
  });

  it("never write a weight that the schema forbids (a typo in the file fails the build, not the page)", () => {
    for (const [id, entry] of Object.entries(SYNERGY.cards)) {
      for (const w of Object.values(entry.w ?? {})) expect(w, id).toBeGreaterThanOrEqual(1);
      for (const g of Object.values(entry.g ?? {})) expect(g, id).not.toBe(0);
    }
  });
});
