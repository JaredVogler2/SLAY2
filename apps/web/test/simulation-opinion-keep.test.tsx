import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SimulationOpinion } from "@/components/advisor/SimulationOpinion";
import * as cardvalues from "@/lib/cardvalues";
import { newRun } from "@/lib/run-state";

// The class's set as the pages read it, with the one thing under test switched: whether its runs kept the relics they gained.
const kept = vi.hoisted(() => ({ value: false }));
vi.mock("@/lib/cardvalues", async (importOriginal) => {
  const actual = await importOriginal<typeof cardvalues>();
  return {
    ...actual,
    setFor: (character: string, index?: Parameters<typeof actual.setFor>[1]) => {
      const set = actual.setFor(character, index);
      return set ? { ...set, relicsKept: kept.value } : set;
    },
  };
});

function render3(relicsKept: boolean) {
  kept.value = relicsKept;
  const run = newRun("ironclad");
  const set = cardvalues.setFor("ironclad");
  const offered = (set?.cards ?? []).slice(0, 3).map((c) => c.id);
  return render(<SimulationOpinion run={run} offered={offered} heuristic={{ kind: "skip" }} />);
}

describe("the advisor's simulated opinion says what the runs behind the values kept", () => {
  it("says the runs held two relics while the values come from the simulator that drops them", () => {
    const { container } = render3(false);
    expect(container).toHaveTextContent(
      "keeps only the relics it has when its first fight starts (gap G14)",
    );
    expect(container).not.toHaveTextContent("These simulated runs kept the relics they gained");
  });

  it("says the runs kept the relics they gained when the class's values were measured that way", () => {
    const { container } = render3(true);
    expect(container).toHaveTextContent(
      "These simulated runs kept the relics they gained, as the game does",
    );
    expect(container).not.toHaveTextContent(
      "keeps only the relics it has when its first fight starts",
    );
  });
});
