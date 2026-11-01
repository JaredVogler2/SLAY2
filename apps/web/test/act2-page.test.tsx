import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LaterStudy } from "@/components/insights/LaterStudy";
import { Act2Panel } from "@/components/methods/Act2Panel";
import {
  downgradeNote,
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
  primaryVerdict: verdict,
  downgrade: null,
  excludedFraction: 0.03,
  robust: {
    pairs: 9900,
    droppedUnknown: 100,
    erroredAfterTheBoss: { arm: 55, baseline: 54 },
    shares: { arm: 0.118, baseline: 0.106 },
    difference: 0.012,
    armOnly: 310,
    baselineOnly: 190,
    p: 1e-6,
  },
  actOne:
    key === "L"
      ? { shares: { arm: 0.6, baseline: 0.66 }, armOnly: 100, baselineOnly: 400, p: 1e-30 }
      : { shares: { arm: 0.66, baseline: 0.66 }, armOnly: 0, baselineOnly: 0, p: 1 },
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
    { ...devRow("lead", -0.02, false), actOne: { arm: 0.55, baseline: 0.6, differs: 480 } },
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
      "fixed how each would be read before any held-out game of it was played (ADR-060)",
    );
    expect(container).toHaveTextContent("none is about winning");
    expect(container).toHaveTextContent(
      "the fit is done; the development screen has not been read and no held-out result exists, so there is no test result yet",
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
      screen.getByText(
        /the development screen is read; the held-out games are not finished and none of their results has been read/,
      ),
    ).toBeInTheDocument();
  });

  it("shows the lead as always tested, with what it costs at the first boss, and no such line for the Act-2-only rules", () => {
    show(data({ dev: dev() }));
    const table = screen.getByRole("table", { name: /candidate rules on development seeds/ });
    const rows = within(table).getAllByRole("row");
    // the lead is tested on held-out seeds whatever the screen shows, so its badge never reads "no"
    expect(within(at(rows, 1)).getByText("always tested")).toBeInTheDocument();
    expect(within(at(rows, 1)).queryByText("no")).toBeNull();
    expect(
      within(at(rows, 1)).getByText(/its price: 55\.0 % against 60\.0 % past the first boss/),
    ).toBeInTheDocument();
    // the rules that differ from the baseline in Act 2 only play the same first boss: nothing to price
    expect(within(at(rows, 2)).queryByText(/its price/)).toBeNull();
    expect(within(at(rows, 3)).queryByText(/its price/)).toBeNull();
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
    expect(container).toHaveTextContent(
      "What it costs at the first boss: 60.0 % of the paired games got past it against 66.0 %",
    );
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

  it("gives a rule that differs before Act 2 its price at the first boss in a sentence of its own, and none to a rule that plays the same first boss", () => {
    const { container } = show(
      data({ dev: dev(), tests: results(test("L", "passed"), test("P", "not-shown", 0.003)) }),
    );
    expect(container).toHaveTextContent(
      "What it costs at the first boss: 60.0 % of the paired games got past it against 66.0 % (−6.0 points; 100 pairs in which only the rule did, 400 in which only the baseline did)",
    );
    const text = container.textContent;
    expect(text.match(/What it (costs|changes) at the first boss/g)).toHaveLength(1); // the lead's, not P's
    // the wins are shown as a count that is not a registered endpoint
    expect(container).toHaveTextContent("wins (not a registered endpoint): 160 against 158");
  });

  it("says on each card how many pairs were left out and the level of the interval, and that wins are not an endpoint", () => {
    const { container } = show(data({ dev: dev(), tests: results(test("L", "passed")) }));
    expect(container).toHaveTextContent(
      "300 of 10,000 pairs were left out because a game did not finish (a simulator error or a step limit), never read as a loss.",
    );
    expect(container).toHaveTextContent("98.3 % interval");
    expect(container).toHaveTextContent("at Ascension 0 with the relics kept");
  });

  it("names the level the tests were read at and the rule that was fixed first", () => {
    const { container } = show(data({ dev: dev(), tests: results(test("L", "not-shown")) }));
    expect(container).toHaveTextContent("ahead only if the exact p is below 0.0167");
    expect(container).toHaveTextContent(
      "a second analysis on every pair whose two endpoints are known",
    );
    expect(container).toHaveTextContent("no more than a tenth of the pairs were dropped");
    expect(container).toHaveTextContent("registered before any of these games");
    expect(container).not.toHaveTextContent("Where the study stands");
  });
});

describe("the ledger panel in Methods", () => {
  it("says where the study stands before any test, and shows nothing before the fit", () => {
    const { container } = render(<Act2Panel data={data()} />);
    expect(container).toHaveTextContent("Where the study stands");
    expect(container).toHaveTextContent(
      "the development screen has not been read and no held-out result exists",
    );
    expect(screen.queryByRole("table")).toBeNull();
    cleanup();
    expect(render(<Act2Panel data={data({ fit: null })} />).container).toBeEmptyDOMElement();
    expect(render(<Act2Panel data={null} />).container).toBeEmptyDOMElement();
  });

  it("lists the three tests with the verdict of each, and the reason a test was not played", () => {
    render(
      <Act2Panel
        data={data({
          dev: dev({ P: { advance: false, arm: null, lateThreshold: null } }),
          tests: results(test("L", "not-shown", 0.002), test("V", "passed")),
        })}
      />,
    );
    const table = screen.getByRole("table", { name: /three tests/i });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(within(at(rows, 1)).getByText("not shown ahead")).toBeInTheDocument();
    expect(
      within(at(rows, 2)).getByText(/Not played: no threshold for the second act qualified/),
    ).toBeInTheDocument();
    expect(within(at(rows, 3)).getByText("ahead of the baseline")).toBeInTheDocument();
    expect(table).toHaveTextContent("+1.2 points");
    expect(table).toHaveTextContent("300 left out");
    // the lead's price is in its row (the shares past the first boss), the others have none
    expect(
      within(at(rows, 1)).getByText("at the first boss: 60.0 % against 66.0 %"),
    ).toBeInTheDocument();
    expect(within(at(rows, 3)).queryByText(/at the first boss/)).toBeNull();
  });

  it("carries the determinism record and, for each test, the check on every pair with known endpoints", () => {
    const t = {
      ...results(test("L", "not-shown")),
      determinism: { shared: 9738, identical: 9700, different: 38 },
    };
    const { container } = render(<Act2Panel data={data({ dev: dev(), tests: t })} />);
    expect(container).toHaveTextContent(
      "9,700 of 9,738 of its games are the games the baseline played for ADR-058 (the Ascension 0 twin of its Ascension 9 study)",
    );
    expect(container).toHaveTextContent("38 differ; the tests use the replayed baseline");
    expect(container).toHaveTextContent("also read on the pairs whose two endpoints are known");
    expect(container).toHaveTextContent("L: +1.2 points (exact p = 1.0e-6, 9,900 pairs)");
  });
});

describe("what the Methods panel says besides the table", () => {
  it("says that it is a simulation never checked against the game, at Ascension 0, and not about winning", () => {
    const { container } = render(
      <Act2Panel
        data={data({
          dev: dev(),
          tests: results(test("L", "passed"), test("P", "not-shown", 0.003)),
        })}
      />,
    );
    expect(container).toHaveTextContent(
      "a simulator that has never been compared with the live game",
    );
    expect(container).toHaveTextContent("at Ascension 0 with the relics kept");
    expect(container).toHaveTextContent("none of it is about winning or about a player");
    expect(container).toHaveTextContent("how to read a result was fixed before any held-out game");
    // the number of tests that were played, and what the screen sent forward
    expect(container).toHaveTextContent("two of the three were");
    expect(container).toHaveTextContent("sent the pickier second act forward at the threshold 0.2");
    expect(container).toHaveTextContent("did not send the refitted values forward");
  });

  it("gives each played test class by class, as the registration asks of every page that says passed", () => {
    render(
      <Act2Panel
        data={data({
          dev: dev(),
          tests: results(test("L", "passed"), test("P", "not-shown", 0.003)),
        })}
      />,
    );
    const table = screen.getByRole("table", { name: /class and each test played/ });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(6); // the header and five classes
    expect(within(at(rows, 1)).getByText("Ironclad")).toBeInTheDocument();
    expect(table).toHaveTextContent("12.0 % against 10.0 %");
    expect(screen.getByText(/ten class tests were read/)).toBeInTheDocument();
  });
});

describe("the second analysis and what it can withhold", () => {
  it("shows the check on known endpoints under every test, and says nothing was withheld when nothing was", () => {
    const { container } = show(data({ dev: dev(), tests: results(test("P", "passed")) }));
    expect(container).toHaveTextContent(
      "Checked again on the 9,900 pairs whose two endpoints are known",
    );
    // the counts are over the games each arm played, not over the pairs kept: the sentence says so
    expect(container).toHaveTextContent(
      "of the 10,000 games each played, 55 of the rule's and 54 of the baseline's ended that way",
    );
    expect(container).not.toHaveTextContent("The primary test alone would read");
  });

  it("explains a result that the check withheld, and one that the dropped pairs withheld", () => {
    const withheld = {
      ...test("P", "not-shown"),
      primaryVerdict: "passed" as const,
      downgrade: "robustness" as const,
    };
    const dropped = {
      ...test("L", "not-shown"),
      primaryVerdict: "reversed" as const,
      downgrade: "excluded" as const,
      excludedFraction: 0.14,
    };
    expect(downgradeNote(withheld)).toBe(
      "The primary test alone would read the rule as ahead, but the check on every pair with known endpoints does not show the same difference at an exact p below 0.05, so the result is read as not shown.",
    );
    expect(downgradeNote(dropped)).toMatch(
      /would read the rule as behind, but 14\.0 % of the pairs were dropped/,
    );
    expect(downgradeNote(test("V", "passed"))).toBe("");
    const { container } = show(data({ dev: dev(), tests: results(withheld) }));
    expect(container).toHaveTextContent("so the result is read as not shown");
  });
});
