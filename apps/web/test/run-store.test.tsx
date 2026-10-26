import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { newRun } from "../src/lib/run-state";

/**
 * The run is saved under a key named after its schema version. A page loaded before the Act 1 version and the opening Ancient
 * existed only knows the first key; it must keep its own copy and never see (and drop) a run it cannot read.
 */
async function freshStore() {
  vi.resetModules(); // the store keeps what it loaded: each test starts from the storage it sets up
  return (await import("../src/lib/run-store")).runStore;
}

describe("the saved run and its version", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("reads a run saved under the first version's key when there is no newer one, and saves under the new key only", async () => {
    const old = { ...newRun("silent"), v: 1 };
    window.localStorage.setItem("slay2.run.v1", JSON.stringify(old));
    const store = await freshStore();
    expect(store.getSnapshot()?.character).toBe("silent");
    expect(store.getSnapshot()?.v).toBe(2);

    store.set({ ...(store.getSnapshot() ?? newRun("silent")), risk: "aggressive" });
    expect(JSON.parse(window.localStorage.getItem("slay2.run.v2") ?? "{}")).toMatchObject({
      v: 2,
      risk: "aggressive",
    });
    // the old copy is left as it was: a page that only knows version 1 keeps working on it
    expect(JSON.parse(window.localStorage.getItem("slay2.run.v1") ?? "{}")).toEqual(old);
  });

  it("prefers the new key, and ignores a change to the old one", async () => {
    window.localStorage.setItem("slay2.run.v1", JSON.stringify({ ...newRun("silent"), v: 1 }));
    window.localStorage.setItem("slay2.run.v2", JSON.stringify(newRun("defect")));
    const store = await freshStore();
    expect(store.getSnapshot()?.character).toBe("defect");
    // a page that only knows version 1 saves under the old key: nothing here follows it
    window.localStorage.setItem("slay2.run.v1", JSON.stringify({ ...newRun("regent"), v: 1 }));
    window.dispatchEvent(new StorageEvent("storage", { key: "slay2.run.v1" }));
    expect(store.getSnapshot()?.character).toBe("defect");
  });

  it("does not bring a cleared run back from the old key", async () => {
    window.localStorage.setItem("slay2.run.v1", JSON.stringify({ ...newRun("silent"), v: 1 }));
    const store = await freshStore();
    expect(store.getSnapshot()).not.toBeNull();
    store.set(null);
    expect(window.localStorage.getItem("slay2.run.v2")).toBeNull();
    expect(window.localStorage.getItem("slay2.run.v1")).toBeNull();
    const again = await freshStore();
    expect(again.getSnapshot()).toBeNull();
  });
});
