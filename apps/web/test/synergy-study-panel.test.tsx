import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SynergyStudyPanel } from "../src/components/methods/SynergyStudyPanel";
import { SYNERGY_EVIDENCE, change, num, range } from "../src/lib/synergy-evidence";

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

  it("says the registered test has not been run, and claims no result of it", () => {
    render(<SynergyStudyPanel />);
    const test = screen.getByRole("heading", { name: "The registered test" }).parentElement;
    expect(test).toHaveTextContent("It has not been run on its held-out seeds");
    expect(test).toHaveTextContent("ADR-050");
    const text = document.getElementById("synergy")?.textContent ?? "";
    expect(text).not.toMatch(/passed its test|improves what the heuristic index picks/);
  });

  it("says what the reading is not: simulated, exploratory, about the first boss, not about winning", () => {
    render(<SynergyStudyPanel />);
    const limits = document.getElementById("synergy");
    expect(limits).toHaveTextContent("Simulated, not measured in the live game");
    expect(limits).toHaveTextContent("Exploratory");
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
});
