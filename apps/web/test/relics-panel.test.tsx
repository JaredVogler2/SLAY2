import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { RelicsPanel, providedBy } from "@/components/advisor/RelicsPanel";
import { newRun, type RunState } from "@/lib/run-state";

function Harness({ initial }: { initial: RunState }) {
  const [run, setRun] = useState(initial);
  return <RelicsPanel run={run} character="ironclad" onChange={setRun} disabled={false} />;
}

describe("the relics panel of the advisor", () => {
  it("says what the relics do for the ranking and how far that has been checked", () => {
    render(<Harness initial={newRun("ironclad")} />);
    expect(
      screen.getByText(/counts as a supplier of it, like a card that provides it/),
    ).toBeVisible();
    expect(screen.getByText(/not been tested in simulation/)).toBeVisible();
    expect(screen.getByText(/No relics listed/)).toBeVisible();
  });

  it("adds a relic by name, shows what it is counted as, and removes it again", async () => {
    const user = userEvent.setup();
    render(<Harness initial={newRun("ironclad")} />);
    const box = screen.getByRole("combobox", { name: "Add a relic you hold" });
    await user.type(box, "vajra");
    await user.keyboard("{Enter}");
    const list = screen.getByRole("list", { name: "Your relics" });
    const item = within(list).getByRole("listitem");
    expect(item).toHaveTextContent("Vajra");
    expect(item).toHaveTextContent("Counted as a supplier of Strength");
    await user.click(within(item).getByRole("button", { name: "Remove Vajra" }));
    expect(screen.queryByRole("list", { name: "Your relics" })).not.toBeInTheDocument();
  });

  it("does not offer a relic twice, nor the class's starting relic", async () => {
    const user = userEvent.setup();
    render(<Harness initial={newRun("ironclad")} />);
    const box = screen.getByRole("combobox", { name: "Add a relic you hold" });
    await user.type(box, "burning");
    expect(screen.queryByRole("option", { name: /Burning Blood/ })).not.toBeInTheDocument();
    await user.clear(box);
    await user.type(box, "vajra");
    await user.keyboard("{Enter}");
    await user.type(box, "vajra");
    expect(screen.queryByRole("option", { name: /Vajra/ })).not.toBeInTheDocument();
  });

  it("names the mechanics a relic provides, and nothing for one the table has nothing to say about", () => {
    expect(providedBy("VAJRA")).toEqual(["Strength"]);
    expect(providedBy("AMETHYST_AUBERGINE")).toEqual([]);
  });
});
