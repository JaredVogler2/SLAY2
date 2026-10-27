import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { newRun, withRelic } from "../src/lib/run-state";

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

  it("saves a run that lists no relic without the relics key (a page from before relics reads it), and with it once one is listed", async () => {
    const store = await freshStore();
    store.set(newRun("ironclad"));
    const bare = JSON.parse(window.localStorage.getItem("slay2.run.v2") ?? "{}") as Record<
      string,
      unknown
    >;
    expect(bare.character).toBe("ironclad");
    expect("relics" in bare).toBe(false);
    store.set(withRelic(newRun("ironclad"), "VAJRA"));
    const held = JSON.parse(window.localStorage.getItem("slay2.run.v2") ?? "{}") as {
      relics?: string[];
    };
    expect(held.relics).toEqual(["VAJRA"]);
    // and the saved text loads back into the same relics
    const again = await freshStore();
    expect(again.getSnapshot()?.relics).toEqual(["VAJRA"]);
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

describe("the run shared with the other tabs", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  const tell = (key: string | null): void => {
    window.dispatchEvent(new StorageEvent("storage", { key }));
  };

  it("follows another tab even when no component is looking at the run (the header used to be what kept it listening)", async () => {
    window.localStorage.setItem("slay2.run.v2", JSON.stringify(newRun("ironclad")));
    const store = await freshStore();
    expect(store.getSnapshot()?.character).toBe("ironclad");
    // nobody subscribed: the page is on an About page, and another tab starts a different run
    window.localStorage.setItem(
      "slay2.run.v2",
      JSON.stringify({ ...newRun("silent"), ascension: 5 }),
    );
    tell("slay2.run.v2");
    expect(store.getSnapshot()?.character).toBe("silent");
    expect(store.getSnapshot()?.ascension).toBe(5);
  });

  it("drops the run that another tab cleared, or the whole storage it cleared, so that the next edit cannot bring it back", async () => {
    window.localStorage.setItem("slay2.run.v2", JSON.stringify(newRun("defect")));
    const store = await freshStore();
    expect(store.getSnapshot()?.character).toBe("defect");
    window.localStorage.removeItem("slay2.run.v2");
    tell("slay2.run.v2");
    expect(store.getSnapshot()).toBeNull();

    window.localStorage.setItem("slay2.run.v2", JSON.stringify(newRun("regent")));
    tell("slay2.run.v2");
    expect(store.getSnapshot()?.character).toBe("regent");
    window.localStorage.clear();
    tell(null);
    expect(store.getSnapshot()).toBeNull();
  });

  it("says why a saved run is not shown, until a new run replaces it", async () => {
    const refused = { ...newRun("defect"), deck: [{ id: "NO_SUCH_CARD", count: 1 }] };
    window.localStorage.setItem("slay2.run.v2", JSON.stringify(refused));
    const store = await freshStore();
    expect(store.getSnapshot()).toBeNull();
    expect(store.unreadableRun).toContain("Unknown card id");
    // nothing is saved: nothing to say
    window.localStorage.clear();
    tell("slay2.run.v2");
    expect(store.getSnapshot()).toBeNull();
    expect(store.unreadableRun).toBeNull();
    // and a refused run is replaced by the next run, after which there is nothing to say
    window.localStorage.setItem("slay2.run.v2", "not json");
    tell("slay2.run.v2");
    expect(store.unreadableRun).toBe("Not valid JSON.");
    store.set(newRun("silent"));
    expect(store.unreadableRun).toBeNull();
  });
});
