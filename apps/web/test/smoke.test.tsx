import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import Home from "../src/app/page";

test("home renders", () => {
  render(<Home />);
  expect(screen.getByText("SLAY2")).toBeInTheDocument();
});
