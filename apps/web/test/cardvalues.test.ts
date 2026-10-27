import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CATALOG } from "@slay2/game-data";
import { describe, expect, it } from "vitest";

import cardvalues from "@/content/cardvalues.generated.json";
import {
  adoptedByPooledTest,
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
  pointsText,
  setFor,
  signCounts,
  valueSign,
  type CardValueSet,
} from "@/lib/cardvalues";

/** Which value files the site shows, from the decision file itself (adopting a set changes this list, ADR-046 and ADR-053). */
const LISTING = (
  JSON.parse(
    readFileSync(
      join(__dirname, "..", "..", "..", "experiments", "cardvalue", "site-sets.json"),
      "utf8",
    ),
  ) as {
    sets: {
      file: string;
      supersedes?: string;
      test?: { comparison: string; against: string };
    }[];
  }
).sets;
const classOf = (file: string): string => file.split("-")[0] ?? "";

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
    // every set says whether the runs it was fitted from kept the relics they gained (read from the manifests of its batches, gap G14)
    for (const set of allSets()) {
      expect(typeof set.relicsKept, set.id).toBe("boolean");
    }
    // each class shows the set the decision file lists for it
    expect(LISTING).toHaveLength(5);
    for (const entry of LISTING) {
      expect(setFor(classOf(entry.file))?.id, entry.file).toBe(entry.file.replace(/\.json$/, ""));
    }
  });

  it("a set that replaces an earlier one says what it was tested against and how far it moved", () => {
    for (const entry of LISTING) {
      const cls = classOf(entry.file);
      const set = requireSet(cls);
      const v = set.validation;
      if (!entry.supersedes) {
        // a first measurement: tested against the hand-written ratings, and moved from nothing
        expect(set.supersedes, cls).toBeNull();
        expect(set.drift, cls).toBeNull();
        expect(v?.against, cls).toBe("ratings");
        expect(v?.basis, cls).toBe("own");
        expect(v && againstText(v), cls).toBe("the hand-written ratings");
        continue;
      }
      expect(set.supersedes, cls).toBe(entry.supersedes.replace(/\.json$/, ""));
      expect(v?.against, cls).toBe(entry.test?.against);
      // the class's own level of the registered tests: 0.05 for the first class tested alone, split over the classes for the others
      expect(v?.alpha, cls).toBeGreaterThan(0);
      expect(v?.alpha, cls).toBeLessThanOrEqual(0.05);
      const d = set.drift;
      expect(d?.previous, cls).toBe(set.supersedes);
      expect(d?.previousSha256, cls).toMatch(/^[0-9a-f]{64}$/);
      expect(d?.cardsInBoth, cls).toBeGreaterThan(50);
      if (entry.test?.against === "first-values") {
        // round two by a stronger pilot (ADR-046): tested against round one, and it passed; two measurements of the same pilot agree more
        // than two pilots do
        expect(v?.basis, cls).toBe("own");
        expect(v ? againstText(v) : "", cls).toBe("the first measurement of the values");
        expect(v?.passed, cls).toBe(true);
        expect(d && d.noiseSpearmanBrown > d.spearman, cls).toBe(true);
      } else {
        // measured with the relics kept (ADR-053): licensed by the pooled test and its rule, not by the class's own significance
        expect(entry.test?.against, cls).toBe("current-values");
        expect(v?.basis, cls).toBe("pooled");
        expect(v?.passed, cls).toBe(true);
        expect(set.relicsKept, cls).toBe(true);
      }
    }
  });

  it("an own-basis set is licensed by its class's comparison, a pooled-basis one by the rule", () => {
    const base = requireSet("silent");
    const v = base.validation;
    if (!v) {
      throw new Error("expected the committed Silent test");
    }
    const own = { ...base, validation: { ...v, basis: "own", passed: true } };
    const pooled = { ...base, validation: { ...v, basis: "pooled", passed: true } };
    const notAdopted = { ...base, validation: { ...v, basis: "pooled", passed: false } };
    expect(adoptedByPooledTest(own)).toBe(false);
    expect(isValidated(own)).toBe(true);
    expect(adoptedByPooledTest(pooled)).toBe(true);
    expect(isValidated(pooled)).toBe(true);
    expect(adoptedByPooledTest(notAdopted)).toBe(false);
    expect(isValidated(notAdopted)).toBe(false);
    expect(adoptedByPooledTest(undefined)).toBe(false);
  });

  it("writes a difference of two shares in points with a true minus sign", () => {
    expect(pointsText(0.612, 0.6)).toBe("+1.2");
    expect(pointsText(0.596, 0.6)).toBe("\u22120.4");
    expect(pointsText(0.5, 0.5)).toBe("0.0");
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
      if (v?.basis === "own") {
        expect(v.passed).toBe(v.passRate > v.passRateBase && v.p < v.alpha);
      } else if (v) {
        // licensed by the pooled test and its rule (ADR-053): a set is listed only when the rule adopted it
        expect(v.basis).toBe("pooled");
        expect(v.passed).toBe(true);
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
    expect(lines[0]?.detail).toContain(`for ${againstText(v)}`);
    expect(lines[2]?.detail).toContain("did not beat");
    expect(lines[3]?.detail).toBe("not measured yet");
  });

  it("says a set adopted by the pooled test was adopted by the rule, with the class's own numbers beside it", () => {
    const pooled = withValidation("silent", {
      ...v,
      against: "current-values",
      basis: "pooled",
      passed: true,
      p: 0.4,
      passRate: 0.61,
      passRateBase: 0.6,
    });
    const line = coverage(buildIndex([pooled])).find((l) => l.character === "silent");
    expect(line?.state).toBe("validated");
    expect(line?.detail).toContain(
      "adopted by the rule registered before the pooled test of the five classes",
    );
    expect(line?.detail).toContain("61.0%");
    expect(line?.detail).toContain("60.0%");
    expect(line?.detail).toContain("p = 0.40");
    expect(line?.detail).toContain("the values measured in the simulator that drops the relics");
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
