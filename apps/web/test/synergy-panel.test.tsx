import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { deckSynergy, type DeckEntry } from "@slay2/decision";
import { getCard } from "@slay2/game-data";

import { SynergyPanel } from "../src/components/advisor/SynergyPanel";
import { SYNERGY_EVIDENCE } from "../src/lib/synergy-evidence";

import { fixtureTest, withTest } from "./fixtures/synergy-test";

function deck(character: "ironclad" | "necrobinder", ...rows: [string, number][]) {
  const entries: DeckEntry[] = rows.map(([id, count]) => {
    const card = getCard(id);
    if (!card) throw new Error(`no card ${id}`);
    return { card, count };
  });
  return deckSynergy(entries, 0, character);
}

describe("the synergy panel", () => {
  it("lists the engines the deck has, who supplies them and who uses them", () => {
    render(
      <SynergyPanel
        synergy={deck(
          "ironclad",
          ["STRIKE_IRONCLAD", 5],
          ["BURNING_PACT", 2],
          ["TRUE_GRIT", 1],
          ["FEEL_NO_PAIN", 1],
        )}
      />,
    );
    const engines = screen.getByRole("list", { name: "Engines in your deck" });
    expect(within(engines).getByText("Exhaust")).toBeInTheDocument();
    expect(engines).toHaveTextContent("Supplied by");
    expect(engines).toHaveTextContent("Burning Pact");
    expect(engines).toHaveTextContent("used by Feel No Pain");
    expect(screen.queryByRole("list", { name: "Cards waiting for support" })).toBeNull();
  });

  it("lists a payoff that nothing feeds as waiting, with how much of its rating is held back", () => {
    render(
      <SynergyPanel synergy={deck("ironclad", ["STRIKE_IRONCLAD", 5], ["FEEL_NO_PAIN", 1])} />,
    );
    const waiting = screen.getByRole("list", { name: "Cards waiting for support" });
    expect(waiting).toHaveTextContent("Feel No Pain");
    expect(waiting).toHaveTextContent("Exhaust (nothing in your deck yet)");
    expect(waiting).toHaveTextContent(/\d+ % of its rating is held back/);
  });

  it("names a starting relic as a supplier instead of leaving the need unmet (the Necrobinder's Osty)", () => {
    render(<SynergyPanel synergy={deck("necrobinder", ["STRIKE_NECROBINDER", 4], ["POKE", 1])} />);
    // Poke needs Osty; Bound Phylactery summons it every combat, so the card is not waiting
    expect(screen.queryByRole("list", { name: "Cards waiting for support" })).toBeNull();
    expect(screen.getByRole("list", { name: "Engines in your deck" })).toHaveTextContent(
      "Bound Phylactery",
    );
  });

  it("says what it is: a judgement, with the study's own numbers and its limits", () => {
    render(<SynergyPanel synergy={deck("ironclad", ["STRIKE_IRONCLAD", 5])} />);
    expect(screen.getByText("Judgement, partly checked")).toBeInTheDocument();
    const b1 = SYNERGY_EVIDENCE.b1;
    expect(b1).not.toBeNull();
    expect(
      screen.getByText((b1?.bossFights ?? 0).toLocaleString("en-US"), { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText(/the engine credit got no such support/)).toBeInTheDocument();
    const reading = screen.getByText("What the simulated runs show, and what they do not");
    expect(reading.closest("details")).not.toBeNull();
    expect(screen.getByText(/Not the live game/)).toBeInTheDocument();
    expect(screen.getByText(/registered before any of its games/)).toBeInTheDocument();
  });

  it("is said in numbers that match the report: the gain is negative log loss with an interval below zero", () => {
    render(<SynergyPanel synergy={deck("ironclad", ["STRIKE_IRONCLAD", 5])} />);
    const gain = SYNERGY_EVIDENCE.b1?.synergyAdded;
    expect(gain?.mean).toBeLessThan(0);
    expect(gain?.ci95[1]).toBeLessThan(0);
    // a negative figure is written with a real minus sign: the synergy term's gain and the gain beyond a model that knows the cards
    expect(
      screen.getAllByText(/\u22120\.0\d{3} \(95 % \u22120\.0\d{3} to \u22120\.0\d{3}\)/),
    ).toHaveLength(2);
  });
});

describe("the synergy panel once the registered test has been run", () => {
  const ironclad = () => deck("ironclad", ["STRIKE_IRONCLAD", 5]);

  it.each([
    [600, 480, "Judgement, tested in simulation", /adding the term improved what the index picks/],
    [500, 480, "Judgement, not shown to help", /did not show that the term improves the picks/],
    [450, 620, "Judgement, worse in simulation", /made the simulated picks worse/],
  ] as const)(
    "%i against %i: labels the term by what the test showed and says nothing more",
    (a, b, label, sentence) => {
      render(<SynergyPanel synergy={ironclad()} evidence={withTest(fixtureTest(a, b))} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.queryByText("Judgement, partly checked")).toBeNull();
      expect(screen.getByText(sentence)).toBeInTheDocument();
      // the test is no longer "not in yet", and the claim is limited to the simulator
      expect(screen.queryByText(/its result is not in yet/)).toBeNull();
      expect(screen.getByText(/Not the live game/)).toBeInTheDocument();
    },
  );

  it("quotes the test's own figures", () => {
    const test = fixtureTest(600, 480);
    render(<SynergyPanel synergy={ironclad()} evidence={withTest(test)} />);
    const e = test.primary.reachedAct2;
    const text = screen.getByText(/The registered test\./).closest("p")?.textContent ?? "";
    expect(text).toContain(`${(e.a.rate * 100).toFixed(1)}%`);
    expect(text).toContain(`${(e.b.rate * 100).toFixed(1)}%`);
    expect(text).toMatch(/p = /);
    expect(text).toContain("same pilot without the synergy term");
  });

  it("keeps saying the test is registered but not in while it has not been run", () => {
    render(<SynergyPanel synergy={ironclad()} evidence={withTest(null)} />);
    expect(screen.getByText("Judgement, partly checked")).toBeInTheDocument();
    expect(screen.getByText(/its result is not in yet/)).toBeInTheDocument();
    expect(screen.queryByText(/The registered test\./)).toBeNull();
  });
});
