/**
 * The little the header and the landing page need to know about the saved run: its class and ascension, to offer "Resume".
 *
 * On a page that has not loaded the run store it reads the two fields straight from the stored JSON. It does not import the run's
 * schema or the card catalog, which are most of the script the advisor needs and none of what an About page does: the header is
 * on every page, and a header that imported the run store sent every visitor of every page the catalog, the synergy table and
 * the schema library (about 120 KB gzipped). Where the store is loaded (the advisor, the calculators, Route Lab, and any page
 * reached from them without a reload) it registers itself as the source, so the header shows what the store holds, run through
 * the full validation; the reading of storage only checks the shape of the two fields it shows, so on a fresh load a saved run
 * the advisor would refuse (a card id it does not know) still offers "Resume" and the advisor then says it cannot read it.
 */
export const RUN_KEY = "slay2.run.v2";
export const LEGACY_RUN_KEY = "slay2.run.v1";
/** Dispatched on `window` after every change of the run in this tab (the browser's `storage` event reaches only other tabs). */
export const RUN_CHANGED_EVENT = "slay2:run-changed";
/** The largest stored run the advisor reads (run-state.ts MAX_IMPORT_BYTES); a larger text is not a run it would resume. */
const MAX_STORED_BYTES = 256 * 1024;

/** The names the pages print for the five classes (the same as CHARACTER_NAMES of the schema package, which a test compares). */
export const SUMMARY_CLASS_NAMES = {
  ironclad: "Ironclad",
  silent: "Silent",
  regent: "Regent",
  necrobinder: "Necrobinder",
  defect: "Defect",
} as const;

export interface RunSummary {
  readonly character: keyof typeof SUMMARY_CLASS_NAMES;
  /** the class as the pages print it */
  readonly name: string;
  readonly ascension: number;
}

/** The summary of a class and an ascension, or null when either is not one the game has (a run with no class yet has none). */
export function summaryOf(character: unknown, ascension: unknown): RunSummary | null {
  if (typeof character !== "string" || !Object.hasOwn(SUMMARY_CLASS_NAMES, character)) {
    return null;
  }
  if (
    typeof ascension !== "number" ||
    !Number.isInteger(ascension) ||
    ascension < 0 ||
    ascension > 10
  ) {
    return null;
  }
  const key = character as RunSummary["character"];
  return { character: key, name: SUMMARY_CLASS_NAMES[key], ascension };
}

/** The class and ascension of a stored run, or null when the text is not one (never throws). */
export function summarizeStoredRun(text: string | null): RunSummary | null {
  if (text === null || text.length === 0 || text.length > MAX_STORED_BYTES) {
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const { v, character, ascension } = raw as Record<string, unknown>;
  return v === 1 || v === 2 ? summaryOf(character, ascension) : null;
}

type Listener = () => void;
type LiveSource = () => { character: unknown; ascension: unknown } | null;

const listeners = new Set<Listener>();
let loaded = false;
let current: RunSummary | null = null;
let live: LiveSource | null = null;

function load(): void {
  loaded = true;
  let next: RunSummary | null = null;
  try {
    if (live) {
      const run = live();
      next = run ? summaryOf(run.character, run.ascension) : null;
    } else {
      // the same order as the run store: the current key, then the first version's copy when there is no current one
      next = summarizeStoredRun(
        window.localStorage.getItem(RUN_KEY) ?? window.localStorage.getItem(LEGACY_RUN_KEY),
      );
    }
  } catch {
    // storage blocked: there is no saved run to offer
  }
  // the same reference while nothing shown changed, so a subscriber does not render again
  if (next?.character !== current?.character || next?.ascension !== current?.ascension) {
    current = next;
  }
}

function changed(): void {
  loaded = false;
  listeners.forEach((l) => {
    l();
  });
}

function onStorage(e: StorageEvent): void {
  if (e.key === null || e.key === RUN_KEY || e.key === LEGACY_RUN_KEY) {
    changed();
  }
}

export function subscribeRunSummary(fn: Listener): () => void {
  listeners.add(fn);
  if (listeners.size === 1) {
    // nothing watched the run until now (a header that was off the page, or a change between the first render and this
    // subscription), so what was read last may be old
    loaded = false;
    if (typeof window !== "undefined") {
      window.addEventListener("storage", onStorage);
      window.addEventListener(RUN_CHANGED_EVENT, changed);
    }
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      loaded = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(RUN_CHANGED_EVENT, changed);
      }
    }
  };
}

export function getRunSummary(): RunSummary | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (!loaded) {
    load();
  }
  return current;
}

/**
 * The run store, once it is loaded, tells the header where the truth is: from then on the header shows the run the store holds
 * (validated in full, and in memory when storage is blocked) and not a reading of storage.
 */
export function setLiveRunSource(source: LiveSource | null): void {
  live = source;
  changed();
}

/** Called by the run store after it changes or persists the run, so the header of this tab follows. */
export function announceRunChanged(): void {
  loaded = false; // also when no header is watching: the next one to look reads the run again
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(RUN_CHANGED_EVENT));
  }
}
