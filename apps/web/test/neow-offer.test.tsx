import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NeowOffer } from "@/components/advisor/NeowOffer";
import { newRun, withAscension } from "@/lib/run-state";
import type { NeowData, NeowMember, NeowTest, NeowValues, RelicMeasurement } from "@/lib/neow";

function relic(label: string, kind: string, beta: number, half = 0.1, over = {}): RelicMeasurement {
  return {
    label,
    kind,
    beta,
    ci95: [beta - half, beta + half],
    taken: 500,
    offered: 1500,
    passRateTaken: 0.5,
    passRateOfferedNotTaken: 0.5,
    excluded: 0,
    exclusionFlag: false,
    ...over,
  };
}

const VALUES: NeowValues = {
  file: "experiments/neow/neow-values-v1.json",
  relicsKept: false,
  sha256: "a".repeat(64),
  outcome: "the run gets past the Act-1 boss",
  ascension: 0,
  profile: "veteran",
  games: 15000,
  excludedGames: 0,
  passRate: 0.5,
  classes: [
    { character: "ironclad", games: 3000, passRate: 0.64, baselineLogOdds: 0.59 },
    { character: "silent", games: 3000, passRate: 0.36, baselineLogOdds: -0.56 },
    { character: "necrobinder", games: 3000, passRate: 0.37, baselineLogOdds: -0.52 },
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
    relic("Fishing Rod", "positive", 0.5),
    relic("Arcane Scroll", "positive", -0.2),
    relic("Winged Boots", "positive", -0.3),
    relic("Silver Crucible", "cursed", 0.8),
    relic("Large Capsule", "cursed", 0.17, 0.1, { excluded: 13, taken: 722, exclusionFlag: true }),
  ],
};

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

// the rule ahead overall; in Silent's own games clearly ahead, in Ironclad's behind
const CLASSES_AS_TESTED: Record<string, [number, number, number]> = {
  ironclad: [0.6, 0.65, 0.4],
  silent: [0.44, 0.18, 1e-80],
  regent: [0.57, 0.5, 1e-6],
  necrobinder: [0.55, 0.5, 1e-3],
  defect: [0.92, 0.76, 1e-49],
};

function test(passed: boolean): NeowTest {
  const table = {
    a_only: 700,
    b_only: 600,
    both: 5000,
    neither: 3500,
    mcnemar_p: passed ? 0.01 : 0.4,
  };
  const rate = (r: number) => ({
    games: Math.round(r * 9800),
    rate: r,
    wilson95: [r - 0.01, r + 0.01],
  });
  const endpoint = {
    definition: "the run got past the Act-1 boss",
    a: rate(passed ? 0.58 : 0.55),
    b: rate(passed ? 0.55 : 0.56),
    pairedTable: table,
  };
  return {
    id: "pooled-neow-values-v2-vs-rules_v2-val",
    relicsKept: false,
    contentSha256: "b".repeat(64),
    valuesSha256: "a".repeat(64),
    a: "rules_v2_neow_values",
    b: "rules_v2",
    alpha: 0.05,
    pairedSeeds: 10000,
    bothCompleted: 9800,
    excludedNotCompleted: 200,
    reachedAct2: endpoint,
    reachedAct3: endpoint,
    wins: { a: 3, b: 2, pairedTable: table },
    floorDifference: { meanAMinusB: 0.1, ci95: [-0.1, 0.3] },
    members: Object.entries(CLASSES_AS_TESTED).map(([c, [a, b, p]]) => member(c, a, b, p)),
    role: "held-out",
    passed,
  };
}

const withTest = (t: NeowTest | null): NeowData => ({ values: VALUES, test: t });

// gap G13 as the exporter writes it: the same pilot with the simulator's start and with the game's, 499 paired runs
const STARTS_HIGH = {
  necrobinder: { simulator: 0.635, game: 0.515, pairs: 499, comparison: "g13-fixture" },
};
const withGap = (t: NeowTest | null): NeowData => ({ ...withTest(t), startHpGaps: STARTS_HIGH });

function setup(
  data: NeowData,
  over: { character?: "ironclad" | "silent" | "necrobinder" | null } = {},
) {
  const run = newRun(over.character === undefined ? "silent" : over.character);
  const onRecord = vi.fn();
  const view = render(
    <NeowOffer run={run} disabled={false} recorded={[]} onRecord={onRecord} data={data} />,
  );
  // the content of a <details> is in the document even when it is closed
  const helpful1 = screen.getByLabelText("First helpful option");
  const helpful2 = screen.getByLabelText("Second helpful option");
  const costly = screen.getByLabelText("Costly option");
  return { onRecord, helpful1, helpful2, costly, run, ...view };
}

function offer(s: ReturnType<typeof setup>): void {
  fireEvent.change(s.helpful1, { target: { value: "FISHING_ROD" } });
  fireEvent.change(s.helpful2, { target: { value: "WINGED_BOOTS" } });
  fireEvent.change(s.costly, { target: { value: "SILVER_CRUCIBLE" } });
}

describe("What did Neow offer?", () => {
  it("shows nothing before a character is chosen, and nothing when there are no measurements", () => {
    const none = render(
      <NeowOffer
        run={newRun(null)}
        disabled={false}
        recorded={[]}
        onRecord={() => undefined}
        data={withTest(null)}
      />,
    );
    expect(none.container).toBeEmptyDOMElement();
    none.unmount();
    const empty = render(
      <NeowOffer
        run={newRun("silent")}
        disabled={false}
        recorded={[]}
        onRecord={() => undefined}
        data={{ values: null, test: null }}
      />,
    );
    expect(empty.container).toBeEmptyDOMElement();
  });

  it("labels itself as simulated and unverified before anything is said", () => {
    setup(withTest(test(true)));
    expect(screen.getByText(/Simulated · unverified/)).toBeInTheDocument();
    expect(screen.getByText(/What did Neow offer\?/)).toBeInTheDocument();
  });

  it("offers helpful options in the two helpful slots and costly ones in the third, never the same relic twice", () => {
    const s = setup(withTest(test(true)));
    const names = (el: HTMLElement) =>
      within(el)
        .getAllByRole("option")
        .map((o) => o.textContent);
    expect(names(s.costly)).toContain("Silver Crucible");
    expect(names(s.costly)).not.toContain("Fishing Rod");
    expect(names(s.helpful1)).toContain("Fishing Rod");
    expect(names(s.helpful1)).not.toContain("Silver Crucible");
    fireEvent.change(s.helpful1, { target: { value: "FISHING_ROD" } });
    expect(names(s.helpful2)).not.toContain("Fishing Rod");
    fireEvent.change(s.helpful2, { target: { value: "WINGED_BOOTS" } });
    expect(names(s.helpful1)).not.toContain("Winged Boots");
  });

  it("shows each relic's chance for the player's class with its interval and the games behind it", () => {
    const s = setup(withTest(test(true)));
    offer(s);
    const list = screen.getByRole("list", { name: "Measured values of the relics offered" });
    const tiles = within(list).getAllByRole("listitem");
    expect(tiles).toHaveLength(3);
    // Silent: logit -0.56 + 0.5 = -0.06 -> 49 %; the average relic is 36 %
    const rod = tiles.find((t) => t.textContent.includes("Fishing Rod"));
    expect(rod).toHaveTextContent("49%");
    expect(rod).toHaveTextContent("The average relic: 36%");
    expect(rod).toHaveTextContent("taken in 500 simulated runs");
    expect(rod).toHaveTextContent("helpful");
    const crucible = tiles.find((t) => t.textContent.includes("Silver Crucible"));
    expect(crucible).toHaveTextContent("costly");
  });

  it("names the relic a simulated pilot would take only after the registered test improved play", () => {
    const s = setup(withTest(test(true)));
    offer(s);
    expect(screen.getByText(/would take/)).toHaveTextContent("Silver Crucible");
    // exactly one tile carries the pick, and it is that relic's
    const pick = screen.getByText(/Simulated pilot.s pick/);
    expect(pick.closest("li")).toHaveTextContent("Silver Crucible");
    expect(
      screen.getByText(/58% of 9,800 against 55% for taking the first helpful relic/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/does not say which relic/)).toBeNull();
  });

  it("says plainly that the runs cannot tell two relics apart when their intervals overlap", () => {
    const s = setup(withTest(test(true)));
    fireEvent.change(s.helpful1, { target: { value: "ARCANE_SCROLL" } });
    fireEvent.change(s.helpful2, { target: { value: "WINGED_BOOTS" } });
    expect(screen.getByText(/do not clearly separate it from/)).toBeInTheDocument();
    // a close call is not marked as the pilot's pick
    expect(screen.queryByText(/Simulated pilot.s pick/)).toBeNull();
  });

  it("gives no advice when the held-out test does not show that it improves play, and says what it found", () => {
    const s = setup(withTest(test(false)));
    offer(s);
    expect(screen.queryByText(/would take/)).toBeNull();
    expect(screen.queryByText(/Simulated pilot.s pick/)).toBeNull();
    const note = screen.getByText(/does not say which relic to take/);
    expect(note).toHaveTextContent("55% of 9,800 games against 56%");
    expect(note).toHaveTextContent("does not show that it improves play");
    // the measurements are still there
    expect(
      screen.getByRole("list", { name: "Measured values of the relics offered" }),
    ).toBeInTheDocument();
  });

  it("gives no advice when the test has not been run", () => {
    const s = setup(withTest(null));
    offer(s);
    expect(screen.queryByText(/would take/)).toBeNull();
    expect(screen.queryByText(/Simulated pilot.s pick/)).toBeNull();
    expect(screen.getByText(/have not been tested against play yet/)).toBeInTheDocument();
  });

  it("says nothing about which to take with one relic on the table", () => {
    const s = setup(withTest(test(true)));
    fireEvent.change(s.helpful1, { target: { value: "FISHING_ROD" } });
    expect(screen.queryByText(/would take/)).toBeNull();
    expect(screen.queryByText(/does not say which/)).toBeNull();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
  });

  it("flags a value that rests on games that finished, and marks a relic that was never measured", () => {
    const s = setup(withTest(test(true)));
    fireEvent.change(s.costly, { target: { value: "LARGE_CAPSULE" } });
    // 722 finished and 13 did not: the 13 are counted against all 735 games with the relic
    expect(screen.getByText(/13 of its 735 games ended in a simulator error/)).toBeInTheDocument();
    fireEvent.change(s.helpful1, { target: { value: "MASSIVE_SCROLL" } });
    expect(
      screen.getByText(/Not measured: the simulated runs never took this relic/),
    ).toBeInTheDocument();
  });

  it("hands the chosen relic to the recorder, and does not offer to record one that is already recorded", () => {
    const run = newRun("silent");
    const onRecord = vi.fn();
    render(
      <NeowOffer
        run={run}
        disabled={false}
        recorded={["WINGED_BOOTS"]}
        onRecord={onRecord}
        data={withTest(test(true))}
      />,
    );
    fireEvent.change(screen.getByLabelText("First helpful option"), {
      target: { value: "FISHING_ROD" },
    });
    fireEvent.change(screen.getByLabelText("Second helpful option"), {
      target: { value: "WINGED_BOOTS" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record Fishing Rod" }));
    expect(onRecord).toHaveBeenCalledExactlyOnceWith("FISHING_ROD");
    expect(screen.getByRole("button", { name: "Recorded" })).toBeDisabled();
  });

  it("warns that every simulated run was Ascension 0 when the player has chosen a higher ascension", () => {
    const run = withAscension({ ...newRun("silent"), ascensionConfirmed: true }, 5);
    render(
      <NeowOffer
        run={{ ...run, ascensionConfirmed: true }}
        disabled={false}
        recorded={[]}
        onRecord={() => undefined}
        data={withTest(test(true))}
      />,
    );
    expect(screen.getByText(/you are at Ascension 5/)).toBeInTheDocument();
  });

  it("gives no advice to a class whose own held-out games did not clearly favour the rule, and says why", () => {
    const run = newRun("ironclad");
    render(
      <NeowOffer
        run={run}
        disabled={false}
        recorded={[]}
        onRecord={() => undefined}
        data={withTest(test(true))}
      />,
    );
    fireEvent.change(screen.getByLabelText("First helpful option"), {
      target: { value: "FISHING_ROD" },
    });
    fireEvent.change(screen.getByLabelText("Second helpful option"), {
      target: { value: "WINGED_BOOTS" },
    });
    fireEvent.change(screen.getByLabelText("Costly option"), {
      target: { value: "SILVER_CRUCIBLE" },
    });
    const note = screen.getByText(/does not say which relic to take for Ironclad/);
    expect(note).toHaveTextContent("in the 1,990 Ironclad games alone");
    expect(note).toHaveTextContent("60% against 65%");
    expect(screen.queryByText(/would take/)).toBeNull();
    expect(screen.queryByText(/Simulated pilot.s pick/)).toBeNull();
    // the measurements are still there
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(3);
  });

  it("gives no advice when the relic the rule would take was never measured", () => {
    const s = setup(withTest(test(true)));
    fireEvent.change(s.helpful1, { target: { value: "MASSIVE_SCROLL" } });
    fireEvent.change(s.helpful2, { target: { value: "WINGED_BOOTS" } });
    expect(
      screen.getByText(/Massive Scroll was never taken in the simulated runs/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/would take/)).toBeNull();
  });

  it("warns a Necrobinder that the simulator starts the class above the game's HP, with the measured cost", () => {
    const necro = setup(withGap(test(true)), { character: "necrobinder" });
    const note = screen.getByText(
      /starts a Necrobinder with more HP than the game gives it \(gap G13\)/,
    );
    expect(note).toHaveTextContent("51.5% of 499 paired runs instead of 63.5%");
    expect(note).toHaveTextContent("read every percentage below as too high for Necrobinder");
    necro.unmount();
    // the other classes start with the game's own HP: no warning, even when a gap is known for another class
    setup(withGap(test(true)), { character: "silent" });
    expect(screen.queryByText(/gap G13/)).not.toBeInTheDocument();
  });

  it("warns that every simulated run was Overgrowth when the player says Underdocks", () => {
    const run = { ...newRun("silent"), act1: "underdocks" as const };
    render(
      <NeowOffer
        run={run}
        disabled={false}
        recorded={[]}
        onRecord={() => undefined}
        data={withTest(test(true))}
      />,
    );
    expect(
      screen.getByText(
        /You said you are in Underdocks; every simulated run was played in Overgrowth/,
      ),
    ).toBeInTheDocument();
  });

  it("says that a simulated run keeps no relic gained after its first fight (gap G14)", () => {
    render(
      <NeowOffer
        run={newRun("silent")}
        disabled={false}
        recorded={[]}
        onRecord={() => undefined}
        data={withTest(test(true))}
      />,
    );
    expect(
      screen.getByText(/a simulated run keeps no relic it gains after its first fight \(gap G14\)/),
    ).toBeInTheDocument();
  });

  it("disables its controls until the page is interactive", () => {
    render(
      <NeowOffer
        run={newRun("silent")}
        disabled
        recorded={[]}
        onRecord={() => undefined}
        data={withTest(test(true))}
      />,
    );
    expect(screen.getByLabelText("First helpful option")).toBeDisabled();
    expect(screen.getByLabelText("Costly option")).toBeDisabled();
  });
});
