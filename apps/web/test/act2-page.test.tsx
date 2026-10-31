import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LaterStudy } from "@/components/insights/LaterStudy";
import {
  testSentence,
  type Act2ClassResult,
  type Act2Data,
  type Act2DevRow,
  type Act2FitClass,
  type Act2Test,
  type Act2TestKey,
  type Act2Verdict,
} from "@/lib/act2";

afterEach(cleanup);

/** The element at an index of a list the test has just counted (a missing one is a failure of the test, not of the type). */
function at<T>(list: readonly T[], i: number): T {
  const v = list[i];
  if (v === undefined) throw new Error(`no element ${String(i)}`);
  return v;
}

/**
 * The Act-2 study as a visitor reads it (ADR-060): each stage the repository can be at renders what it has and nothing more, the sentence
 * of a test follows its verdict, a test the screen did not send forward says why it was not played, and nothing is a placeholder. The data
 * are made up here, consistent with each other only as far as the page reads them; the exporter's tests check the data themselves.
 */
const CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"] as const;
const nameOf = (id: string): string => id.replace(/_/g, " ").toLowerCase();

const fitClass = (character: string, fitted: boolean, passed = 300): Act2FitClass => ({
  character,
  file: `experiments/cardvalue/${character}-a0-act2-v1.json`,
  sha256: "a".repeat(64),
  fitted,
  reason: fitted ? null : "kept",
  bossFights: character === "silent" ? 118 : 900,
  passed: character === "silent" ? 2 : passed,
  gain: character === "silent" ? null : fitted ? 0.0265 : -0.0004,
  bestL2: character === "silent" ? null : 30,
  indicatorPenalty: 10,
  logLoss:
    character === "silent"
      ? null
      : { baseRate: 0.59, scaleOnly: 0.462, full: fitted ? 0.435 : 0.462 },
  scaleOnly: character === "silent" ? null : { estimate: 0.254, ci95: [0.206, 0.31] },
  moved: fitted
    ? [{ id: "ANGER", shown: 0.83, value: 0.03, delta: -0.23, ci95: [-0.4, -0.05], decks: 400 }]
    : [],
  movedCount: fitted ? 13 : 0,
  signFlips: fitted ? 24 : 0,
  cards: 99,
});

const devRow = (
  arm: string,
  difference: number,
  eligible: boolean,
  lateThreshold: number | null = null,
): Act2DevRow => ({
  arm,
  lateThreshold,
  pairs: 2990,
  excluded: 10,
  shares: { arm: 0.1 + difference, baseline: 0.1 },
  difference,
  armOnly: 100 + Math.round(difference * 1000),
  baselineOnly: 100,
  p: eligible ? 0.03 : 0.6,
  eligible,
  actOne: { arm: 0.6, baseline: 0.6, differs: 0 },
  wins: { arm: 3, baseline: 3 },
});

const classResult = (character: string, verdict: Act2ClassResult["verdict"]): Act2ClassResult => ({
  character,
  pairs: 1900,
  shares: { arm: 0.12, baseline: 0.1 },
  difference: 0.02,
  armOnly: 80,
  baselineOnly: 40,
  p: 0.001,
  verdict,
  actOne: { arm: 0.6, baseline: 0.6, armOnly: 0, baselineOnly: 0 },
  wins: { arm: 1, baseline: 1 },
  meanFloorDifference: 0.3,
});

const test = (key: Act2TestKey, verdict: Act2Verdict, difference = 0.012): Act2Test => ({
  key,
  arm: key === "L" ? "lead" : key === "V" ? "v" : "p020",
  file: `experiments/act2/pooled-act2-${key}.json`,
  sha256: "b".repeat(64),
  pairs: 9700,
  pairedSeeds: 10000,
  excluded: 300,
  notFinished: { a: 150, b: 150 },
  shares: { arm: 0.106 + difference, baseline: 0.106 },
  games: { arm: 1100, baseline: 1000 },
  difference,
  ci:
    verdict === "passed"
      ? [0.004, 0.02]
      : verdict === "reversed"
        ? [-0.02, -0.004]
        : [-0.006, 0.03],
  ci95: [0.005, 0.019],
  armOnly: 300,
  baselineOnly: 180,
  p: verdict === "not-shown" ? 0.2 : 1e-6,
  verdict,
  actOne: { shares: { arm: 0.6, baseline: 0.66 }, armOnly: 100, baselineOnly: 400, p: 1e-30 },
  wins: { arm: 160, baseline: 158, p: 0.9 },
  floorDifference: { meanAMinusB: 0.4, ci95: [0.2, 0.6] },
  perClass: CLASSES.map((c) => classResult(c, c === "silent" ? "level" : "arm")),
});

function data(over: Partial<Act2Data> = {}): Act2Data {
  return {
    adr: "ADR-060",
    registered: true,
    level: 0.05 / 3,
    classLevel: 0.01,
    screenLevel: 0.1,
    gate: 0.002,
    seeds: 2000,
    frozen: true,
    fit: {
      classes: [
        fitClass("ironclad", true, 422),
        fitClass("silent", false),
        fitClass("regent", false),
        fitClass("necrobinder", false),
        fitClass("defect", true, 201),
      ],
      anyFitted: true,
    },
    dev: null,
    tests: null,
    ...over,
  };
}

const dev = (
  overrides: Partial<NonNullable<Act2Data["dev"]>> = {},
): NonNullable<Act2Data["dev"]> => ({
  file: "experiments/act2/dev-selection.json",
  sha256: "c".repeat(64),
  slice: { partition: "dev", offset: 1000, n: 600 },
  arms: [
    devRow("lead", -0.02, false),
    devRow("p020", 0.012, true, 0.2),
    devRow("pnone", -0.01, false, 100),
    devRow("v", 0.001, false),
  ],
  P: { advance: true, arm: "p020", lateThreshold: 0.2 },
  V: { advance: false, anyClassFitted: true },
  ...overrides,
});

const results = (...ts: Act2Test[]): NonNullable<Act2Data["tests"]> => ({
  results: Object.fromEntries(ts.map((t) => [t.key, t])),
  determinism: { shared: 9738, identical: 9738, different: 0 },
  robustness: null,
});

function show(d: Act2Data) {
  return render(<LaterStudy data={d} nameOf={nameOf} />);
}

describe("the fit stage", () => {
  it("shows each class's runs, the weight of the shown ranking and whether a card-specific part was found, from the data", () => {
    const { container } = show(data());
    const table = screen.getByRole("table", { name: /how much of the shown ranking carries over/ });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(6); // the header and five classes
    const ironclad = within(at(rows, 1));
    expect(ironclad.getByText(/×0\.25 \(0\.21 to 0\.31\)/)).toBeInTheDocument();
    expect(
      ironclad.getByText(/found: 13 cards, held-out loss 0\.435 against 0\.462/),
    ).toBeInTheDocument();
    expect(within(at(rows, 2)).getByText("not fitted")).toBeInTheDocument();
    expect(within(at(rows, 2)).getByText(/too few runs to ask \(2 passed\)/)).toBeInTheDocument();
    expect(
      within(at(rows, 3)).getByText(
        /none found \(held-out gain −0\.0004 nats a fight, below 0\.002\)/,
      ),
    ).toBeInTheDocument();
    expect(container).toHaveTextContent("a card worth +1.0 at the first boss is worth about +0.25");
  });

  it("lists the cards whose value moved for the fitted classes only, with names and signs", () => {
    show(data());
    const summaries = screen.getAllByText(/cards with an interval that excludes zero/);
    expect(summaries).toHaveLength(2); // Ironclad and Defect
    const table = at(screen.getAllByRole("table", { name: /differs most from the shown one/ }), 0);
    expect(within(table).getByText("anger")).toBeInTheDocument();
    expect(table).toHaveTextContent("+0.83");
    expect(table).toHaveTextContent("−0.23 (−0.40 to −0.05)");
  });

  it("has no development screen and no tests before they exist, and says it asks and fixed the reading first", () => {
    const { container } = show(data());
    expect(screen.queryByText("The development screen")).toBeNull();
    expect(screen.queryByText("The held-out tests")).toBeNull();
    expect(container).toHaveTextContent(
      "fixed how each would be read before any game of it was played (ADR-060)",
    );
    expect(container).toHaveTextContent("none is about winning");
    expect(container).toHaveTextContent(
      "the fit is done; the development screen and the held-out games have not been played, so there is no test result yet",
    );
  });
});

describe("the development screen", () => {
  it("lists every candidate with its figures and marks the one that went forward", () => {
    show(data({ dev: dev() }));
    const table = screen.getByRole("table", { name: /candidate rules on development seeds/ });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(5);
    expect(within(at(rows, 2)).getByText("went forward")).toBeInTheDocument();
    expect(
      within(at(rows, 2)).getByText(/takes a card only if it is worth more than 0\.2/),
    ).toBeInTheDocument();
    expect(within(at(rows, 3)).getByText(/never takes a card/)).toBeInTheDocument();
    expect(screen.getByText(/the threshold that went forward is 0\.2/)).toBeInTheDocument();
    expect(
      screen.getByText(/the development screen is read; the held-out games have not been played/),
    ).toBeInTheDocument();
  });

  it("says when nothing qualified, and why the refitted values were not played", () => {
    show(
      data({
        dev: dev({
          P: { advance: false, arm: null, lateThreshold: null },
          V: { advance: false, anyClassFitted: false },
        }),
      }),
    );
    expect(screen.getByText(/No threshold for the second act qualified/)).toBeInTheDocument();
    expect(
      screen.getByText(/No class kept values of its own, so there was nothing to test/),
    ).toBeInTheDocument();
  });
});

describe("the held-out tests", () => {
  it("reads each verdict into its sentence, with the figures of the test", () => {
    const passed = testSentence(test("P", "passed"));
    expect(passed).toMatch(/^Ahead of the baseline by \+1\.2 points/);
    expect(passed).toMatch(/11\.8 % of 9,700 paired games got past the Act-2 boss against 10\.6 %/);
    expect(testSentence(test("L", "reversed", -0.012))).toMatch(
      /^Behind the baseline by \+?1\.2 points/,
    );
    expect(testSentence(test("V", "not-shown", 0.002))).toMatch(
      /^No difference shown: 10\.8 % against 10\.6 %/,
    );
  });

  it("renders a card for each test that was played, and a reason for each that was not", () => {
    const { container } = show(
      data({
        dev: dev({
          P: { advance: false, arm: null, lateThreshold: null },
          V: { advance: false, anyClassFitted: true },
        }),
        tests: results(test("L", "reversed", -0.02)),
      }),
    );
    expect(screen.getByRole("heading", { name: "The old lead" })).toBeInTheDocument();
    expect(container).toHaveTextContent("behind the baseline");
    expect(container).toHaveTextContent("past the first boss: 60.0 % against 66.0 %");
    expect(container).toHaveTextContent(
      "No threshold for the second act qualified in the development screen, so it was not played on held-out seeds.",
    );
    expect(container).toHaveTextContent(
      "The refitted values did not qualify in the development screen",
    );
  });

  it("gives every played test its class table, with the class level and its verdict in words", () => {
    show(data({ dev: dev(), tests: results(test("L", "not-shown"), test("P", "passed")) }));
    const tables = screen.getAllByRole("table", {
      name: /each class.s paired games at the second boss/,
    });
    expect(tables).toHaveLength(2);
    const rows = within(at(tables, 1)).getAllByRole("row");
    expect(rows).toHaveLength(6);
    expect(within(at(rows, 2)).getByText("not shown")).toBeInTheDocument(); // Silent
    expect(within(at(rows, 1)).getByText("ahead")).toBeInTheDocument();
  });

  it("names the level the tests were read at and the rule that was fixed first", () => {
    const { container } = show(data({ dev: dev(), tests: results(test("L", "not-shown")) }));
    expect(container).toHaveTextContent("ahead only if the exact p is below 0.0167");
    expect(container).toHaveTextContent("registered before any of these games");
    expect(container).not.toHaveTextContent("Where the study stands");
  });
});
