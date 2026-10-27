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
  previousPilot: "rules_explore",
  pilot: "rules_explore_v3",
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
      actual.allSets().map((s) =>
        s.character === "silent"
          ? {
              ...s,
              relicsKept: true,
              supersedes: "silent-a0-v1",
              drift: DRIFT,
              // adopted by the pooled test and its rule although this class's own games are not significant (ADR-053 item 5)
              validation: s.validation && {
                ...s.validation,
                against: "current-values",
                basis: "pooled",
                passed: true,
                p: 0.4,
                passRate: 0.612,
                passRateBase: 0.6,
              },
            }
          : s.character === "ironclad"
            ? {
                ...s,
                relicsKept: true,
                supersedes: "ironclad-a0-v2",
                drift: { ...DRIFT, previous: "ironclad-a0-v2", previousPilot: "rules_explore_v3" },
              }
            : s,
      ),
  };
});

describe("the card-value panel describes how values moved when the relics were kept", () => {
  it("says the earlier measurement dropped the relics and was made by an older pilot, not that the relics alone moved it", () => {
    const { container } = render(<CardValuesPanel />);
    const silent = container.querySelector("#cv-silent")?.closest("section");
    expect(silent).not.toBeNull();
    if (!silent) return;
    // the pilot changed too (rules_explore against rules_explore_v3): the heading does not attribute the move to the relics
    expect(silent).toHaveTextContent("How these values moved from the earlier measurement");
    expect(silent).toHaveTextContent(
      "which was made in a simulator that dropped the relics a run gains after its first fight (gap G14), by an older pilot (rules_explore; rules_explore_v3 now): 2,500 runs reached the Act-1 boss and 52.0% got past it",
    );
    expect(silent).toHaveTextContent(
      "correlate at 0.55; two halves of the new games, split by seed, correlate at 0.82",
    );
    expect(silent).toHaveTextContent("2 of the 5 best and 3 of the 5 worst cards are shared");
    expect(silent).toHaveTextContent("(about one would by chance if nothing had changed)");
    expect(silent).toHaveTextContent(
      "The game and the pilot both changed, so this does not separate them.",
    );
    expect(silent).not.toHaveTextContent("weaker pilot");
    expect(silent).not.toHaveTextContent("two measurements of the same pilot agree");
  });

  it("attributes the move to the relics when the pilot is the same", () => {
    const { container } = render(<CardValuesPanel />);
    const ironclad = container.querySelector("#cv-ironclad")?.closest("section");
    expect(ironclad).not.toBeNull();
    if (!ironclad) return;
    expect(ironclad).toHaveTextContent("How these values moved when the relics were kept");
    expect(ironclad).not.toHaveTextContent("by an older pilot");
    expect(ironclad).not.toHaveTextContent("The game and the pilot both changed");
    expect(ironclad).toHaveTextContent("This is a description, not a test.");
  });

  it("says a class adopted by the pooled test was adopted by the rule, not that its own games passed", () => {
    const { container } = render(<CardValuesPanel />);
    const silent = container.querySelector("#cv-silent")?.closest("section");
    expect(silent).not.toBeNull();
    if (!silent) return;
    expect(silent).toHaveTextContent("adopted by the pooled test");
    expect(silent).not.toHaveTextContent("validated in simulation");
    expect(silent).not.toHaveTextContent("measurement only");
    expect(silent).toHaveTextContent("The one change is which values it follows");
    expect(silent).toHaveTextContent("both played with the relics kept");
    expect(silent).toHaveTextContent("The test that was registered is the pooled one above");
    expect(silent).toHaveTextContent(
      "this class's own games do not show the earlier values significantly ahead",
    );
    // the other classes keep their own wording
    const ironclad = container.querySelector("#cv-ironclad")?.closest("section");
    expect(ironclad).not.toHaveTextContent("adopted by the pooled test");
  });
});
