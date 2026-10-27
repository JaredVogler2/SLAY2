import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SynergyPanel, labelOf } from "../src/components/advisor/SynergyPanel";
import { SynergyStudyPanel } from "../src/components/methods/SynergyStudyPanel";
import { deckSynergy } from "@slay2/decision";
import { getCard, starterDeck } from "@slay2/game-data";

import { fixtureKeepTest, fixtureTest, withTests } from "./fixtures/synergy-test";

/**
 * The registered test of the synergy term repeated with the relics kept (ADR-054), on the made-up numbers of the fixtures: what the
 * methods page and the advisor's label say for each way it can come out, with the first test beside it. (ADR-054 item 4: ahead keeps
 * the label, behind revisits it, not shown says the term was tested twice and what each test found.)
 */
const FIRST = fixtureTest(600, 480);

function methods(keep: ReturnType<typeof fixtureKeepTest> | null): HTMLElement {
  render(<SynergyStudyPanel evidence={withTests(FIRST, keep)} />);
  const heading = screen.getByRole("heading", { name: "The same test with the relics kept" });
  const box = heading.closest("section");
  if (!box) throw new Error("no box for the repeated test");
  return box;
}

describe("the registered test repeated with the relics kept, on /methods", () => {
  it("says it is registered and not in yet, and claims no result, while it has not been read", () => {
    const box = methods(null);
    expect(box).toHaveTextContent("Registered (ADR-054) before any of its games");
    expect(box).toHaveTextContent("gap G14");
    expect(box.textContent).not.toMatch(/Ahead again|Worse\.|Not shown\./);
  });

  it("ahead: says the term still improved what the index picks, with the numbers and the first test beside it", () => {
    const keep = fixtureKeepTest(620, 450);
    const box = methods(keep);
    expect(box).toHaveTextContent("ahead, in simulation");
    expect(box).toHaveTextContent("Ahead again.");
    expect(box).toHaveTextContent("still improved what the heuristic index picks");
    expect(box).toHaveTextContent("620 games only the pilot with the term got past the boss");
    expect(box).toHaveTextContent("450 only the one without it");
    expect(box).toHaveTextContent("The first test, without the relics:");
    expect(box).toHaveTextContent("getting past the first boss is not winning");
    expect(box.textContent).not.toMatch(/Worse\.|Not shown\./);
  });

  it("behind: says the term made the simulated picks worse, and that the label says so", () => {
    const box = methods(fixtureKeepTest(440, 640));
    expect(box).toHaveTextContent("worse, in simulation");
    expect(box).toHaveTextContent("adding the synergy term made the simulated picks worse");
    expect(box).toHaveTextContent("recorded in the decision log (ADR-054)");
    expect(box.textContent).not.toMatch(/Ahead again|Not shown\./);
  });

  it("not shown: claims neither a difference nor that there is none", () => {
    const box = methods(fixtureKeepTest(500, 480));
    expect(box).toHaveTextContent("not shown");
    expect(box).toHaveTextContent("could not tell the two pilots apart");
    expect(box).toHaveTextContent("does not show that the term makes no difference");
    expect(box).toHaveTextContent("tested twice");
    expect(box.textContent).not.toMatch(/Ahead again|Worse\./);
  });

  it("lists the five classes and does not claim the relic reading, a live game or winning", () => {
    const box = methods(fixtureKeepTest(620, 450));
    for (const cls of ["Ironclad", "Silent", "Regent", "Necrobinder", "Defect"]) {
      expect(box).toHaveTextContent(cls);
    }
    expect(box).toHaveTextContent("What this does not show.");
    expect(box).toHaveTextContent("both pilots read the class alone here");
  });

  it("starts every sentence of its prose with a capital letter", () => {
    const box = methods(fixtureKeepTest(620, 450));
    for (const p of Array.from(box.querySelectorAll(":scope > p, :scope > div > p"))) {
      const text = p.textContent.trim();
      expect(text.charAt(0), text.slice(0, 40)).toBe(text.charAt(0).toUpperCase());
      for (const lead of text.matchAll(/\.\s+([a-z][a-z-]*)/g)) {
        expect
          .soft(
            ["e.g", "i.e"].includes(lead[1] ?? ""),
            `lower-case start after a full stop: ${lead[0]}`,
          )
          .toBe(true);
      }
    }
  });
});

describe("the label the advisor's synergy panel carries, by how the registered tests came out", () => {
  const verdictFixtures = {
    ahead: () => fixtureTest(600, 480),
    "not-shown": () => fixtureTest(500, 480),
    behind: () => fixtureTest(450, 620),
  };
  const keepFixtures = {
    ahead: () => fixtureKeepTest(620, 450),
    "not-shown": () => fixtureKeepTest(500, 480),
    behind: () => fixtureKeepTest(440, 640),
  };

  it("is partly checked before any test, and the first test's alone until the repeated one is read", () => {
    expect(labelOf({ b2: null, b2keep: null })).toBe("Judgement, partly checked");
    expect(labelOf({ b2: verdictFixtures.ahead(), b2keep: null })).toBe(
      "Judgement, tested in simulation",
    );
    expect(labelOf({ b2: verdictFixtures["not-shown"](), b2keep: null })).toBe(
      "Judgement, not shown to help",
    );
    expect(labelOf({ b2: verdictFixtures.behind(), b2keep: null })).toBe(
      "Judgement, worse in simulation",
    );
  });

  it.each([
    ["ahead", "ahead", "Judgement, tested in simulation"],
    ["ahead", "not-shown", "Judgement, mixed in simulation"],
    ["ahead", "behind", "Judgement, worse in simulation"],
    ["not-shown", "ahead", "Judgement, mixed in simulation"],
    ["not-shown", "not-shown", "Judgement, not shown to help"],
    ["not-shown", "behind", "Judgement, worse in simulation"],
    ["behind", "ahead", "Judgement, worse in simulation"],
    ["behind", "not-shown", "Judgement, worse in simulation"],
    ["behind", "behind", "Judgement, worse in simulation"],
  ] as const)("first %s, repeated %s: %s", (first, keep, label) => {
    expect(labelOf({ b2: verdictFixtures[first](), b2keep: keepFixtures[keep]() })).toBe(label);
  });

  it("shows the label and, among the evidence, what the repeated test found", () => {
    const synergy = deckSynergy(
      starterDeck("ironclad").flatMap(({ id, count }) => {
        const card = getCard(id);
        return card ? [{ card, count }] : [];
      }),
      0,
      "ironclad",
    );
    const evidence = withTests(fixtureTest(600, 480), fixtureKeepTest(500, 480));
    const { container } = render(<SynergyPanel synergy={synergy} evidence={evidence} />);
    expect(screen.getByText("Judgement, mixed in simulation")).toBeInTheDocument();
    expect(container).toHaveTextContent("The same test with the relics kept.");
    expect(container).toHaveTextContent("did not show that the term helps");
    expect(container).toHaveTextContent("mixed in simulation. In");
  });

  it("says the repeated test is registered and not in yet when only the first has been read", () => {
    const synergy = deckSynergy(
      starterDeck("ironclad").flatMap(({ id, count }) => {
        const card = getCard(id);
        return card ? [{ card, count }] : [];
      }),
      0,
      "ironclad",
    );
    const { container } = render(
      <SynergyPanel synergy={synergy} evidence={withTests(fixtureTest(600, 480), null)} />,
    );
    expect(screen.getByText("Judgement, tested in simulation")).toBeInTheDocument();
    expect(container).toHaveTextContent("The same test with the relics kept is registered");
    expect(container).not.toHaveTextContent("The same test with the relics kept.");
  });
});
