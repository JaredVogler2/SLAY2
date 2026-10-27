import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import {
  RelicsPanel,
  providedBy,
  relicReadingLine,
  takenAwayBy,
} from "@/components/advisor/RelicsPanel";
import { newRun, withRelic, type RunState } from "@/lib/run-state";

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
    expect(screen.getByText("no registered test")).toBeVisible();
    expect(
      screen.getByText(/Read once against simulated runs that keep their relics/),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Evidence & methods" })).toHaveAttribute(
      "href",
      "/methods#synergy",
    );
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

  it("says that a relic which takes a mechanic away is counted against it, not that nothing is read from it", async () => {
    expect(takenAwayBy("BIG_MUSHROOM")).toHaveLength(1);
    expect(providedBy("BIG_MUSHROOM")).toEqual([]);
    expect(relicReadingLine("BIG_MUSHROOM")).toMatch(
      /^Takes away .+ counted against the cards that need it\.$/,
    );
    expect(relicReadingLine("BIG_MUSHROOM")).not.toContain("reads nothing");
    expect(relicReadingLine("AMETHYST_AUBERGINE")).toContain("the ranking reads nothing from it");
    expect(relicReadingLine("VAJRA")).toBe("Counted as a supplier of Strength.");
    const user = userEvent.setup();
    render(<Harness initial={newRun("silent")} />);
    await user.type(screen.getByRole("combobox", { name: "Add a relic you hold" }), "big mushroom");
    await user.keyboard("{Enter}");
    const item = within(screen.getByRole("list", { name: "Your relics" })).getByRole("listitem");
    expect(item).toHaveTextContent("Big Mushroom");
    expect(item).toHaveTextContent("counted against the cards that need it");
    expect(item).not.toHaveTextContent("reads nothing");
  });

  it("says that the count of damage, block, draw and energy sources reads cards only", () => {
    render(<Harness initial={newRun("ironclad")} />);
    expect(screen.getByText(/which reads cards only/)).toBeVisible();
  });

  it("keeps the keyboard where it was after a relic is removed: the next relic's button, the one before, or the search box", async () => {
    const user = userEvent.setup();
    const run = ["VAJRA", "ANCHOR", "KUNAI"].reduce(withRelic, newRun("ironclad"));
    render(<Harness initial={run} />);
    // remove the first of three: the focus lands on the new first one's button
    await user.click(screen.getByRole("button", { name: "Remove Vajra" }));
    expect(screen.getByRole("button", { name: "Remove Anchor" })).toHaveFocus();
    // remove the last of two: the one before it
    await user.click(screen.getByRole("button", { name: "Remove Kunai" }));
    expect(screen.getByRole("button", { name: "Remove Anchor" })).toHaveFocus();
    // remove the only one: back to the search box
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("list", { name: "Your relics" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Add a relic you hold" })).toHaveFocus();
  });

  it("does not take the Enter that confirms an input-method composition for a choice", async () => {
    const user = userEvent.setup();
    render(<Harness initial={newRun("ironclad")} />);
    const box = screen.getByRole("combobox", { name: "Add a relic you hold" });
    await user.type(box, "vajra");
    fireEvent.keyDown(box, { key: "Enter", isComposing: true });
    fireEvent.keyDown(box, { key: "Process" });
    expect(screen.queryByRole("list", { name: "Your relics" })).not.toBeInTheDocument();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(screen.getByRole("list", { name: "Your relics" })).toHaveTextContent("Vajra");
  });

  it("says so when the typed text matches nothing, and when it only matches a relic already listed", async () => {
    const user = userEvent.setup();
    render(<Harness initial={newRun("ironclad")} />);
    const box = screen.getByRole("combobox", { name: "Add a relic you hold" });
    const announced = (): HTMLElement => {
      const region = box.parentElement?.querySelector<HTMLElement>('[aria-live="polite"]');
      if (!region) throw new Error("no live region next to the search box");
      return region;
    };
    await user.type(box, "zzzzqx");
    expect(screen.getAllByText(/No relic matches “zzzzqx”/).length).toBeGreaterThan(0);
    expect(announced()).toHaveTextContent("No relic matches “zzzzqx”");
    await user.clear(box);
    expect(announced()).toBeEmptyDOMElement();
    await user.type(box, "vajra");
    await user.keyboard("{Enter}");
    await user.type(box, "vajra");
    expect(announced()).toHaveTextContent("No relic matches “vajra”");
    expect(announced()).toHaveTextContent("already listed");
  });
});
