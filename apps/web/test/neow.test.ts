import { OPENING_OPTIONS } from "@slay2/game-data";
import { describe, expect, it } from "vitest";

import neowJson from "@/content/neow.generated.json";
import {
  assessOffer,
  averageChance,
  chanceWith,
  classBaseline,
  neowCoverage,
  neowTest,
  neowValues,
  optionIdOfLabel,
  relicValue,
  relicValues,
  ruleValidated,
  type NeowData,
  type NeowTest,
  type NeowValues,
  type RelicMeasurement,
} from "@/lib/neow";

function relic(label: string, beta: number, half = 0.1, over: Partial<RelicMeasurement> = {}) {
  return {
    label,
    kind: "positive",
    beta,
    ci95: [beta - half, beta + half],
    taken: 600,
    offered: 1800,
    passRateTaken: 0.55,
    passRateOfferedNotTaken: 0.55,
    excluded: 0,
    exclusionFlag: false,
    ...over,
  };
}

/** A small, fully controlled data set: three relics whose values and intervals are chosen to test the rules. */
function fixture(test: NeowTest | null = null): NeowData {
  const values: NeowValues = {
    file: "x.json",
    sha256: "0".repeat(64),
    outcome: "the run gets past the Act-1 boss",
    ascension: 0,
    profile: "veteran",
    games: 1000,
    excludedGames: 0,
    passRate: 0.5,
    classes: [
      { character: "silent", games: 500, passRate: 0.36, baselineLogOdds: -0.56 },
      { character: "defect", games: 500, passRate: 0.9, baselineLogOdds: 2.18 },
    ],
    model: {
      l2: 10,
      folds: 5,
      bootstrapDraws: 200,
      minTaken: 30,
      cvLogLoss: 0.59,
      cvAuc: 0.73,
      baselineLogLoss: 0.6,
    },
    batches: [],
    relics: [
      relic("Fishing Rod", 0.5, 0.1),
      relic("Arcane Scroll", 0.1, 0.1),
      relic("Winged Boots", -0.3, 0.1),
      relic("Booming Conch", 0.1, 0.3),
      relic("Lost Coffer", 0.1, 0.1),
    ],
  };
  return { values, test };
}

function testResult(passed: boolean): NeowTest {
  const table = { a_only: 1, b_only: 1, both: 1, neither: 1, mcnemar_p: 1 };
  const rate = { games: 1, rate: 0.5, wilson95: [0.1, 0.9] };
  const endpoint = { definition: "x", a: rate, b: rate, pairedTable: table };
  return {
    id: "t",
    contentSha256: "0".repeat(64),
    valuesSha256: "0".repeat(64),
    a: "rules_v2_neow_values",
    b: "rules_v2",
    alpha: 0.05,
    pairedSeeds: 4,
    bothCompleted: 4,
    excludedNotCompleted: 0,
    reachedAct2: endpoint,
    reachedAct3: endpoint,
    wins: { a: 0, b: 0, pairedTable: table },
    floorDifference: { meanAMinusB: 0, ci95: [-1, 1] },
    members: [],
    role: "held-out",
    passed,
  };
}

describe("the shipped opening-relic values", () => {
  const values = neowValues();

  it("are present, fitted before the test, with the facts needed to read them", () => {
    expect(values).not.toBeNull();
    expect(values?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(values?.games).toBeGreaterThan(10_000);
    expect(values?.model.cvLogLoss).toBeLessThan(values?.model.baselineLogLoss ?? 0);
    expect(values?.ascension).toBe(0);
    expect(values?.classes.map((c) => c.character).sort()).toEqual([
      "defect",
      "ironclad",
      "necrobinder",
      "regent",
      "silent",
    ]);
  });

  it("map every measured label onto a catalog option of the same kind, and leave only the co-op scroll unmeasured", () => {
    const measured = relicValues();
    expect(measured.length).toBe(values?.relics.length);
    expect(new Set(measured.map((r) => r.id)).size).toBe(measured.length);
    for (const r of measured) {
      expect(r.kind, r.label).toBe(r.optionKind);
      expect(r.ci95[0] ?? NaN, r.label).toBeLessThanOrEqual(r.beta);
      expect(r.ci95[1] ?? NaN, r.label).toBeGreaterThanOrEqual(r.beta);
      expect(r.taken, r.label).toBeGreaterThanOrEqual(values?.model.minTaken ?? 0);
    }
    const unmeasured = OPENING_OPTIONS.filter((o) => !relicValue(o.id)).map((o) => o.id);
    // Massive Scroll is a co-op option: a solo run never offers it, so it was never taken in a simulated run
    expect(unmeasured).toEqual(["MASSIVE_SCROLL"]);
  });

  it("are listed best first", () => {
    const betas = relicValues().map((r) => r.beta);
    expect(betas).toEqual([...betas].sort((a, b) => b - a));
  });

  it("are exactly what the exporter wrote (no hand-typed number reaches the page)", () => {
    expect(neowJson.values.relics.length).toBe(values?.relics.length);
    expect(relicValue("SILVER_CRUCIBLE")?.label).toBe("Silver Crucible");
  });
});

describe("label to option id", () => {
  it("ignores spaces, apostrophes and case", () => {
    expect(optionIdOfLabel("Neows Talisman")).toBe("NEOWS_TALISMAN");
    expect(optionIdOfLabel("Neow's Talisman")).toBe("NEOWS_TALISMAN");
    expect(optionIdOfLabel("silver crucible")).toBe("SILVER_CRUCIBLE");
    expect(optionIdOfLabel("Not A Relic")).toBeUndefined();
  });
});

describe("the chance of getting past the Act-1 boss", () => {
  const data = fixture();

  it("is the class's starting point moved by the relic's value, with the interval's ends", () => {
    const r = relicValue("FISHING_ROD", data);
    expect(r).toBeDefined();
    const c = chanceWith("silent", r ?? { beta: 0, ci95: [0, 0] }, data);
    const avg = averageChance("silent", data);
    expect(avg).toBeCloseTo(1 / (1 + Math.exp(0.56)), 9);
    expect(c?.lo).toBeLessThan(c?.mid ?? 0);
    expect(c?.hi).toBeGreaterThan(c?.mid ?? 1);
    expect(c?.mid).toBeGreaterThan(avg ?? 1);
    // a value of 0 is the average relic
    expect(chanceWith("silent", { beta: 0, ci95: [0, 0] }, data)?.mid).toBeCloseTo(avg ?? 0, 12);
  });

  it("moves a class that rarely gets past the boss by more points than one that almost always does", () => {
    const move = (character: string): number => {
      const c = chanceWith(character, { beta: 0.5, ci95: [0.4, 0.6] }, data);
      const a = averageChance(character, data);
      return (c?.mid ?? 0) - (a ?? 0);
    };
    expect(move("silent")).toBeGreaterThan(move("defect") * 2);
  });

  it("is nothing for a class that was not measured", () => {
    expect(classBaseline("nobody", data)).toBeUndefined();
    expect(chanceWith("nobody", { beta: 0.5, ci95: [0.4, 0.6] }, data)).toBeUndefined();
    expect(averageChance("nobody", data)).toBeUndefined();
  });
});

describe("comparing what Neow offered", () => {
  const data = fixture();

  it("picks the largest value and says the runs separate it when the intervals do not overlap", () => {
    const a = assessOffer(["WINGED_BOOTS", "FISHING_ROD", "ARCANE_SCROLL"], data);
    expect(a.best?.id).toBe("FISHING_ROD");
    expect(a.runnerUp?.id).toBe("ARCANE_SCROLL");
    // 0.5 -+ 0.1 against 0.1 -+ 0.1: 0.4 is above 0.2
    expect(a.separation).toBe("clear");
    expect(a.lines.map((l) => l.id)).toEqual(["WINGED_BOOTS", "FISHING_ROD", "ARCANE_SCROLL"]);
  });

  it("says the runs cannot tell two apart when the intervals overlap", () => {
    // Arcane Scroll 0.1 (0.0 to 0.2) against Booming Conch 0.1 (-0.2 to 0.4): the same value, wide overlap
    const a = assessOffer(["BOOMING_CONCH", "ARCANE_SCROLL"], data);
    expect(a.separation).toBe("close");
  });

  it("gives a tie to the first of the player's slots, in either order", () => {
    expect(assessOffer(["ARCANE_SCROLL", "LOST_COFFER"], data).best?.id).toBe("ARCANE_SCROLL");
    expect(assessOffer(["LOST_COFFER", "ARCANE_SCROLL"], data).best?.id).toBe("LOST_COFFER");
  });

  it("counts an unmeasured relic as the average, as the tested rule does, and never calls that separation", () => {
    // Massive Scroll was never measured: it counts as 0, which beats Winged Boots at -0.3
    const worse = assessOffer(["WINGED_BOOTS", "MASSIVE_SCROLL"], data);
    expect(worse.best?.id).toBe("MASSIVE_SCROLL");
    expect(worse.best?.value).toBeUndefined();
    expect(worse.separation).toBe("close");
    // and against a relic that is above the average, the measured one wins
    expect(assessOffer(["MASSIVE_SCROLL", "FISHING_ROD"], data).best?.id).toBe("FISHING_ROD");
  });

  it("handles one relic, none, a repeat and an id that is not an option", () => {
    expect(assessOffer(["FISHING_ROD"], data).separation).toBe("alone");
    expect(assessOffer([], data)).toMatchObject({
      best: undefined,
      runnerUp: undefined,
      separation: "none",
    });
    expect(assessOffer(["FISHING_ROD", "FISHING_ROD"], data).lines).toHaveLength(1);
    expect(assessOffer(["NOT_A_RELIC", "FISHING_ROD"], data).lines).toHaveLength(1);
  });
});

describe("when a recommendation may be shown", () => {
  it("only after the registered test improved play", () => {
    expect(ruleValidated(fixture(null))).toBe(false);
    expect(ruleValidated(fixture(testResult(false)))).toBe(false);
    expect(ruleValidated(fixture(testResult(true)))).toBe(true);
    expect(neowTest(fixture(testResult(true)))?.passed).toBe(true);
  });

  it("follows the shipped test exactly: passed means ahead at the pre-registered level", () => {
    const t = neowTest();
    if (t === null) {
      expect(ruleValidated()).toBe(false);
      return;
    }
    const ahead = t.reachedAct2.a.rate > t.reachedAct2.b.rate;
    const significant = t.reachedAct2.pairedTable.mcnemar_p < t.alpha;
    expect(t.passed).toBe(ahead && significant);
    expect(ruleValidated()).toBe(t.passed);
    expect(t.alpha).toBe(0.05);
    expect(t.role).toBe("held-out");
    expect(t.members.map((m) => m.character).sort()).toEqual([
      "defect",
      "ironclad",
      "necrobinder",
      "regent",
      "silent",
    ]);
    // the test was run with the values on the page
    expect(t.valuesSha256).toBe(neowValues()?.sha256);
  });
});

describe("the coverage line for the landing page", () => {
  it("says nothing was measured, measured but untested, tested without improvement, or tested and improved", () => {
    expect(neowCoverage({ values: null, test: null })).toEqual({
      state: "none",
      detail: "not measured yet",
    });
    const untested = neowCoverage(fixture(null));
    expect(untested.state).toBe("untested");
    expect(untested.detail).toContain("5 relics measured in 1,000 simulated games");
    expect(untested.detail).toContain("not tested against play yet");
    const failed = neowCoverage(fixture(testResult(false)));
    expect(failed.state).toBe("measured");
    expect(failed.detail).toContain(
      "did not beat the first helpful one at the pre-registered level",
    );
    const passed = neowCoverage(fixture(testResult(true)));
    expect(passed.state).toBe("validated");
    expect(passed.detail).toContain("taking the best-measured relic:");
    expect(passed.detail).not.toContain("did not beat");
  });

  it("follows the shipped data", () => {
    const line = neowCoverage();
    expect(line.state).toBe(
      neowTest() === null ? "untested" : neowTest()?.passed ? "validated" : "measured",
    );
  });
});
