import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CodexViews } from "@/components/codex/CodexViews";
import { RelicBrowser } from "@/components/codex/RelicBrowser";

describe("the relic list of the Codex", () => {
  it("lists relics as facts, finds one by name and says what it does not reproduce", async () => {
    const user = userEvent.setup();
    render(<RelicBrowser />);
    const list = screen.getByRole("list", { name: "Relics" });
    expect(within(list).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent("296 relics in All");
    expect(
      screen.getByText(/What a relic does is the game's own text and is not reproduced here/),
    ).toBeVisible();

    await user.type(screen.getByRole("searchbox", { name: "Search relics" }), "anchor");
    expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent("Anchor");
    expect(screen.getByRole("status")).toHaveTextContent(/\d+ relics? match in All/);
  });

  it("narrows by pool and rarity and recovers from an empty result", async () => {
    const user = userEvent.setup();
    render(<RelicBrowser />);
    await user.click(screen.getByLabelText(/^Ironclad/));
    expect(screen.getByRole("status")).toHaveTextContent("8 relics in Ironclad");
    await user.selectOptions(screen.getByLabelText("Relic rarity"), "rare");
    await user.type(screen.getByRole("searchbox", { name: "Search relics" }), "zzzzqqqq");
    expect(screen.getByRole("status")).toHaveTextContent("No relic matches.");
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("status")).toHaveTextContent(/relics? in Ironclad/);
  });

  it("is one view of the Codex beside the cards, with the cards first", async () => {
    const user = userEvent.setup();
    render(<CodexViews />);
    expect(screen.getByRole("list", { name: "Cards" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Relics" })).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(/^Relics/));
    expect(screen.getByRole("list", { name: "Relics" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Cards" })).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(/^Cards/));
    expect(screen.getByRole("list", { name: "Cards" })).toBeInTheDocument();
  });
});
