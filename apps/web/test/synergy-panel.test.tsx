import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PART_WEIGHT, deckSynergy, type DeckEntry } from "@slay2/decision";
import { getCard } from "@slay2/game-data";

import { SynergyPanel, labelOf } from "../src/components/advisor/SynergyPanel";
import { SYNERGY_EVIDENCE, kept } from "../src/lib/synergy-evidence";

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
  it("names the relics it counted and says that their reading has no registered test, only when there are some", () => {
    const synergy = deck("ironclad", ["STRIKE_IRONCLAD", 5]);
    const { rerender } = render(<SynergyPanel synergy={synergy} />);
    expect(screen.queryByText(/Counted as suppliers here/)).toBeNull();
    rerender(
      <SynergyPanel
        synergy={synergy}
        relics={{
          supplying: [{ id: "VAJRA", name: "Vajra", mechanics: ["Strength"] }],
          taking: [],
          unread: [],
        }}
      />,
    );
    const note = screen.getByText(/Counted as suppliers here/);
    expect(note).toHaveTextContent("Vajra (Strength)");
    expect(note).toHaveTextContent("a separate judgement with no registered test");
    expect(note).toHaveTextContent("simulated runs that keep their relics");
    rerender(
      <SynergyPanel synergy={synergy} relics={{ supplying: [], taking: [], unread: ["Anchor"] }} />,
    );
    expect(screen.queryByText(/Counted as suppliers here/)).toBeNull();
    expect(screen.queryByText(/Counted against here/)).toBeNull();
    // a relic that takes a mechanic away is named, as counted against and not as a supplier
    rerender(
      <SynergyPanel
        synergy={synergy}
        relics={{
          supplying: [],
          taking: [{ id: "BIG_MUSHROOM", name: "Big Mushroom", mechanics: ["Card draw"] }],
          unread: [],
        }}
      />,
    );
    const against = screen.getByText(/Counted against here/);
    expect(against).toHaveTextContent("Big Mushroom (Card draw)");
    expect(against).not.toHaveTextContent("Counted as suppliers here");
    expect(against).toHaveTextContent("no registered test");
  });

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

  it("names the engines but says that the ranking does not count them (the page keeps none of an engine's strength, ADR-050 addendum D)", () => {
    expect(PART_WEIGHT.engines).toBe(0);
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
    expect(screen.getByRole("list", { name: "Engines in your deck" })).toHaveTextContent(
      "used by Feel No Pain",
    );
    expect(screen.getByText(/the ranking above does not count engines/)).toBeInTheDocument();
  });

  it("says what the index keeps of each part, in words", () => {
    render(<SynergyPanel synergy={deck("ironclad", ["STRIKE_IRONCLAD", 5])} />);
    expect(
      screen.getByText(
        /The index counts unmet needs in full, the lift from Strength, Dexterity and Focus at 0\.70 of its first judgement and engines not at all/,
      ),
    ).toBeInTheDocument();
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

  it("says what it is before any held-out result: a judgement, with the study's own numbers and its limits", () => {
    render(
      <SynergyPanel synergy={deck("ironclad", ["STRIKE_IRONCLAD", 5])} evidence={withTest(null)} />,
    );
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

const shipped = SYNERGY_EVIDENCE.b2;

describe.runIf(shipped !== null)("the synergy panel with the shipped held-out result", () => {
  it("is labelled by what the registered test showed, and quotes its own figures", () => {
    if (!shipped) throw new Error("no B2 result");
    render(<SynergyPanel synergy={deck("ironclad", ["STRIKE_IRONCLAD", 5])} />);
    // the label follows from the tests that have been read (the repeated test with the relics kept too, once it is in)
    expect(screen.getByText(labelOf(SYNERGY_EVIDENCE))).toBeInTheDocument();
    expect(screen.queryByText("Judgement, partly checked")).toBeNull();
    const e = shipped.primary.reachedAct2;
    const text = screen.getByText(/The registered test\./).closest("p")?.textContent ?? "";
    expect(text).toContain(`${(e.a.rate * 100).toFixed(1)}%`);
    expect(text).toContain(`${(e.b.rate * 100).toFixed(1)}%`);
    expect(text).toContain("same pilot without the synergy term");
    expect(
      screen.queryByText(/A held-out test of a pilot that picks cards by this index/),
    ).toBeNull();
  });
});

describe("what the index keeps, in words", () => {
  it("says in full, not at all, or how much of the first judgement", () => {
    expect(kept(1)).toBe("in full");
    expect(kept(1.2)).toBe("in full");
    expect(kept(0)).toBe("not at all");
    expect(kept(0.7)).toBe("at 0.70 of its first judgement");
    expect(kept(0.25)).toBe("at 0.25 of its first judgement");
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
      // the first test is no longer "not in yet" (the repeated one, with the relics kept, is registered and says so), and the claim is
      // limited to the simulator
      expect(
        screen.queryByText(/A held-out test of a pilot that picks cards by this index/),
      ).toBeNull();
      expect(
        screen.getByText(/The same test with the relics kept is registered/),
      ).toBeInTheDocument();
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
    expect(
      screen.getByText(/A held-out test of a pilot that picks cards by this index is registered/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/The registered test\./)).toBeNull();
  });
});
