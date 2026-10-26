import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RouteError from "../src/app/error";
import { runStore } from "../src/lib/run-store";
import { newRun } from "../src/lib/run-state";

describe("route error boundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("never shows the error message or stack, only a reference", () => {
    const error = Object.assign(new Error("secret internal detail"), { digest: "abc123" });
    render(<RouteError error={error} retry={() => undefined} />);
    expect(screen.queryByText(/secret internal detail/)).toBeNull();
    expect(screen.getByText("abc123")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("unexpected error");
  });

  it("copes with a thrown value that is not an Error", () => {
    render(<RouteError error="boom" retry={() => undefined} />);
    expect(screen.queryByText(/Error reference/)).toBeNull();
  });

  it("retries on request", () => {
    const retry = vi.fn();
    render(<RouteError error={new Error("x")} retry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("clears only the saved run on request", () => {
    runStore.set(newRun("ironclad"));
    expect(window.localStorage.getItem("slay2.run.v1")).not.toBeNull();
    window.localStorage.setItem("unrelated", "keep me");
    render(<RouteError error={new Error("x")} retry={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear my saved run" }));
    expect(window.localStorage.getItem("slay2.run.v1")).toBeNull();
    expect(window.localStorage.getItem("unrelated")).toBe("keep me");
    expect(screen.getByRole("status")).toHaveTextContent("Saved run cleared");
  });
});
