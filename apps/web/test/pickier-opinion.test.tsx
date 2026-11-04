import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PickierOpinion } from "@/components/advisor/PickierOpinion";
import { setFor } from "@/lib/cardvalues";
import { PICKIER_SOURCES, pickierOpinion } from "@/lib/pickier-opinion";
import {
  NOT_A_RECOMMENDATION,
  ascensionSentence,
  cappedHeadline,
  classSentence,
  limitsText,
  pooledSentence,
  sizeSentence,
} from "@/lib/pickier-text";
import { newRun } from "@/lib/run-state";
import { DECK_CAP, PICKIER_THRESHOLD } from "@/lib/simulation-pick";
import {
  bossSentence,
  excludedSentence,
  formatP,
  levelText,
  pctShare,
  pts,
  threshData,
  type ThreshData,
} from "@/lib/thresh";

import { threshFixture } from "./fixtures/thresh-test";

afterEach(cleanup);

/**
 * The optional second opinion for Act 2 (ADR-063): it exists only where the registered replication of the pickier rule (ADR-062, T1) allows it, for the bar that
 * was tested and nothing else, and it says what it is and what the test found, class by class. The fixtures are consistent made-up numbers, not simulations;
 * the shipped file is read where a test says so.
 */
const text = (el: HTMLElement): string => el.textContent.replace(/\s+/g, " ");
const n = (x: number): string => x.toLocaleString("en-US");

const set = setFor("ironclad");
const BETWEEN = set?.cards.find((c) => c.beta > 0.02 && c.beta < PICKIER_THRESHOLD)?.id ?? "";
const ABOVE = set?.cards.find((c) => c.beta > PICKIER_THRESHOLD + 0.05)?.id ?? "";

const passed = threshFixture({ stage: "tested", verdicts: { T1: "passed" } });
const t1 = (() => {
  const t = passed.tests?.results.T1;
  if (!t) throw new Error("the fixture has no T1");
  return t;
})();

function withClass(
  d: ThreshData,
  character: string,
  change: { verdict: "arm" | "level" | "baseline"; p?: number },
): ThreshData {
  const t = d.tests?.results.T1;
  if (!d.tests || !t) throw new Error("no T1");
  return {
    ...d,
    tests: {
      ...d.tests,
      results: {
        ...d.tests.results,
        T1: {
          ...t,
          perClass: t.perClass.map((c) => (c.character === character ? { ...c, ...change } : c)),
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

  it("is available for Ironclad and Defect in Act 2, after a fight, once the replication passed, and carries the test, every class's row, the seeds and the record", () => {
    for (const character of ["ironclad", "defect"]) {
      const cards = setFor(character)?.cards ?? [];
      const above = cards.find((c) => c.beta > PICKIER_THRESHOLD + 0.05)?.id ?? "";
      const o = ask({ character, offered: [above] });
      expect(o.available, character).toBe(true);
      if (!o.available) continue;
      expect(o.test.key).toBe("T1");
      expect(o.test.arm).toBe("t020");
      expect(o.classResult.character).toBe(character);
      expect(o.classes.map((c) => c.character)).toEqual(["ironclad", "defect"]);
      expect(o.level).toBe(0.05);
      expect(o.seeds).toBe(passed.seeds);
      expect(o.adr).toBe(passed.adr);
      expect(o.capped).toBe(false);
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
  });

  it("marks a full deck as the cause of the skip, whatever the bar, and not before", () => {
    const full = ask({ offered: [ABOVE], deckSize: DECK_CAP });
    expect(full.available && full.pick.kind).toBe("skip");
    expect(full.available && full.capped).toBe(true);
    const room = ask({ offered: [ABOVE], deckSize: DECK_CAP - 1 });
    expect(room.available && room.pick.kind).toBe("pick");
    expect(room.available && room.capped).toBe(false);
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
    if (!passed.tests) throw new Error("no tests");
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
    expect(ask({ data: withClass(passed, "ironclad", { verdict: "baseline" }) })).toMatchObject({
      available: false,
      why: "behind",
    });
    // Defect behind does not take Ironclad's opinion away
    expect(ask({ data: withClass(passed, "defect", { verdict: "baseline" }) }).available).toBe(
      true,
    );
    for (const verdict of ["arm", "level"] as const)
      expect(ask({ data: withClass(passed, "ironclad", { verdict }) }).available, verdict).toBe(
        true,
      );
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
});

describe("the shipped result", () => {
  it("is live: the exported replication passed, so the opinion exists for Ironclad and Defect (this fails if the file loses it)", () => {
    const real = threshData()?.tests?.results.T1;
    expect(real?.arm).toBe("t020");
    expect(real?.verdict).toBe("passed");
    for (const character of ["ironclad", "defect"]) {
      const above = setFor(character)?.cards.find((c) => c.beta > PICKIER_THRESHOLD + 0.05)?.id;
      const o = pickierOpinion({
        character,
        actIndex: 1,
        source: "regular",
        offered: [above ?? ""],
        deckSize: 12,
      });
      expect(o.available, character).toBe(true);
    }
  });
});

describe("the words", () => {
  it("say the pickier pilot's share first and the ordinary pilot's second, the interval and the pairs, in the registration's order", () => {
    const s = pooledSentence(t1, 0.05, passed.seeds, passed.adr);
    expect(s).toContain(`on ${n(passed.seeds)} seeds that no earlier study had played`);
    expect(s).toContain(`(${passed.adr}: its rules for reading it were written down before`);
    expect(s).toContain(
      `won ${pctShare(t1.shares.arm)} of the ${n(t1.pairs)} paired games both pilots finished, against ${pctShare(t1.shares.baseline)} for the ordinary simulated pilot above`,
    );
    expect(s).toContain(
      `(${pts(t1.difference)}; ${levelText(0.05)} interval ${pts(t1.ci[0] ?? 0)} to ${pts(t1.ci[1] ?? 0)}; exact ${formatP(t1.p)})`,
    );
    expect(s).toContain(
      `${n(t1.armOnly)} pairs were won only by the pickier pilot and ${n(t1.baselineOnly)} only by the ordinary one`,
    );
    expect(s).not.toMatch(/any card/);
  });

  it("say each class's own row with its own share order, pairs and p (not the pooled one), and what the row is worth on its own", () => {
    for (const row of t1.perClass) {
      expect(row.p, "the class row must differ from the pooled test").not.toBe(t1.p);
      const s = classSentence(row, "Label", false);
      expect(s).toContain(
        `Label: ${pctShare(row.shares.arm)} against ${pctShare(row.shares.baseline)} (${pts(row.difference)}; ${n(row.armOnly)} pairs only the pickier pilot, ${n(row.baselineOnly)} only the ordinary one; exact ${formatP(row.p)})`,
      );
      expect(s).not.toContain("(your class)");
    }
    const row = t1.perClass[0];
    if (!row) throw new Error("no class row");
    expect(classSentence(row, "Ironclad", true)).toContain("Ironclad (your class):");
    expect(classSentence({ ...row, verdict: "arm" }, "X", false)).toMatch(
      /ahead on its own at the class level 0\.01 \(secondary, uncorrected\)\.$/,
    );
    expect(classSentence({ ...row, verdict: "level" }, "X", false)).toMatch(
      /not shown on its own at the class level 0\.01, so the pooled test is the evidence here\.$/,
    );
    expect(classSentence({ ...row, verdict: "baseline" }, "X", false)).toMatch(
      /behind on its own\.$/,
    );
  });

  it("derive the size from the data and never type it", () => {
    const s = sizeSentence(t1);
    const per = Math.round(1 / t1.difference / 10) * 10;
    expect(s).toContain(`The pooled difference is ${pts(t1.difference)} of the share of games won`);
    expect(s).toContain(`about one extra win in ${n(per)} games`);
    expect(s).toContain(
      `by pilots that win ${pctShare(t1.shares.baseline, 1)} to ${pctShare(t1.shares.arm, 1)} of their paired games`,
    );
    expect(sizeSentence({ ...t1, difference: 0 })).toBe("");
    expect(sizeSentence({ ...t1, difference: -0.004 })).toBe("");
  });

  it("state the limits the registration and the record state", () => {
    expect(ascensionSentence(9)).toBe(
      "Every game of this test was played at Ascension 0. You said you are at Ascension 9: nothing is known about whether the rule holds there.",
    );
    expect(cappedHeadline()).toMatch(
      /32 or more cards .* the bar of 0\.2 makes no difference here/,
    );
    expect(NOT_A_RECOMMENDATION).toMatch(/not a recommendation to skip, or to take/);
    expect(NOT_A_RECOMMENDATION).toMatch(
      /whole simulated runs, and say nothing about this one choice/,
    );
    const lim = limitsText();
    expect(lim).toMatch(/played at Ascension 0/);
    expect(lim).toMatch(/never been compared with the live game/);
    expect(lim).toMatch(/the few an event or a relic gives/);
    expect(lim).toMatch(
      /right after the Act 1 boss counts as Act 1, the one after the Act 2 boss as Act 2/,
    );
    expect(lim).toMatch(/Only the bar 0\.2 was tested/);
  });
});

describe("the panel", () => {
  const run = { ...newRun("ironclad"), actIndex: 1 as const };

  it("is closed until the visitor opens it, labelled as a simulated pilot's result and not the advisor's, and puts 'not a recommendation' directly under the answer", () => {
    const { container } = render(
      <PickierOpinion run={run} offered={[BETWEEN]} source="regular" data={passed} />,
    );
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.hasAttribute("open")).toBe(false);
    const all = text(container);
    expect(all).toContain("Act 2 · also show what a pickier simulated pilot would do (optional)");
    expect(all).toContain("Simulated · unverified");
    expect(all).toContain("Registered test passed (pooled) · ADR-062");
    expect(all).toContain("Not the advisor’s index");
    const head = all.indexOf(
      "In Act 2, a simulated pilot that takes a card only if it is measured above 0.2 would skip this reward.",
    );
    const note = all.indexOf(NOT_A_RECOMMENDATION);
    const evidence = all.indexOf("In a registered test (ADR-062");
    expect(head).toBeGreaterThan(-1);
    expect(note).toBeGreaterThan(head);
    expect(evidence).toBeGreaterThan(note);
    expect(all).toMatch(/The ordinary simulated pilot above would take /);
    expect(all).toContain(limitsText());
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/insights#thresholds", "/methods#thresh"]);
  });

  it("gives what ADR-062 item 5 asks of a page that says 'passed': the pooled result and interval, the pairs, every class's row, the boss shares and the floors", () => {
    const { container } = render(
      <PickierOpinion run={run} offered={[BETWEEN]} source="regular" data={passed} />,
    );
    const all = text(container);
    expect(all).toContain(pooledSentence(t1, 0.05, passed.seeds, passed.adr));
    for (const [i, row] of t1.perClass.entries()) {
      const label = row.character === "ironclad" ? "Ironclad" : "Defect";
      expect(all, row.character).toContain(classSentence(row, label, i === 0));
    }
    expect(all).toContain(bossSentence(t1));
    expect(all).toContain(excludedSentence(t1));
    expect(all).toContain(sizeSentence(t1));
    expect(all).toContain("Along the way: ");
  });

  it("does not let Defect read as a pass on its own: its row says it is not shown alone at the class level and that the pooled test is the evidence", () => {
    const d = withClass(passed, "defect", { verdict: "level", p: 0.026 });
    const defect = render(
      <PickierOpinion
        run={{ ...newRun("defect"), actIndex: 1 as const }}
        offered={[setFor("defect")?.cards.find((c) => c.beta > 0.25)?.id ?? ""]}
        source="regular"
        data={d}
      />,
    );
    const all = text(defect.container);
    expect(all).toMatch(
      /Defect \(your class\): .*exact p = 0\.026\), not shown on its own at the class level 0\.01, so the pooled test is the evidence here\./,
    );
    expect(all).toMatch(
      /Ironclad: .*ahead on its own at the class level 0\.01 \(secondary, uncorrected\)\./,
    );
    expect(all).toContain("Registered test passed (pooled)");
  });

  it("counts the copies of the deck, not its rows: 32 cards in two rows is a full deck, 31 is not", () => {
    const above = ABOVE;
    const rows = (a: number, b: number) => [
      { id: "STRIKE_IRONCLAD", count: a },
      { id: "DEFEND_IRONCLAD", count: b },
    ];
    const full = render(
      <PickierOpinion
        run={{ ...run, deck: rows(20, 12) }}
        offered={[above]}
        source="regular"
        data={passed}
      />,
    );
    expect(text(full.container)).toContain(cappedHeadline());
    cleanup();
    const room = render(
      <PickierOpinion
        run={{ ...run, deck: rows(20, 11) }}
        offered={[above]}
        source="regular"
        data={passed}
      />,
    );
    expect(text(room.container)).not.toContain(cappedHeadline());
    expect(text(room.container)).toMatch(/would take /);
    expect(text(room.container)).toContain("is above 0.2");
  });

  it("tells a run at Ascension 1 to 10 that the test was played at Ascension 0 and nothing is known above it, and a run at Ascension 0 nothing extra", () => {
    const at9 = render(
      <PickierOpinion
        run={{ ...run, ascension: 9, ascensionConfirmed: true }}
        offered={[BETWEEN]}
        source="regular"
        data={passed}
      />,
    );
    expect(text(at9.container)).toContain("Your Ascension. " + ascensionSentence(9));
    cleanup();
    const at0 = render(
      <PickierOpinion run={run} offered={[BETWEEN]} source="regular" data={passed} />,
    );
    expect(text(at0.container)).not.toContain("Your Ascension.");
    expect(text(at0.container)).toContain("Every game of the test was played at Ascension 0");
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
      { run, source: "event" as const },
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
