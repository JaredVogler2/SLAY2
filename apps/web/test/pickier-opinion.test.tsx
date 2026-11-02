import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PickierOpinion, evidenceSentence } from "@/components/advisor/PickierOpinion";
import { setFor } from "@/lib/cardvalues";
import { PICKIER_SOURCES, pickierOpinion } from "@/lib/pickier-opinion";
import { newRun } from "@/lib/run-state";
import { DECK_CAP, PICKIER_THRESHOLD } from "@/lib/simulation-pick";
import { levelText, threshData, type ThreshData } from "@/lib/thresh";

import { threshFixture } from "./fixtures/thresh-test";

afterEach(cleanup);

/**
 * The optional second opinion for Act 2 (ADR-063): it exists only where the registered replication of the pickier rule (ADR-062, T1) allows it, for the bar that
 * was tested and nothing else, and it says what it is. The fixtures are consistent made-up numbers, not simulations.
 */
const text = (el: HTMLElement): string => el.textContent.replace(/\s+/g, " ");

const set = setFor("ironclad");
const BETWEEN = set?.cards.find((c) => c.beta > 0.02 && c.beta < PICKIER_THRESHOLD)?.id ?? "";
const ABOVE = set?.cards.find((c) => c.beta > PICKIER_THRESHOLD + 0.05)?.id ?? "";

const passed = threshFixture({ stage: "tested", verdicts: { T1: "passed" } });

function withClass(
  d: ThreshData,
  character: string,
  verdict: "arm" | "level" | "baseline",
): ThreshData {
  const t1 = d.tests?.results.T1;
  if (!d.tests || !t1) throw new Error("no T1");
  return {
    ...d,
    tests: {
      ...d.tests,
      results: {
        ...d.tests.results,
        T1: {
          ...t1,
          perClass: t1.perClass.map((c) => (c.character === character ? { ...c, verdict } : c)),
        },
      },
    },
  };
}

const ask = (over: Partial<Parameters<typeof pickierOpinion>[0]> = {}) =>
  pickierOpinion({
    character: "ironclad",
    actIndex: 1,
    source: "regular",
    offered: [BETWEEN, ABOVE],
    deckSize: 12,
    data: passed,
    ...over,
  });

describe("when the second opinion exists", () => {
  it("has the cards it needs", () => {
    expect(BETWEEN).not.toBe("");
    expect(ABOVE).not.toBe("");
  });

  it("is available for Ironclad and Defect in Act 2, after a fight, once the replication passed, and carries the test and the class's own row", () => {
    for (const character of ["ironclad", "defect"]) {
      const cards = setFor(character)?.cards ?? [];
      const above = cards.find((c) => c.beta > PICKIER_THRESHOLD + 0.05)?.id ?? "";
      const o = ask({ character, offered: [above] });
      expect(o.available, character).toBe(true);
      if (!o.available) continue;
      expect(o.test.key).toBe("T1");
      expect(o.test.arm).toBe("t020");
      expect(o.classResult.character).toBe(character);
      expect(o.level).toBe(0.05);
      expect(o.pick.kind).toBe("pick");
    }
    for (const source of PICKIER_SOURCES) expect(ask({ source }).available, source).toBe(true);
  });

  it("gives the pickier pilot's answer and the ordinary pilot's beside it: a card between zero and the bar is taken by one and skipped by the other", () => {
    const o = ask({ offered: [BETWEEN] });
    expect(o.available).toBe(true);
    if (!o.available) return;
    expect(o.pick.kind).toBe("skip");
    expect(o.pick.reason).toContain("above 0.2");
    expect(o.baseline.kind).toBe("pick");
    const both = ask({ offered: [BETWEEN, ABOVE] });
    expect(both.available && both.pick.kind === "pick" ? both.pick.cardId : "").toBe(ABOVE);
    const full = ask({ offered: [ABOVE], deckSize: DECK_CAP });
    expect(full.available && full.pick.kind).toBe("skip");
  });
});

describe("when it does not exist", () => {
  it("says nothing before the replication has been read, and nothing when it did not pass", () => {
    for (const stage of ["registered", "screened"] as const) {
      const o = ask({ data: threshFixture({ stage }) });
      expect(o, stage).toMatchObject({ available: false, why: "no-result" });
    }
    expect(ask({ data: null })).toMatchObject({ available: false, why: "no-result" });
    for (const verdict of ["not-shown", "reversed"] as const) {
      const o = ask({ data: threshFixture({ stage: "tested", verdicts: { T1: verdict } }) });
      expect(o, verdict).toMatchObject({ available: false, why: "not-passed" });
    }
  });

  it("says nothing for a test of another arm than 0.2 against the baseline", () => {
    const t1 = passed.tests?.results.T1;
    if (!passed.tests || !t1) throw new Error("no T1");
    for (const swap of [{ arm: "t030" }, { baseline: "t020" }]) {
      const d: ThreshData = {
        ...passed,
        tests: { ...passed.tests, results: { ...passed.tests.results, T1: { ...t1, ...swap } } },
      };
      expect(ask({ data: d }), JSON.stringify(swap)).toMatchObject({
        available: false,
        why: "no-result",
      });
    }
  });

  it("speaks for the classes the test played and for a class only if it was not behind", () => {
    for (const character of ["silent", "regent", "necrobinder", "no-such-class", ""]) {
      expect(ask({ character }), character).toMatchObject({ available: false, why: "class" });
    }
    expect(ask({ data: withClass(passed, "ironclad", "baseline") })).toMatchObject({
      available: false,
      why: "behind",
    });
    // Defect behind does not take Ironclad's opinion away
    expect(ask({ data: withClass(passed, "defect", "baseline") }).available).toBe(true);
    for (const verdict of ["arm", "level"] as const)
      expect(ask({ data: withClass(passed, "ironclad", verdict) }).available, verdict).toBe(true);
  });

  it("speaks for Act 2 only, and for the rewards after a fight only", () => {
    for (const actIndex of [0, 2])
      expect(ask({ actIndex }), String(actIndex)).toMatchObject({ available: false, why: "act" });
    for (const source of ["shop", "event"] as const)
      expect(ask({ source }), source).toMatchObject({ available: false, why: "source" });
  });

  it("says nothing when no offered card was measured", () => {
    expect(ask({ offered: ["SOME_UNLISTED_CARD"] })).toMatchObject({
      available: false,
      why: "unmeasured",
    });
  });

  it("reads the repository's own result by default", () => {
    const real = threshData();
    const o = pickierOpinion({
      character: "ironclad",
      actIndex: 1,
      source: "regular",
      offered: [ABOVE],
      deckSize: 12,
    });
    expect(o.available).toBe(real?.tests?.results.T1?.verdict === "passed");
  });
});

describe("the panel", () => {
  const run = { ...newRun("ironclad"), actIndex: 1 as const };

  it("is closed until the visitor opens it, labelled as a simulated pilot's result and not the advisor's, with the test's own figures beside it", () => {
    const { container } = render(
      <PickierOpinion run={run} offered={[BETWEEN]} source="regular" data={passed} />,
    );
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.hasAttribute("open")).toBe(false);
    expect(text(container)).toContain(
      "Act 2 · also show what a pickier simulated pilot did (optional)",
    );
    expect(text(container)).toContain("Simulated · unverified");
    expect(text(container)).toContain("Registered test passed · ADR-062");
    expect(text(container)).toContain("Not the advisor’s index");
    expect(text(container)).toMatch(
      /In Act 2, a simulated pilot that takes a card only if it is measured above 0\.2 would skip this reward\./,
    );
    expect(text(container)).toMatch(/The ordinary simulated pilot above would take /);
    const t1 = passed.tests?.results.T1;
    const row = t1?.perClass.find((c) => c.character === "ironclad");
    if (!t1 || !row) throw new Error("no T1");
    expect(text(container)).toContain(evidenceSentence(t1, 0.05, row, "Ironclad"));
    expect(evidenceSentence(t1, 0.05, row, "Ironclad")).toContain(levelText(0.05));
    expect(text(container)).toMatch(/this is not a recommendation to skip/);
    expect(text(container)).toMatch(
      /Only the bar 0\.2 was tested on seeds the screening did not use/,
    );
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/insights#thresholds", "/methods#thresh"]);
  });

  it("says when the two pilots agree, and takes the better card when there is one", () => {
    const agree = render(
      <PickierOpinion run={run} offered={[ABOVE]} source="regular" data={passed} />,
    );
    expect(text(agree.container)).toMatch(/would take /);
    expect(text(agree.container)).toContain(
      "The ordinary simulated pilot above gives the same answer here.",
    );
  });

  it("renders nothing where the second opinion does not exist", () => {
    for (const props of [
      { run: { ...run, actIndex: 0 as const }, source: "regular" as const },
      { run: { ...run, actIndex: 2 as const }, source: "regular" as const },
      { run, source: "shop" as const },
      { run: { ...newRun("silent"), actIndex: 1 as const }, source: "regular" as const },
    ]) {
      const { container } = render(<PickierOpinion offered={[BETWEEN]} data={passed} {...props} />);
      expect(container, JSON.stringify(props.source)).toBeEmptyDOMElement();
      cleanup();
    }
    const none = render(
      <PickierOpinion
        run={run}
        offered={[BETWEEN]}
        source="regular"
        data={threshFixture({ stage: "tested", verdicts: { T1: "not-shown" } })}
      />,
    );
    expect(none.container).toBeEmptyDOMElement();
  });
});
