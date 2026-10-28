import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { deckSynergy, type DeckEntry } from "@slay2/decision";
import { getCard } from "@slay2/game-data";

import { AscensionNote } from "@/components/advisor/AscensionNote";
import { NeowOffer } from "@/components/advisor/NeowOffer";
import { SimulationOpinion } from "@/components/advisor/SimulationOpinion";
import { SynergyPanel } from "@/components/advisor/SynergyPanel";
import { AscensionPanel } from "@/components/methods/AscensionPanel";
import {
  ASCENSION,
  ascensionCoverage,
  ascensionNote,
  ascensionTested,
  fallNote,
  neowAdviceAllowed,
  standingOf,
  type AscensionClassResult,
  type AscensionData,
  type AscensionFinding,
  type AscensionMember,
  type AscensionReference,
  type AscensionSize,
  type AscensionTest,
  type AscensionVerdict,
} from "@/lib/ascension";
import { setFor } from "@/lib/cardvalues";
import { NEOW } from "@/lib/neow";
import { newRun, withAscension } from "@/lib/run-state";

/**
 * The Ascension 9 study on the pages (ADR-058): what a run above Ascension 0 is told, whichever way the study came out, and the
 * opening-relic advice withheld at Ascension 1 to 10 when the study does not license it. The data here are fixtures: only the wording,
 * the reading and the gating are under test (the exporter's reading of the real files is tested in ascension-export.test.ts).
 */
const CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"] as const;
type Cls = (typeof CLASSES)[number];

/** How one class's own paired games went: the first arm ahead, the second ahead, or no clear difference (the class level is 0.01). */
type Own = "ahead" | "behind" | "none";

function classFixture(own: Own): {
  member: (c: string) => AscensionMember;
  result: AscensionClassResult;
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

const A0: AscensionReference = {
  file: "experiments/synergy/keep-val/pooled-astar-vs-d0star.json",
  adr: "ADR-054",
  mean: 0.071,
  ci95: [0.063, 0.08],
  a: 0.404,
  b: 0.333,
  bothCompleted: 9865,
};

function makeTest(
  verdict: AscensionVerdict,
  over: {
    own?: Partial<Record<Cls, Own>>;
    size?: AscensionSize | null;
    a0?: AscensionReference | null;
    twin?: boolean;
  } = {},
): AscensionTest {
  const rate = (r: number) => ({
    games: Math.round(r * 9800),
    rate: r,
    wilson95: [r - 0.01, r + 0.01],
  });
  const ahead = verdict === "reversed" ? 0.2 : 0.3;
  const behind = verdict === "reversed" ? 0.3 : 0.2;
  const table = {
    a_only: verdict === "reversed" ? 1400 : 1700,
    b_only: verdict === "reversed" ? 1700 : 1400,
    both: 2000,
    neither: 4700,
    mcnemar_p: verdict === "not-shown" ? 0.2 : 1e-12,
  };
  const defaultOwn: Own =
    verdict === "passed" ? "ahead" : verdict === "reversed" ? "behind" : "none";
  const fixtures = Object.fromEntries(
    CLASSES.map((c) => [c, classFixture(over.own?.[c] ?? defaultOwn)]),
  ) as Record<Cls, ReturnType<typeof classFixture>>;
  const pooled = {
    file: "experiments/ascension9/pooled-a9-fixture.json",
    sha256: "c".repeat(64),
    pairedSeeds: 10000,
    bothCompleted: 9800,
    excludedNotCompleted: 200,
    reachedAct2: { a: rate(ahead), b: rate(behind), pairedTable: table },
    reachedAct3: { a: rate(0.02), b: rate(0.02), pairedTable: table },
    wins: { a: 2, b: 1, pairedTable: table },
    floorDifference: { meanAMinusB: 0.5, ci95: [0.3, 0.7] },
    clusteredDifference: {
      meanAMinusB: 0.1,
      ci95: [0.08, 0.12],
      ciAtLevel: { level: 1 - 0.05 / 3, ci: [0.075, 0.125] },
    },
    members: CLASSES.map((c) => fixtures[c].member(c)),
  };
  return {
    ...pooled,
    verdict,
    classes: Object.fromEntries(CLASSES.map((c) => [c, fixtures[c].result])),
    a0: over.a0 === undefined ? A0 : over.a0,
    size: over.size === undefined ? (verdict === "passed" ? "smaller" : null) : over.size,
    ...(over.twin
      ? { twin: { ...pooled, file: "experiments/ascension9/pooled-a0keep-fixture.json" } }
      : {}),
  };
}

const REGISTERED: AscensionData = {
  registered: true,
  adr: "ADR-058",
  ascension: 9,
  level: 0.05 / 3,
  classLevel: 0.01,
  seeds: 2000,
  precondition: {
    file: "experiments/ascension9/precondition.json",
    sha256: "d".repeat(64),
    games: 3500,
    pooledShownValues: {
      ascension0: { completed: 491, pastActOneBoss: 334, rate: 0.6802 },
      ascension9: { completed: 499, pastActOneBoss: 140, rate: 0.2806 },
    },
  },
  ascensionCheck: {
    file: "experiments/ascension9/ascension-check.json",
    sha256: "e".repeat(64),
    claims: ["A1 elites 5 -> 8", "A5 Ascender's Bane in the starting deck"],
  },
  tests: null,
};

function tested(
  verdicts: Partial<Record<AscensionFinding, AscensionVerdict>> = {},
  over: Partial<Record<AscensionFinding, Parameters<typeof makeTest>[1]>> = {},
): AscensionData {
  const v = (f: AscensionFinding): AscensionVerdict => verdicts[f] ?? "passed";
  return {
    ...REGISTERED,
    tests: {
      synergy: makeTest(v("synergy"), over.synergy),
      values: makeTest(v("values"), { twin: true, ...over.values }),
      neow: makeTest(v("neow"), over.neow),
    },
  };
}

const NOT_REGISTERED: AscensionData = { registered: false };

/** The two arms of each test as a note names them to a player. */
const ARMS: Record<AscensionFinding, { first: string; second: string }> = {
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

describe("where a run's Ascension lies against what was tested", () => {
  it("is zero at 0, between for 1 to 8, the level tested at 9 and beyond at 10 (whose second boss is never played)", () => {
    expect(standingOf(0)).toBe("zero");
    for (const l of [1, 2, 5, 8]) expect(standingOf(l)).toBe("between");
    expect(standingOf(9)).toBe("tested");
    expect(standingOf(10)).toBe("beyond");
  });
});

describe("the note under a finding", () => {
  it("says nothing at Ascension 0, when the Ascension is not confirmed, and when the study is not in the data", () => {
    for (const f of ["synergy", "values", "neow"] as const) {
      expect(ascensionNote(f, 0, true, tested())).toBeNull();
      expect(ascensionNote(f, 5, false, tested())).toBeNull();
      expect(ascensionNote(f, 5, true, NOT_REGISTERED)).toBeNull();
    }
  });

  it("while the test is registered and not run, says the finding was measured at Ascension 0 only, where the run is, and what is not tested", () => {
    for (const f of ["synergy", "values", "neow"] as const) {
      const mid = ascensionNote(f, 5, true, REGISTERED);
      expect(mid?.kind).toBe("registered");
      expect(mid?.text).toContain("measured at Ascension 0 only");
      expect(mid?.text).toContain("Your run is at Ascension 5");
      expect(mid?.text).toContain("registered (ADR-058) and has not been run");
      expect(mid?.text).toContain("the levels between 0 and 9 are not tested in this study");
      expect(mid?.text).not.toContain("will not be tested");
      const nine = ascensionNote(f, 9, true, REGISTERED);
      expect(nine?.text).toContain("Your run is at Ascension 9");
      expect(nine?.text).not.toContain("levels between");
      const ten = ascensionNote(f, 10, true, REGISTERED);
      expect(ten?.text).toContain("second boss that the simulator never plays (gap G1)");
      expect(ten?.text).toContain("no test covers it");
    }
  });

  it("says each of the three outcomes in its own words, with the figures, and never claims more than the test showed", () => {
    for (const f of ["synergy", "neow"] as const) {
      const passed = ascensionNote(f, 9, true, tested({ [f]: "passed" }));
      expect(passed?.kind).toBe("passed");
      expect(passed?.text).toContain("Tested in simulation at Ascension 0 and at Ascension 9");
      expect(passed?.text).toContain("30.0 %");
      expect(passed?.text).toContain("20.0 %");
      expect(passed?.text).toContain("9,800 paired held-out games in the simulator");
      expect(passed?.text).toContain("a simulated pilot");
      expect(passed?.text).toContain(
        "The other figures on this panel were measured at Ascension 0.",
      );
      expect(passed?.text).toContain("the level that was tested");
    }
    for (const f of ["synergy", "values", "neow"] as const) {
      const notShown = ascensionNote(f, 5, true, tested({ [f]: "not-shown" }));
      expect(notShown?.kind).toBe("not-shown");
      expect(notShown?.text).toContain(`did not show ${ARMS[f].first} ahead of ${ARMS[f].second}`);
      expect(notShown?.text).toContain("not the same as showing that it does not help");
      expect(notShown?.text).toContain("between the two levels tested");
      expect(notShown?.text).not.toContain("Tested in simulation at Ascension 0 and");

      const reversed = ascensionNote(f, 10, true, tested({ [f]: "reversed" }));
      expect(reversed?.kind).toBe("reversed");
      expect(reversed?.text).toContain(`had ${ARMS[f].second} ahead of ${ARMS[f].first}`);
      expect(reversed?.text).toContain("30.0 %");
      expect(reversed?.text).toContain("beyond anything tested here");
    }
  });

  it("words the card values as what they are: the pair was never played with the relics kept at Ascension 0 before the twin", () => {
    const passed = ascensionNote("values", 9, true, tested({ values: "passed" }));
    expect(passed?.text).toContain(
      "The pair behind this panel was tested in simulation at Ascension 9",
    );
    expect(passed?.text).toContain("and played at Ascension 0 with the relics kept");
    expect(passed?.text).not.toContain("tested in simulation at Ascension 0");
    expect(passed?.text).toContain(
      "had not been played against the hand-written rules in that game before",
    );
    expect(passed?.text).not.toContain("Tested in simulation at Ascension 0 and at Ascension 9");
  });

  it("names what each finding compared", () => {
    const text = (f: AscensionFinding) => ascensionNote(f, 9, true, tested())?.text ?? "";
    expect(text("synergy")).toContain("the index with the synergy term");
    expect(text("synergy")).toContain("without it");
    expect(text("values")).toContain("follows the card values shown here");
    expect(text("values")).toContain("the hand-written rules");
    expect(text("neow")).toContain("takes the best-measured opening relic");
    expect(text("neow")).toContain("the first helpful relic");
  });

  it("says how big a passed result is beside the same arms at Ascension 0, and never says that it 'holds' without a size", () => {
    const beside = "at Ascension 0 with the relics kept (+7.1 points: 40.4 % against 33.3 %)";
    const sizes: [AscensionSize, string][] = [
      ["smaller", `smaller than the difference ${beside}`],
      ["about-the-same", `about the same as the difference ${beside}`],
      ["larger", `larger than the difference ${beside}`],
    ];
    for (const [size, words] of sizes) {
      const text = ascensionNote("synergy", 9, true, tested({}, { synergy: { size } }))?.text;
      expect(text).toContain(`That is ${words}`);
      expect(text).not.toContain(" holds");
      expect(text).not.toContain("the gain");
    }
    // no size words for a test that did not pass; the Ascension 0 difference is only stated, with the shares it is made of
    const notShown = ascensionNote("synergy", 9, true, tested({ synergy: "not-shown" }))?.text;
    expect(notShown).not.toContain("That is smaller");
    expect(notShown).toContain(
      "The same arms differ by +7.1 points at Ascension 0 with the relics kept (40.4 % against 33.3 %)",
    );
    // nor when there is no Ascension 0 difference to set it beside
    const bare = ascensionNote(
      "synergy",
      9,
      true,
      tested({}, { synergy: { a0: null, size: null } }),
    )?.text;
    expect(bare).not.toContain("Ascension 0 with the relics kept (");
    expect(bare).not.toContain("That is");
    expect(bare).not.toContain("less often at Ascension 9");
  });

  it("says when both arms got past the boss less often at Ascension 9 than at 0, so that fewer points are not read as a weaker effect", () => {
    // the fixture: 30.0 % and 20.0 % at Ascension 9, 40.4 % and 33.3 % at Ascension 0
    const smaller = makeTest("passed", { size: "smaller" });
    expect(fallNote(smaller)).toBe(
      "Both arms got past the Act 1 boss less often at Ascension 9, so a smaller number of points does not by itself mean a weaker effect.",
    );
    for (const size of ["about-the-same", "larger", null] as const) {
      const note = fallNote(makeTest("passed", { size }));
      expect(note).toBe(
        "Both arms got past the Act 1 boss less often at Ascension 9 than at Ascension 0.",
      );
      expect(note).not.toContain("weaker effect");
    }
    // it is a statement about the two shares, so it is made whichever way the test came out
    expect(fallNote(makeTest("not-shown", { size: null }))).toContain("less often at Ascension 9");
    // and only when both fell: either arm doing as well or better, or nothing at Ascension 0 to set it beside, says nothing
    expect(fallNote(makeTest("passed", { a0: { ...A0, a: 0.3 } }))).toBe("");
    expect(fallNote(makeTest("passed", { a0: { ...A0, b: 0.2 } }))).toBe("");
    expect(fallNote(makeTest("passed", { a0: { ...A0, a: 0.25, b: 0.15 } }))).toBe("");
    expect(fallNote(makeTest("passed", { a0: null, size: null }))).toBe("");
    // the note carries the sentence, once, and the panel for a run at 0 carries none of it
    const text = ascensionNote("synergy", 9, true, tested())?.text ?? "";
    expect(text.split("less often at Ascension 9").length - 1).toBe(1);
    expect(ascensionNote("synergy", 0, true, tested())).toBeNull();
  });

  it("tells a run whose own class went the other way in its own games, and only that class", () => {
    const data = tested(
      {},
      { synergy: { own: { silent: "behind" } }, values: { own: { silent: "behind" } } },
    );
    for (const f of ["synergy", "values"] as const) {
      const silent = ascensionNote(f, 9, true, data, "silent")?.text;
      expect(silent).toContain(
        `In the simulated games of your own class alone at Ascension 9, ${ARMS[f].second} came out ahead: 120 pairs got past the Act 1 boss only with ${ARMS[f].second} against 80 only with ${ARMS[f].first}`,
      );
      expect(silent).not.toContain("the other arm");
      expect(ascensionNote(f, 9, true, data, "ironclad")?.text).not.toContain("your own class");
      expect(ascensionNote(f, 9, true, data)?.text).not.toContain("your own class");
    }
    // a class that was merely not clear is not reported as behind
    const none = tested({}, { synergy: { own: { silent: "none" } } });
    expect(ascensionNote("synergy", 9, true, none, "silent")?.text).not.toContain("your own class");
  });

  it("renders as one paragraph with a link to the study, and nothing when there is no note", () => {
    const { container, rerender } = render(
      <AscensionNote finding="synergy" level={5} confirmed data={REGISTERED} />,
    );
    const note = container.querySelector("[data-ascension-note]");
    expect(note).toHaveAttribute("data-ascension-note", "registered");
    expect(note).toHaveTextContent("Your Ascension.");
    expect(screen.getByRole("link", { name: "Evidence & methods" })).toHaveAttribute(
      "href",
      "/methods#ascension",
    );
    rerender(<AscensionNote finding="synergy" level={0} confirmed data={REGISTERED} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the opening-relic advice at Ascension 1 to 10", () => {
  it("is the rule of ADR-055 at Ascension 0, and stays as it was until the Ascension 9 test has been run", () => {
    expect(neowAdviceAllowed("silent", 0, true, tested({ neow: "reversed" }))).toBe(true);
    expect(neowAdviceAllowed("silent", 5, false, tested({ neow: "reversed" }))).toBe(true);
    expect(neowAdviceAllowed("silent", 5, true, REGISTERED)).toBe(true);
    expect(neowAdviceAllowed("silent", 5, true, NOT_REGISTERED)).toBe(true);
    expect(ascensionTested(REGISTERED)).toBe(false);
    expect(ascensionTested(tested())).toBe(true);
  });

  it("needs the pooled test to have passed and the class's own games to have licensed the rule", () => {
    const data = tested(
      { neow: "passed" },
      { neow: { own: { silent: "none", regent: "behind" } } },
    );
    for (const level of [1, 5, 9, 10]) {
      expect(neowAdviceAllowed("ironclad", level, true, data)).toBe(true);
      expect(neowAdviceAllowed("silent", level, true, data)).toBe(false);
      expect(neowAdviceAllowed("regent", level, true, data)).toBe(false);
    }
    // a pooled test that was not shown ahead licenses no class, however its own games went
    for (const verdict of ["not-shown", "reversed"] as const) {
      const none = tested(
        { neow: verdict },
        { neow: { own: Object.fromEntries(CLASSES.map((c) => [c, "ahead"])) } },
      );
      for (const c of CLASSES) expect(neowAdviceAllowed(c, 9, true, none)).toBe(false);
    }
  });
});

describe("the three panels", () => {
  function deck(): ReturnType<typeof deckSynergy> {
    const card = getCard("STRIKE_IRONCLAD");
    if (!card) throw new Error("no card");
    const entries: DeckEntry[] = [{ card, count: 5 }];
    return deckSynergy(entries, 0, "ironclad");
  }

  it("the synergy panel tells a run above Ascension 0 what was tested, and a run at 0 nothing", () => {
    const { container, rerender } = render(
      <SynergyPanel
        synergy={deck()}
        ascension={{ level: 5, confirmed: true }}
        ascensionData={REGISTERED}
      />,
    );
    expect(container.querySelector("[data-ascension-note]")).not.toBeNull();
    expect(container).toHaveTextContent("measured at Ascension 0 only");
    rerender(
      <SynergyPanel
        synergy={deck()}
        ascension={{ level: 0, confirmed: true }}
        ascensionData={REGISTERED}
      />,
    );
    expect(container.querySelector("[data-ascension-note]")).toBeNull();
    rerender(<SynergyPanel synergy={deck()} ascensionData={REGISTERED} />);
    expect(container.querySelector("[data-ascension-note]")).toBeNull();
  });

  it("the simulated second opinion on card rewards carries the note for the card values", () => {
    const set = setFor("ironclad");
    const offered = (set?.cards ?? []).slice(0, 3).map((c) => c.id);
    const run = withAscension({ ...newRun("ironclad"), ascensionConfirmed: true }, 7);
    const { container, rerender } = render(
      <SimulationOpinion
        run={run}
        offered={offered}
        heuristic={{ kind: "skip" }}
        ascensionData={REGISTERED}
      />,
    );
    const note = container.querySelector("[data-ascension-note]");
    expect(note).toHaveAttribute("data-ascension-note", "registered");
    expect(note).toHaveTextContent("Your run is at Ascension 7");
    rerender(
      <SimulationOpinion
        run={newRun("ironclad")}
        offered={offered}
        heuristic={{ kind: "skip" }}
        ascensionData={REGISTERED}
      />,
    );
    expect(container.querySelector("[data-ascension-note]")).toBeNull();
  });

  it("with no data passed, the panels read the data the site ships, as tested", () => {
    const set = setFor("ironclad");
    const offered = (set?.cards ?? []).slice(0, 3).map((c) => c.id);
    const run = withAscension({ ...newRun("ironclad"), ascensionConfirmed: true }, 7);
    const values = render(
      <SimulationOpinion run={run} offered={offered} heuristic={{ kind: "skip" }} />,
    );
    const note = values.container.querySelector("[data-ascension-note]");
    expect(note).not.toBeNull();
    expect(note).not.toHaveAttribute("data-ascension-note", "registered");
    expect(note).not.toHaveTextContent("has not been run");
    values.unmount();
    const synergy = render(
      <SynergyPanel synergy={deck()} ascension={{ level: 7, confirmed: true }} />,
    );
    expect(synergy.container.querySelector("[data-ascension-note]")).not.toBeNull();
    expect(synergy.container).not.toHaveTextContent("has not been run");
  });

  it("each panel carries the note of its own finding, from the data it is given", () => {
    const data = tested();
    const own = (container: HTMLElement) => container.querySelector("[data-ascension-note]");
    const synergy = render(
      <SynergyPanel
        synergy={deck()}
        ascension={{ level: 9, confirmed: true }}
        ascensionData={data}
      />,
    );
    expect(own(synergy.container)).toHaveTextContent("the index with the synergy term");
    expect(own(synergy.container)).not.toHaveTextContent("card values shown here");
    expect(own(synergy.container)).not.toHaveTextContent("opening relic");
    synergy.unmount();

    const set = setFor("ironclad");
    const offered = (set?.cards ?? []).slice(0, 3).map((c) => c.id);
    const run = withAscension({ ...newRun("ironclad"), ascensionConfirmed: true }, 9);
    const values = render(
      <SimulationOpinion
        run={run}
        offered={offered}
        heuristic={{ kind: "skip" }}
        ascensionData={data}
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
        ascensionData={data}
      />,
    );
    expect(own(neow.container)).toHaveTextContent("takes the best-measured opening relic");
    expect(own(neow.container)).not.toHaveTextContent("synergy term");
    expect(own(neow.container)).not.toHaveTextContent("card values shown here");
  });

  it("each panel tells the run's own class when its own games went the other way, in its own words", () => {
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
        ascension={{ level: 9, confirmed: true, character: "silent" }}
        ascensionData={data}
      />,
    );
    expect(synergy.container).toHaveTextContent(
      `${ARMS.synergy.second} came out ahead: 120 pairs got past the Act 1 boss only with ${ARMS.synergy.second}`,
    );
    synergy.unmount();
    const set = setFor("silent");
    const offered = (set?.cards ?? []).slice(0, 3).map((c) => c.id);
    const run = withAscension({ ...newRun("silent"), ascensionConfirmed: true }, 9);
    const values = render(
      <SimulationOpinion
        run={run}
        offered={offered}
        heuristic={{ kind: "skip" }}
        ascensionData={data}
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
    function setup(level: number, character: "silent" | "ironclad", ascensionData: AscensionData) {
      const run = withAscension({ ...newRun(character), ascensionConfirmed: true }, level);
      render(
        <NeowOffer
          run={run}
          disabled={false}
          recorded={[]}
          onRecord={() => undefined}
          data={NEOW}
          ascensionData={ascensionData}
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

    it("names the relic at Ascension 0 as before, whatever the Ascension 9 test found", () => {
      setup(0, "silent", tested({ neow: "reversed" }));
      expect(document.body.textContent).toContain("would take");
      expect(screen.getByText(PICK)).toBeInTheDocument();
      expect(document.body.textContent).not.toContain(
        "SLAY2 does not say which relic to take at Ascension",
      );
      expect(document.body.querySelector("[data-ascension-note]")).toBeNull();
    });

    it("keeps naming the relic at a higher Ascension while the test is only registered, with the note", () => {
      setup(5, "silent", REGISTERED);
      expect(document.body.textContent).toContain("would take");
      expect(screen.getByText(PICK)).toBeInTheDocument();
      expect(document.body.querySelector("[data-ascension-note='registered']")).not.toBeNull();
    });

    it("names the relic at a higher Ascension when the test passed and the class's own games had the rule ahead", () => {
      setup(5, "silent", tested());
      expect(document.body.textContent).toContain("would take");
      expect(screen.getByText(PICK)).toBeInTheDocument();
      expect(document.body.querySelector("[data-ascension-note='passed']")).not.toBeNull();
    });

    it("withholds the relic at a higher Ascension when the class's own games did not show the rule ahead, and says so", () => {
      setup(5, "silent", tested({ neow: "passed" }, { neow: { own: { silent: "none" } } }));
      expect(document.body.textContent).not.toContain("would take");
      expect(document.body.textContent).toContain(
        "SLAY2 does not say which relic to take at Ascension 5",
      );
      expect(document.body.textContent).toContain(
        "it has no tested advice for Silent there, because Silent's own Ascension 9 games did not show the rule ahead",
      );
      expect(document.body.textContent).not.toContain("license");
      // the same two relics show the pick when the advice is allowed (the test above), so its absence here is the withholding's doing
      expect(screen.queryByText(PICK)).toBeNull();
    });

    it("tells the class when its own games went the other way, as well as withholding the relic", () => {
      setup(5, "silent", tested({ neow: "passed" }, { neow: { own: { silent: "behind" } } }));
      expect(document.body.textContent).not.toContain("would take");
      expect(document.body.textContent).toContain(
        "In the simulated games of your own class alone at Ascension 9",
      );
      expect(screen.queryByText(PICK)).toBeNull();
    });

    it("withholds the relic for every class when the test was not shown ahead, or had the baseline ahead, and says which", () => {
      setup(9, "ironclad", tested({ neow: "not-shown" }));
      expect(document.body.textContent).not.toContain("would take");
      expect(document.body.textContent).toContain(
        "SLAY2 does not say which relic to take at Ascension 9",
      );
      expect(document.body.textContent).toContain(
        "because the Ascension 9 test did not show the rule ahead",
      );
      expect(document.body.querySelector("[data-ascension-note='not-shown']")).not.toBeNull();
      expect(screen.queryByText(PICK)).toBeNull();
      cleanup();
      setup(9, "ironclad", tested({ neow: "reversed" }));
      expect(document.body.textContent).toContain(
        "because at Ascension 9 the test had the first helpful relic ahead of the rule",
      );
      expect(screen.queryByText(PICK)).toBeNull();
    });
  });
});

describe("the /methods section", () => {
  it("renders nothing when the study is not registered", () => {
    const { container } = render(<AscensionPanel data={NOT_REGISTERED} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says the study is registered and not run, with what was checked on development seeds, and what it does not cover", () => {
    const { container } = render(<AscensionPanel data={REGISTERED} />);
    expect(container.querySelector("#ascension")).not.toBeNull();
    expect(container).toHaveTextContent("registered (ADR-058), not run yet");
    expect(container).toHaveTextContent("Not run yet.");
    expect(container).toHaveTextContent("3,500 games");
    expect(container).toHaveTextContent(
      "28.1% of 499 completed games at Ascension 9 against 68.0% of 491",
    );
    expect(container).toHaveTextContent("compares no pilots");
    expect(container).toHaveTextContent("0.0167");
    expect(container).toHaveTextContent("twin at Ascension 0 with the relics kept");
    expect(container).toHaveTextContent("Not read back: the gold of Ascension 3");
    expect(container).toHaveTextContent("Ascension 10 (the second boss is never played, gap G1)");
    expect(container).toHaveTextContent("A fit at Ascension 9");
    expect(container.querySelector("#ascension-synergy")).toBeNull();
  });

  it("shows each of the three tests as it came out, with its size beside the Ascension 0 result, its class table and the twin", () => {
    const data = tested(
      { synergy: "passed", values: "not-shown", neow: "reversed" },
      { synergy: { size: "larger" }, neow: { own: { ironclad: "ahead", silent: "none" } } },
    );
    const { container } = render(<AscensionPanel data={data} />);
    expect(container).toHaveTextContent("1 of 3 ahead at Ascension 9");
    expect(container).not.toHaveTextContent("hold at Ascension 9");
    const synergy = container.querySelector("#ascension-synergy");
    expect(synergy).toHaveTextContent("ahead at Ascension 9");
    expect(synergy).toHaveTextContent(
      "1,700 pairs only with the first arm, 1,400 only with the second",
    );
    expect(synergy).toHaveTextContent("larger than at Ascension 0");
    expect(synergy).toHaveTextContent("+7.1 points");
    expect(synergy).toHaveTextContent(
      "the lower end of its interval at the level of the test is above the Ascension 0 difference",
    );
    expect(container.querySelector("#ascension-values")).toHaveTextContent(
      "not shown ahead at Ascension 9",
    );
    expect(container.querySelector("#ascension-values")).toHaveTextContent(
      "The twin at Ascension 0, the relics kept (descriptive)",
    );
    expect(container.querySelector("#ascension-neow")).toHaveTextContent("behind at Ascension 9");
    expect(container).not.toHaveTextContent("Not run yet.");
    expect(container.querySelectorAll("table")).toHaveLength(3);
  });

  it("says which classes have tested advice, and none when the pooled test did not pass", () => {
    const some = render(
      <AscensionPanel
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
      <AscensionPanel
        data={tested(
          { neow: "not-shown" },
          { neow: { own: Object.fromEntries(CLASSES.map((c) => [c, "ahead"])) } },
        )}
      />,
    );
    expect(none.container).toHaveTextContent("Classes with tested advice: none.");
  });

  it("titles the section for the level that was tested, and says 'until this study' only once the study has been run", () => {
    const registered = render(<AscensionPanel data={REGISTERED} />);
    expect(registered.container.querySelector("h2")?.textContent).toBe(
      "Do these results carry over to Ascension 9?",
    );
    expect(registered.container).toHaveTextContent(
      "Every result on this page was measured at Ascension 0",
    );
    expect(registered.container).not.toHaveTextContent("Until this study");
    registered.unmount();
    // with the results in, the paragraph above them cannot say that every result on the page was measured at Ascension 0
    const done = render(<AscensionPanel data={tested()} />);
    expect(done.container).toHaveTextContent(
      "Until this study, every result on this page was measured at Ascension 0",
    );
    expect(done.container.textContent).not.toMatch(
      /(^|\. )Every result on this page was measured at Ascension 0/,
    );
  });

  it("shows the secondary endpoints it registered: the Act-2 boss and the wins, and gives each class table its own caption", () => {
    const { container } = render(<AscensionPanel data={tested()} />);
    const synergy = container.querySelector("#ascension-synergy");
    expect(synergy).toHaveTextContent("Past the Act-2 boss (secondary)");
    expect(synergy).toHaveTextContent("Wins");
    const captions = [...container.querySelectorAll("caption")].map((c) => c.textContent);
    expect(captions).toHaveLength(3);
    expect(new Set(captions).size).toBe(3);
  });

  it("says all three are ahead when they all passed, and never that they 'hold'", () => {
    const { container } = render(<AscensionPanel data={tested()} />);
    expect(container).toHaveTextContent("all three ahead at Ascension 9");
    expect(container.textContent).not.toMatch(/\bhold at Ascension 9/);
  });
});

describe("the landing page's coverage line", () => {
  it("is absent when the study is not registered, and says it is registered and not run before the tests", () => {
    expect(ascensionCoverage(NOT_REGISTERED)).toBeNull();
    const registered = ascensionCoverage(REGISTERED);
    expect(registered?.state).toBe("registered");
    expect(registered?.detail).toContain(
      "Every simulated result on this page was measured at Ascension 0",
    );
    expect(registered?.detail).toContain("registered (ADR-058) and has not been run yet");
  });

  it("says how each test came out, with the size of a passed one beside Ascension 0, and what is not tested", () => {
    const data = tested(
      { synergy: "passed", values: "not-shown", neow: "reversed" },
      { synergy: { size: "larger" } },
    );
    const covered = ascensionCoverage(data);
    expect(covered?.state).toBe("tested");
    expect(covered?.detail).toContain(
      "the synergy term ahead (larger than at Ascension 0), the card values not shown ahead",
    );
    expect(covered?.detail).toContain("the card values not shown ahead");
    expect(covered?.detail).toContain("the opening-relic rule behind");
    expect(covered?.detail).toContain("Ascension 10 and the levels from 1 to 8 are not tested");
    expect(covered?.detail).not.toMatch(/\bhold/);
    // a passed result without a size to set it beside says only that it was ahead
    const bare = ascensionCoverage(tested({}, { synergy: { a0: null, size: null } }));
    expect(bare?.detail).toContain("the synergy term ahead, the card values");
  });
});

describe("the data the site ships", () => {
  it("is the registered study with its passed precondition", () => {
    expect(ASCENSION.registered).toBe(true);
    expect(ASCENSION.adr).toBe("ADR-058");
    expect(ASCENSION.ascension).toBe(9);
    expect(ASCENSION.precondition?.games).toBe(3500);
    expect(ASCENSION.ascensionCheck?.claims).toHaveLength(5);
  });

  it("carries the three tests as the result block of ADR-058 records them, each read by the rule that was registered", () => {
    expect(ASCENSION.tests).not.toBeNull();
    const tests = ASCENSION.tests;
    if (!tests) return;
    expect(Object.keys(tests).sort()).toEqual(["neow", "synergy", "values"]);
    // the card-value test carries its twin at Ascension 0 with the relics kept, the others do not
    expect(tests.values.twin).toBeDefined();
    expect(tests.synergy.twin).toBeUndefined();
    expect(tests.neow.twin).toBeUndefined();
    // all three came out ahead at Ascension 9, each smaller in points than at Ascension 0 (ADR-058, "Result of ADR-058")
    for (const f of ["synergy", "values", "neow"] as const) {
      const t = tests[f];
      expect(t.verdict).toBe("passed");
      expect(t.size).toBe("smaller");
      // ... which the numbers must bear out under the rule: below the level, the first arm ahead, the interval at that level above zero
      expect(t.reachedAct2.pairedTable.mcnemar_p).toBeLessThan(ASCENSION.level ?? 0);
      expect(t.reachedAct2.a.rate).toBeGreaterThan(t.reachedAct2.b.rate);
      expect(t.clusteredDifference.ciAtLevel.level).toBeCloseTo(1 - (ASCENSION.level ?? 0), 12);
      expect(t.clusteredDifference.ciAtLevel.ci[0]).toBeGreaterThan(0);
      // 5 classes x 2000 seeds, of which the games that ended (the rest are not counted)
      expect(t.pairedSeeds).toBe(10000);
      expect(t.bothCompleted).toBeGreaterThan(9000);
      expect(t.bothCompleted + t.excludedNotCompleted).toBe(t.pairedSeeds);
      expect(t.members.map((m) => m.character).sort()).toEqual([...CLASSES].sort());
    }
  });

  it("licenses the opening-relic advice at Ascension 1 to 10 for the four classes whose own games showed the rule ahead, and not for Silent", () => {
    for (const level of [1, 5, 9, 10]) {
      for (const c of ["ironclad", "regent", "necrobinder", "defect"]) {
        expect(neowAdviceAllowed(c, level, true, ASCENSION)).toBe(true);
      }
      expect(neowAdviceAllowed("silent", level, true, ASCENSION)).toBe(false);
    }
    // at Ascension 0 the rule of ADR-055 stands for every class, and an unconfirmed Ascension changes nothing
    for (const c of CLASSES) {
      expect(neowAdviceAllowed(c, 0, true, ASCENSION)).toBe(true);
      expect(neowAdviceAllowed(c, 9, false, ASCENSION)).toBe(true);
    }
  });

  it("shows the whole study to a run above Ascension 0 as tested, not as registered", () => {
    expect(ascensionTested(ASCENSION)).toBe(true);
    for (const f of ["synergy", "values", "neow"] as const) {
      const note = ascensionNote(f, 9, true, ASCENSION);
      expect(note?.kind).toBe("passed");
      expect(note?.text).not.toContain("has not been run");
    }
    expect(ascensionCoverage(ASCENSION)?.state).toBe("tested");
  });
});
