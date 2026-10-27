import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { newRun } from "../src/lib/run-state";

/**
 * The header and the landing page offer "Resume" for a saved run from its class and ascension alone (ADR-056), so a saved run that
 * the advisor refuses (a card the catalog does not know, a file of another version) must be explained where "Resume" leads, and not
 * show an empty page as if nothing had been saved.
 */
describe("the advisor with a saved run it cannot read", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("says that the run could not be read and why, and the notice goes once a new run replaces it", async () => {
    window.localStorage.setItem(
      "slay2.run.v2",
      JSON.stringify({ ...newRun("defect"), deck: [{ id: "NO_SUCH_CARD", count: 1 }] }),
    );
    const { AdvisorWorkbench } = await import("../src/components/advisor/AdvisorWorkbench");
    render(<AdvisorWorkbench />);
    const notice = await screen.findByText(/could not be read, so it is not shown/);
    expect(notice).toHaveAttribute("role", "status");
    expect(notice).toHaveTextContent(
      "Unknown card id(s) for build sts2-main-0.107.1: NO_SUCH_CARD).",
    );
    expect(notice).toHaveTextContent("replaces it");
    // the start screen is there, as for a visitor with no saved run
    expect(screen.getByRole("heading", { name: "Choose your character" })).toBeInTheDocument();

    const [ironclad] = screen.getAllByText("Ironclad");
    if (!ironclad) {
      throw new Error("the character picker has no Ironclad");
    }
    fireEvent.click(ironclad);
    expect(await screen.findByRole("heading", { name: "Your run" })).toBeInTheDocument();
    expect(screen.queryByText(/could not be read, so it is not shown/)).toBeNull();
  });

  it("says nothing when nothing is saved", async () => {
    const { AdvisorWorkbench } = await import("../src/components/advisor/AdvisorWorkbench");
    render(<AdvisorWorkbench />);
    expect(
      await screen.findByRole("heading", { name: "Choose your character" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/could not be read/)).toBeNull();
  });
});
