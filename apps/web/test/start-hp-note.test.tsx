import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StartHpNote } from "@/components/ui/StartHpNote";
import { startHpGap, type NeowData } from "@/lib/neow";

const data: NeowData = {
  values: null,
  test: null,
  startHpGaps: { necrobinder: { simulator: 0.6353, game: 0.515, pairs: 1499, comparison: "x" } },
};

describe("the start-HP note (gap G13)", () => {
  it("says what the simulator does, with the measured cost, for the class that has a gap", () => {
    render(<StartHpNote character="necrobinder" subject="chances" data={data} />);
    const note = screen.getByText(/starts a Necrobinder with more HP than the game gives it/);
    expect(note).toHaveTextContent("51.5% of 1,499 paired runs instead of 63.5%");
    expect(note).toHaveTextContent("read every percentage below as too high for Necrobinder");
  });

  it("says what is not known about card values when the subject is values", () => {
    render(<StartHpNote character="necrobinder" subject="values" data={data} />);
    const note = screen.getByText(/gap G13/);
    expect(note).toHaveTextContent(
      "whether the order of these values holds at the game's HP has not been measured",
    );
    expect(note).not.toHaveTextContent("percentage");
  });

  it("is nothing for a class that starts with the game's HP, for no class, and for no data", () => {
    const { container, rerender } = render(
      <StartHpNote character="silent" subject="values" data={data} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<StartHpNote character="" subject="values" data={data} />);
    expect(container).toBeEmptyDOMElement();
    rerender(
      <StartHpNote character="necrobinder" subject="values" data={{ values: null, test: null }} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(startHpGap("necrobinder", data)?.game).toBe(0.515);
    expect(startHpGap("Necrobinder", data)?.game).toBe(0.515);
  });

  it("reads the committed measurement, which the exporter takes from the game-HP comparison", () => {
    const real = startHpGap("necrobinder");
    expect(real, "the G13 comparison is committed and exported").toBeDefined();
    expect(real?.game).toBeLessThan(real?.simulator ?? 0);
    expect(real?.pairs).toBeGreaterThan(400);
    expect(startHpGap("silent")).toBeUndefined();
  });
});
