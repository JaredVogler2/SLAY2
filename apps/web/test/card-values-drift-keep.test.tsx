import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CardValuesPanel } from "@/components/methods/CardValuesPanel";
import type * as cardvalues from "@/lib/cardvalues";
import type { Drift } from "@/lib/cardvalues";

// A class whose shown set was measured with the relics kept and replaces the earlier one (ADR-053): the real set with those two things
// switched on, so that the block that describes how the values moved can be read.
const DRIFT: Drift = {
  previous: "silent-a0-v1.json",
  previousSha256: "a".repeat(64),
  previousBossFights: 2500,
  previousPassRate: 0.52,
  cardsInBoth: 70,
  spearman: 0.55,
  k: 5,
  bestShared: 2,
  worstShared: 3,
  disjointIntervals: 6,
  noiseCards: 60,
  noiseSpearman: 0.7,
  noiseSpearmanBrown: 0.82,
};

vi.mock("@/lib/cardvalues", async (importOriginal) => {
  const actual = await importOriginal<typeof cardvalues>();
  return {
    ...actual,
    allSets: () =>
      actual
        .allSets()
        .map((s) =>
          s.character === "silent"
            ? { ...s, relicsKept: true, supersedes: "silent-a0-v1", drift: DRIFT }
            : s,
        ),
  };
});

describe("the card-value panel describes how values moved when the relics were kept", () => {
  it("says the earlier measurement dropped the relics, not that a weaker pilot played", () => {
    const { container } = render(<CardValuesPanel />);
    const silent = container.querySelector("#cv-silent")?.closest("section");
    expect(silent).not.toBeNull();
    if (!silent) return;
    expect(silent).toHaveTextContent("How these values moved when the relics were kept");
    expect(silent).toHaveTextContent(
      "which was made in a simulator that dropped the relics a run gains after its first fight (gap G14): 2,500 runs reached the Act-1 boss and 52.0% got past it",
    );
    expect(silent).toHaveTextContent(
      "correlate at 0.55, where two measurements of the same pilot agree at 0.82",
    );
    expect(silent).toHaveTextContent("2 of the 5 best and 3 of the 5 worst cards are shared");
    expect(silent).not.toHaveTextContent("weaker pilot");
    expect(silent).toHaveTextContent("This is a description, not a test.");
  });
});
