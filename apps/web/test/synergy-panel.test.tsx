import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { deckSynergy, type DeckEntry } from "@slay2/decision";
import { getCard } from "@slay2/game-data";

import { SynergyPanel } from "../src/components/advisor/SynergyPanel";
import { SYNERGY_EVIDENCE } from "../src/lib/synergy-evidence";

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
      screen.getAllByText(/\u22120\.00\d\d \(95 % \u22120\.00\d\d to \u22120\.00\d\d\)/),
    ).toHaveLength(2);
  });
});
