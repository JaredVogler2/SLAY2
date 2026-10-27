import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("clears only the saved run on request", async () => {
    runStore.set(newRun("ironclad"));
    expect(window.localStorage.getItem("slay2.run.v2")).not.toBeNull();
    // a copy under the first version's key would come back at the next load, so clearing takes it too
    window.localStorage.setItem("slay2.run.v1", "{}");
    window.localStorage.setItem("unrelated", "keep me");
    render(<RouteError error={new Error("x")} retry={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear my saved run" }));
    // the run store is fetched when the button is pressed (it is not part of the error page)
    expect(await screen.findByRole("status")).toHaveTextContent("Saved run cleared");
    expect(window.localStorage.getItem("slay2.run.v2")).toBeNull();
    expect(window.localStorage.getItem("slay2.run.v1")).toBeNull();
    expect(window.localStorage.getItem("unrelated")).toBe("keep me");
    expect(runStore.getSnapshot()).toBeNull(); // the copy in memory is cleared with the one in storage
  });

  it("still clears the saved run when the run store cannot be loaded", async () => {
    window.localStorage.setItem("slay2.run.v2", JSON.stringify(newRun("silent")));
    window.localStorage.setItem("slay2.run.v1", "{}");
    window.localStorage.setItem("unrelated", "keep me");
    vi.resetModules();
    vi.doMock("@/lib/run-store", () => {
      throw new Error("the chunk did not load");
    });
    try {
      const { default: Fresh } = await import("../src/app/error");
      render(<Fresh error={new Error("x")} retry={() => undefined} />);
      fireEvent.click(screen.getByRole("button", { name: "Clear my saved run" }));
      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent("Saved run cleared");
      });
      expect(window.localStorage.getItem("slay2.run.v2")).toBeNull();
      expect(window.localStorage.getItem("slay2.run.v1")).toBeNull();
      expect(window.localStorage.getItem("unrelated")).toBe("keep me");
    } finally {
      vi.doUnmock("@/lib/run-store");
    }
  });
});
