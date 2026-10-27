import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NeowOffer } from "@/components/advisor/NeowOffer";
import { NeowRepeatBlock } from "@/components/methods/NeowRepeatBlock";
import { NeowValuesPanel } from "@/components/methods/NeowValuesPanel";
import {
  NEOW,
  neowCoverage,
  neowRelicsKept,
  neowStudy,
  relicValues,
  type NeowComparison,
  type NeowData,
  type NeowTest,
  type NeowValues,
} from "@/lib/neow";
import { newRun } from "@/lib/run-state";

/**
 * The opening-relic study repeated with the relics kept (ADR-055) on the pages: registered, fitted, and tested whichever way it
 * came out. The data are the repository's own first study with the repetition's differences written in (the repetition's values
 * are the first's, renamed: only the wording and the choice of the study are under test here).
 */
function need<T>(x: T | null | undefined): T {
  if (x === null || x === undefined) {
    throw new Error("the first study is missing from the site data");
  }
  return x;
}

// the first study stays in the site data beside the repetition (`first`), whichever study the pages follow
const FIRST_VALUES = need(NEOW.first?.values);
const FIRST_TEST = need(NEOW.first?.test);
const SHA = "e".repeat(64);

const KEPT_VALUES: NeowValues = {
  ...FIRST_VALUES,
  relicsKept: true,
  file: "experiments/neow/neow-values-keep-v1.json",
  sha256: SHA,
  games: 15000,
};

function keptTest(
  passed: boolean,
  id = "pooled-neow-values-keep-v1-vs-rules_v2-keeprelics-val",
): NeowTest {
  const table = {
    a_only: passed ? 1400 : 900,
    b_only: passed ? 900 : 1000,
    both: 6000,
    neither: 1400,
    mcnemar_p: passed ? 1e-20 : 0.2,
  };
  return {
    ...FIRST_TEST,
    id,
    relicsKept: true,
    valuesSha256: SHA,
    passed,
    reachedAct2: {
      ...FIRST_TEST.reachedAct2,
      a: { games: 7400, rate: passed ? 0.74 : 0.69, wilson95: [0.7, 0.78] },
      b: { games: 6900, rate: 0.69, wilson95: [0.65, 0.73] },
      pairedTable: table,
    },
  };
}

// the first study's ranking: its table stays on the page when the repetition is the study shown
const firstRanking = relicValues({ values: FIRST_VALUES, test: null });
const best = need(firstRanking[0]);
const second = need(firstRanking[1]);
const COMPARISON: NeowComparison = {
  file: "experiments/neow/compare-v2-keep-v1.json",
  relicsInBoth: 27,
  spearman: 0.61,
  k: 5,
  bestShared: 3,
  worstShared: 2,
  disjointIntervals: 4,
  onlyInFirst: [],
  onlyInRepeated: [],
  bestInFirst: best.label,
  bestInRepeated: second.label,
  noise: { relicsInBoth: 27, seeds: [1500, 1500], spearman: 0.8, spearmanBrown: 0.89 },
};

const FIRST = { values: FIRST_VALUES, test: FIRST_TEST };
const registered: NeowData = { ...FIRST, study: "first", first: FIRST, repeated: null };
const fitted: NeowData = {
  ...FIRST,
  study: "first",
  first: FIRST,
  repeated: { values: KEPT_VALUES, test: null, secondary: null, comparison: COMPARISON },
};
function tested(passed: boolean, secondary: NeowTest | null = null): NeowData {
  const test = keptTest(passed);
  return {
    values: KEPT_VALUES,
    test,
    study: "repeated",
    first: FIRST,
    repeated: { values: KEPT_VALUES, test, secondary, comparison: COMPARISON },
  };
}

describe("which study the pages follow", () => {
  it("stays on the first study until the repetition's one test has been run", () => {
    for (const data of [registered, fitted]) {
      expect(neowStudy(data)).toBe("first");
      expect(neowRelicsKept(data)).toBe(false);
    }
    for (const passed of [true, false]) {
      expect(neowStudy(tested(passed))).toBe("repeated");
      expect(neowRelicsKept(tested(passed))).toBe(true);
    }
    // a test's own data, without the new fields, is the first study
    expect(neowStudy({ values: FIRST_VALUES, test: null })).toBe("first");
  });

  it("says in the coverage line that the games kept the relics a run gains, and only then", () => {
    expect(neowCoverage(registered).detail).not.toContain("kept the relics");
    expect(neowCoverage(tested(true)).detail).toContain(
      "simulated games that kept the relics a run gains",
    );
  });
});

describe("the /methods block on the opening-relic study repeated with the relics kept", () => {
  it("says it is registered and not run when there is no fit, and what happens if it does not show the rule ahead", () => {
    const { container } = render(<NeowRepeatBlock data={registered} />);
    const block = need(container.querySelector("#opening-ancient-keep"));
    expect(
      within(block as HTMLElement).getByText("registered (ADR-055), not run yet"),
    ).toBeVisible();
    expect(block).toHaveTextContent("gap G14");
    expect(block).toHaveTextContent("stops naming a relic for any class");
  });

  it("describes the fit and compares it with the first, but keeps following the first study until its test has been run", () => {
    const { container } = render(<NeowRepeatBlock data={fitted} />);
    const block = need(container.querySelector("#opening-ancient-keep"));
    expect(block).toHaveTextContent("fitted, test not run yet");
    expect(block).toHaveTextContent("still follow the first study");
    expect(block).toHaveTextContent(
      "Over the 27 relics measured in both, the two sets of values correlate at 0.61",
    );
    expect(block).toHaveTextContent("agree at 0.89");
    expect(block).toHaveTextContent("3 of the 5 best and 2 of the 5 worst relics are shared");
    expect(block).toHaveTextContent(
      "4 have intervals that do not overlap (fewer than one relic in a hundred would if nothing had changed)",
    );
    // the fits are compared by what they rank first, never by what a pilot "would take": the repetition has no test yet
    expect(block).toHaveTextContent(
      `the first fit ranks ${best.name} first where the second ranks ${second.name} first`,
    );
    expect(block).not.toHaveTextContent("would take");
    expect(block).not.toHaveTextContent("one in twenty");
    expect(block).toHaveTextContent("it tests nothing");
  });

  it("shows the repetition's result whichever way it came out, with the first study's beside it", () => {
    for (const passed of [true, false]) {
      const { container, unmount } = render(<NeowRepeatBlock data={tested(passed)} />);
      const block = need(container.querySelector("#opening-ancient-keep"));
      expect(block).toHaveTextContent("The same study, played in both games");
      expect(block).toHaveTextContent(
        passed ? "rule ahead with the relics kept" : "rule not shown ahead with the relics kept",
      );
      // the first study's own result, and why it stays in the record
      expect(block).toHaveTextContent("The first study, in the simulator that drops the relics");
      expect(block).toHaveTextContent(
        "it was measured in a game that is harsher than the real one",
      );
      expect(
        within(block as HTMLElement).getByLabelText(/Result of the first opening-relic test/),
      ).toBeInTheDocument();
      expect(block).not.toHaveTextContent(
        "The first study’s rule in the game with the relics kept",
      );
      // the first study's values stay on the page, in a disclosure, with the relic the first study measured best at the top
      const values = within(block as HTMLElement).getByLabelText(
        "Values of the first study, measured in the simulator that drops the relics",
      );
      expect(within(values).getAllByRole("row")[1]).toHaveTextContent(best.name);
      expect(
        within(block as HTMLElement).getByText(/The first study's relic values/),
      ).toBeInTheDocument();
      unmount();
    }
  });

  it("shows the first study's rule played with the relics kept when that arm exists, as a description", () => {
    const secondary = keptTest(true, "pooled-neow-values-v2-vs-rules_v2-keeprelics-val");
    const { container } = render(<NeowRepeatBlock data={tested(false, secondary)} />);
    const block = need(container.querySelector("#opening-ancient-keep"));
    expect(block).toHaveTextContent("The first study’s rule in the game with the relics kept");
    expect(block).toHaveTextContent("no decision depends on it");
    expect(
      within(block as HTMLElement).getByLabelText(/first study's rule played with the relics kept/),
    ).toBeInTheDocument();
  });
});

describe("the opening-relic panel", () => {
  it("says what the runs of the shown study kept, and puts the block inside the panel", () => {
    const first = render(<NeowValuesPanel data={fitted} />);
    expect(first.container).toHaveTextContent("These runs kept only two relics");
    expect(first.container.querySelector("#opening-ancient-keep")).not.toBeNull();
    first.unmount();
    const kept = render(<NeowValuesPanel data={tested(false)} />);
    expect(kept.container).toHaveTextContent(
      "These runs kept the relics they gained, as the game does",
    );
    expect(kept.container).not.toHaveTextContent("These runs kept only two relics");
    // the shown test is the repetition's: its verdict follows its own result
    expect(kept.container).toHaveTextContent("It did not pass");
    // with the relics kept the simulator's errors come deep into a run, so leaving those pairs out reads the share slightly low
    expect(kept.container).toHaveTextContent(
      "leaving them out of the pair reads the share past the boss slightly low in both arms alike).",
    );
    expect(kept.container).not.toHaveTextContent("which says nothing about play");
    kept.unmount();
    const unfitted = render(<NeowValuesPanel data={registered} />);
    expect(unfitted.container).toHaveTextContent(
      "which says nothing about play, and are left out of the pair).",
    );
  });
});

describe("What did Neow offer? when the repetition has been tested", () => {
  function setup(data: NeowData) {
    render(
      <NeowOffer
        run={newRun("silent")}
        disabled={false}
        recorded={[]}
        onRecord={() => undefined}
        data={data}
      />,
    );
    const helpful = relicValues(data).filter((r) => r.optionKind === "positive");
    const one = need(helpful[0]);
    const two = need(helpful[1]);
    fireEvent.change(screen.getByLabelText("First helpful option"), { target: { value: one.id } });
    fireEvent.change(screen.getByLabelText("Second helpful option"), { target: { value: two.id } });
  }

  it("names no relic when the repetition did not show the rule ahead, and says that the earlier study found it helpful and this one did not confirm it", () => {
    setup(tested(false));
    const text = document.body.textContent;
    expect(text).toContain("SLAY2 does not say which relic to take.");
    expect(text).toContain("found the rule helpful");
    expect(text).toContain("this one keeps the relics, as the game does, and did not confirm it");
    // a result with the rule nominally ahead but not at the registered level is not "no improvement", and not "the opposite"
    expect(text).toContain("does not show that it improves play");
    expect(text).not.toContain("found the opposite");
    expect(text).not.toContain("did not improve play");
    expect(text).not.toContain("would take");
  });

  it("does not mention an earlier study while the first one is the one shown", () => {
    setup({ ...registered, test: { ...FIRST_TEST, passed: false } });
    expect(document.body.textContent).not.toContain("found the rule helpful");
  });

  it("says the simulated runs kept the relics they gained, and not that they kept none", () => {
    setup(tested(true));
    expect(document.body.textContent).toContain("the simulated runs kept the relics they gained");
    expect(document.body.textContent).not.toContain(
      "keeps no relic it gains after its first fight",
    );
  });

  it("keeps the old caveat for the first study", () => {
    setup(registered);
    expect(document.body.textContent).toContain("keeps no relic it gains after its first fight");
  });
});
