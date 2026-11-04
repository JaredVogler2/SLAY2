import underdocks from "@/content/underdocks.generated.json";

/**
 * What simulated runs say about Act 1's other version, Underdocks (ADR-064). Every other result on the site was measured with Act 1 in
 * Overgrowth; this is the study that asks whether three of them hold in Underdocks, with nothing refitted: the synergy term, the card values
 * the site shows and the opening-relic rule. Exported by scripts/export-site-data.mjs from the registered record and, once they exist, the
 * three pooled tests (each with its Overgrowth twin on the same seeds beside it).
 */
export type UnderdocksFinding = "synergy" | "values" | "neow";

/**
 * How a test came out by the rule registered before it (ADR-064 item 5, a partition): ahead (the exact pooled p below the level, the first
 * arm ahead and the whole-seed interval of the difference excluding zero), the other arm ahead on the same terms, or not shown.
 */
export type UnderdocksVerdict = "passed" | "not-shown" | "reversed";

/** How big a passed result is beside the same arms in Overgrowth, by where the Underdocks interval lies against the Overgrowth difference. */
export type UnderdocksSize = "smaller" | "about-the-same" | "larger";

interface PairedTable {
  readonly a_only: number;
  readonly b_only: number;
  readonly both: number;
  readonly neither: number;
  readonly mcnemar_p: number;
}

interface Rate {
  readonly games: number;
  readonly rate: number;
  readonly wilson95: readonly number[];
}

export interface UnderdocksMember {
  readonly character: string;
  readonly pairedSeeds: number;
  readonly bothCompleted: number;
  readonly reachedAct2: {
    readonly a: number;
    readonly b: number;
    readonly pairedTable: PairedTable;
  };
  readonly meanFloorDifference: number;
}

/** One class's own paired games, read at the class level (0.01, uncorrected): the first arm ahead, or the other. */
export interface UnderdocksClassResult {
  readonly aOnly: number;
  readonly bOnly: number;
  readonly p: number;
  /** the first arm was ahead in the class's own Underdocks games at p below the class level (ADR-064 item 6 iii) */
  readonly ahead: boolean;
  /** the other arm was ahead there at that level (item 6 v) */
  readonly behind: boolean;
}

/** The difference of the same two arms in Overgrowth with the relics kept, set beside the Underdocks result. */
export interface OvergrowthReference {
  readonly file: string;
  readonly adr: string;
  /** the pooled difference in the share past the Act-1 boss (first arm minus second), 0 to 1 */
  readonly mean: number;
  readonly ci95: readonly number[];
  readonly a: number;
  readonly b: number;
  readonly bothCompleted: number;
}

/** The all-pairs analysis of one test (ADR-064 item 5): every pair of seeds, the endpoint scored as the games ended (a game that ended in an error counts by how far it got). */
export interface UnderdocksAllPairs {
  readonly pairs: number;
  readonly aOnly: number;
  readonly bOnly: number;
  /** the share of games past the Act-1 boss, first arm and second */
  readonly aRate: number;
  readonly bRate: number;
  /** the exact McNemar p of the discordant pairs */
  readonly p: number;
  readonly difference: number;
  /** the share of pairs the primary test dropped (a game that did not end in a win or a death) */
  readonly excludedFraction: number;
}

/** Which condition of the reading rule withheld a result the primary test had passed or reversed (the first): the all-pairs analysis did not agree, or too many pairs were dropped. */
export type UnderdocksWithheld = "robustness" | "excluded";

export interface UnderdocksTest {
  readonly file: string;
  readonly sha256: string;
  readonly pairedSeeds: number;
  readonly bothCompleted: number;
  readonly excludedNotCompleted: number;
  readonly reachedAct2: {
    readonly a: Rate;
    readonly b: Rate;
    readonly pairedTable: PairedTable;
  };
  readonly reachedAct3: {
    readonly a: Rate;
    readonly b: Rate;
    readonly pairedTable: PairedTable;
  };
  readonly wins: { readonly a: number; readonly b: number; readonly pairedTable: PairedTable };
  readonly floorDifference: { readonly meanAMinusB: number; readonly ci95: readonly number[] };
  readonly clusteredDifference: {
    readonly meanAMinusB: number;
    readonly ci95: readonly number[];
    /** the whole-seed interval at the level the test is read at */
    readonly ciAtLevel: { readonly level: number; readonly ci: readonly number[] };
  };
  readonly members: readonly UnderdocksMember[];
  /** how the test came out by the rule (a partition): passed only if the primary test passed and the all-pairs analysis agreed, and likewise reversed */
  readonly verdict: UnderdocksVerdict;
  /** what the primary test alone said, on the pairs in which both games ended in a win or a death */
  readonly primary: UnderdocksVerdict;
  /** the condition that withheld a passed or reversed primary result (null when nothing did) */
  readonly withheld: UnderdocksWithheld | null;
  readonly downgrades: readonly UnderdocksWithheld[];
  readonly allPairs: UnderdocksAllPairs;
  /** by lower-case class id */
  readonly classes: Readonly<Record<string, UnderdocksClassResult>>;
  /** the same arms in Overgrowth, on the same seeds */
  readonly overgrowth: OvergrowthReference;
  /** for a passed test: its size beside the Overgrowth difference */
  readonly size: UnderdocksSize | null;
}

export interface UnderdocksData {
  /** false when the decision log carries no registration (then nothing else is here) */
  readonly registered: boolean;
  readonly adr?: string;
  /** the study-wise 0.05 split over the three tests */
  readonly level?: number;
  /** the level of the class rules */
  readonly classLevel?: number;
  readonly seeds?: number;
  readonly precondition?: {
    readonly file: string;
    readonly sha256: string;
    readonly games: number;
    readonly pooledShownValues: {
      readonly underdocks: {
        readonly completed: number;
        readonly pastActOneBoss: number;
        readonly rate: number;
      };
      readonly overgrowth: {
        readonly completed: number;
        readonly pastActOneBoss: number;
        readonly rate: number;
      };
    };
  } | null;
  /** null until the pooled tests have been run (they are run together, once) */
  readonly tests?: Readonly<Record<UnderdocksFinding, UnderdocksTest>> | null;
}

/** The exporter's file as the shape it writes (a JSON import types its strings as `string`, not as the verdicts they are). */
const asData = (raw: unknown): UnderdocksData => raw as UnderdocksData;

/** The data the exporter wrote. Tests pass their own `UnderdocksData` to the functions below. */
export const UNDERDOCKS: UnderdocksData = asData(underdocks);

export const FINDING_NAMES: Record<UnderdocksFinding, string> = {
  synergy: "the synergy term",
  values: "the measured card values",
  neow: "the opening-relic rule",
};

/** Whether the study's tests have been run. */
export function underdocksTested(data: UnderdocksData = UNDERDOCKS): boolean {
  return data.registered && !!data.tests;
}

export function underdocksTest(
  finding: UnderdocksFinding,
  data: UnderdocksData = UNDERDOCKS,
): UnderdocksTest | null {
  return data.tests?.[finding] ?? null;
}

/**
 * Whether the opening-relic advice may name a relic for this class on a run in Underdocks. In Overgrowth, or when the player has not said,
 * the rule of ADR-055 decides and this has no say (true). In Underdocks, once the test has been run, the advice needs the pooled test to
 * have passed and the class's own Underdocks games to have the rule ahead at the class level (ADR-064 item 6 iii). Before the test has been
 * run there is no result to withhold the advice on, and it stays, with the note that it was measured in Overgrowth only.
 */
export function neowAdviceAllowedInUnderdocks(
  character: string,
  act1: string | null | undefined,
  data: UnderdocksData = UNDERDOCKS,
): boolean {
  if (act1 !== "underdocks" || !underdocksTested(data)) return true;
  const test = underdocksTest("neow", data);
  return test?.verdict === "passed" && test.classes[character.toLowerCase()]?.ahead === true;
}

const SIZE_WORDS: Record<UnderdocksSize, string> = {
  smaller: "smaller than",
  "about-the-same": "about the same as",
  larger: "larger than",
};

/** How one test came out, in a few words, for the landing page's coverage table (a passed result with its size beside Overgrowth). */
function verdictWords(t: UnderdocksTest): string {
  switch (t.verdict) {
    case "passed":
      return t.size ? `ahead (${SIZE_WORDS[t.size]} in Overgrowth)` : "ahead";
    case "not-shown":
      return "not shown ahead";
    case "reversed":
      return "behind";
  }
}

export type UnderdocksCoverageState = "registered" | "tested";

/**
 * Where the simulated evidence stands for Act 1's other version, in words, read from the data: registered and not run, or how each of the
 * three tests came out. Nothing (null) when the decision log carries no registration.
 */
export function underdocksCoverage(
  data: UnderdocksData = UNDERDOCKS,
): { readonly state: UnderdocksCoverageState; readonly detail: string } | null {
  if (!data.registered) return null;
  const tests = data.tests;
  if (!tests) {
    return {
      state: "registered",
      detail: `Every simulated result on this site was measured with Act 1 in Overgrowth. A test in Underdocks of the synergy term, the card values and the opening-relic rule is registered (${data.adr ?? "ADR-064"}) and has not been run yet; a run in Underdocks is told on the advisor's panels that the finding was measured in Overgrowth only`,
    };
  }
  return {
    state: "tested",
    detail: `Each of three results was tested again in Underdocks with nothing refitted: the synergy term ${verdictWords(tests.synergy)}, the card values ${verdictWords(tests.values)}, the opening-relic rule ${verdictWords(tests.neow)}. Nothing was fitted in Underdocks`,
  };
}

// ---- the note a run in Underdocks gets on each of the three panels

export interface UnderdocksNoteText {
  /** "registered" while the test has not been run, otherwise how it came out */
  readonly kind: "registered" | UnderdocksVerdict;
  readonly text: string;
}

const percent = (x: number): string => `${(x * 100).toFixed(1)} %`;
/** two decimals, for a share that is compared with a tenth: 10.01 % must not print as 10.0 % */
const percentFine = (x: number): string => `${(x * 100).toFixed(2)} %`;
/** A difference of shares in percentage points, with its sign ("+4.7 points"). */
const points = (x: number): string => `${x < 0 ? "−" : "+"}${Math.abs(x * 100).toFixed(1)} points`;

function pText(p: number): string {
  if (p === 0) return "p < 1e-300";
  if (p < 1e-4) return `p = ${p.toExponential(1)}`;
  // three figures below 0.1, so that a p just under a level (0.0166 against 0.0167) does not print as the other side of it
  return `p = ${p < 0.1 ? p.toPrecision(3) : p.toPrecision(2)}`;
}

/** What the test compared, in words, with its figures: the first arm against the second, past the Act-1 boss. */
function figures(finding: UnderdocksFinding, t: UnderdocksTest): string {
  const a = percent(t.reachedAct2.a.rate);
  const b = percent(t.reachedAct2.b.rate);
  const p = pText(t.reachedAct2.pairedTable.mcnemar_p);
  const tail = `(${t.bothCompleted.toLocaleString("en-US")} paired held-out games in the simulator, five classes, exact McNemar ${p})`;
  switch (finding) {
    case "synergy":
      return `a simulated pilot that picks cards by the index with the synergy term got past the Act 1 boss in ${a} of its games against ${b} without it ${tail}`;
    case "values":
      return `a simulated pilot that follows the card values shown here got past the Act 1 boss in ${a} of its games against ${b} for the hand-written rules ${tail}`;
    case "neow":
      return `a simulated pilot that takes the best-measured opening relic got past the Act 1 boss in ${a} of its games against ${b} for one that takes the first helpful relic ${tail}`;
  }
}

/**
 * Whether both arms got past the Act-1 boss less often in Underdocks than the same arms in Overgrowth (ADR-064 item 5): then a smaller
 * number of points is not by itself a smaller effect, and the page says so beside the size words. Empty when there is nothing to say.
 */
export function fallNote(t: UnderdocksTest): string {
  const og = t.overgrowth;
  if (!(t.reachedAct2.a.rate < og.a && t.reachedAct2.b.rate < og.b)) return "";
  return t.size === "smaller"
    ? "Both arms got past the Act 1 boss less often in Underdocks, so a smaller number of points does not by itself mean a weaker effect."
    : "Both arms got past the Act 1 boss less often in Underdocks than in Overgrowth.";
}

/** Why the rule did not count a passed or reversed primary result, in words, with the figures of the all-pairs analysis. */
export function withheldWords(t: UnderdocksTest): string {
  const ap = t.allPairs;
  const reasons = t.downgrades.map((d) =>
    d === "excluded"
      ? `the test dropped ${percentFine(ap.excludedFraction)} of the pairs (games that did not end in a win or a death: a simulator error, a step limit or a timeout), more than the tenth the registration allows`
      : `an analysis of every pair of seeds, a game that ended in an error counted by how far it got, did not agree (${percent(ap.aRate)} against ${percent(ap.bRate)}, ${pText(ap.p)})`,
  );
  return reasons.length > 0 ? reasons.join(", and ") : "a condition of the rule was not met";
}

/** The Overgrowth difference of the same arms, in words: how big the passed result is beside it, or what it was. */
function beside(t: UnderdocksTest): string {
  const og = t.overgrowth;
  const where = "in Overgrowth with the relics kept";
  const shares = `${percent(og.a)} against ${percent(og.b)}`;
  const fall = fallNote(t);
  const tail = fall ? ` ${fall}` : "";
  if (t.size) {
    return ` That is ${SIZE_WORDS[t.size]} the difference ${where} (${points(og.mean)}: ${shares}).${tail}`;
  }
  return ` The same arms differ by ${points(og.mean)} ${where} (${shares}).${tail}`;
}

/** The two arms of each test as a player would name them: the first (the one under test) and the second (what it was set against). */
const ARM_NAMES: Record<UnderdocksFinding, { readonly first: string; readonly second: string }> = {
  synergy: { first: "the pilot with the synergy term", second: "the pilot without it" },
  values: {
    first: "the pilot that follows the card values shown here",
    second: "the hand-written rules",
  },
  neow: {
    first: "the pilot that takes the best-measured opening relic",
    second: "the pilot that takes the first helpful relic",
  },
};

/** The class's own Underdocks games, when the second arm was ahead in them (ADR-064 item 6 v). */
function classReversal(
  finding: UnderdocksFinding,
  t: UnderdocksTest,
  character: string | undefined,
): string {
  const c = character ? t.classes[character.toLowerCase()] : undefined;
  if (!c?.behind) return "";
  const arms = ARM_NAMES[finding];
  return ` In the simulated Underdocks games of your own class alone, ${arms.second} came out ahead: ${c.bOnly.toLocaleString("en-US")} pairs got past the Act 1 boss only with ${arms.second} against ${c.aOnly.toLocaleString("en-US")} only with ${arms.first} (${pText(c.p)}).`;
}

/** The note while the Underdocks test is registered and has not been run. */
function registeredText(adr: string): string {
  return `This was measured with Act 1 in Overgrowth only. A test of it in Underdocks is registered (${adr}) and has not been run, so none of this has been tested in your Act 1.`;
}

/**
 * The line a run in Underdocks gets under a finding: that the finding was measured with Act 1 in Overgrowth and, once the Underdocks test has
 * been run, how it came out, whichever way that was, with its figures, how big a passed result is beside the Overgrowth one and, when the
 * run's own class went the other way in its own games, that (ADR-064 item 6 ii and v). Nothing for a run in Overgrowth, or when the
 * study is not in the site's data.
 */
export function underdocksNote(
  finding: UnderdocksFinding,
  act1: string | null | undefined,
  data: UnderdocksData = UNDERDOCKS,
  character?: string,
): UnderdocksNoteText | null {
  if (!data.registered || act1 !== "underdocks") return null;
  const test = underdocksTest(finding, data);
  if (!test) return { kind: "registered", text: registeredText(data.adr ?? "ADR-064") };
  const base = `${beside(test)}${classReversal(finding, test, character)}`;
  // the figures elsewhere on the panel (the ranking, the values, the relic measurements) are still the Overgrowth ones: nothing was refitted
  const unchanged = "The other figures on this panel were measured in Overgrowth and not refitted.";
  switch (test.verdict) {
    case "passed":
      return {
        kind: "passed",
        text: `Tested in simulation with Act 1 in Overgrowth and in Underdocks. In Underdocks, ${figures(finding, test)}.${base} ${unchanged}`,
      };
    case "not-shown":
      if (test.withheld) {
        // the primary test said passed or reversed and the rule did not count it (ADR-064 item 5): say what was seen and which condition withheld it
        const arms = ARM_NAMES[finding];
        const [front, back] =
          test.primary === "reversed" ? [arms.second, arms.first] : [arms.first, arms.second];
        const counted = test.primary === "reversed" ? "a reversal" : "shown";
        return {
          kind: "not-shown",
          text: `Measured with Act 1 in Overgrowth. In Underdocks the held-out test had ${front} ahead of ${back} on the pairs in which both games ended in a win or a death: ${figures(finding, test)}. But ${withheldWords(test)}, so the registered rule does not count it as ${counted}. That is not the same as showing that it does not help.${base} ${unchanged}`,
        };
      }
      return {
        kind: "not-shown",
        text: `Measured with Act 1 in Overgrowth. In Underdocks the held-out test did not show ${ARM_NAMES[finding].first} ahead of ${ARM_NAMES[finding].second}: ${figures(finding, test)}. That is not the same as showing that it does not help.${base} ${unchanged}`,
      };
    case "reversed":
      return {
        kind: "reversed",
        text: `Measured with Act 1 in Overgrowth. In Underdocks the held-out test had ${ARM_NAMES[finding].second} ahead of ${ARM_NAMES[finding].first}: ${figures(finding, test)}.${base} ${unchanged}`,
      };
  }
}
