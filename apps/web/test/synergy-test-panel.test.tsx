import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PART_WEIGHT } from "@slay2/decision";

import { SynergyStudyPanel } from "../src/components/methods/SynergyStudyPanel";
import { SYNERGY_EVIDENCE, verdictOf, type SynergyTest } from "../src/lib/synergy-evidence";

import { CLASSES, fixtureTest, withTest } from "./fixtures/synergy-test";

function renderPanel(test: SynergyTest | null): HTMLElement {
  render(<SynergyStudyPanel evidence={withTest(test)} />);
  const section = document.getElementById("synergy");
  if (!section) throw new Error("the synergy section did not render");
  return section;
}

describe("the registered test on /methods", () => {
  it("reads the registered rule from the numbers alone", () => {
    expect(verdictOf(fixtureTest(600, 480))).toBe("ahead");
    expect(verdictOf(fixtureTest(450, 620))).toBe("behind");
    expect(verdictOf(fixtureTest(500, 480))).toBe("not-shown");
    // significant at 0.05 only just: the level is the test's own, not a default
    const edge = fixtureTest(560, 500);
    const p = edge.primary.reachedAct2.pairedTable.mcnemar_p;
    expect(p).toBeGreaterThan(0.04);
    expect(p).toBeLessThan(0.1);
    expect(verdictOf({ alpha: p * 1.01, primary: edge.primary })).toBe("ahead");
    expect(verdictOf({ alpha: p * 0.99, primary: edge.primary })).toBe("not-shown");
  });

  it("says it has not been run when it has not, and claims no result", () => {
    const section = renderPanel(null);
    expect(section).toHaveTextContent("It has not been run on its held-out seeds");
    expect(section.textContent).not.toMatch(
      /improved what the heuristic index picks|made the simulated picks worse/,
    );
  });

  it("ahead: says the term improved what the index picks, in simulated play, with the numbers", () => {
    const test = fixtureTest(600, 480);
    const section = renderPanel(test);
    const box = screen.getByRole("heading", { name: "The registered test" }).parentElement
      ?.parentElement;
    if (!box) throw new Error("no test box");
    expect(box).toHaveTextContent("ahead, in simulation");
    expect(box).toHaveTextContent(
      "adding the synergy term improved what the heuristic index picks",
    );
    expect(box).toHaveTextContent("600 games only the pilot with the term got past the boss");
    expect(box).toHaveTextContent("480 only the one without it");
    expect(section).not.toHaveTextContent("It has not been run");
    expect(box.textContent).not.toMatch(/made the simulated picks worse|Not shown/);
    // the claim carries its limits
    expect(box).toHaveTextContent("has not been compared with the live game");
    expect(box).toHaveTextContent("getting past the first boss is not winning");
  });

  it("not shown: does not claim a difference, and does not claim there is none", () => {
    const section = renderPanel(fixtureTest(500, 480));
    expect(section).toHaveTextContent("Not shown.");
    expect(section).toHaveTextContent("does not show that the term makes no difference");
    expect(section.textContent).not.toMatch(
      /improved what the heuristic index picks|made the simulated picks worse/,
    );
    expect(section.textContent).not.toMatch(/ahead, in simulation|worse, in simulation/);
  });

  it("behind: says the simulated picks got worse and that the label is revised", () => {
    const section = renderPanel(fixtureTest(450, 620));
    expect(section).toHaveTextContent("worse, in simulation");
    expect(section).toHaveTextContent("made the simulated picks worse");
    expect(section).toHaveTextContent("decision log (ADR-050)");
    expect(section.textContent).not.toMatch(/improved what the heuristic index picks/);
  });

  it("shows the five classes as a descriptive table and the Necrobinder start-HP caution", () => {
    const section = renderPanel(fixtureTest(600, 480));
    const table = within(section).getByRole("table", {
      name: /By class \(descriptive: one test was registered/,
    });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("rowheader")[0]?.textContent)).toEqual([
      "Ironclad",
      "Silent",
      "Regent",
      "Necrobinder",
      "Defect",
    ]);
    expect(section).toHaveTextContent("read every percentage below as too high for Necrobinder");
  });

  it("reports the secondary comparisons whatever the primary shows", () => {
    for (const [a, b] of [
      [600, 480],
      [500, 480],
      [450, 620],
    ] as const) {
      document.body.innerHTML = "";
      const section = renderPanel(fixtureTest(a, b, 1.5));
      expect(section).toHaveTextContent("Got past the Act-2 boss.");
      expect(section).toHaveTextContent("Everything the study changed, together.");
      expect(section).toHaveTextContent("Against measured card values.");
      expect(section).toHaveTextContent("What the arms did on the card screens.");
    }
  });

  it("names the comparison with no margin only when the margin is not zero", () => {
    const zero = renderPanel(fixtureTest(600, 480, 0));
    expect(zero).not.toHaveTextContent("Everything the study changed, together.");
    document.body.innerHTML = "";
    const margin = renderPanel(fixtureTest(600, 480, 1.5));
    expect(margin).toHaveTextContent("a card has to add 1.5 index points");
    expect(margin).toHaveTextContent("Everything the study changed, together.");
  });

  it("states what the development stage chose and that its games are not part of the result", () => {
    const section = renderPanel(fixtureTest(600, 480, 1.5));
    const choice = screen
      .getByText("How the configuration was chosen")
      .closest("details") as HTMLElement;
    expect(choice).toHaveTextContent("engine credit at 0.25 of their first judgement");
    expect(choice).toHaveTextContent(
      "it takes the best-ranked card only if the card adds at least 1.5 index points",
    );
    expect(choice).toHaveTextContent("These are tuning games, not a test");
    expect(section).toHaveTextContent("one test");
  });

  it("leaves the arm profile out when it was not written, instead of showing a blank", () => {
    const test = { ...fixtureTest(600, 480), profile: null };
    const section = renderPanel(test);
    expect(section).not.toHaveTextContent("What the arms did on the card screens.");
    expect(section).toHaveTextContent("Got past the Act-2 boss.");
  });
});

const shipped = SYNERGY_EVIDENCE.b2;
describe.runIf(shipped !== null)("the shipped result of the registered test", () => {
  it("is about the table the page computes with and the configuration the page uses", () => {
    if (!shipped) throw new Error("no B2 result");
    expect(shipped.tableSha256).toBe(SYNERGY_EVIDENCE.table.sha256);
    expect(shipped.alpha).toBe(0.05);
    // the index on the page keeps what the tested pilot kept (ADR-050 item 3)
    expect(PART_WEIGHT.needs).toBe(shipped.astar.needs);
    expect(PART_WEIGHT.scalers).toBe(shipped.astar.scalers);
    expect(PART_WEIGHT.engines).toBe(shipped.astar.engines);
  });

  it("carries the exporter's reading of the primary comparison, which is the rule applied to its numbers", () => {
    if (!shipped) throw new Error("no B2 result");
    expect(shipped.verdict).toBe(verdictOf(shipped));
  });

  it("pools five classes of 2,000 held-out pairs each", () => {
    if (!shipped) throw new Error("no B2 result");
    expect(shipped.primary.pairedSeeds).toBe(10000);
    expect(shipped.primary.members.map((m) => m.character).sort()).toEqual([...CLASSES].sort());
    expect(new Set(shipped.primary.members.map((m) => m.pairedSeeds))).toEqual(new Set([2000]));
  });
});
