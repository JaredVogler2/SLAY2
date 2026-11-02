import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ThreshStudy } from "@/components/insights/ThreshStudy";
import { ThreshPanel } from "@/components/methods/ThreshPanel";
import {
  THRESH_TAGS,
  advisorNote,
  downgradeNote,
  meaningOf,
  narrowSentence,
  resultLine,
  screenSentence,
  testInfo,
  testSentence,
  threshData,
  verdictText,
  verificationNote,
  type ThreshVerdict,
} from "@/lib/thresh";

import { PEAK_NETS, threshFixture, threshTest } from "./fixtures/thresh-test";

afterEach(cleanup);

/**
 * The threshold study (ADR-062) as a visitor gets it, at every stage and for every way the tests can come out (the fixtures are consistent made-up numbers,
 * not simulations): the words follow the verdicts the reading rule gave, the meaning of each outcome is the one the registration wrote down first, and nothing
 * that was not shown is said to have been.
 */
const text = (el: HTMLElement): string => el.textContent.replace(/\s+/g, " ");

describe("before anything has been played and read", () => {
  it("says the study is registered and that there is no result yet, on both pages, and shows no table", () => {
    const d = threshFixture({ stage: "registered" });
    const { container } = render(<ThreshStudy data={d} />);
    expect(text(container)).toMatch(/registered/);
    expect(text(container)).toMatch(/no result yet/);
    expect(text(container)).toMatch(/between about one chance in three and one in two/);
    expect(container.querySelectorAll("table")).toHaveLength(0);
    cleanup();
    const panel = render(<ThreshPanel data={d} />);
    expect(text(panel.container)).toMatch(/Where the study stands: it is registered/);
    expect(text(panel.container)).toMatch(/3,000 fresh seeds of each class/);
    expect(text(panel.container)).toMatch(/15,000 other fresh seeds of each class/);
    expect(panel.container.querySelectorAll("table")).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(/ADR-062/);
  });

  it("renders nothing when the study is not registered", () => {
    expect(render(<ThreshPanel data={null} />).container).toBeEmptyDOMElement();
  });

  it("reads the exporter's real output at the stage the repository is at", () => {
    const d = threshData();
    expect(d).not.toBeNull();
    expect(["registered", "screened", "tested"]).toContain(d?.stage);
    expect(d?.adr).toBe("ADR-062");
  });
});

describe("after the development screen", () => {
  it("shows the six thresholds as development numbers and says nothing goes forward when 0.2 is on top", () => {
    const d = threshFixture({ stage: "screened" });
    const { container } = render(<ThreshStudy data={d} />);
    expect(text(container)).toMatch(/Development result/);
    expect(text(container)).toMatch(/nomination, not a result/);
    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(6);
    expect(text(container)).toMatch(/Nothing goes forward beyond 0\.2/);
    expect(text(container)).toMatch(/not evidence that the thresholds are alike/);
    expect(text(container)).toMatch(/no test result yet/);
    expect(text(container)).not.toMatch(/The held-out tests/);
    cleanup();
    const panel = render(<ThreshPanel data={d} />);
    expect(panel.container.querySelectorAll("tbody tr")).toHaveLength(6);
    expect(text(panel.container)).toMatch(/the development screen has been read once/);
  });

  it("says that the choice goes forward when it is ahead of 0.2 head to head, and names the three tests that follow", () => {
    const d = threshFixture({ stage: "screened", nets: PEAK_NETS });
    expect(d.screen?.choice).toMatchObject({ advance: true, arm: "t030" });
    const sentence = screenSentence(d.screen ?? (null as never));
    expect(sentence).toMatch(/threshold with the most net wins .* was 0\.3/);
    expect(sentence).toMatch(/It goes forward/);
    expect(sentence).toMatch(/against the baseline and against 0\.2/);
    const { container } = render(<ThreshStudy data={d} />);
    expect(text(container)).toMatch(/It goes forward/);
  });

  it("marks the threshold with the most net wins in the table of the Methods panel", () => {
    const d = threshFixture({ stage: "screened", nets: PEAK_NETS });
    const { container } = render(<ThreshPanel data={d} />);
    expect(text(container)).toMatch(/most net wins, goes forward/);
    expect(THRESH_TAGS).toHaveLength(6);
  });
});

describe("after the held-out tests", () => {
  const VERDICTS: readonly ThreshVerdict[] = ["passed", "not-shown", "reversed"];

  it.each(VERDICTS)("reads T1 alone at the whole level when its verdict is %s", (verdict) => {
    const d = threshFixture({ stage: "tested", verdicts: { T1: verdict } });
    expect(d.tests?.order).toEqual(["T1"]);
    const t = d.tests?.results.T1;
    expect(t).toBeDefined();
    const { container } = render(<ThreshStudy data={d} />);
    const body = text(container);
    expect(body).toMatch(/Each test is read at 0\.05 \/ 1/);
    expect(body).toContain(verdictText({ key: "T1", verdict }));
    if (verdict === "passed")
      expect(body).toMatch(/T1 passed: the Act-2 result of ADR-061 is shown again/);
    if (verdict === "not-shown") expect(body).toMatch(/T1 not shown: these games do not show/);
    if (verdict === "reversed") expect(body).toMatch(/T1 reversed: the baseline won more/);
    cleanup();
    const panel = render(<ThreshPanel data={d} />);
    expect(panel.container.querySelectorAll("table")).not.toHaveLength(0);
    expect(text(panel.container)).toContain(verdictText({ key: "T1", verdict }));
  });

  it("reads three tests at a third of the level when the screen sent a threshold forward, T3 against 0.2", () => {
    const d = threshFixture({
      stage: "tested",
      nets: PEAK_NETS,
      verdicts: { T1: "not-shown", T2: "passed", T3: "reversed" },
    });
    expect(d.tests?.order).toEqual(["T1", "T2", "T3"]);
    expect(d.tests?.levelLabel).toBe("0.05 / 3");
    const results = d.tests?.results ?? {};
    expect(results.T3).toMatchObject({ arm: "t030", baseline: "t020", verdict: "reversed" });
    expect(testInfo(results.T3 ?? (null as never)).title).toBe(
      "The screen's choice (0.3) against 0.2",
    );
    expect(verdictText({ key: "T3", verdict: "reversed" })).toBe("wins fewer than 0.2");
    expect(verdictText({ key: "T2", verdict: "passed" })).toBe("wins more than the baseline");
    const { container } = render(<ThreshStudy data={d} />);
    const body = text(container);
    expect(body).toMatch(/Each test is read at 0\.05 \/ 3/);
    expect(body).toMatch(/T2 passed: 0\.3 wins more than the baseline/);
    expect(body).toMatch(/T3 reversed: 0\.3 wins fewer games than 0\.2/);
    expect(body).toMatch(/one of three tests read at 0\.016667/);
    expect(testSentence(results.T3 ?? (null as never), 0.05 / 3)).toMatch(/for 0\.2/);
  });

  it("calls a pass whose interval's lower end is under a quarter of the difference a narrow pass, and says so beside it", () => {
    const d = threshFixture({ stage: "tested", verdicts: { T1: "passed" }, narrow: true });
    const t = d.tests?.results.T1;
    expect(t?.narrow).toBe(true);
    expect(narrowSentence(t ?? (null as never))).toMatch(/A narrow pass/);
    const { container } = render(<ThreshStudy data={d} />);
    expect(text(container)).toMatch(/A narrow pass: the lower end of the interval/);
    cleanup();
    expect(text(render(<ThreshPanel data={d} />).container)).toMatch(/a narrow pass/);
  });

  it("says why a reading the primary test would have granted is withheld, naming every condition", () => {
    const d = threshFixture({
      stage: "tested",
      verdicts: { T1: "passed" },
      downgrades: { T1: ["robustness", "excluded"] },
    });
    const t = d.tests?.results.T1;
    expect(t).toMatchObject({ verdict: "not-shown", primaryVerdict: "passed" });
    const note = downgradeNote(t ?? (null as never));
    expect(note).toMatch(/would read the arm as ahead/);
    expect(note).toMatch(/dropped because a game did not end in a win or a death/);
    expect(note).toMatch(/does not show the same difference at an exact p below 0\.05/);
    expect(text(render(<ThreshStudy data={d} />).container)).toContain(note);
  });

  it("shows a disagreement of the independent resample as a disagreement that decides nothing", () => {
    const d = threshFixture({
      stage: "tested",
      verdicts: { T1: "passed" },
      disagreements: { T1: 2 },
    });
    const note = verificationNote(d.tests?.results.T1 ?? (null as never));
    expect(note).toMatch(/disagreed about 2 interval ends/);
    expect(note).toMatch(/decides nothing/);
    expect(verificationNote(threshTest("T1", "t020", "s", "passed"))).toBe("");
  });

  it("says the same in one line, and what it changes for the advisor: nothing because of this study alone", () => {
    const passed =
      threshFixture({ stage: "tested", verdicts: { T1: "passed" } }).tests?.results ?? {};
    const none =
      threshFixture({ stage: "tested", verdicts: { T1: "not-shown" } }).tests?.results ?? {};
    expect(resultLine(passed)).toMatch(/Read as winning more games: replication: 0\.2 in act 2/);
    expect(resultLine(none)).toMatch(/None of the tests was shown to differ from its baseline/);
    expect(advisorNote(passed)[0]).toBe("The advisor does not change because of this study alone.");
    expect(advisorNote(passed)[1]).toMatch(/separate change with its own review/);
    expect(advisorNote(none)[1]).toMatch(
      /nothing to offer, and nothing already published is withdrawn/,
    );
    const peak = threshFixture({ stage: "tested", nets: PEAK_NETS, verdicts: { T3: "passed" } });
    expect(advisorNote(peak.tests?.results ?? {})[1]).toMatch(/nothing to offer/); // T3 alone offers nothing: only a test against the baseline does
  });

  it("gives the meaning of each combination, T3 and T2 apart, as the registration wrote it first", () => {
    const r =
      threshFixture({
        stage: "tested",
        nets: PEAK_NETS,
        verdicts: { T1: "not-shown", T2: "passed", T3: "not-shown" },
      }).tests?.results ?? {};
    const lines = meaningOf(r);
    expect(lines.some((s) => s.includes("T1 not shown") && s.includes("not replicated"))).toBe(
      true,
    );
    expect(lines.some((s) => s.includes("T2 passed: 0.3 wins more"))).toBe(true);
    expect(
      lines.some((s) => s.includes("T3 not shown: these games do not separate 0.3 from 0.2")),
    ).toBe(true);
    expect(lines.some((s) => s.includes("possible and is reported as it came out"))).toBe(true);
  });
});
