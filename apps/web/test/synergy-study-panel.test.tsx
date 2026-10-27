import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PART_WEIGHT } from "@slay2/decision";

import { SynergyStudyPanel } from "../src/components/methods/SynergyStudyPanel";
import { SYNERGY_EVIDENCE, change, num, range, verdictOf } from "../src/lib/synergy-evidence";

import { withTest } from "./fixtures/synergy-test";

describe("the /methods synergy section", () => {
  const b1 = SYNERGY_EVIDENCE.b1;

  it("has the study's report to quote", () => {
    expect(b1, "experiments/synergy/b1-calibration.json is exported").not.toBeNull();
  });

  it("quotes the report's own figures, with their intervals", () => {
    if (!b1) throw new Error("no B1 report");
    render(<SynergyStudyPanel />);
    const tiles = screen.getByRole("list", {
      name: "Result of the exploratory reading of the synergy parts",
    });
    expect(tiles).toHaveTextContent(
      `${num(b1.logLoss.index, 4)} → ${num(b1.logLoss.indexAndSynergy, 4)}`,
    );
    expect(tiles).toHaveTextContent(change(b1.synergyAdded));
    for (const r of [b1.ratios.needs, b1.ratios.scalers, b1.ratios.engines]) {
      expect(tiles).toHaveTextContent(num(r.toQuality, 2));
      expect(tiles).toHaveTextContent(`95 % ${range(r.ci95, 2)}`);
    }
    const section = document.getElementById("synergy");
    expect(section?.tagName).toBe("SECTION");
    expect(section).toHaveTextContent(`${b1.bossFights.toLocaleString("en-US")} simulated runs`);
    expect(section).toHaveTextContent(SYNERGY_EVIDENCE.table.sha256.slice(0, 12));
    expect(section).toHaveTextContent(b1.sha256.slice(0, 12));
  });

  it("says what the page's index keeps of each part, from the constants the page uses", () => {
    render(<SynergyStudyPanel />);
    const text = document.getElementById("synergy")?.textContent ?? "";
    expect(PART_WEIGHT).toEqual({ needs: 1, scalers: 0.7, engines: 0 });
    expect(text).toContain(
      "keeps unmet needs in full, the lifts at 0.70 of its first judgement and engines not at all",
    );
    expect(text).toContain("ADR-050 addendum D");
  });

  it("reads each class and seed set by its own interval: a gain is clear only when the interval is below zero", () => {
    if (!b1) throw new Error("no B1 report");
    render(<SynergyStudyPanel />);
    const table = screen.getByRole("table", { name: /By class and seed set/ });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(b1.cohorts.length);
    for (const cohort of b1.cohorts) {
      const gain = b1.perCohortGain[cohort.name];
      const seeds = cohort.partition === "train" ? "training seeds" : "development seeds";
      const row = rows.find((r) => r.textContent.startsWith(`${cohort.character}, ${seeds}`));
      expect(row, `a row for ${cohort.name}`).toBeDefined();
      const clear = (gain?.ci95[1] ?? 0) < 0;
      expect(row).toHaveTextContent(clear ? "clear gain" : "the data cannot tell");
      if (gain) expect(row).toHaveTextContent(change(gain));
    }
  });

  it("quotes the reading repeated with the relics kept: its own figures, and what it is not", () => {
    const keep = SYNERGY_EVIDENCE.keep;
    expect(keep).not.toBeNull();
    if (!keep) return;
    render(<SynergyStudyPanel />);
    const block = screen
      .getByRole("heading", { name: /Read again with the relics kept/ })
      .closest("section");
    expect(block).not.toBeNull();
    if (!block) return;
    expect(block).toHaveTextContent(keep.bossFights.toLocaleString("en-US"));
    expect(block).toHaveTextContent(keep.withTaggedRelic.toLocaleString("en-US"));
    expect(block).toHaveTextContent(num(keep.classAlone.logLoss, 5));
    expect(block).toHaveTextContent(num(keep.relicsCounted.logLoss, 5));
    expect(block).toHaveTextContent(change(keep.relicsCounted.synergyAdded));
    // the further gain from counting the relics is reported as a positive amount with an interval that does not include zero
    expect(keep.relicGain.mean).toBeLessThan(0);
    expect(keep.relicGain.ci95[1] ?? 1).toBeLessThan(0);
    expect(block).toHaveTextContent(`further ${num(-keep.relicGain.mean, 5)}`);
    expect(block).toHaveTextContent("exploratory");
    expect(block).toHaveTextContent("could not see the relic term");
    expect(block).toHaveTextContent("gap G14");
    // the table the reading was made with is the one the page computes with
    expect(keep.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("says the registered test has not been run, and claims no result of it, until a result is exported", () => {
    render(<SynergyStudyPanel evidence={withTest(null)} />);
    const test = screen.getByRole("heading", { name: "The registered test" }).parentElement;
    expect(test).toHaveTextContent("It has not been run on its held-out seeds");
    expect(test).toHaveTextContent("ADR-050");
    const text = document.getElementById("synergy")?.textContent ?? "";
    expect(text).not.toMatch(/passed its test|improves what the heuristic index picks/);
  });

  it.runIf(SYNERGY_EVIDENCE.b2 !== null)(
    "states the shipped result of the registered test, from the file's own numbers",
    () => {
      const test = SYNERGY_EVIDENCE.b2;
      if (!test) throw new Error("no B2 result");
      render(<SynergyStudyPanel />);
      const section = document.getElementById("synergy");
      const e = test.primary.reachedAct2;
      expect(section).toHaveTextContent(`${(e.a.rate * 100).toFixed(1)}%`);
      expect(section).toHaveTextContent(`${(e.b.rate * 100).toFixed(1)}%`);
      expect(section).not.toHaveTextContent("It has not been run on its held-out seeds");
      const word = { ahead: "Ahead.", "not-shown": "Not shown.", behind: "Worse." }[
        verdictOf(test)
      ];
      expect(section).toHaveTextContent(word);
    },
  );

  it("says what the reading is not: simulated, exploratory, about the first boss, not about winning", () => {
    render(<SynergyStudyPanel />);
    const limits = document.getElementById("synergy");
    expect(limits).toHaveTextContent("Simulated, not measured in the live game");
    expect(limits).toHaveTextContent("The exploratory readings above, not the registered test");
    expect(limits).toHaveTextContent("not about winning");
    expect(limits).toHaveTextContent("Parity with the live game unverified");
  });

  it("carries the Necrobinder start-HP note, because its runs are in the reading (gap G13)", () => {
    render(<SynergyStudyPanel />);
    expect(document.getElementById("synergy")).toHaveTextContent(
      "whether the readings themselves hold at the game's HP has not been measured",
    );
  });

  it("explains the audit that changed the tags and why the figures flatter them", () => {
    render(<SynergyStudyPanel />);
    const audit = screen
      .getByText("How the readings changed the tags")
      .closest("details") as HTMLElement;
    expect(audit).toHaveTextContent("Bound Phylactery");
    expect(audit).toHaveTextContent("the figures flatter them");
    expect(audit).toHaveTextContent("independent second reading");
    expect(audit).toHaveTextContent("thrown away unread");
  });

  it("lists the unmet needs mechanic by mechanic, as a description and with the report's own figures", () => {
    const mech = b1?.mechanics;
    if (!mech) throw new Error("no per-mechanic report");
    render(<SynergyStudyPanel />);
    const disclosure = screen
      .getByText("Which needs the runs support, one mechanic at a time")
      .closest("details") as HTMLElement;
    const table = within(disclosure).getByRole("table", {
      name: /Worth of a point of each mechanic/,
    });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(mech.rows.length + 1);
    expect(rows[0]).toHaveTextContent("All needs together");
    expect(rows[0]).toHaveTextContent(
      `${num(mech.pooled.toQuality, 2)} (${range(mech.pooled.ci95, 2)})`,
    );
    for (const r of mech.rows) {
      const row = rows.find((x) => x.querySelector("th")?.textContent === r.label);
      expect(row, `a row for ${r.label}`).toBeDefined();
      expect(row).toHaveTextContent(`${num(r.ratio.toQuality, 2)} (${range(r.ratio.ci95, 2)})`);
      expect(row).toHaveTextContent(r.decks.toLocaleString("en-US"));
    }
    // it is a description: nothing here claims a mechanic is mis-tagged, and the table is not changed by it
    expect(disclosure).toHaveTextContent("not corrected for it");
    expect(disclosure).toHaveTextContent("the tags were not changed because of it");
    expect(disclosure).toHaveTextContent(mech.sha256.slice(0, 12));
  });

  it("sorts the mechanics the way the report does, by how much their unmet need varies", () => {
    const mech = b1?.mechanics;
    if (!mech) throw new Error("no per-mechanic report");
    render(<SynergyStudyPanel />);
    const table = screen.getByRole("table", { name: /Worth of a point of each mechanic/ });
    const labels = within(table)
      .getAllByRole("row")
      .slice(2)
      .map((row) => row.querySelector("th")?.textContent);
    expect(labels).toEqual(mech.rows.map((r) => r.label));
  });
});
