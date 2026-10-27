import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CardValuesPanel } from "../src/components/methods/CardValuesPanel";
import { againstText, keepValuesVerdict } from "../src/lib/cardvalues";

import { fixtureKeepValues } from "./fixtures/keep-values";

/**
 * The test of the card values measured again with the relics kept (ADR-053), on the made-up numbers of the fixtures: what /methods
 * says for each way the reading rule of item 5 can come out, and what it says while the result does not exist.
 */
function block(test: ReturnType<typeof fixtureKeepValues> | null): HTMLElement {
  render(<CardValuesPanel keepTest={test} />);
  const heading = screen.getByRole("heading", {
    name: "The values measured again with the relics kept",
  });
  const section = heading.closest("section");
  if (!section) throw new Error("no section");
  return section;
}

describe("the card values measured again with the relics kept, on /methods", () => {
  it("reads the rule of item 5 from the numbers alone", () => {
    expect(keepValuesVerdict(fixtureKeepValues(700, 540))).toBe("gain");
    expect(keepValuesVerdict(fixtureKeepValues(540, 700))).toBe("loss");
    expect(keepValuesVerdict(fixtureKeepValues(600, 590))).toBe("none");
  });

  it("says it is registered and claims no result while the result does not exist", () => {
    const box = block(null);
    expect(box).toHaveTextContent("gap G14");
    expect(box).toHaveTextContent("ADR-053");
    expect(box).toHaveTextContent("registered before any of its games");
    expect(box).toHaveTextContent("change only if the test says so, by a rule fixed beforehand");
    expect(box.textContent).not.toMatch(/New values ahead|New values behind|No difference shown/);
  });

  it("gain: names the classes that adopt the new values and the ones that keep their set, with the numbers", () => {
    const box = block(
      fixtureKeepValues(700, 540, { ironclad: [60, 140], silent: [160, 100], regent: [150, 110] }),
    );
    expect(box).toHaveTextContent("new values ahead");
    expect(box).toHaveTextContent("New values ahead.");
    expect(box).toHaveTextContent("use the new values for Silent");
    expect(box).toHaveTextContent("Ironclad keeps the current set");
    expect(box).toHaveTextContent("700 games only with the new values");
    expect(box).toHaveTextContent("540 only with the current");
    expect(box.textContent).not.toMatch(/No difference shown|New values behind/);
    expect(box).toHaveTextContent("level 0.05");
  });

  it("none: says the values did not change enough to matter for this pilot, and that this is not proof", () => {
    const box = block(fixtureKeepValues(600, 590));
    expect(box).toHaveTextContent("no difference shown");
    expect(box).toHaveTextContent("did not change enough to matter for this pilot");
    expect(box).toHaveTextContent("not proof that they never would");
    expect(box).toHaveTextContent("The current sets stay");
    expect(box.textContent).not.toMatch(/New values ahead|New values behind/);
  });

  it("says what leaving out the games that ended in a simulator error does when the relics are kept", () => {
    const box = block(fixtureKeepValues(700, 540));
    expect(box).toHaveTextContent(
      "which with the relics kept come deep into a run, after the Act-1 boss in nearly every case (ADR-053), so leaving them out of the pair reads the share past the boss slightly low in both arms alike",
    );
    expect(box.textContent).not.toContain("which says nothing about play");
  });

  it("loss: says the current values did better and that every current set stays", () => {
    const box = block(fixtureKeepValues(540, 700));
    expect(box).toHaveTextContent("new values behind");
    expect(box).toHaveTextContent("every current set stays");
    expect(box.textContent).not.toMatch(/New values ahead|No difference shown/);
  });

  it("lists the five classes and which set is shown for each", () => {
    const box = block(fixtureKeepValues(700, 540, { ironclad: [60, 140] }));
    for (const cls of ["Ironclad", "Silent", "Regent", "Necrobinder", "Defect"]) {
      expect(box).toHaveTextContent(cls);
    }
    const rows = Array.from(box.querySelectorAll("tbody tr"));
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent("the current values");
    expect(rows[1]).toHaveTextContent("the new values");
  });

  it("says a set measured against the values the site showed is compared with them, in words", () => {
    expect(
      againstText({
        comparison: "x",
        alpha: 0.05,
        pairedGames: 1,
        passRate: 0.5,
        passRateBase: 0.5,
        p: 0.5,
        against: "current-values",
        basis: "pooled",
        passed: false,
      }),
    ).toContain("the values measured in the simulator that drops the relics");
  });
});
