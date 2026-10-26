import { CATALOG } from "@slay2/game-data";
import { describe, expect, it } from "vitest";

import cardvalues from "@/content/cardvalues.generated.json";
import {
  againstText,
  allSets,
  buildIndex,
  coverage,
  extremes,
  formatBeta,
  isValidated,
  measuredCount,
  measuredValue,
  measurementsOf,
  oddsMultiplier,
  setFor,
  signCounts,
  valueSign,
  type CardValueSet,
} from "@/lib/cardvalues";

const ironclad = setFor("ironclad");

function requireSet(character: string): CardValueSet {
  const set = setFor(character);
  if (!set) {
    throw new Error(`expected a measured set for ${character}`);
  }
  return set;
}

describe("measured card values", () => {
  it("ships a set per measured class, with the facts needed to read it", () => {
    expect(allSets().length).toBeGreaterThan(0);
    for (const set of allSets()) {
      expect(["ironclad", "silent", "regent", "necrobinder", "defect"]).toContain(set.character);
      expect(set.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(set.games).toBeGreaterThan(1000);
      expect(set.bossFights).toBeLessThanOrEqual(set.games);
      expect(set.passRate).toBeGreaterThan(0);
      expect(set.passRate).toBeLessThan(1);
      expect(set.batches.length).toBeGreaterThan(0);
      expect(set.model.cvAuc).toBeGreaterThan(0.5);
      expect(set.model.cvLogLoss).toBeLessThan(set.model.baselineLogLoss);
    }
    // round two replaced round one for Ironclad after its pre-registered test (ADR-046); the others are still round one
    expect(ironclad?.id).toBe("ironclad-a0-v2");
    expect(setFor("silent")?.id).toBe("silent-a0-v1");
  });

  it("a set that replaces an earlier one says what it was tested against and how far it moved", () => {
    expect(ironclad?.supersedes).toBe("ironclad-a0-v1");
    const v = ironclad?.validation;
    expect(v?.against).toBe("first-values");
    expect(v ? againstText(v) : "").toBe("the first measurement of the values");
    expect(v?.passed).toBe(true);
    expect(v?.alpha).toBe(0.05);
    const d = ironclad?.drift;
    expect(d?.previous).toBe("ironclad-a0-v1");
    expect(d?.previousSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(d?.cardsInBoth).toBeGreaterThan(50);
    // two measurements of the same pilot agree more than two pilots do
    expect(d && d.noiseSpearmanBrown > d.spearman).toBe(true);
    // the others are first measurements, tested against the hand-written ratings, and moved from nothing
    for (const c of ["silent", "regent", "necrobinder", "defect"]) {
      const other = setFor(c);
      expect(other?.supersedes, c).toBeNull();
      expect(other?.drift, c).toBeNull();
      expect(other?.validation?.against, c).toBe("ratings");
      expect(other?.validation && againstText(other.validation), c).toBe(
        "the hand-written ratings",
      );
    }
  });

  it("attaches every measurement to exactly one catalog card per class (simulator `_CARD` ids included)", () => {
    const ids = new Set(CATALOG.cards.map((c) => c.id));
    for (const set of allSets()) {
      const seen = new Set<string>();
      for (const c of set.cards) {
        expect(ids.has(c.id), c.id).toBe(true);
        expect(seen.has(c.id), `${c.id} twice`).toBe(false);
        seen.add(c.id);
        expect(c.simId === c.id || c.simId === `${c.id}_CARD`, c.simId).toBe(true);
      }
    }
    expect(measuredCount()).toBe(allSets().reduce((n, s) => n + s.cards.length, 0));
    // the collision names the simulator suffixes are the reason this mapping exists
    expect(measuredValue("FEEL_NO_PAIN", "ironclad")?.card.simId).toBe("FEEL_NO_PAIN_CARD");
    expect(measurementsOf("FEEL_NO_PAIN_CARD")).toEqual([]);
  });

  it("reports each value with an interval that contains it and the number of runs it rests on", () => {
    for (const set of allSets()) {
      for (const c of set.cards) {
        const [lo = 1, hi = -1] = c.ci95;
        expect(lo <= c.beta && c.beta <= hi, c.id).toBe(true);
        expect(c.gamesWithCard, c.id).toBeGreaterThanOrEqual(30);
        expect(c.gamesWithCard, c.id).toBeLessThanOrEqual(set.games);
      }
      const betas = set.cards.map((c) => c.beta);
      expect(betas).toEqual([...betas].sort((a, b) => b - a));
    }
  });

  it("calls a value helpful or harmful only when the whole interval is on one side of zero", () => {
    expect(valueSign({ ci95: [0.2, 0.9] })).toBe("helps");
    expect(valueSign({ ci95: [-0.9, -0.2] })).toBe("hurts");
    expect(valueSign({ ci95: [-0.1, 0.9] })).toBe("unclear");
    expect(valueSign({ ci95: [0, 0.9] })).toBe("unclear");
  });

  it("formats with a real minus sign and a plain odds multiplier", () => {
    expect(formatBeta(1.742)).toBe("+1.74");
    expect(formatBeta(-0.327)).toBe("−0.33");
    expect(formatBeta(0)).toBe("+0.00");
    expect(oddsMultiplier(0)).toBe("×1.0");
    expect(oddsMultiplier(Math.log(5.7))).toBe("×5.7");
    expect(oddsMultiplier(Math.log(0.5))).toBe("×0.50");
    expect(oddsMultiplier(Math.log(12.3))).toBe("×12");
  });

  it("lists the extremes without the starter cards and counts the signs", () => {
    expect(ironclad).toBeDefined();
    if (!ironclad) {
      return;
    }
    const { best, worst } = extremes(ironclad, 5);
    expect(best).toHaveLength(5);
    expect(worst).toHaveLength(5);
    expect(best[0]?.beta ?? 0).toBeGreaterThanOrEqual(best[4]?.beta ?? 1);
    expect(worst[0]?.beta ?? 1).toBeLessThanOrEqual(worst[4]?.beta ?? 0);
    const basic = new Set(CATALOG.cards.filter((c) => c.rarity === "basic").map((c) => c.id));
    for (const c of [...best, ...worst]) {
      expect(basic.has(c.id), c.id).toBe(false);
    }
    expect(best[0]?.beta ?? 0).toBeGreaterThan(worst[0]?.beta ?? 0);
    const counts = signCounts(ironclad);
    expect(counts.helps + counts.hurts + counts.unclear).toBe(ironclad.cards.length);
    expect(counts.helps).toBeGreaterThan(0);
  });

  it("treats a class as validated only when its held-out test passed at its pre-registered level", () => {
    expect(isValidated(undefined)).toBe(false);
    for (const set of allSets()) {
      const v = set.validation;
      expect(isValidated(set)).toBe(v?.passed === true);
      if (v) {
        expect(v.passed).toBe(v.passRate > v.passRateBase && v.p < v.alpha);
      }
    }
    expect(isValidated(ironclad)).toBe(true);
  });

  it("is the generated file, not a hand-edited one (the staleness test covers the bytes)", () => {
    expect(cardvalues.schema).toBe(1);
    expect(cardvalues.generatedFrom).toContain("experiments/cardvalue");
  });
});

describe("the index keeps classes apart", () => {
  const base = requireSet("ironclad");
  const card = (id: string, beta: number) => ({
    ...base.cards[0],
    id,
    simId: id,
    beta,
    ci95: [beta - 0.1, beta + 0.1] as [number, number],
  });
  const silent = {
    ...base,
    id: "silent-a0-v1",
    character: "silent",
    cards: [card("BACKFLIP", 0.4), card("DRAMATIC_ENTRANCE", -0.3)],
  } as CardValueSet;
  const iron = {
    ...base,
    id: "ironclad-a0-v1",
    character: "ironclad",
    cards: [card("ANGER", 0.7), card("DRAMATIC_ENTRANCE", 0.2)],
  } as CardValueSet;
  const index = buildIndex([iron, silent]);

  it("finds a class card in its own class only, and a colorless card once per class that measured it", () => {
    expect(measuredValue("BACKFLIP", "silent", index)?.card.beta).toBe(0.4);
    expect(measuredValue("BACKFLIP", "ironclad", index)).toBeUndefined();
    expect(
      measurementsOf("DRAMATIC_ENTRANCE", index).map((m) => [m.set.character, m.card.beta]),
    ).toEqual([
      ["ironclad", 0.2],
      ["silent", -0.3],
    ]);
    expect(measuredValue("DRAMATIC_ENTRANCE", "silent", index)?.card.beta).toBe(-0.3);
    expect(setFor("defect", index)).toBeUndefined();
  });

  it("a later set of the same class replaces the earlier one instead of merging with it", () => {
    const newer = { ...iron, id: "ironclad-a0-v2", cards: [card("ANGER", 1.1)] } as CardValueSet;
    const replaced = buildIndex([iron, newer]);
    expect(replaced.sets).toHaveLength(1);
    expect(measuredValue("ANGER", "ironclad", replaced)?.card.beta).toBe(1.1);
    expect(measuredValue("DRAMATIC_ENTRANCE", "ironclad", replaced)).toBeUndefined();
  });
});

describe("coverage of the five classes", () => {
  const base = requireSet("ironclad");
  const v = base.validation;
  if (!v) {
    throw new Error("expected the committed Ironclad test");
  }
  const withValidation = (
    character: string,
    validation: CardValueSet["validation"],
  ): CardValueSet => ({
    ...base,
    id: `${character}-a0-v1`,
    character,
    validation,
  });

  it("says, per class, whether there is nothing, a measurement, a failed test or a passed test", () => {
    const index = buildIndex([
      withValidation("ironclad", { ...v, passed: true }),
      withValidation("silent", null),
      withValidation("regent", { ...v, passed: false, p: 0.4, passRate: 0.2, passRateBase: 0.19 }),
    ]);
    const lines = coverage(index);
    expect(lines.map((l) => [l.character, l.state])).toEqual([
      ["ironclad", "validated"],
      ["silent", "untested"],
      ["regent", "measured"],
      ["necrobinder", "none"],
      ["defect", "none"],
    ]);
    expect(lines[0]?.detail).toContain("held-out simulated games");
    expect(lines[0]?.detail).toContain("for the first measurement of the values");
    expect(lines[2]?.detail).toContain("did not beat");
    expect(lines[3]?.detail).toBe("not measured yet");
  });

  it("is generated from the committed data (every class is listed, in the same order)", () => {
    expect(coverage().map((l) => l.character)).toEqual([
      "ironclad",
      "silent",
      "regent",
      "necrobinder",
      "defect",
    ]);
    expect(coverage()[0]?.state).toBe("validated");
  });
});
