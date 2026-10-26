import { describe, expect, it } from "vitest";

import { ACT1_BRIEFS, ACT1_VARIANTS, starterDeck } from "@slay2/game-data";

import {
  InvalidDraftRequestError,
  MAX_TILT,
  actContextTilt,
  evaluateDraft,
  type DraftRequest,
} from "../src/index";

function request(over: Partial<DraftRequest> = {}): DraftRequest {
  return {
    build: "sts2-main-0.107.1",
    character: "ironclad",
    ascension: 0,
    actIndex: 0,
    deck: starterDeck("ironclad"),
    offered: ["THUNDERCLAP", "SHRUG_IT_OFF", "SWORD_BOOMERANG", "POMMEL_STRIKE", "INFLAME"],
    source: "regular",
    riskPreference: "balanced",
    ...over,
  };
}

describe("Act 1 context: the tilt", () => {
  it("is bounded, and every version tilts something, naming the fights behind a rise", () => {
    for (const variant of ACT1_VARIANTS) {
      for (const boss of [null, ...ACT1_BRIEFS[variant].bosses.map((b) => b.id)]) {
        const tilt = actContextTilt({ variant, boss });
        expect(tilt.adjustments.length, `${variant} ${String(boss)}`).toBeGreaterThan(0);
        for (const m of Object.values(tilt.multipliers)) {
          expect(m).toBeGreaterThanOrEqual(1 - MAX_TILT - 1e-9);
          expect(m).toBeLessThanOrEqual(1 + MAX_TILT + 1e-9);
        }
        for (const a of tilt.adjustments) {
          // a rise is explained by the fights that ask for it; a fall is "fewer of its fights ask for it than the average"
          expect(a.because.length > 0, `${variant} ${String(boss)} ${a.group}`).toBe(
            a.multiplier > 1,
          );
        }
      }
    }
  });

  it("is relative to the average Act 1: what every fight asks for does not move the weights", () => {
    // block is asked by four of the six elites and bosses of each version; the first version of this tilt raised it by the
    // full 30 % for either, which says nothing about which Act 1 the player is in
    const over = actContextTilt({ variant: "overgrowth", boss: null });
    const under = actContextTilt({ variant: "underdocks", boss: null });
    expect(over.multipliers.block).toBeGreaterThan(1);
    expect(under.multipliers.block).toBeLessThan(1);
    // with the boss unknown the two versions are the two halves of the average, so they are mirror images
    for (const g of Object.keys(over.multipliers) as (keyof typeof over.multipliers)[]) {
      expect(over.multipliers[g] - 1, g).toBeCloseTo(-(under.multipliers[g] - 1), 9);
    }
    // and the size is a few percent, not the cap: Underdocks asks for scaling in three of its six fights, Overgrowth for none
    expect(under.multipliers.scaling).toBeCloseTo(1.105, 3);
    expect(over.multipliers.block).toBeCloseTo(1.1, 3);
    expect(Math.max(...Object.values(over.multipliers).map((m) => Math.abs(m - 1)))).toBeLessThan(
      0.15,
    );
  });

  it("differs between the two versions, which is the point of asking", () => {
    const over = actContextTilt({ variant: "overgrowth", boss: null });
    const under = actContextTilt({ variant: "underdocks", boss: null });
    expect(over.multipliers).not.toEqual(under.multipliers);
    // Underdocks' Skulking Colony, Waterfall Giant and Lagavulin Matriarch ask for scaling and set-up; Overgrowth has none
    const scaling = under.adjustments.find((a) => a.group === "scaling");
    expect(scaling?.because).toContain("Skulking Colony");
    expect(over.adjustments.find((a) => a.group === "scaling")?.because).toEqual([]);
    // Overgrowth's elites and bosses burst more and block more
    expect(over.adjustments.find((a) => a.group === "damage")?.because.length).toBeGreaterThan(0);
  });

  it("counts a boss the player has seen three times as much as an unknown one", () => {
    const unknown = actContextTilt({ variant: "overgrowth", boss: null });
    const kin = actContextTilt({ variant: "overgrowth", boss: "the-kin" });
    expect(kin.boss?.name).toBe("The Kin");
    // the Kin is a single-target fight: it lowers the weight of area damage relative to the average of the three bosses
    expect(kin.multipliers.aoe).toBeLessThan(unknown.multipliers.aoe);
    // the Ceremonial Beast must be burst down to its stun threshold: it asks for damage more than the average boss does
    const beast = actContextTilt({ variant: "overgrowth", boss: "ceremonial-beast" });
    expect(beast.multipliers.damage).toBeGreaterThan(unknown.multipliers.damage);
  });

  it("ignores a boss that is not in the version rather than guessing", () => {
    expect(actContextTilt({ variant: "overgrowth", boss: "soul-fysh" }).boss).toBeNull();
  });
});

describe("Act 1 context: the advisor", () => {
  it("changes nothing when no context is given, and says what is missing", () => {
    const r = evaluateDraft(request());
    expect(r.actContext).toBeUndefined();
    expect(r.missingInputs.join(" ")).toContain("Which Act 1 you are in");
    expect(r.ranking.some((o) => o.reasons.some((x) => x.kind === "context"))).toBe(false);
  });

  it("adds the context as its own line, so the lines still add up to the index", () => {
    const plain = evaluateDraft(request());
    const withCtx = evaluateDraft(request({ actContext: { variant: "underdocks", boss: null } }));
    expect(withCtx.actContext?.applied).toBe(true);
    expect(withCtx.missingInputs.join(" ")).not.toContain("Which Act 1 you are in");
    expect(withCtx.assumptions.join(" ")).toContain("Act 1 context (Underdocks");
    let seenContext = false;
    for (const o of withCtx.ranking) {
      const key = o.action.kind === "skip" ? "skip" : o.action.cardId;
      const before = plain.ranking.find(
        (p) => (p.action.kind === "skip" ? "skip" : p.action.cardId) === key,
      );
      const ctxReason = o.reasons.find((x) => x.kind === "context");
      if (ctxReason) {
        seenContext = true;
        expect(o.indexDelta - (before?.indexDelta ?? 0)).toBeCloseTo(ctxReason.delta, 9);
        expect(ctxReason.text).toContain("Act 1 context (Underdocks)");
      } else {
        expect(Math.abs(o.indexDelta - (before?.indexDelta ?? 0))).toBeLessThan(0.05);
      }
    }
    expect(seenContext).toBe(true);
  });

  it("can change which card is called best, in the direction the fights ask for", () => {
    // with many area-damage cards on offer, a version that asks for more area damage moves them up the ranking
    const only = { offered: ["THUNDERCLAP", "POMMEL_STRIKE"] };
    const gap = (variant: "overgrowth" | "underdocks", boss: string | null) => {
      const r = evaluateDraft(request({ ...only, actContext: { variant, boss } }));
      const get = (id: string) =>
        r.ranking.find((o) => o.action.kind === "pick" && o.action.cardId === id)?.indexDelta ?? 0;
      return get("THUNDERCLAP") - get("POMMEL_STRIKE");
    };
    const plain = evaluateDraft(request(only));
    const plainGap =
      (plain.ranking.find((o) => o.action.kind === "pick" && o.action.cardId === "THUNDERCLAP")
        ?.indexDelta ?? 0) -
      (plain.ranking.find((o) => o.action.kind === "pick" && o.action.cardId === "POMMEL_STRIKE")
        ?.indexDelta ?? 0);
    // the Kin is a fight to focus one enemy in; Phantasmal Gardeners are four
    expect(gap("overgrowth", "the-kin")).toBeLessThan(gap("underdocks", null));
    expect(gap("underdocks", null)).not.toBeCloseTo(plainGap, 6);
  });

  it("refuses a boss of the other version, and ignores the context in later acts with a warning", () => {
    expect(() =>
      evaluateDraft(request({ actContext: { variant: "underdocks", boss: "vantom" } })),
    ).toThrow(InvalidDraftRequestError);
    const later = evaluateDraft(
      request({ actIndex: 1, actContext: { variant: "underdocks", boss: null } }),
    );
    expect(later.actContext?.applied).toBe(false);
    expect(later.warnings.join(" ")).toContain("ignored");
    const noCtx = evaluateDraft(request({ actIndex: 1 }));
    expect(later.ranking.map((o) => o.indexDelta)).toEqual(noCtx.ranking.map((o) => o.indexDelta));
  });

  it("is deterministic, and its digest depends on the context", () => {
    const a = evaluateDraft(request({ actContext: { variant: "overgrowth", boss: "vantom" } }));
    const b = evaluateDraft(request({ actContext: { variant: "overgrowth", boss: "vantom" } }));
    const c = evaluateDraft(request({ actContext: { variant: "underdocks", boss: null } }));
    expect(a).toEqual(b);
    expect(a.stateDigest).not.toBe(c.stateDigest);
    expect(a.stateDigest).not.toBe(evaluateDraft(request()).stateDigest);
  });
});
