"use client";

import { useSyncExternalStore } from "react";

import { parseRunState, serializeRunState, touch, type RunState } from "./run-state";
import { LEGACY_RUN_KEY, RUN_KEY, announceRunChanged, setLiveRunSource } from "./run-summary";

/**
 * The run lives under a key named after its schema version. Version 1 (before the Act 1 version, the opening Ancient and
 * upgraded copies) is read once when there is no version 2 and never written: a page loaded before this deployment keeps
 * working on its own copy under the old key instead of failing on fields it does not know and dropping the run.
 */
const KEY = RUN_KEY;
const LEGACY_KEY = LEGACY_RUN_KEY;
const MAX_UNDO = 50;

type Listener = () => void;

/**
 * Tiny external store: the current run, persisted to localStorage, with a session-only undo/redo stack.
 * Everything touching storage is wrapped: private windows and blocked storage must degrade to in-memory state.
 */
class RunStore {
  private state: RunState | null = null;
  private loaded = false;
  private past: (RunState | null)[] = [];
  private future: (RunState | null)[] = [];
  private listeners = new Set<Listener>();
  private storageOk = true;
  private version = 0;
  /** why the run saved in this browser was not read (a text the advisor refuses), or null: nothing saved, or it was read */
  private unreadable: string | null = null;

  constructor() {
    // The run is shared with the other tabs of this browser, so this tab hears about their changes for as long as the page is open,
    // not only while a component is looking at the run (the header's chip used to be what kept this attached; it no longer reads
    // the run through this store).
    if (typeof window !== "undefined") {
      window.addEventListener("storage", this.onStorage);
    }
  }

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  private onStorage = (e: StorageEvent): void => {
    // a null key is the whole storage cleared
    if (e.key === KEY || e.key === null) {
      this.loaded = false;
      this.emit();
    }
  };

  private emit(): void {
    this.version += 1;
    this.listeners.forEach((l) => {
      l();
    });
    // the header and the landing page read the saved run without this store (run-summary.ts)
    announceRunChanged();
  }

  private load(): void {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    try {
      const text = window.localStorage.getItem(KEY) ?? window.localStorage.getItem(LEGACY_KEY);
      if (text) {
        const parsed = parseRunState(text);
        this.state = parsed.ok ? parsed.state : null;
        this.unreadable = parsed.ok ? null : parsed.error;
      } else {
        // nothing is saved: a run cleared in another tab is gone here too
        this.state = null;
        this.unreadable = null;
      }
    } catch {
      this.storageOk = false;
    }
  }

  /** Why the run saved in this browser is not shown (a file the advisor cannot read), or null. */
  get unreadableRun(): string | null {
    if (typeof window !== "undefined") {
      this.load();
    }
    return this.unreadable;
  }

  getSnapshot = (): RunState | null => {
    if (typeof window === "undefined") {
      return null;
    }
    this.load();
    return this.state;
  };

  getServerSnapshot = (): RunState | null => null;

  get storageAvailable(): boolean {
    return this.storageOk;
  }

  private persist(): void {
    // whatever was saved before is replaced (or removed) by what is written now
    this.unreadable = null;
    try {
      if (this.state) {
        window.localStorage.setItem(KEY, serializeRunState(this.state));
      } else {
        // clearing the run clears the old copy too, or it would come back at the next load
        window.localStorage.removeItem(KEY);
        window.localStorage.removeItem(LEGACY_KEY);
      }
    } catch {
      this.storageOk = false;
    }
  }

  set(next: RunState | null): void {
    this.load();
    this.past.push(this.state);
    if (this.past.length > MAX_UNDO) {
      this.past.shift();
    }
    this.future = [];
    this.state = next ? touch(next) : null;
    this.persist();
    this.emit();
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(): void {
    if (this.past.length === 0) {
      return;
    }
    this.future.push(this.state);
    this.state = this.past.pop() ?? null;
    this.persist();
    this.emit();
  }

  redo(): void {
    if (this.future.length === 0) {
      return;
    }
    this.past.push(this.state);
    this.state = this.future.pop() ?? null;
    this.persist();
    this.emit();
  }

  /** Bumps on every change so hooks can re-read canUndo/canRedo. */
  getVersion = (): number => this.version;
}

export const runStore = new RunStore();

// From here on the header shows the run this store holds (see run-summary.ts), not a reading of storage.
setLiveRunSource(() => {
  const run = runStore.getSnapshot();
  return run ? { character: run.character, ascension: run.ascension } : null;
});

export function useRunState(): RunState | null {
  return useSyncExternalStore(runStore.subscribe, runStore.getSnapshot, runStore.getServerSnapshot);
}

export function useRunHistory(): { canUndo: boolean; canRedo: boolean } {
  useSyncExternalStore(runStore.subscribe, runStore.getVersion, () => 0);
  return { canUndo: runStore.canUndo, canRedo: runStore.canRedo };
}
