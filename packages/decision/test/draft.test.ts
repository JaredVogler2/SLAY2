import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  CATALOG,
  getCard,
  rewardPool,
  starterDeck,
  ALL_UNLOCKED,
  type PlayableClass,
  PLAYABLE_CLASSES,
} from "@slay2/game-data";
import { UnsupportedBuildError } from "@slay2/game-schema";

import { InvalidDraftRequestError, evaluateDraft, type DraftRequest } from "../src/index";

function request(over: Partial<DraftRequest> = {}): DraftRequest {
  return {
    build: "sts2-main-0.107.1",
    character: "ironclad",
    ascension: 0,
    actIndex: 0,
    deck: starterDeck("ironclad"),
    offered: ["POMMEL_STRIKE", "INFLAME", "OFFERING"],
    source: "regular",
    riskPreference: "balanced",
    ...over,
  };
}

const curse = CATALOG.cards.find((c) => c.rarity === "curse");

describe("draft advisor v0: contract", () => {
  it("is labelled a heuristic, uncalibrated, and never reports a probability", () => {
    const r = evaluateDraft(request());
    expect(r.method).toBe("heuristic");
    expect(r.calibrated).toBe(false);
    expect(r.policyVersion).toBe("draft-heuristic-v0");
    expect(r.gameId).toBe("STS2");
    expect(JSON.stringify(r)).not.toMatch(/winProbability|winRate|probabilityEstimate/);
    expect(r.assumptions.length).toBeGreaterThan(2);
    expect(r.notModelled.length).toBeGreaterThan(2);
  });

  it("only recommends legal actions: an offered card or skip, each listed exactly once", () => {
    const r = evaluateDraft(request());
    expect(r.legalActions).toHaveLength(4);
    expect(r.ranking).toHaveLength(4);
    expect(r.ranking.map((o) => o.rank)).toEqual([1, 2, 3, 4]);
    const keys = r.ranking.map((o) => (o.action.kind === "skip" ? "skip" : o.action.cardId));
    expect(new Set(keys)).toEqual(new Set(["POMMEL_STRIKE", "INFLAME", "OFFERING", "skip"]));
    expect(keys[0]).toBe(
      r.recommendation.action.kind === "skip"
        ? "skip"
        : (r.recommendation.action as { cardId: string }).cardId,
    );
    expect(r.ranking.find((o) => o.action.kind === "skip")?.indexDelta).toBe(0);
  });

  it("is deterministic and its digest ignores deck row order", () => {
    const a = evaluateDraft(request());
    const b = evaluateDraft(request());
    expect(b).toEqual(a);
    const shuffled = request({ deck: [...starterDeck("ironclad")].reverse() });
    expect(evaluateDraft(shuffled).stateDigest).toBe(a.stateDigest);
    expect(evaluateDraft(request({ ascension: 5 })).stateDigest).not.toBe(a.stateDigest);
  });

  it("merges duplicate deck rows", () => {
    const split = request({
      deck: [
        { id: "STRIKE_IRONCLAD", count: 2 },
        { id: "STRIKE_IRONCLAD", count: 3 },
        { id: "DEFEND_IRONCLAD", count: 4 },
        { id: "BASH", count: 1 },
      ],
    });
    expect(evaluateDraft(split).stateDigest).toBe(evaluateDraft(request()).stateDigest);
  });
});

describe("draft advisor v0: behaviour", () => {
  it("prefers skipping a curse and a starter strike over a thin strong deck", () => {
    if (!curse) {
      throw new Error("no curse in catalog");
    }
    const r = evaluateDraft(request({ offered: [curse.id] }));
    expect(r.recommendation.action.kind).toBe("skip");
    expect(r.warnings.join(" ")).toMatch(/curse|status|unplayable/);

    const strong = [
      { id: "DEMON_FORM", count: 1 },
      { id: "OFFERING", count: 1 },
      { id: "IMPERVIOUS", count: 1 },
      { id: "INFLAME", count: 2 },
      { id: "SHRUG_IT_OFF", count: 2 },
      { id: "POMMEL_STRIKE", count: 2 },
      { id: "THUNDERCLAP", count: 1 },
      { id: "BATTLE_TRANCE", count: 1 },
      { id: "BASH", count: 1 },
      { id: "DEFEND_IRONCLAD", count: 2 },
      { id: "STRIKE_IRONCLAD", count: 2 },
    ];
    const s = evaluateDraft(request({ deck: strong, offered: ["STRIKE_IRONCLAD"], actIndex: 1 }));
    expect(s.recommendation.action.kind).toBe("skip");
  });

  it("values a first source of a missing role over a fifth copy of the same role", () => {
    const noDraw = request({ offered: ["POMMEL_STRIKE", "ANGER"] });
    const withDraw = request({
      deck: [
        ...starterDeck("ironclad"),
        { id: "BATTLE_TRANCE", count: 2 },
        { id: "SHRUG_IT_OFF", count: 2 },
      ],
      offered: ["POMMEL_STRIKE", "ANGER"],
    });
    const deltaNoDraw =
      evaluateDraft(noDraw).ranking.find((o) => o.label === "Pommel Strike")?.indexDelta ?? NaN;
    const deltaWithDraw =
      evaluateDraft(withDraw).ranking.find((o) => o.label === "Pommel Strike")?.indexDelta ?? NaN;
    expect(deltaNoDraw).toBeGreaterThan(deltaWithDraw);
  });

  it("explains each pick with reasons sorted by magnitude", () => {
    const r = evaluateDraft(request());
    for (const o of r.ranking) {
      expect(o.reasons.length).toBeGreaterThan(0);
      const mags = o.reasons.map((x) => Math.abs(x.delta));
      expect([...mags].sort((a, b) => b - a)).toEqual(mags);
    }
  });

  it("changes weights with risk preference but keeps the same legal set", () => {
    const safe = evaluateDraft(request({ riskPreference: "safe" }));
    const bold = evaluateDraft(request({ riskPreference: "aggressive" }));
    expect(safe.legalActions).toEqual(bold.legalActions);
    expect(safe.ranking.map((o) => o.indexDelta)).not.toEqual(
      bold.ranking.map((o) => o.indexDelta),
    );
  });

  it("reports how stable the top choice is under its own weight uncertainty", () => {
    const r = evaluateDraft(request());
    const { perturbations, topChoiceKept, otherTopChoices } = r.confidence.stability;
    expect(perturbations).toBe(64);
    expect(topChoiceKept).toBeGreaterThanOrEqual(0);
    expect(topChoiceKept + Object.values(otherTopChoices).reduce((a, b) => a + b, 0)).toBe(
      perturbations,
    );
  });

  it("warns about cards outside the character's pool", () => {
    const other = rewardPool("silent", ALL_UNLOCKED)[0];
    expect(other).toBeDefined();
    const r = evaluateDraft(request({ offered: [other?.id ?? "", "INFLAME"] }));
    expect(r.warnings.join(" ")).toMatch(/not in the ironclad reward pool/);
  });
});

describe("draft advisor v0: validation", () => {
  it("rejects unknown cards, duplicates and malformed input with structured details", () => {
    expect(() => evaluateDraft(request({ offered: ["NOT_A_CARD"] }))).toThrow(
      InvalidDraftRequestError,
    );
    expect(() => evaluateDraft(request({ offered: ["BASH", "BASH"] }))).toThrow(/twice/);
    expect(() => evaluateDraft(request({ deck: [{ id: "NOPE_CARD", count: 1 }] }))).toThrow(
      /unknown card id/,
    );
    expect(() => evaluateDraft(request({ offered: [] }))).toThrow(InvalidDraftRequestError);
    expect(() => evaluateDraft(request({ hp: { current: 90, max: 80 } }))).toThrow(
      InvalidDraftRequestError,
    );
    expect(() => evaluateDraft({ ...request(), extra: 1 })).toThrow(InvalidDraftRequestError);
    expect(() => evaluateDraft(request({ ascension: 11 }))).toThrow(InvalidDraftRequestError);
    expect(() => evaluateDraft(null)).toThrow(InvalidDraftRequestError);
    try {
      evaluateDraft(request({ offered: ["NOT_A_CARD"] }));
    } catch (e) {
      expect((e as InvalidDraftRequestError).details[0]?.path).toBe("offered");
    }
  });

  it("refuses the beta build instead of guessing", () => {
    expect(() => evaluateDraft(request({ build: "sts2-beta-0.111.0" }))).toThrow(
      UnsupportedBuildError,
    );
  });
});

describe("draft advisor v0: property tests over random valid requests", () => {
  const cls = fc.constantFrom<PlayableClass>(...PLAYABLE_CLASSES);
  const arbRequest = cls.chain((c) => {
    const pool = rewardPool(c, ALL_UNLOCKED).map((x) => x.id);
    return fc.record({
      character: fc.constant(c),
      ascension: fc.integer({ min: 0, max: 10 }),
      actIndex: fc.constantFrom<0 | 1 | 2>(0, 1, 2),
      risk: fc.constantFrom<"safe" | "balanced" | "aggressive">("safe", "balanced", "aggressive"),
      extra: fc.array(fc.tuple(fc.constantFrom(...pool), fc.integer({ min: 1, max: 3 })), {
        maxLength: 18,
      }),
      offered: fc.uniqueArray(fc.constantFrom(...pool), { minLength: 1, maxLength: 4 }),
    });
  });

  it("never returns NaN, always ranks skip at exactly 0 and orders deltas descending", () => {
    fc.assert(
      fc.property(arbRequest, (r) => {
        const deck = [
          ...starterDeck(r.character),
          ...r.extra.map(([id, count]) => ({ id, count })),
        ];
        const out = evaluateDraft({
          build: "sts2-main-0.107.1",
          character: r.character,
          ascension: r.ascension,
          actIndex: r.actIndex,
          deck,
          offered: r.offered,
          source: "regular",
          riskPreference: r.risk,
        });
        const deltas = out.ranking.map((o) => o.indexDelta);
        expect(deltas.every((d) => Number.isFinite(d))).toBe(true);
        expect([...deltas].sort((a, b) => b - a)).toEqual(deltas);
        expect(out.ranking.find((o) => o.action.kind === "skip")?.indexDelta).toBe(0);
        expect(out.ranking).toHaveLength(r.offered.length + 1);
        expect(out.legalActions).toHaveLength(r.offered.length + 1);
        const top = out.recommendation.action;
        expect(top.kind === "skip" || r.offered.includes(top.cardId)).toBe(true);
        expect(out.confidence.stability.topChoiceKept).toBeLessThanOrEqual(64);
        expect(getCard(r.offered[0] ?? "")).toBeDefined();
      }),
      { numRuns: 120 },
    );
  });
});
