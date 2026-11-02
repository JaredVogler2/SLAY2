import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SimulationOpinion } from "@/components/advisor/SimulationOpinion";
import { UnderdocksNote } from "@/components/advisor/UnderdocksNote";
import { newRun } from "@/lib/run-state";

afterEach(cleanup);

/**
 * The caveat for a visitor in Underdocks (every simulated run was played in Overgrowth, gap G12) is one callout: the same boxed note in the colour the site keeps for
 * risk on every advisor panel that shows simulated numbers. It used to be a bare line of small red text on the Neow panel and a box on the others.
 */
const BOX = "rounded-lg border border-rose-deep/60 bg-rose/10 p-3 text-sm text-rose";
const underdocks = { ...newRun("ironclad"), act1: "underdocks" as const };

describe("the Underdocks caveat looks the same wherever it appears", () => {
  it("is a boxed note, with a role, in the one style", () => {
    const { container } = render(<UnderdocksNote>text</UnderdocksNote>);
    const note = container.querySelector("[data-underdocks-note]");
    expect(note).toHaveAttribute("role", "note");
    expect(note?.className).toBe(BOX);
    expect(note).toHaveTextContent("text");
  });

  it("is the same box on the card-pick panel (the Neow panel's is asserted in neow-offer.test.tsx) and a quiet line, not a box, for Overgrowth", () => {
    const pick = render(
      <SimulationOpinion run={underdocks} offered={["RAMPAGE"]} heuristic={{ kind: "skip" }} />,
    );
    const onPick = pick.container.querySelector("[data-underdocks-note]");
    expect(onPick?.className).toContain(BOX);
    expect(onPick).toHaveTextContent("You said you are in Underdocks.");
    cleanup();
    const overgrowth = render(
      <SimulationOpinion
        run={{ ...underdocks, act1: "overgrowth" }}
        offered={["RAMPAGE"]}
        heuristic={{ kind: "skip" }}
      />,
    );
    expect(overgrowth.container.querySelector("[data-underdocks-note]")).toBeNull();
    expect(screen.getByText(/Every simulated run was played in Overgrowth/)).toBeInTheDocument();
  });

  it("is written in one place: no panel draws its own box for it", () => {
    for (const file of ["NeowOffer.tsx", "SimulationOpinion.tsx", "OpeningPanel.tsx"]) {
      const src = readFileSync(join(__dirname, "..", "src", "components", "advisor", file), "utf8");
      expect(src, file).toContain("<UnderdocksNote");
      expect(src, file).not.toContain("border-rose-deep/60 bg-rose/10");
    }
  });
});
