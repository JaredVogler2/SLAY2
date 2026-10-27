import { CHARACTER_NAMES } from "@slay2/game-schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { newRun, parseRunState, serializeRunState } from "../src/lib/run-state";
import {
  LEGACY_RUN_KEY,
  RUN_CHANGED_EVENT,
  RUN_KEY,
  SUMMARY_CLASS_NAMES,
  summarizeStoredRun,
  summaryOf,
} from "../src/lib/run-summary";

/**
 * The header and the landing page offer "Resume" from the class and ascension of the saved run, read without the run's schema
 * or the card catalog (which the header would otherwise send to every page). These tests pin the reading to the full parser's.
 */
async function fresh() {
  vi.resetModules(); // the module keeps what it loaded: each test starts from the storage it sets up
  return await import("../src/lib/run-summary");
}

describe("the summary of a saved run", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("prints the class names the schema package prints, for the five classes and no other", () => {
    const upper = Object.fromEntries(
      Object.entries(SUMMARY_CLASS_NAMES).map(([k, v]) => [k.toUpperCase(), v]),
    );
    expect(upper).toEqual(CHARACTER_NAMES);
  });

  it("agrees with the full parser on every class and ascension of a run the advisor saves", () => {
    for (const character of Object.keys(
      SUMMARY_CLASS_NAMES,
    ) as (keyof typeof SUMMARY_CLASS_NAMES)[]) {
      for (let ascension = 0; ascension <= 10; ascension += 1) {
        const run = { ...newRun(character), ascension };
        const text = serializeRunState(run);
        const parsed = parseRunState(text);
        expect(parsed.ok).toBe(true);
        expect(summarizeStoredRun(text)).toEqual({
          character,
          name: CHARACTER_NAMES[character.toUpperCase() as keyof typeof CHARACTER_NAMES],
          ascension,
        });
      }
    }
  });

  it("reads the first version's copy too, and offers nothing for a run with no class yet", () => {
    expect(summarizeStoredRun(JSON.stringify({ ...newRun("silent"), v: 1 }))?.character).toBe(
      "silent",
    );
    expect(summarizeStoredRun(serializeRunState(newRun(null)))).toBeNull();
  });

  it("offers nothing for text that is not a run it could show", () => {
    const base = JSON.parse(serializeRunState(newRun("defect"))) as Record<string, unknown>;
    const bad: unknown[] = [
      null,
      "",
      "not json",
      "[]",
      "7",
      JSON.stringify({ ...base, v: 3 }),
      JSON.stringify({ ...base, v: undefined }),
      JSON.stringify({ ...base, character: "watcher" }),
      JSON.stringify({ ...base, character: "IRONCLAD" }),
      JSON.stringify({ ...base, character: "toString" }),
      JSON.stringify({ ...base, character: "__proto__" }),
      JSON.stringify({ ...base, ascension: 11 }),
      JSON.stringify({ ...base, ascension: -1 }),
      JSON.stringify({ ...base, ascension: 2.5 }),
      JSON.stringify({ ...base, ascension: "3" }),
      JSON.stringify({ ...base, ascension: null }),
      "x".repeat(256 * 1024 + 1),
    ];
    for (const text of bad) {
      expect(summarizeStoredRun(text as string | null), String(text).slice(0, 40)).toBeNull();
    }
    expect(summaryOf("silent", 4)).toEqual({ character: "silent", name: "Silent", ascension: 4 });
    expect(summaryOf(null, 4)).toBeNull();
    expect(summaryOf("silent", 11)).toBeNull();
  });

  it("follows the saved run in this tab, in other tabs and when it is cleared, and lets go of the window when nobody looks", async () => {
    const summary = await fresh();
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const seen: (string | undefined)[] = [];
    const stop = summary.subscribeRunSummary(() => {
      seen.push(summary.getRunSummary()?.character);
    });
    expect(add.mock.calls.map((c) => c[0]).sort()).toEqual(["slay2:run-changed", "storage"]);
    expect(summary.getRunSummary()).toBeNull();

    // a run saved in this tab, announced the way the run store does after it persists
    window.localStorage.setItem(RUN_KEY, serializeRunState({ ...newRun("regent"), ascension: 7 }));
    summary.announceRunChanged();
    expect(summary.getRunSummary()).toMatchObject({ character: "regent", ascension: 7 });
    // the same reference while nothing shown changed
    const first = summary.getRunSummary();
    window.dispatchEvent(new Event(RUN_CHANGED_EVENT));
    expect(summary.getRunSummary()).toBe(first);

    // another tab changes it
    window.localStorage.setItem(RUN_KEY, serializeRunState(newRun("necrobinder")));
    window.dispatchEvent(new StorageEvent("storage", { key: RUN_KEY }));
    expect(summary.getRunSummary()?.character).toBe("necrobinder");
    // a key that is not the run's is none of its business
    const before = seen.length;
    window.dispatchEvent(new StorageEvent("storage", { key: "unrelated" }));
    expect(seen.length).toBe(before);
    // the whole storage cleared
    window.localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(summary.getRunSummary()).toBeNull();

    stop();
    expect(remove.mock.calls.map((c) => c[0]).sort()).toEqual(["slay2:run-changed", "storage"]);
  });

  it("prefers the current key and falls back to the first version's copy, as the run store does", async () => {
    window.localStorage.setItem(LEGACY_RUN_KEY, JSON.stringify({ ...newRun("silent"), v: 1 }));
    const summary = await fresh();
    expect(summary.getRunSummary()?.character).toBe("silent");
    window.localStorage.setItem(RUN_KEY, serializeRunState(newRun("defect")));
    summary.announceRunChanged();
    expect(summary.getRunSummary()?.character).toBe("defect");
  });

  it("shows nothing, and does not throw, when storage cannot be read", async () => {
    const summary = await fresh();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    summary.announceRunChanged();
    expect(summary.getRunSummary()).toBeNull();
  });
});

describe("the summary beside the run store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("uses the same keys as the run store, and follows every change the store makes in this tab", async () => {
    const summary = await fresh();
    const { runStore } = await import("../src/lib/run-store");
    const notified = vi.fn();
    const stop = summary.subscribeRunSummary(notified);
    expect(summary.getRunSummary()).toBeNull();

    runStore.set({ ...newRun("ironclad"), ascension: 3 });
    expect(window.localStorage.getItem(RUN_KEY)).not.toBeNull();
    expect(notified).toHaveBeenCalled();
    expect(summary.getRunSummary()).toMatchObject({ character: "ironclad", ascension: 3 });

    runStore.set({ ...newRun("silent"), ascension: 5 });
    expect(summary.getRunSummary()).toMatchObject({ character: "silent", ascension: 5 });
    runStore.undo();
    expect(summary.getRunSummary()).toMatchObject({ character: "ironclad", ascension: 3 });
    runStore.redo();
    expect(summary.getRunSummary()?.character).toBe("silent");
    runStore.set(null);
    expect(summary.getRunSummary()).toBeNull();
    stop();
  });

  it("shows what the store holds once the store is loaded: the run in memory when storage is blocked, and nothing for a run the advisor refuses", async () => {
    // a saved run with a card the catalog does not have: the light reading alone would offer "Resume"
    const refused = { ...newRun("defect"), deck: [{ id: "NO_SUCH_CARD", count: 1 }] };
    window.localStorage.setItem(RUN_KEY, JSON.stringify(refused));
    const summary = await fresh();
    expect(summary.getRunSummary()?.character).toBe("defect"); // before the store is loaded: the shape of two fields
    const { runStore } = await import("../src/lib/run-store");
    expect(runStore.getSnapshot()).toBeNull(); // the advisor refuses it
    expect(summary.getRunSummary()).toBeNull(); // so the header stops offering it once the store is there

    // storage blocked: the store keeps the run in memory and the header follows it
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    runStore.set(newRun("regent"));
    expect(summary.getRunSummary()?.character).toBe("regent");
  });
});
