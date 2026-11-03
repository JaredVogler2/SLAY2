import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { deckSynergy, type DeckEntry } from "@slay2/decision";
import { getCard } from "@slay2/game-data";

import { NeowOffer } from "@/components/advisor/NeowOffer";
import { SimulationOpinion } from "@/components/advisor/SimulationOpinion";
import { SynergyPanel } from "@/components/advisor/SynergyPanel";
import { UnderdocksNote } from "@/components/advisor/UnderdocksNote";
import { UnderdocksPanel } from "@/components/methods/UnderdocksPanel";
import { setFor } from "@/lib/cardvalues";
import { NEOW } from "@/lib/neow";
import { newRun } from "@/lib/run-state";
import {
  UNDERDOCKS,
  fallNote,
  neowAdviceAllowedInUnderdocks,
  underdocksCoverage,
  underdocksNote,
  underdocksTest,
  underdocksTested,
  withheldWords,
  type UnderdocksAllPairs,
  type UnderdocksClassResult,
  type UnderdocksData,
  type UnderdocksFinding,
  type UnderdocksMember,
  type UnderdocksSize,
  type UnderdocksTest,
  type UnderdocksVerdict,
  type UnderdocksWithheld,
  type OvergrowthReference,
} from "@/lib/underdocks";

afterEach(cleanup);

/**
 * The Underdocks transfer study on the pages (ADR-064): what a run in Underdocks is told, whichever way each of the three tests came out,
 * and the opening-relic advice withheld in Underdocks when the study does not license it. The data here are fixtures: only the wording, the
 * reading and the gating are under test (the exporter's reading of the real files is tested in underdocks-export.test.ts).
 */
const CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"] as const;
type Cls = (typeof CLASSES)[number];

/** How one class's own paired games went: the first arm ahead, the second ahead, or no clear difference (the class level is 0.01). */
type Own = "ahead" | "behind" | "none";

function classFixture(own: Own): {
  member: (c: string) => UnderdocksMember;
  result: UnderdocksClassResult;
} {
  const aOnly = own === "behind" ? 80 : own === "ahead" ? 120 : 101;
  const bOnly = own === "behind" ? 120 : own === "ahead" ? 80 : 100;
  const p = own === "none" ? 0.9 : 1e-4;
  return {
    member: (character) => ({
      character,
      pairedSeeds: 2000,
      bothCompleted: 1980,
      reachedAct2: {
        a: own === "behind" ? 0.19 : 0.21,
        b: own === "behind" ? 0.21 : 0.19,
        pairedTable: { a_only: aOnly, b_only: bOnly, both: 400, neither: 1300, mcnemar_p: p },
      },
      meanFloorDifference: 0.4,
    }),
    result: { aOnly, bOnly, p, ahead: own === "ahead", behind: own === "behind" },
  };
}

const OG: OvergrowthReference = {
  file: "experiments/synergy/keep-val/pooled-astar-vs-d0star.json",
  adr: "ADR-054",
  mean: 0.071,
  ci95: [0.063, 0.08],
  a: 0.404,
  b: 0.333,
  bothCompleted: 9865,
};

function makeTest(
  verdict: UnderdocksVerdict,
  over: {
    own?: Partial<Record<Cls, Own>>;
    size?: UnderdocksSize | null;
    og?: OvergrowthReference;
    /** the exact pooled p of the games in which the arms differ */
    p?: number;
    /** the share past the Act-1 boss of the two arms (the first, the second) */
    rates?: readonly [number, number];
    /** what the primary test said, when the rule did not count it (then ``verdict`` is "not-shown" and ``withheld`` says why) */
    primary?: UnderdocksVerdict;
    withheld?: UnderdocksWithheld | null;
    allPairs?: Partial<UnderdocksAllPairs>;
  } = {},
): UnderdocksTest {
  const shape = over.primary ?? verdict; // the numbers of the primary test are those of what it said
  const rate = (r: number) => ({
    games: Math.round(r * 9800),
    rate: r,
    wilson95: [r - 0.01, r + 0.01],
  });
  const [ra, rb] = over.rates ?? (shape === "reversed" ? [0.2, 0.3] : [0.3, 0.2]);
  const table = {
    a_only: shape === "reversed" ? 1400 : 1700,
    b_only: shape === "reversed" ? 1700 : 1400,
    both: 2000,
    neither: 4700,
    mcnemar_p: over.p ?? (shape === "not-shown" ? 0.2 : 1e-12),
  };
  const defaultOwn: Own = shape === "passed" ? "ahead" : shape === "reversed" ? "behind" : "none";
  const fixtures = Object.fromEntries(
    CLASSES.map((c) => [c, classFixture(over.own?.[c] ?? defaultOwn)]),
  ) as Record<Cls, ReturnType<typeof classFixture>>;
  return {
    file: "experiments/underdocks/pooled-ud-fixture.json",
    sha256: "c".repeat(64),
    pairedSeeds: 10000,
    bothCompleted: 9800,
    excludedNotCompleted: 200,
    reachedAct2: { a: rate(ra), b: rate(rb), pairedTable: table },
    reachedAct3: { a: rate(0.02), b: rate(0.02), pairedTable: table },
    wins: { a: 2, b: 1, pairedTable: table },
    floorDifference: { meanAMinusB: 0.5, ci95: [0.3, 0.7] },
    clusteredDifference: {
      meanAMinusB: 0.1,
      ci95: [0.08, 0.12],
      ciAtLevel: { level: 1 - 0.05 / 3, ci: [0.075, 0.125] },
    },
    members: CLASSES.map((c) => fixtures[c].member(c)),
    verdict,
    primary: shape,
    withheld: over.withheld ?? null,
    downgrades: over.withheld ? [over.withheld] : [],
    allPairs: {
      pairs: 10000,
      aOnly: shape === "reversed" ? 1500 : 1800,
      bOnly: shape === "reversed" ? 1800 : 1500,
      aRate: ra + 0.01,
      bRate: rb + 0.01,
      p: shape === "not-shown" ? 0.2 : 1e-9,
      difference: (ra - rb) * 0.9,
      excludedFraction: 0.02,
      ...over.allPairs,
    },
    classes: Object.fromEntries(CLASSES.map((c) => [c, fixtures[c].result])),
    overgrowth: over.og ?? OG,
    size: over.size === undefined ? (verdict === "passed" ? "smaller" : null) : over.size,
  };
}

const REGISTERED: UnderdocksData = {
  registered: true,
  adr: "ADR-064",
  level: 0.05 / 3,
  classLevel: 0.01,
  seeds: 2000,
  precondition: {
    file: "experiments/underdocks/precondition.json",
    sha256: "d".repeat(64),
    games: 3500,
    pooledShownValues: {
      underdocks: { completed: 483, pastActOneBoss: 231, rate: 0.4783 },
      overgrowth: { completed: 491, pastActOneBoss: 334, rate: 0.6802 },
    },
  },
  tests: null,
};

function tested(
  verdicts: Partial<Record<UnderdocksFinding, UnderdocksVerdict>> = {},
  over: Partial<Record<UnderdocksFinding, Parameters<typeof makeTest>[1]>> = {},
): UnderdocksData {
  const v = (f: UnderdocksFinding): UnderdocksVerdict => verdicts[f] ?? "passed";
  return {
    ...REGISTERED,
    tests: {
      synergy: makeTest(v("synergy"), over.synergy),
      values: makeTest(v("values"), over.values),
      neow: makeTest(v("neow"), over.neow),
    },
  };
}

const NOT_REGISTERED: UnderdocksData = { registered: false };
const FINDINGS = ["synergy", "values", "neow"] as const;

/** The two arms of each test as a note names them to a player. */
const ARMS: Record<UnderdocksFinding, { first: string; second: string }> = {
  synergy: { first: "the pilot with the synergy term", second: "the pilot without it" },
  values: {
    first: "the pilot that follows the card values shown here",
    second: "the hand-written rules",
  },
  neow: {
    first: "the pilot that takes the best-measured opening relic",
    second: "the pilot that takes the first helpful relic",
  },
};

describe("the note under a finding", () => {
  it("says nothing in Overgrowth, when the Act 1 is not known, and when the study is not in the data", () => {
    for (const f of FINDINGS) {
      expect(underdocksNote(f, "overgrowth", tested())).toBeNull();
      expect(underdocksNote(f, null, tested())).toBeNull();
      expect(underdocksNote(f, undefined, tested())).toBeNull();
      expect(underdocksNote(f, "underdocks", NOT_REGISTERED)).toBeNull();
    }
  });

  it("while the test is registered and not run, says the finding was measured with Act 1 in Overgrowth only and that nothing is tested", () => {
    for (const f of FINDINGS) {
      const note = underdocksNote(f, "underdocks", REGISTERED);
      expect(note?.kind).toBe("registered");
      expect(note?.text).toContain("measured with Act 1 in Overgrowth only");
      expect(note?.text).toContain("registered (ADR-064) and has not been run");
      expect(note?.text).toContain("none of this has been tested in your Act 1");
      expect(note?.text).not.toContain("Tested in simulation");
    }
  });

  it("says each of the three outcomes in its own words, with the figures, and never claims more than the test showed", () => {
    for (const f of FINDINGS) {
      const passed = underdocksNote(f, "underdocks", tested({ [f]: "passed" }));
      expect(passed?.kind).toBe("passed");
      expect(passed?.text).toContain(
        "Tested in simulation with Act 1 in Overgrowth and in Underdocks",
      );
      expect(passed?.text).toContain("30.0 %");
      expect(passed?.text).toContain("20.0 %");
      expect(passed?.text).toContain(
        "9,800 paired held-out games in the simulator, five classes, exact McNemar p = 1.0e-12",
      );
      expect(passed?.text).toContain("a simulated pilot");
      expect(passed?.text).toContain(
        "The other figures on this panel were measured in Overgrowth and not refitted.",
      );

      const notShown = underdocksNote(f, "underdocks", tested({ [f]: "not-shown" }));
      expect(notShown?.kind).toBe("not-shown");
      expect(notShown?.text).toContain(`did not show ${ARMS[f].first} ahead of ${ARMS[f].second}`);
      expect(notShown?.text).toContain("not the same as showing that it does not help");
      expect(notShown?.text).not.toContain("Tested in simulation");

      const reversed = underdocksNote(f, "underdocks", tested({ [f]: "reversed" }));
      expect(reversed?.kind).toBe("reversed");
      expect(reversed?.text).toContain(`had ${ARMS[f].second} ahead of ${ARMS[f].first}`);
      expect(reversed?.text).toContain("20.0 %");
      expect(reversed?.text).toContain("30.0 %");
      expect(reversed?.text).not.toContain("Tested in simulation");
    }
  });

  it("names what each finding compared, in the words a player would use", () => {
    const text = (f: UnderdocksFinding) => underdocksNote(f, "underdocks", tested())?.text ?? "";
    expect(text("synergy")).toContain("picks cards by the index with the synergy term");
    expect(text("synergy")).toContain("without it");
    expect(text("values")).toContain("follows the card values shown here");
    expect(text("values")).toContain("for the hand-written rules");
    expect(text("neow")).toContain("takes the best-measured opening relic");
    expect(text("neow")).toContain("takes the first helpful relic");
    // each note speaks of its own finding only
    expect(text("synergy")).not.toContain("opening relic");
    expect(text("neow")).not.toContain("synergy term");
    expect(text("values")).not.toContain("synergy term");
  });

  it("prints the p of the test so that a p just under the level does not read as the other side of it", () => {
    const at = (p: number) =>
      underdocksNote("synergy", "underdocks", tested({}, { synergy: { p } }))?.text ?? "";
    expect(at(0.0166)).toContain("exact McNemar p = 0.0166)");
    expect(at(0.0167)).toContain("exact McNemar p = 0.0167)");
    expect(at(0.2)).toContain("exact McNemar p = 0.20)");
    expect(at(3e-5)).toContain("exact McNemar p = 3.0e-5)");
    expect(at(0)).toContain("exact McNemar p < 1e-300)");
  });

  it("says how big a passed result is beside the same arms in Overgrowth, and never says that it 'holds' without a size", () => {
    const beside = "in Overgrowth with the relics kept (+7.1 points: 40.4 % against 33.3 %)";
    const sizes: [UnderdocksSize, string][] = [
      ["smaller", `smaller than the difference ${beside}`],
      ["about-the-same", `about the same as the difference ${beside}`],
      ["larger", `larger than the difference ${beside}`],
    ];
    for (const [size, words] of sizes) {
      const text = underdocksNote("synergy", "underdocks", tested({}, { synergy: { size } }))?.text;
      expect(text).toContain(`That is ${words}`);
      expect(text).not.toContain(" holds");
      expect(text).not.toContain("the gain");
    }
    // a test that did not pass gets no size words; the Overgrowth difference is only stated, with the shares it is made of
    const notShown = underdocksNote(
      "synergy",
      "underdocks",
      tested({ synergy: "not-shown" }),
    )?.text;
    expect(notShown).not.toContain("That is smaller");
    expect(notShown).toContain(
      "The same arms differ by +7.1 points in Overgrowth with the relics kept (40.4 % against 33.3 %)",
    );
  });

  it("says when both arms got past the boss less often in Underdocks than in Overgrowth, so that fewer points are not read as a weaker effect", () => {
    // the fixture: 30.0 % and 20.0 % in Underdocks, 40.4 % and 33.3 % in Overgrowth
    const smaller = makeTest("passed", { size: "smaller" });
    expect(fallNote(smaller)).toBe(
      "Both arms got past the Act 1 boss less often in Underdocks, so a smaller number of points does not by itself mean a weaker effect.",
    );
    for (const size of ["about-the-same", "larger", null] as const) {
      const note = fallNote(makeTest("passed", { size }));
      expect(note).toBe(
        "Both arms got past the Act 1 boss less often in Underdocks than in Overgrowth.",
      );
      expect(note).not.toContain("weaker effect");
    }
    // it is a statement about the two shares, so it is made whichever way the test came out
    expect(fallNote(makeTest("not-shown", { size: null }))).toContain("less often in Underdocks");
    // and only when both fell: either arm doing as well or better says nothing
    expect(fallNote(makeTest("passed", { og: { ...OG, a: 0.3 } }))).toBe("");
    expect(fallNote(makeTest("passed", { og: { ...OG, b: 0.2 } }))).toBe("");
    expect(fallNote(makeTest("passed", { og: { ...OG, a: 0.25, b: 0.15 } }))).toBe("");
    expect(fallNote(makeTest("passed", { rates: [0.45, 0.4] }))).toBe("");
    // the note carries the sentence once
    const text = underdocksNote("synergy", "underdocks", tested())?.text ?? "";
    expect(text.split("less often in Underdocks").length - 1).toBe(1);
  });

  it("tells a run whose own class went the other way in its own games, and only that class", () => {
    const data = tested(
      {},
      { synergy: { own: { silent: "behind" } }, values: { own: { silent: "behind" } } },
    );
    for (const f of ["synergy", "values"] as const) {
      const silent = underdocksNote(f, "underdocks", data, "silent")?.text;
      expect(silent).toContain(
        `In the simulated Underdocks games of your own class alone, ${ARMS[f].second} came out ahead: 120 pairs got past the Act 1 boss only with ${ARMS[f].second} against 80 only with ${ARMS[f].first}`,
      );
      expect(underdocksNote(f, "underdocks", data, "Silent")?.text).toContain("your own class");
      expect(underdocksNote(f, "underdocks", data, "ironclad")?.text).not.toContain(
        "your own class",
      );
      expect(underdocksNote(f, "underdocks", data)?.text).not.toContain("your own class");
    }
    // a class that was merely not clear is not reported as behind
    const none = tested({}, { synergy: { own: { silent: "none" } } });
    expect(underdocksNote("synergy", "underdocks", none, "silent")?.text).not.toContain(
      "your own class",
    );
    // and a class that the study does not name says nothing
    expect(underdocksNote("synergy", "underdocks", data, "watcher")?.text).not.toContain(
      "your own class",
    );
  });
});

describe("a result the registered rule did not count (ADR-064 item 5)", () => {
  const withheld = (finding: UnderdocksFinding, over: Parameters<typeof makeTest>[1] = {}) =>
    tested(
      { [finding]: "not-shown" },
      { [finding]: { primary: "passed", withheld: "robustness", ...over } },
    );

  it("is told as what it was: ahead on the pairs both games completed, and not counted, with the reason and the figures", () => {
    const data = withheld("synergy", { allPairs: { p: 0.3, aRate: 0.31, bRate: 0.3 } });
    const note = underdocksNote("synergy", "underdocks", data);
    expect(note?.kind).toBe("not-shown");
    expect(note?.text).toContain(
      "had the pilot with the synergy term ahead of the pilot without it on the pairs in which both games ended in a win or a death",
    );
    expect(note?.text).toContain("30.0 %");
    expect(note?.text).toContain(
      "But an analysis of every pair of seeds, a game that ended in an error counted by how far it got, did not agree (31.0 % against 30.0 %, p = 0.30)",
    );
    expect(note?.text).toContain("so the registered rule does not count it as shown");
    expect(note?.text).toContain("not the same as showing that it does not help");
    expect(note?.text).not.toContain("Tested in simulation");
    expect(note?.text).not.toMatch(/did not show .* ahead of/);
  });

  it("says that too many dropped pairs withheld it, and both reasons when both did", () => {
    const dropped = underdocksNote(
      "values",
      "underdocks",
      tested(
        { values: "not-shown" },
        {
          values: {
            primary: "passed",
            withheld: "excluded",
            allPairs: { excludedFraction: 0.125 },
          },
        },
      ),
    );
    expect(dropped?.text).toContain(
      "the test dropped 12.50 % of the pairs (games that did not end in a win or a death: a simulator error, a step limit or a timeout), more than the tenth the registration allows",
    );
    expect(
      withheldWords({
        ...makeTest("not-shown", { primary: "passed", withheld: "excluded" }),
        downgrades: ["excluded", "robustness"],
      }),
    ).toMatch(/the test dropped 2\.00 % of the pairs .*, and an analysis of every pair of seeds/);
  });

  it("is told as a reversal that was not counted when it was the second arm that was ahead", () => {
    const data = tested(
      { neow: "not-shown" },
      { neow: { primary: "reversed", withheld: "robustness" } },
    );
    const note = underdocksNote("neow", "underdocks", data);
    expect(note?.text).toContain(
      "had the pilot that takes the first helpful relic ahead of the pilot that takes the best-measured opening relic",
    );
    expect(note?.text).toContain("so the registered rule does not count it as a reversal");
  });

  it("licenses no advice, whatever the class's own games showed", () => {
    const data = tested(
      { neow: "not-shown" },
      {
        neow: {
          primary: "passed",
          withheld: "robustness",
          own: Object.fromEntries(CLASSES.map((c) => [c, "ahead"])),
        },
      },
    );
    for (const c of CLASSES)
      expect(neowAdviceAllowedInUnderdocks(c, "underdocks", data)).toBe(false);
  });

  it("is on the methods page with the figures of the analysis of every pair and the reason", () => {
    const { container } = render(
      <UnderdocksPanel data={withheld("synergy", { allPairs: { p: 0.3 } })} />,
    );
    const block = container.querySelector("#underdocks-synergy");
    expect(block).toHaveTextContent("not shown ahead in Underdocks");
    expect(block).toHaveTextContent("pass withheld by the rule");
    expect(block).toHaveTextContent("Every pair (errors counted by how far they got)");
    expect(block).toHaveTextContent("The analysis of every pair.");
    expect(block).toHaveTextContent(
      "The primary test had the first arm ahead, and an analysis of every pair of seeds",
    );
    expect(block).toHaveTextContent("so the rule does not count it");
    expect(container).toHaveTextContent("2 of 3 ahead in Underdocks");
  });

  it("is said on the page for a result that stands: the analysis agrees, or could not change the reading", () => {
    const stands = render(<UnderdocksPanel data={tested({}, {})} />);
    expect(stands.container.querySelector("#underdocks-synergy")).toHaveTextContent(
      "It agrees with the primary test.",
    );
    expect(stands.container.querySelector("#underdocks-synergy")).not.toHaveTextContent(
      "withheld by the rule",
    );
    stands.unmount();
    const none = render(<UnderdocksPanel data={tested({ synergy: "not-shown" })} />);
    expect(none.container.querySelector("#underdocks-synergy")).toHaveTextContent(
      "The primary test did not pass, so this analysis could not change the reading.",
    );
  });

  it("is a test that was not shown ahead on the landing page's line, like any other", () => {
    const covered = underdocksCoverage(withheld("synergy"));
    expect(covered?.detail).toContain("the synergy term not shown ahead");
  });
});

describe("the opening-relic advice in Underdocks", () => {
  it("is the rule of ADR-055 in Overgrowth, when the Act 1 is not known, and until the Underdocks test has been run", () => {
    for (const act1 of ["overgrowth", null, undefined]) {
      expect(neowAdviceAllowedInUnderdocks("silent", act1, tested({ neow: "reversed" }))).toBe(
        true,
      );
    }
    expect(neowAdviceAllowedInUnderdocks("silent", "underdocks", REGISTERED)).toBe(true);
    expect(neowAdviceAllowedInUnderdocks("silent", "underdocks", NOT_REGISTERED)).toBe(true);
    expect(underdocksTested(REGISTERED)).toBe(false);
    expect(underdocksTested(NOT_REGISTERED)).toBe(false);
    expect(underdocksTested(tested())).toBe(true);
  });

  it("needs the pooled test to have passed and the class's own games to have licensed the rule", () => {
    const data = tested(
      { neow: "passed" },
      { neow: { own: { silent: "none", regent: "behind" } } },
    );
    expect(neowAdviceAllowedInUnderdocks("ironclad", "underdocks", data)).toBe(true);
    expect(neowAdviceAllowedInUnderdocks("Ironclad", "underdocks", data)).toBe(true);
    expect(neowAdviceAllowedInUnderdocks("silent", "underdocks", data)).toBe(false);
    expect(neowAdviceAllowedInUnderdocks("regent", "underdocks", data)).toBe(false);
    // a class the study does not name is not licensed
    expect(neowAdviceAllowedInUnderdocks("watcher", "underdocks", data)).toBe(false);
    // a pooled test that was not shown ahead licenses no class, however its own games went
    for (const verdict of ["not-shown", "reversed"] as const) {
      const none = tested(
        { neow: verdict },
        { neow: { own: Object.fromEntries(CLASSES.map((c) => [c, "ahead"])) } },
      );
      for (const c of CLASSES) {
        expect(neowAdviceAllowedInUnderdocks(c, "underdocks", none)).toBe(false);
        // ... while in Overgrowth the rule stands
        expect(neowAdviceAllowedInUnderdocks(c, "overgrowth", none)).toBe(true);
      }
    }
  });
});

describe("the callout", () => {
  it("is the one boxed note, and adds the Underdocks test only when it is given the finding it rests on", () => {
    const bare = render(<UnderdocksNote>text</UnderdocksNote>);
    const note = bare.container.querySelector("[data-underdocks-note]");
    expect(note).toHaveAttribute("role", "note");
    expect(note).not.toHaveAttribute("data-underdocks-result");
    expect(note).toHaveTextContent("text");
    expect(note).not.toHaveTextContent("In Underdocks.");
    bare.unmount();

    const withResult = render(
      <UnderdocksNote finding="synergy" data={tested({ synergy: "not-shown" })}>
        text
      </UnderdocksNote>,
    );
    const quoted = withResult.container.querySelector("[data-underdocks-note]");
    expect(quoted).toHaveAttribute("data-underdocks-result", "not-shown");
    expect(quoted).toHaveTextContent("text In Underdocks.");
    expect(quoted).toHaveTextContent("did not show the pilot with the synergy term ahead");
    expect(screen.getByRole("link", { name: "Evidence & methods" })).toHaveAttribute(
      "href",
      "/methods#underdocks",
    );
  });

  it("says that the test is registered while it has not been run, and tells the run's own class when its games went the other way", () => {
    const registered = render(
      <UnderdocksNote finding="neow" data={REGISTERED}>
        text
      </UnderdocksNote>,
    );
    expect(registered.container.querySelector("[data-underdocks-note]")).toHaveAttribute(
      "data-underdocks-result",
      "registered",
    );
    expect(registered.container).toHaveTextContent("has not been run");
    registered.unmount();

    const data = tested({}, { neow: { own: { silent: "behind" } } });
    const silent = render(
      <UnderdocksNote finding="neow" character="silent" data={data}>
        text
      </UnderdocksNote>,
    );
    expect(silent.container).toHaveTextContent("your own class alone");
    silent.unmount();
    const ironclad = render(
      <UnderdocksNote finding="neow" character="ironclad" data={data}>
        text
      </UnderdocksNote>,
    );
    expect(ironclad.container).not.toHaveTextContent("your own class");
  });
});

describe("the advisor panels", () => {
  function deck(): ReturnType<typeof deckSynergy> {
    const card = getCard("STRIKE_IRONCLAD");
    if (!card) throw new Error("no card");
    const entries: DeckEntry[] = [{ card, count: 5 }];
    return deckSynergy(entries, 0, "ironclad");
  }
  const offered = (c: "ironclad" | "silent") =>
    (setFor(c)?.cards ?? []).slice(0, 3).map((x) => x.id);
  const own = (container: HTMLElement) => container.querySelector("[data-underdocks-note]");

  it("the synergy panel tells a run in Underdocks what was tested, and a run in Overgrowth nothing", () => {
    const { container, rerender } = render(
      <SynergyPanel
        synergy={deck()}
        act1={{ version: "underdocks", character: "ironclad" }}
        underdocksData={tested({ synergy: "not-shown" })}
      />,
    );
    expect(own(container)).toHaveAttribute("data-underdocks-result", "not-shown");
    expect(own(container)).toHaveTextContent("Your Act 1 is Underdocks.");
    expect(own(container)).toHaveTextContent("the pilot with the synergy term");
    rerender(
      <SynergyPanel
        synergy={deck()}
        act1={{ version: "overgrowth", character: "ironclad" }}
        underdocksData={tested()}
      />,
    );
    expect(own(container)).toBeNull();
    rerender(<SynergyPanel synergy={deck()} underdocksData={tested()} />);
    expect(own(container)).toBeNull();
  });

  it("the simulated second opinion on card rewards carries the note for the card values", () => {
    const run = { ...newRun("ironclad"), act1: "underdocks" as const };
    const { container, rerender } = render(
      <SimulationOpinion
        run={run}
        offered={offered("ironclad")}
        heuristic={{ kind: "skip" }}
        underdocksData={REGISTERED}
      />,
    );
    expect(own(container)).toHaveAttribute("data-underdocks-result", "registered");
    expect(own(container)).toHaveTextContent("You said you are in Underdocks.");
    rerender(
      <SimulationOpinion
        run={{ ...run, act1: "overgrowth" }}
        offered={offered("ironclad")}
        heuristic={{ kind: "skip" }}
        underdocksData={REGISTERED}
      />,
    );
    expect(own(container)).toBeNull();
    expect(container).toHaveTextContent("none was fitted in Underdocks");
  });

  it("each panel carries the note of its own finding, from the data it is given", () => {
    const data = tested();
    const synergy = render(
      <SynergyPanel
        synergy={deck()}
        act1={{ version: "underdocks", character: "ironclad" }}
        underdocksData={data}
      />,
    );
    expect(own(synergy.container)).toHaveTextContent("the index with the synergy term");
    expect(own(synergy.container)).not.toHaveTextContent("card values shown here");
    expect(own(synergy.container)).not.toHaveTextContent("opening relic");
    synergy.unmount();

    const run = { ...newRun("ironclad"), act1: "underdocks" as const };
    const values = render(
      <SimulationOpinion
        run={run}
        offered={offered("ironclad")}
        heuristic={{ kind: "skip" }}
        underdocksData={data}
      />,
    );
    expect(own(values.container)).toHaveTextContent("follows the card values shown here");
    expect(own(values.container)).not.toHaveTextContent("synergy term");
    expect(own(values.container)).not.toHaveTextContent("opening relic");
    values.unmount();

    const neow = render(
      <NeowOffer
        run={run}
        disabled={false}
        recorded={[]}
        onRecord={() => undefined}
        data={NEOW}
        underdocksData={data}
      />,
    );
    expect(own(neow.container)).toHaveTextContent("takes the best-measured opening relic");
    expect(own(neow.container)).not.toHaveTextContent("synergy term");
    expect(own(neow.container)).not.toHaveTextContent("card values shown here");
  });

  it("each panel tells the run's own class when its own games went the other way", () => {
    const data = tested(
      {},
      {
        synergy: { own: { silent: "behind" } },
        values: { own: { silent: "behind" } },
        neow: { own: { silent: "behind" } },
      },
    );
    const synergy = render(
      <SynergyPanel
        synergy={deck()}
        act1={{ version: "underdocks", character: "silent" }}
        underdocksData={data}
      />,
    );
    expect(synergy.container).toHaveTextContent(
      `${ARMS.synergy.second} came out ahead: 120 pairs got past the Act 1 boss only with ${ARMS.synergy.second}`,
    );
    synergy.unmount();
    const run = { ...newRun("silent"), act1: "underdocks" as const };
    const values = render(
      <SimulationOpinion
        run={run}
        offered={offered("silent")}
        heuristic={{ kind: "skip" }}
        underdocksData={data}
      />,
    );
    expect(values.container).toHaveTextContent(
      `${ARMS.values.second} came out ahead: 120 pairs got past the Act 1 boss only with ${ARMS.values.second}`,
    );
  });

  describe("What did Neow offer?", () => {
    // two helpful relics that the site's data separate clearly, so that the simulated pilot's pick is on screen whenever the advice is
    // allowed (without that, a test that the pick is gone could not fail)
    const PAIR = ["PRECISE_SCISSORS", "STONE_HUMIDIFIER"] as const;
    function setup(
      act1: "underdocks" | "overgrowth",
      character: "silent" | "ironclad",
      underdocksData: UnderdocksData,
    ) {
      const run = { ...newRun(character), act1 };
      render(
        <NeowOffer
          run={run}
          disabled={false}
          recorded={[]}
          onRecord={() => undefined}
          data={NEOW}
          underdocksData={underdocksData}
        />,
      );
      fireEvent.change(screen.getByLabelText("First helpful option"), {
        target: { value: PAIR[0] },
      });
      fireEvent.change(screen.getByLabelText("Second helpful option"), {
        target: { value: PAIR[1] },
      });
    }
    const PICK = "Simulated pilot’s pick";

    it("names the relic in Overgrowth as before, whatever the Underdocks test found", () => {
      setup("overgrowth", "silent", tested({ neow: "reversed" }));
      expect(document.body.textContent).toContain("would take");
      expect(screen.getByText(PICK)).toBeInTheDocument();
      expect(document.body.textContent).not.toContain("does not say which relic to take");
      expect(document.body.querySelector("[data-underdocks-note]")).toBeNull();
    });

    it("keeps naming the relic in Underdocks while the test is only registered, with the note", () => {
      setup("underdocks", "silent", REGISTERED);
      expect(document.body.textContent).toContain("would take");
      expect(screen.getByText(PICK)).toBeInTheDocument();
      expect(document.body.querySelector("[data-underdocks-result='registered']")).not.toBeNull();
    });

    it("names the relic in Underdocks when the test passed and the class's own games had the rule ahead", () => {
      setup("underdocks", "silent", tested());
      expect(document.body.textContent).toContain("would take");
      expect(screen.getByText(PICK)).toBeInTheDocument();
      expect(document.body.querySelector("[data-underdocks-result='passed']")).not.toBeNull();
    });

    it("withholds the relic when the class's own games did not show the rule ahead, and says so", () => {
      setup(
        "underdocks",
        "silent",
        tested({ neow: "passed" }, { neow: { own: { silent: "none" } } }),
      );
      expect(document.body.textContent).not.toContain("would take");
      expect(document.body.textContent).toContain(
        "SLAY2 does not say which relic to take in Underdocks",
      );
      expect(document.body.textContent).toContain(
        "it has no tested advice for Silent there, because Silent's own Underdocks games did not show the rule ahead",
      );
      expect(document.body.textContent).not.toContain("license");
      // the same two relics show the pick when the advice is allowed (the test above), so its absence here is the withholding's doing
      expect(screen.queryByText(PICK)).toBeNull();
    });

    it("tells the class when its own games went the other way, as well as withholding the relic", () => {
      setup(
        "underdocks",
        "silent",
        tested({ neow: "passed" }, { neow: { own: { silent: "behind" } } }),
      );
      expect(document.body.textContent).not.toContain("would take");
      expect(document.body.textContent).toContain(
        "In the simulated Underdocks games of your own class alone",
      );
      expect(screen.queryByText(PICK)).toBeNull();
    });

    it("says, when the test's pass was withheld by the registered conditions, that this is why there is no advice", () => {
      setup(
        "underdocks",
        "ironclad",
        tested(
          { neow: "not-shown" },
          {
            neow: {
              primary: "passed",
              withheld: "robustness",
              allPairs: { p: 0.3, aRate: 0.31, bRate: 0.3 },
            },
          },
        ),
      );
      expect(document.body.textContent).not.toContain("would take");
      expect(document.body.textContent).toContain(
        "because the Underdocks test had the rule ahead on the pairs both games completed, but an analysis of every pair of seeds",
      );
      expect(document.body.textContent).toContain(
        "so the registered rule does not count it as shown",
      );
      expect(screen.queryByText(PICK)).toBeNull();
    });

    it("says the opposite when what the rule withheld was a reversal: the first helpful relic was ahead, and the rule does not count it", () => {
      setup(
        "underdocks",
        "ironclad",
        tested(
          { neow: "not-shown" },
          {
            neow: {
              primary: "reversed",
              withheld: "excluded",
              allPairs: { excludedFraction: 0.12 },
            },
          },
        ),
      );
      expect(document.body.textContent).not.toContain("would take");
      const text = document.body.textContent;
      expect(text).toContain(
        "because the Underdocks test had the first helpful relic ahead of the rule on the pairs both games completed, but the test dropped",
      );
      expect(text).toContain("so the registered rule does not count it as a reversal");
      expect(text).not.toContain("the Underdocks test had the rule ahead on the pairs");
      expect(screen.queryByText(PICK)).toBeNull();
    });

    it("withholds the relic for every class when the test was not shown ahead, or had the baseline ahead, and says which", () => {
      setup("underdocks", "ironclad", tested({ neow: "not-shown" }));
      expect(document.body.textContent).not.toContain("would take");
      expect(document.body.textContent).toContain(
        "SLAY2 does not say which relic to take in Underdocks",
      );
      expect(document.body.textContent).toContain(
        "because the Underdocks test did not show the rule ahead",
      );
      expect(document.body.querySelector("[data-underdocks-result='not-shown']")).not.toBeNull();
      expect(screen.queryByText(PICK)).toBeNull();
      cleanup();
      setup("underdocks", "ironclad", tested({ neow: "reversed" }));
      expect(document.body.textContent).toContain(
        "because in Underdocks the test had the first helpful relic ahead of the rule",
      );
      expect(screen.queryByText(PICK)).toBeNull();
    });
  });
});

describe("the /methods section", () => {
  it("renders nothing when the study is not registered", () => {
    const { container } = render(<UnderdocksPanel data={NOT_REGISTERED} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says the study is registered and not run, with what was checked on development seeds, and what it does not cover", () => {
    const { container } = render(<UnderdocksPanel data={REGISTERED} />);
    expect(container.querySelector("#underdocks")).not.toBeNull();
    expect(container.querySelector("h2")?.textContent).toBe(
      "Do these results carry over to Underdocks?",
    );
    expect(container).toHaveTextContent("registered (ADR-064), not run yet");
    expect(container).toHaveTextContent("Not run yet.");
    expect(container).toHaveTextContent("3,500 games");
    expect(container).toHaveTextContent(
      "47.8% of 483 completed games in Underdocks against 68.0% of 491",
    );
    expect(container).toHaveTextContent("compares no pilots");
    expect(container).toHaveTextContent("0.0167");
    expect(container).toHaveTextContent("A fit in Underdocks");
    expect(container).toHaveTextContent("never compared with the live game");
    expect(container.querySelector("#underdocks-synergy")).toBeNull();
    // before the study has been run, the paragraph above says that every result was measured in Overgrowth
    expect(container).toHaveTextContent("Every result on this page was measured with Act 1");
    expect(container).not.toHaveTextContent("Until this study");
  });

  it("shows each of the three tests as it came out, with its size beside the Overgrowth result and its class table", () => {
    const data = tested(
      { synergy: "passed", values: "not-shown", neow: "reversed" },
      { synergy: { size: "larger" }, neow: { own: { ironclad: "ahead", silent: "none" } } },
    );
    const { container } = render(<UnderdocksPanel data={data} />);
    expect(container).toHaveTextContent("1 of 3 ahead in Underdocks");
    const synergy = container.querySelector("#underdocks-synergy");
    expect(synergy).toHaveTextContent("ahead in Underdocks");
    expect(synergy).toHaveTextContent(
      "1,700 pairs only with the first arm, 1,400 only with the second",
    );
    expect(synergy).toHaveTextContent("larger than in Overgrowth");
    expect(synergy).toHaveTextContent("+7.1 points");
    expect(synergy).toHaveTextContent(
      "the lower end of its interval at the level of the test is above the Overgrowth difference",
    );
    expect(container.querySelector("#underdocks-values")).toHaveTextContent(
      "not shown ahead in Underdocks",
    );
    expect(container.querySelector("#underdocks-neow")).toHaveTextContent("behind in Underdocks");
    expect(container).not.toHaveTextContent("Not run yet.");
    expect(container.querySelectorAll("table")).toHaveLength(3);
  });

  it("words the size of a passed result by where its interval lies against the Overgrowth difference", () => {
    const words: [UnderdocksSize, string][] = [
      [
        "smaller",
        "the upper end of its interval at the level of the test is below the Overgrowth difference",
      ],
      [
        "about-the-same",
        "the Overgrowth difference lies inside its interval at the level of the test",
      ],
      [
        "larger",
        "the lower end of its interval at the level of the test is above the Overgrowth difference",
      ],
    ];
    for (const [size, because] of words) {
      const { container, unmount } = render(
        <UnderdocksPanel data={tested({}, { synergy: { size } })} />,
      );
      expect(container.querySelector("#underdocks-synergy")).toHaveTextContent(because);
      unmount();
    }
    // a test that was not shown ahead gets no size words (the sentence that both arms fell is about the two shares, not about the size)
    const none = render(<UnderdocksPanel data={tested({ synergy: "not-shown" })} />);
    const block = none.container.querySelector("#underdocks-synergy");
    for (const phrase of [
      "smaller than in Overgrowth",
      "about the same as in Overgrowth",
      "larger than in Overgrowth",
    ]) {
      expect(block).not.toHaveTextContent(phrase);
    }
    expect(block).not.toHaveTextContent("The result in Underdocks is");
  });

  it("says which classes have tested advice, and none when the pooled test did not pass", () => {
    const some = render(
      <UnderdocksPanel
        data={tested(
          { neow: "passed" },
          {
            neow: {
              own: {
                ironclad: "ahead",
                silent: "none",
                regent: "behind",
                necrobinder: "ahead",
                defect: "none",
              },
            },
          },
        )}
      />,
    );
    expect(some.container).toHaveTextContent("Classes with tested advice: Ironclad, Necrobinder.");
    expect(some.container.textContent).not.toContain("icense");
    some.unmount();
    const none = render(
      <UnderdocksPanel
        data={tested(
          { neow: "not-shown" },
          { neow: { own: Object.fromEntries(CLASSES.map((c) => [c, "ahead"])) } },
        )}
      />,
    );
    expect(none.container).toHaveTextContent("Classes with tested advice: none.");
  });

  it("says 'until this study' only once the study has been run", () => {
    const done = render(<UnderdocksPanel data={tested()} />);
    expect(done.container).toHaveTextContent("Until this study, every result on this page");
    expect(done.container.textContent).not.toMatch(
      /(^|\. )Every result on this page was measured with Act 1/,
    );
  });

  it("shows the secondary endpoints it registered, and gives each class table its own caption", () => {
    const { container } = render(<UnderdocksPanel data={tested()} />);
    const synergy = container.querySelector("#underdocks-synergy");
    expect(synergy).toHaveTextContent("Past the Act-2 boss (secondary)");
    expect(synergy).toHaveTextContent("Wins");
    const captions = [...container.querySelectorAll("caption")].map((c) => c.textContent);
    expect(captions).toHaveLength(3);
    expect(new Set(captions).size).toBe(3);
  });

  it("says all three are ahead when they all passed, and never that they 'hold'", () => {
    const { container } = render(<UnderdocksPanel data={tested()} />);
    expect(container).toHaveTextContent("all three ahead in Underdocks");
    expect(container.textContent).not.toMatch(/\bhold in Underdocks/);
  });

  it("states what was and was not read from the simulator's Underdocks, and that nothing was fitted there", () => {
    const { container } = render(<UnderdocksPanel data={REGISTERED} />);
    expect(container).toHaveTextContent("nothing refitted");
    expect(container).toHaveTextContent("gap G5");
    expect(container).toHaveTextContent("Ascensions above 0 in Underdocks");
  });
});

describe("the landing page's coverage line", () => {
  it("is absent when the study is not registered, and says it is registered and not run before the tests", () => {
    expect(underdocksCoverage(NOT_REGISTERED)).toBeNull();
    const registered = underdocksCoverage(REGISTERED);
    expect(registered?.state).toBe("registered");
    expect(registered?.detail).toContain(
      "Every simulated result on this site was measured with Act 1 in Overgrowth",
    );
    expect(registered?.detail).toContain("registered (ADR-064) and has not been run yet");
  });

  it("says how each test came out, with the size of a passed one beside Overgrowth, and that nothing was fitted in Underdocks", () => {
    const data = tested(
      { synergy: "passed", values: "not-shown", neow: "reversed" },
      { synergy: { size: "larger" } },
    );
    const covered = underdocksCoverage(data);
    expect(covered?.state).toBe("tested");
    expect(covered?.detail).toContain(
      "the synergy term ahead (larger than in Overgrowth), the card values not shown ahead",
    );
    expect(covered?.detail).toContain("the opening-relic rule behind");
    expect(covered?.detail).toContain("Nothing was fitted in Underdocks");
    expect(covered?.detail).not.toMatch(/\bhold/);
    // a passed result without a size to set it beside says only that it was ahead
    const bare = underdocksCoverage(tested({}, { synergy: { size: null } }));
    expect(bare?.detail).toContain("the synergy term ahead, the card values");
  });
});

describe("the data the site ships", () => {
  it("is the registered study, with the precondition that was passed before the registration", () => {
    expect(UNDERDOCKS.registered).toBe(true);
    expect(UNDERDOCKS.adr).toBe("ADR-064");
    expect(UNDERDOCKS.seeds).toBe(2000);
    expect(UNDERDOCKS.level).toBeCloseTo(0.05 / 3, 12);
    expect(UNDERDOCKS.classLevel).toBe(0.01);
    expect(UNDERDOCKS.precondition?.games).toBe(3500);
    expect(UNDERDOCKS.precondition?.sha256).toMatch(/^[0-9a-f]{64}$/);
    // it ran in both Act 1s, and the act could be got through in Underdocks
    const shown = UNDERDOCKS.precondition?.pooledShownValues;
    expect(shown?.underdocks.rate).toBeGreaterThanOrEqual(0.1);
    expect(shown?.overgrowth.completed).toBeGreaterThan(0);
  });

  it("carries, for any test that has been run, the verdict the registered rule gives its numbers, and nothing before", () => {
    const tests = UNDERDOCKS.tests;
    if (!tests) {
      // registered and not run: no test, no coverage beyond the registration, every note says so
      expect(underdocksTested(UNDERDOCKS)).toBe(false);
      expect(underdocksCoverage(UNDERDOCKS)?.state).toBe("registered");
      for (const f of FINDINGS) {
        expect(underdocksTest(f)).toBeNull();
        expect(underdocksNote(f, "underdocks", UNDERDOCKS)?.kind).toBe("registered");
      }
      return;
    }
    const level = UNDERDOCKS.level ?? 0;
    expect(Object.keys(tests).sort()).toEqual(["neow", "synergy", "values"]);
    for (const f of FINDINGS) {
      const t = tests[f];
      const aheadByRule =
        t.reachedAct2.pairedTable.mcnemar_p < level &&
        t.reachedAct2.a.rate > t.reachedAct2.b.rate &&
        (t.clusteredDifference.ciAtLevel.ci[0] ?? 0) > 0;
      const behindByRule =
        t.reachedAct2.pairedTable.mcnemar_p < level &&
        t.reachedAct2.a.rate < t.reachedAct2.b.rate &&
        (t.clusteredDifference.ciAtLevel.ci[1] ?? 0) < 0;
      expect(t.verdict, f).toBe(aheadByRule ? "passed" : behindByRule ? "reversed" : "not-shown");
      expect(t.size === null, f).toBe(t.verdict !== "passed");
      expect(t.clusteredDifference.ciAtLevel.level).toBeCloseTo(1 - level, 12);
      expect(t.pairedSeeds).toBe(10000);
      expect(t.bothCompleted + t.excludedNotCompleted).toBe(t.pairedSeeds);
      expect(t.members.map((m) => m.character).sort()).toEqual([...CLASSES].sort());
      expect(t.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("gives a run in Overgrowth no note and no withholding, whatever the shipped data hold", () => {
    for (const f of FINDINGS) expect(underdocksNote(f, "overgrowth", UNDERDOCKS)).toBeNull();
    for (const c of CLASSES) {
      expect(neowAdviceAllowedInUnderdocks(c, "overgrowth", UNDERDOCKS)).toBe(true);
      expect(neowAdviceAllowedInUnderdocks(c, null, UNDERDOCKS)).toBe(true);
    }
  });
});
