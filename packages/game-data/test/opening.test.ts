import { describe, expect, it } from "vitest";

import {
  ACT1_BOSS_IDS,
  ACT1_BRIEFS,
  ACT1_VARIANTS,
  ASKS,
  OPENING_OPTIONS,
  PLAYABLE_CLASSES,
  basicCardId,
  getAct1Boss,
  getCard,
  getOpeningOption,
  resolveStepCards,
} from "../src";

/**
 * The opening Ancient's options and the two versions of Act 1 are rules facts typed by hand from the game's source, so the
 * tests pin what can be pinned: counts, ids that exist, wording limits and the shape every step must have.
 */
describe("the opening Ancient's options (STS2 main v0.107.1)", () => {
  it("lists 28 options: 20 helpful (14 always in the pool, 6 that enter it in pairs) and 8 costly", () => {
    expect(OPENING_OPTIONS).toHaveLength(28);
    expect(OPENING_OPTIONS.filter((o) => o.kind === "positive")).toHaveLength(20);
    expect(OPENING_OPTIONS.filter((o) => o.kind === "cursed")).toHaveLength(8);
    expect(
      OPENING_OPTIONS.filter(
        (o) => o.kind === "positive" && !o.offeredWhen?.includes("Takes the place"),
      ),
    ).toHaveLength(14);
    expect(new Set(OPENING_OPTIONS.map((o) => o.id)).size).toBe(28);
    for (const o of OPENING_OPTIONS) {
      expect(o.id, o.name).toMatch(/^[A-Z][A-Z0-9_]+$/);
      expect(o.name.length, o.id).toBeGreaterThan(2);
      expect(o.summary.length, o.id).toBeLessThanOrEqual(200);
      expect(o.steps.length, o.id).toBeGreaterThan(0);
      expect(getOpeningOption(o.id)).toBe(o);
    }
    expect(getOpeningOption("NOT_AN_OPTION")).toBeUndefined();
  });

  it("names only cards the catalog has, for every class", () => {
    for (const character of PLAYABLE_CLASSES) {
      for (const o of OPENING_OPTIONS) {
        for (const step of o.steps) {
          if (step.kind === "add") {
            const ids = resolveStepCards(character, step.cards);
            expect(ids.length).toBeGreaterThan(0);
            for (const id of ids) {
              expect(getCard(id), `${o.id}: ${id}`).toBeDefined();
            }
          }
        }
      }
      expect(getCard(basicCardId(character, "strike"))?.name).toBe("Strike");
      expect(getCard(basicCardId(character, "defend"))?.name).toBe("Defend");
    }
    expect(() => resolveStepCards("ironclad", ["NOT_A_CARD"])).toThrow(/does not have/);
  });

  it("describes each step well enough to build a form from it", () => {
    for (const o of OPENING_OPTIONS) {
      for (const step of o.steps) {
        switch (step.kind) {
          case "pick":
            expect(step.count, o.id).toBeGreaterThanOrEqual(1);
            expect(step.count, o.id).toBeLessThanOrEqual(3);
            expect(step.label.length, o.id).toBeGreaterThan(5);
            break;
          case "remove":
            expect(step.count, o.id).toBeGreaterThanOrEqual(1);
            expect(step.label.length, o.id).toBeGreaterThan(5);
            break;
          case "transform":
          case "upgradeChosen":
            expect(step.label.length, o.id).toBeGreaterThan(5);
            break;
          case "maxHp":
          case "hp":
            expect(Number.isInteger(step.delta) && step.delta !== 0, o.id).toBe(true);
            break;
          case "info":
            expect(step.text.length, o.id).toBeGreaterThan(5);
            break;
          case "add":
          case "upgrade":
            break;
        }
      }
    }
  });

  it("records the numbers that change the run exactly as the source has them", () => {
    const hp = (id: string, kind: "hp" | "maxHp"): number[] =>
      (getOpeningOption(id)?.steps ?? []).flatMap((s) => (s.kind === kind ? [s.delta] : []));
    expect(hp("PRECARIOUS_SHEARS", "hp")).toEqual([-16]);
    expect(hp("LEAFY_POULTICE", "maxHp")).toEqual([-12]);
    expect(hp("NUTRITIOUS_OYSTER", "maxHp")).toEqual([11]);
    const shears = getOpeningOption("PRECARIOUS_SHEARS")?.steps.find((s) => s.kind === "remove");
    expect(shears?.count).toBe(2);
    const torment = getOpeningOption("NEOWS_TORMENT")?.steps[0];
    expect(torment).toEqual({ kind: "add", cards: ["NEOWS_FURY"] });
    const hefty = getOpeningOption("HEFTY_TABLET");
    expect(hefty?.steps.some((s) => s.kind === "add" && s.cards.includes("INJURY"))).toBe(true);
  });
});

describe("the two versions of Act 1 (STS2 main v0.107.1)", () => {
  it("gives each version three elites, three bosses and its own pool of ordinary fights", () => {
    expect(ACT1_VARIANTS).toEqual(["overgrowth", "underdocks"]);
    for (const v of ACT1_VARIANTS) {
      const brief = ACT1_BRIEFS[v];
      expect(brief.variant).toBe(v);
      expect(brief.elites).toHaveLength(3);
      expect(brief.bosses).toHaveLength(3);
      expect(brief.weak).toHaveLength(4);
    }
    expect(ACT1_BRIEFS.overgrowth.normal).toHaveLength(12);
    expect(ACT1_BRIEFS.underdocks.normal).toHaveLength(10);
    expect(ACT1_BRIEFS.overgrowth.alternate).toBe(false);
    expect(ACT1_BRIEFS.underdocks.alternate).toBe(true);
  });

  it("shares no elite or boss between the versions, and every fight says what it asks of a deck", () => {
    const ids = ACT1_VARIANTS.flatMap((v) =>
      [...ACT1_BRIEFS[v].elites, ...ACT1_BRIEFS[v].bosses].map((f) => f.id),
    );
    expect(new Set(ids).size).toBe(12);
    for (const v of ACT1_VARIANTS) {
      for (const f of [...ACT1_BRIEFS[v].elites, ...ACT1_BRIEFS[v].bosses]) {
        expect(f.id, f.name).toMatch(/^[a-z]+(-[a-z]+)*$/);
        expect(f.summary.length, f.name).toBeGreaterThan(40);
        expect(f.summary.length, f.name).toBeLessThanOrEqual(420);
        expect(f.asks.length, f.name).toBeGreaterThanOrEqual(1);
        expect(f.asks.length, f.name).toBeLessThanOrEqual(3);
        for (const a of f.asks) {
          expect(ASKS).toContain(a);
        }
      }
      expect(ACT1_BRIEFS[v].elites.every((f) => f.kind === "elite")).toBe(true);
      expect(ACT1_BRIEFS[v].bosses.every((f) => f.kind === "boss")).toBe(true);
    }
  });

  it("finds a boss by version and id, and refuses a boss of the other version", () => {
    expect(ACT1_BOSS_IDS).toHaveLength(6);
    expect(getAct1Boss("overgrowth", "vantom")?.name).toBe("Vantom");
    expect(getAct1Boss("underdocks", "soul-fysh")?.name).toBe("Soul Fysh");
    expect(getAct1Boss("underdocks", "vantom")).toBeUndefined();
    expect(getAct1Boss("overgrowth", "waterfall-giant")).toBeUndefined();
  });
});
