import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "../src/app/page";

describe("landing page", () => {
  it("renders the promise, calls to action and the honest coverage table", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/on evidence/);
    expect(screen.getByRole("link", { name: "Get my next decision" })).toHaveAttribute(
      "href",
      "/advisor",
    );
    expect(screen.getByRole("link", { name: "Explore exact odds" })).toHaveAttribute(
      "href",
      "/odds",
    );
    expect(screen.getByRole("row", { name: /Co-op/ })).toHaveTextContent("Not supported");
    expect(screen.getByRole("row", { name: /Card advisor/ })).toHaveTextContent("Heuristic v0");
  });
});
