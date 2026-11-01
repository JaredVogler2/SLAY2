import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ActsStudy } from "@/components/insights/ActsStudy";
import { ActsPanel } from "@/components/methods/ActsPanel";
import {
  ACTS_KEYS,
  actThreeNote,
  bossSentence,
  downgradeNote,
  excludedSentence,
  meaningOf,
  robustSentence,
  testSentence,
  verificationNote,
  type ActsTestKey,
  type ActsVerdict,
} from "@/lib/acts";

import { actsFixture, actsTest } from "./fixtures/acts-test";

afterEach(cleanup);

/**
 * The acts study (ADR-061) as a visitor gets it, at every stage and for every way the four tests can come out (the fixtures are consistent made-up
 * numbers, not simulations): the words follow the verdicts the reading rule gave, the meaning of each combination is the one the registration wrote
 * down first, and nothing that was not shown is said to have been.
 */
type Verdicts = Partial<Record<ActsTestKey, ActsVerdict>>;
const text = (el: HTMLElement): string => el.textContent.replace(/\s+/g, " ");

describe("before the held-out games are read", () => {
  it("says the study is registered and that there is no result yet, on both pages, and shows no table", () => {
    const d = actsFixture(null);
    const { container } = render(<ActsStudy data={d} />);
    expect(text(container)).toMatch(/registered/);
    expect(text(container)).toMatch(/no result yet/);
    expect(text(container)).toMatch(
      /Act 3 only can differ from the baseline only in the runs that reach Act 3/,
    );
    expect(container.querySelectorAll("table")).toHaveLength(0);
    cleanup();
    const panel = render(<ActsPanel data={d} />);
    expect(text(panel.container)).toMatch(/Where the study stands: it is registered/);
    expect(panel.container.querySelectorAll("table")).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(/ADR-061/);
  });

  it("is not drawn at all when the repository has no record of the study", () => {
    expect(render(<ActsPanel data={null} />).container).toBeEmptyDOMElement();
  });
});

describe("with the four tests", () => {
  it("gives each test its verdict in words, its figures and the caveats the registration asks for, and never says 'passed'", () => {
    const d = actsFixture({ L: "passed", A1: "not-shown", A2: "reversed", A3: "not-shown" });
    const { container } = render(<ActsStudy data={d} />);
    for (const title of [
      "The old lead",
      "Pickier in Act 1 only",
      "Pickier in Act 2 only",
      "Pickier in Act 3 only",
    ])
      expect(screen.getByRole("heading", { level: 4, name: title })).toBeInTheDocument();
    const t = text(container);
    expect(t).toContain("wins more than the baseline");
    expect(t).toContain("wins fewer than the baseline");
    expect(t).toContain("not shown to win more");
    expect(t).toMatch(/Won more: 2\.76 % of 14,500 paired games were won against 2\.07 %/);
    expect(t).toMatch(/Won fewer:/);
    expect(t).toMatch(/No difference shown:/);
    expect(t).not.toMatch(/\bpassed\b/i);
    // the price at the first boss is quoted for the rules that differ before the second act, and said to be nil by construction for the others
    expect(t).toMatch(/61\.0 % of the paired games got past the first boss against 67\.0 %/);
    expect(t).toMatch(/the first boss is the same by construction/);
    expect(t).toMatch(/plays the baseline's game until the third act/);
    // every test says how many pairs it left out, what the second analysis found and at what level it was read
    expect(t.match(/500 of 15,000 pairs were left out/g)).toHaveLength(4);
    expect(t.match(/Checked again on all 15,000 pairs of seeds/g)).toHaveLength(4);
    expect(t.match(/read at 0\.0125 \(the study-wise 0\.05 divided by four\)/g)).toHaveLength(4);
    expect(t).toMatch(/not independent/);
    expect(t).toMatch(
      /not shown is not no effect|&ldquo;not shown&rdquo; is not|“not shown” is not “no effect”/,
    );
  });

  it("names every condition that withheld a reading, and says what the independent resample disagreed about", () => {
    const d = actsFixture(
      { L: "passed", A1: "passed" },
      {
        downgrades: { L: ["excluded", "robustness"], A1: ["robustness"] },
        disagreements: { A2: 1, A3: 2 },
      },
    );
    const l = d.tests?.results.L;
    const a1 = d.tests?.results.A1;
    if (!l || !a1) throw new Error("no tests");
    expect(l.verdict).toBe("not-shown");
    expect(downgradeNote(l)).toMatch(
      /would read the rule as ahead, but the result is read as not shown because 14\.0 % of the pairs were dropped.*, and because the check on all pairs does not show the same difference/,
    );
    expect(downgradeNote(a1)).toMatch(
      /because the check on all pairs does not show the same difference at an exact p below 0\.05\.$/,
    );
    expect(downgradeNote(actsTest("A2", "passed"))).toBe("");
    const { container } = render(<ActsStudy data={d} />);
    expect(text(container)).toMatch(/disagreed about 1 interval end by more than the tolerance/);
    expect(text(container)).toMatch(/disagreed about 2 interval ends/);
    expect(verificationNote(actsTest("L", "passed"))).toBe("");
  });

  it("has a class table for each test, with a caption, scoped headers and the class level", () => {
    const d = actsFixture({ L: "passed" });
    render(<ActsStudy data={d} />);
    const tables = screen.getAllByRole("table", { hidden: true });
    expect(tables).toHaveLength(4);
    for (const table of tables) {
      expect(table.querySelector("caption")).not.toBeNull();
      expect(table.querySelectorAll('th[scope="col"]').length).toBeGreaterThanOrEqual(5);
      expect(table.querySelectorAll('tbody th[scope="row"]')).toHaveLength(5);
      expect(within(table).getAllByText(/At 0\.01 on its own/).length).toBe(1);
    }
  });
});

describe("what the four results mean together (ADR-061 item 8)", () => {
  const cases: readonly (readonly [string, Verdicts, readonly RegExp[], readonly RegExp[]])[] = [
    [
      "L passed alone",
      { L: "passed" },
      [
        /lead won more games than the baseline on seeds nobody had played/,
        /No single act is shown to carry it/,
        /less power/,
      ],
      [/alone also won more/],
    ],
    [
      "L and A2 passed",
      { L: "passed", A2: "passed" },
      [
        /alone also won more games, so that act's picks alone are shown to matter/,
        /Act 2 alone/,
        /need not add up to the lead's/,
      ],
      [/No single act is shown/],
    ],
    [
      "L, A1 and A3 passed",
      { L: "passed", A1: "passed", A3: "passed" },
      [/Act 1 and Act 3 alone also won more/],
      [/No single act is shown/],
    ],
    [
      "L not shown, A3 passed",
      { A3: "passed" },
      [
        /Act 3 alone won more games while the old lead, which adds the picks of the other acts, was not shown to/,
        /one of four tests read at 0\.0125.*one time in eighty/,
      ],
      [/None of the four/],
    ],
    [
      "nothing shown",
      {},
      [/None of the four was shown to differ/, /statement about this sample, not about the lead/],
      [/won more games than the baseline/],
    ],
    [
      "L reversed",
      { L: "reversed" },
      [
        /follows the shown values won more games than the old lead/,
        /need not be so for other thresholds/,
      ],
      [/None of the four/],
    ],
    [
      "L reversed, A1 passed",
      { L: "reversed", A1: "passed" },
      [
        /Act 1 alone won more games while the old lead, which adds the picks of the other acts, won fewer/,
      ],
      [],
    ],
    [
      "L not shown, A2 reversed",
      { A2: "reversed" },
      [
        /not shown to win more or fewer games on these seeds/,
        /Act 2 alone won fewer games than the baseline/,
      ],
      [/None of the four was shown to differ/],
    ],
    [
      "L passed, A1 and A2 reversed",
      { L: "passed", A1: "reversed", A2: "reversed" },
      [
        /lead won more games/,
        /No single act is shown to carry it/,
        /Act 1 and Act 2 alone won fewer games/,
      ],
      [],
    ],
  ];
  it.each(cases)("%s", (_name, verdicts, expected, forbidden) => {
    const d = actsFixture(verdicts);
    const results = d.tests?.results;
    if (!results) throw new Error("no tests");
    const said = meaningOf(results).join(" ");
    for (const re of expected) expect(said).toMatch(re);
    for (const re of forbidden) expect(said).not.toMatch(re);
    // the page shows exactly those sentences
    const { container } = render(<ActsStudy data={d} />);
    for (const sentence of meaningOf(results)) expect(text(container)).toContain(sentence);
    cleanup();
  });

  it("says one thing for every one of the 81 combinations of verdicts, and nothing that contradicts the verdicts", () => {
    const vs: readonly ActsVerdict[] = ["passed", "not-shown", "reversed"];
    let count = 0;
    for (const l of vs)
      for (const a1 of vs)
        for (const a2 of vs)
          for (const a3 of vs) {
            const results = actsFixture({ L: l, A1: a1, A2: a2, A3: a3 }).tests?.results;
            if (!results) throw new Error("no tests");
            const said = meaningOf(results);
            expect(said.length).toBeGreaterThan(0);
            const all = said.join(" ");
            count += 1;
            // a gain is claimed only where a test showed it, a loss only where one did
            expect(/alone (also )?won more games/.test(all)).toBe([a1, a2, a3].includes("passed"));
            expect(all.includes("alone won fewer games than the baseline")).toBe(
              [a1, a2, a3].includes("reversed"),
            );
            expect(all.includes("lead won more games than the baseline")).toBe(l === "passed");
            expect(all.includes("None of the four was shown to differ")).toBe(
              [l, a1, a2, a3].every((v) => v === "not-shown"),
            );
          }
    expect(count).toBe(81);
  });
});

describe("the sentences", () => {
  it("quote the figures of the test and nothing else", () => {
    const t = actsTest("A2", "passed");
    expect(testSentence(t)).toContain("2.76 % of 14,500 paired games");
    expect(testSentence(t)).toContain("+0.69 points");
    expect(testSentence(t)).toContain("99.00 % interval".replace("99.00", "98.75"));
    expect(excludedSentence(t)).toMatch(/^500 of 15,000 pairs were left out/);
    expect(robustSentence(t)).toMatch(
      /An errored game cannot have been won; neither analysis says it would have been lost\.$/,
    );
    expect(bossSentence(t)).toMatch(/the first boss is the same by construction/);
    expect(bossSentence(actsTest("A1", "not-shown"))).toMatch(
      /61\.0 % of the paired games got past the first boss against 67\.0 %/,
    );
    expect(bossSentence(actsTest("A3", "not-shown"))).toMatch(
      /all the third act's picks can change/,
    );
    expect(actThreeNote(actsTest("A3", "not-shown"))).toMatch(
      /10\.5 % of the baseline's paired games got past the second boss/,
    );
  });

  it("covers the four keys", () => {
    expect(ACTS_KEYS).toEqual(["L", "A1", "A2", "A3"]);
  });
});

describe("the Methods panel", () => {
  it("shows the four tests in a table with their figures, the class table and the records", () => {
    const d = actsFixture({ L: "passed", A2: "reversed" });
    const { container } = render(<ActsPanel data={d} />);
    const table = screen.getAllByRole("table", { hidden: true })[0];
    if (!table) throw new Error("no table");
    expect(table.querySelector("caption")).not.toBeNull();
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(5); // header + 4 tests
    expect(rows[1]).toHaveTextContent("The old lead");
    expect(rows[1]).toHaveTextContent("2.76 % against 2.07 %");
    expect(rows[1]).toHaveTextContent("wins more than the baseline");
    expect(rows[3]).toHaveTextContent("wins fewer than the baseline");
    expect(text(container)).toMatch(/Difference \(98\.75 % interval\)/);
    expect(text(container)).toMatch(/exact checks a file, all agreeing/);
    expect(text(container)).toMatch(/SHA-256 [0-9a-f]{12}…/);
    expect(text(container)).toMatch(/The design checks passed/);
    expect(text(container)).not.toMatch(/\bpassed\b.*wins more/);
    // a link to the page that reads the result
    expect(within(container).getByRole("link", { name: "Insights page" })).toHaveAttribute(
      "href",
      "/insights#acts",
    );
  });
});
