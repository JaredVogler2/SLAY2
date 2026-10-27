import { OPENING_OPTIONS } from "@slay2/game-data";
import { describe, expect, it } from "vitest";

import neowJson from "@/content/neow.generated.json";
import {
  assessOffer,
  averageChance,
  chanceWith,
  classAlpha,
  classBaseline,
  classResult,
  neowCoverage,
  neowTest,
  neowValues,
  offerVerdict,
  optionIdOfLabel,
  relicValue,
  relicValues,
  ruleValidated,
  type NeowData,
  type NeowMember,
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
    relicsKept: false,
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
      seeds: 3000,
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

function member(character: string, a: number, b: number, p: number): NeowMember {
  const table = { a_only: 300, b_only: 200, both: 1000, neither: 500, mcnemar_p: p };
  return {
    character,
    a: { batchId: `a-${character}`, wins: 0 },
    b: { batchId: `b-${character}`, wins: 0 },
    pairedSeeds: 2000,
    bothCompleted: 1990,
    reachedAct2: { a, b, pairedTable: table },
    meanFloorDifference: 0,
  };
}

/** The test as it would ship: the rule ahead overall, and in each class as the second argument says. */
const CLASS_RESULTS: Record<string, [number, number, number]> = {
  ironclad: [0.7, 0.65, 0.00005],
  silent: [0.44, 0.18, 1e-80],
  regent: [0.57, 0.5, 0.2],
  necrobinder: [0.41, 0.62, 1e-47],
  defect: [0.92, 0.76, 1e-49],
};

function testResult(passed: boolean, classes = CLASS_RESULTS): NeowTest {
  const table = { a_only: 1, b_only: 1, both: 1, neither: 1, mcnemar_p: 1 };
  const rate = { games: 1, rate: 0.5, wilson95: [0.1, 0.9] };
  const endpoint = { definition: "x", a: rate, b: rate, pairedTable: table };
  return {
    id: "t",
    relicsKept: false,
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
    members: Object.entries(classes).map(([c, [a, b, p]]) => member(c, a, b, p)),
    role: "held-out",
    passed,
  };
}

describe.runIf(neowValues() !== null)("the shipped opening-relic values", () => {
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
    expect((neowJson as NeowData).values?.relics.length).toBe(values?.relics.length);
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
    const expected =
      neowValues() === null
        ? "none"
        : neowTest() === null
          ? "untested"
          : neowTest()?.passed
            ? "validated"
            : "measured";
    expect(line.state).toBe(expected);
  });

  it("says nothing, and gives no advice, while no valid measurement is published", () => {
    const none: NeowData = { values: null, test: null };
    expect(ruleValidated(none)).toBe(false);
    expect(relicValues(none)).toEqual([]);
    // every relic is "not measured" and counts as the average: nothing can be called best with any support
    const a = assessOffer(["FISHING_ROD", "WINGED_BOOTS", "SILVER_CRUCIBLE"], none);
    expect(a.separation).toBe("close");
    expect(a.lines.every((l) => l.value === undefined)).toBe(true);
  });
});

describe("what a class may be told (ADR-049)", () => {
  const data = fixture(testResult(true));

  it("splits the test's level over the classes it pooled", () => {
    const t = testResult(true);
    expect(classAlpha(t)).toBeCloseTo(0.01, 12);
  });

  it("helps a class only when the rule was ahead in that class's own games at the split level", () => {
    expect(classResult("silent", data)?.helped).toBe(true);
    expect(classResult("Silent", data)?.helped).toBe(true); // the id's letter case does not matter here
    // ahead but not clearly (p = 0.2): no advice
    expect(classResult("regent", data)?.helped).toBe(false);
    // clearly behind: no advice
    expect(classResult("necrobinder", data)?.helped).toBe(false);
    expect(classResult("necrobinder", data)?.member.reachedAct2.a).toBeLessThan(0.5);
    // a class that was not in the test, and no test at all
    expect(classResult("watcher", data)).toBeUndefined();
    expect(classResult("silent", fixture(null))).toBeUndefined();
  });

  it("names a relic as the rule's pick only for a class whose own games favoured the rule", () => {
    const offer = ["FISHING_ROD", "WINGED_BOOTS", "ARCANE_SCROLL"];
    const a = assessOffer(offer, data);
    expect(offerVerdict(a, "silent", data).kind).toBe("take");
    expect(offerVerdict(a, "necrobinder", data).kind).toBe("not-for-class");
    expect(offerVerdict(a, "regent", data).kind).toBe("not-for-class");
    expect(offerVerdict(a, "necrobinder", data)).toMatchObject({ result: { helped: false } });
  });

  it("gives no pick when the test failed, was never run, or was run with other values", () => {
    const a = assessOffer(["FISHING_ROD", "WINGED_BOOTS", "ARCANE_SCROLL"], data);
    expect(offerVerdict(a, "silent", fixture(testResult(false))).kind).toBe("not-improved");
    expect(offerVerdict(a, "silent", fixture(null)).kind).toBe("untested");
    const other: NeowData = {
      values: data.values,
      test: { ...testResult(true), valuesSha256: "f".repeat(64) },
    };
    expect(ruleValidated(other)).toBe(false);
    expect(offerVerdict(a, "silent", other).kind).toBe("untested");
  });

  it("gives no pick when the relic it would take was never measured", () => {
    // Massive Scroll counts as the average in the tested rule, but it is a co-op option a solo run never offers
    const a = assessOffer(["WINGED_BOOTS", "MASSIVE_SCROLL"], data);
    expect(a.best?.id).toBe("MASSIVE_SCROLL");
    expect(offerVerdict(a, "silent", data)).toMatchObject({ kind: "unmeasured" });
  });

  it("has nothing to say about an empty or one-relic offer", () => {
    expect(offerVerdict(assessOffer([], data), "silent", data).kind).toBe("empty");
    expect(offerVerdict(assessOffer(["FISHING_ROD"], data), "silent", data).kind).toBe("single");
  });

  it("names the classes the rule did not clearly help in the coverage line", () => {
    const line = neowCoverage(data);
    expect(line.state).toBe("validated");
    expect(line.detail).toContain(
      "ahead at the class level (exact McNemar p below 0.01) in 3 of 5 classes, not in Regent, Necrobinder",
    );
    const everyone = neowCoverage(
      fixture(
        testResult(true, {
          ironclad: [0.7, 0.65, 1e-5],
          silent: [0.44, 0.18, 1e-80],
          regent: [0.57, 0.5, 1e-5],
          necrobinder: [0.7, 0.6, 1e-9],
          defect: [0.92, 0.76, 1e-49],
        }),
      ),
    );
    expect(everyone.detail).toContain(
      "ahead at the class level (exact McNemar p below 0.01) in all 5 classes",
    );
  });
});
