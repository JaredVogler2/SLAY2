import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MeasuredValue } from "@/components/codex/MeasuredValue";
import { allSets, type CardValueSet } from "@/lib/cardvalues";

/**
 * The Codex says, under each measured value, whether the runs it was fitted from kept the relics they gained: the pinned simulator
 * drops them (gap G14, ADR-052), and a set fitted from runs that kept them (ADR-053) is not described by the same sentence.
 */
function first(): { set: CardValueSet; card: CardValueSet["cards"][number] } {
  const set = allSets()[0];
  const card = set?.cards[0];
  if (!set || !card) throw new Error("no measured set");
  return { set, card };
}

describe("the Codex's measured value and the relics of the runs behind it", () => {
  it("says the runs kept only two relics when the set was fitted from the simulator as it is", () => {
    const { set, card } = first();
    render(<MeasuredValue m={card} set={{ ...set, relicsKept: false }} />);
    expect(screen.getByText(/Those runs kept only two relics/)).toBeInTheDocument();
    expect(screen.getByText(/gap G14/)).toBeInTheDocument();
    expect(screen.getByText(/Unverified against the live game/)).toBeInTheDocument();
  });

  it("says the runs kept the relics they gained when the set was fitted from runs that did", () => {
    const { set, card } = first();
    render(<MeasuredValue m={card} set={{ ...set, relicsKept: true }} />);
    expect(screen.getByText(/Those runs kept the relics they gained/)).toBeInTheDocument();
    expect(screen.queryByText(/kept only two relics/)).toBeNull();
  });

  it("leaves the compact form (the advisor's second opinion, which carries its own paragraph) as it was", () => {
    const { set, card } = first();
    render(<MeasuredValue m={card} set={set} compact />);
    expect(screen.queryByText(/gap G14/)).toBeNull();
  });
});
