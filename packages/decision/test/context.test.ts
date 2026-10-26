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
  it("is bounded, and every version tilts something", () => {
    for (const variant of ACT1_VARIANTS) {
      for (const boss of [null, ...ACT1_BRIEFS[variant].bosses.map((b) => b.id)]) {
        const tilt = actContextTilt({ variant, boss });
        expect(tilt.adjustments.length, `${variant} ${String(boss)}`).toBeGreaterThan(0);
        for (const m of Object.values(tilt.multipliers)) {
          expect(m).toBeGreaterThanOrEqual(1 - MAX_TILT - 1e-9);
          expect(m).toBeLessThanOrEqual(1 + MAX_TILT + 1e-9);
        }
        for (const a of tilt.adjustments) {
          expect(a.because.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("differs between the two versions, which is the point of asking", () => {
    const over = actContextTilt({ variant: "overgrowth", boss: null });
    const under = actContextTilt({ variant: "underdocks", boss: null });
    expect(over.multipliers).not.toEqual(under.multipliers);
    // Underdocks' Phantasmal Gardeners are four enemies and its pool has no multi-enemy boss; Overgrowth has Phrog Parasite's spawn
    expect(under.adjustments.find((a) => a.group === "block")?.because).toContain("Terror Eel");
    expect(over.adjustments.find((a) => a.group === "aoe")?.because).toContain("Phrog Parasite");
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
