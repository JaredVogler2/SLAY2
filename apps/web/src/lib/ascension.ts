import ascension from "@/content/ascension.generated.json";

/**
 * What simulated runs say about Ascension (ADR-058). Every other result on the site was measured at Ascension 0; this is the study that
 * asks whether three of them hold at Ascension 9, with nothing refitted: the synergy term, the card values the site shows and the
 * opening-relic rule. Exported by scripts/export-site-data.mjs from the registered record and, once they exist, the three pooled tests
 * and the twin of the second at Ascension 0.
 */
export type AscensionFinding = "synergy" | "values" | "neow";

/**
 * How a test came out by the rule registered before it (ADR-058 item 4, a partition): ahead (the exact pooled p below the level, the first
 * arm ahead and the whole-seed interval of the difference excluding zero), the other arm ahead on the same terms, or not shown.
 */
export type AscensionVerdict = "passed" | "not-shown" | "reversed";

/** How big a passed result is beside the same arms at Ascension 0, by where the Ascension 9 interval lies against the Ascension 0 difference. */
export type AscensionSize = "smaller" | "about-the-same" | "larger";

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

export interface AscensionMember {
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
export interface AscensionClassResult {
  readonly aOnly: number;
  readonly bOnly: number;
  readonly p: number;
  /** the first arm was ahead in the class's own Ascension 9 games at p below the class level (ADR-058 item 5 iii) */
  readonly ahead: boolean;
  /** the other arm was ahead there at that level (item 5 v) */
  readonly behind: boolean;
}

/** The difference of the same two arms at Ascension 0 with the relics kept, set beside the Ascension 9 result. */
export interface AscensionReference {
  readonly file: string;
  readonly adr: string;
  /** the pooled difference in the share past the Act-1 boss (first arm minus second), 0 to 1 */
  readonly mean: number;
  readonly ci95: readonly number[];
  readonly a: number;
  readonly b: number;
  readonly bothCompleted: number;
}

interface PooledResult {
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
  readonly members: readonly AscensionMember[];
}

/** One pooled paired test at Ascension 9, the first arm against the second (the study fixed which is which). */
export interface AscensionTest extends PooledResult {
  readonly verdict: AscensionVerdict;
  /** by lower-case class id */
  readonly classes: Readonly<Record<string, AscensionClassResult>>;
  /** the same arms at Ascension 0 with the relics kept, when that test exists */
  readonly a0: AscensionReference | null;
  /** for a passed test with an Ascension 0 difference to set it beside */
  readonly size: AscensionSize | null;
  /** the twin of the card-value test at Ascension 0 with the relics kept (descriptive; only on that test) */
  readonly twin?: PooledResult;
}

export interface AscensionData {
  /** false when the decision log carries no registration (then nothing else is here) */
  readonly registered: boolean;
  readonly adr?: string;
  readonly ascension?: number;
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
      readonly ascension0: {
        readonly completed: number;
        readonly pastActOneBoss: number;
        readonly rate: number;
      };
      readonly ascension9: {
        readonly completed: number;
        readonly pastActOneBoss: number;
        readonly rate: number;
      };
    };
  };
  readonly ascensionCheck?: {
    readonly file: string;
    readonly sha256: string;
    readonly claims: readonly string[];
  };
  /** null until the pooled tests have been run (they are run together, once) */
  readonly tests?: Readonly<Record<AscensionFinding, AscensionTest>> | null;
}

/** The exporter's file as the shape it writes (a JSON import types its strings as `string`, not as the verdicts they are). */
const asData = (raw: unknown): AscensionData => raw as AscensionData;

/** The data the exporter wrote. Tests pass their own `AscensionData` to the functions below. */
export const ASCENSION: AscensionData = asData(ascension);

/** The Ascension the study tested at, the only one besides 0. */
export const TESTED_ASCENSION = 9;

export const FINDING_NAMES: Record<AscensionFinding, string> = {
  synergy: "the synergy term",
  values: "the measured card values",
  neow: "the opening-relic rule",
};

/** Whether the study's tests have been run. */
export function ascensionTested(data: AscensionData = ASCENSION): boolean {
  return data.registered && !!data.tests;
}

export function ascensionTest(
  finding: AscensionFinding,
  data: AscensionData = ASCENSION,
): AscensionTest | null {
  return data.tests?.[finding] ?? null;
}

/**
 * Where a run's Ascension lies against what was tested (0 and 9). 10 adds a second boss the simulator never plays (gap G1), so it is
 * beyond what was tested, not at it.
 */
export type Standing = "zero" | "between" | "tested" | "beyond";

export function standingOf(level: number): Standing {
  if (level <= 0) return "zero";
  if (level < TESTED_ASCENSION) return "between";
  return level === TESTED_ASCENSION ? "tested" : "beyond";
}

/**
 * Whether the opening-relic advice may name a relic for this class on a run at this Ascension. At Ascension 0 the rule of ADR-055 decides
 * and this has no say (true). At 1 to 10, once the Ascension 9 test has been run, the advice needs the pooled test to have passed and the
 * class's own Ascension 9 games to have the rule ahead at the class level (ADR-058 item 5 iii). Before the test has been run there is no
 * result to withhold the advice on, and it stays, with the note that it was measured at Ascension 0 only.
 */
export function neowAdviceAllowed(
  character: string,
  level: number,
  confirmed: boolean,
  data: AscensionData = ASCENSION,
): boolean {
  if (!confirmed || level <= 0 || !ascensionTested(data)) return true;
  const test = ascensionTest("neow", data);
  return test?.verdict === "passed" && test.classes[character.toLowerCase()]?.ahead === true;
}

// ---- the note an Ascension 1 to 10 run gets on each of the three panels

export interface AscensionNoteText {
  /** "registered" while the test has not been run, otherwise how it came out */
  readonly kind: "registered" | AscensionVerdict;
  readonly text: string;
}

const percent = (x: number): string => `${(x * 100).toFixed(1)} %`;
/** A difference of shares in percentage points, with its sign ("+4.7 points"). */
const points = (x: number): string => `${x < 0 ? "−" : "+"}${Math.abs(x * 100).toFixed(1)} points`;

function pText(p: number): string {
  return p === 0 ? "p < 1e-300" : `p = ${p < 1e-4 ? p.toExponential(1) : p.toPrecision(2)}`;
}

const SIZE_WORDS: Record<AscensionSize, string> = {
  smaller: "smaller than",
  "about-the-same": "about the same as",
  larger: "larger than",
};

/** What the test compared, in words, with its figures: the first arm against the second, past the Act-1 boss. */
function figures(finding: AscensionFinding, t: AscensionTest): string {
  const a = percent(t.reachedAct2.a.rate);
  const b = percent(t.reachedAct2.b.rate);
  const p = pText(t.reachedAct2.pairedTable.mcnemar_p);
  const tail = `(${t.bothCompleted.toLocaleString("en-US")} paired held-out games, five classes, exact McNemar ${p})`;
  switch (finding) {
    case "synergy":
      return `a pilot that picks cards by the index with the synergy term got past the Act 1 boss in ${a} of games against ${b} without it ${tail}`;
    case "values":
      return `a pilot that follows the card values shown here got past the Act 1 boss in ${a} of games against ${b} for the hand-written rules ${tail}`;
    case "neow":
      return `a pilot that takes the best-measured opening relic got past the Act 1 boss in ${a} of games against ${b} for one that takes the first helpful relic ${tail}`;
  }
}

/** The Ascension 0 difference of the same arms, in words: how big the passed result is beside it, or what it was. */
function beside(t: AscensionTest): string {
  const a0 = t.a0;
  if (!a0) return "";
  const where = "at Ascension 0 with the relics kept";
  if (t.size) {
    return ` That is ${SIZE_WORDS[t.size]} the gain ${where} (${points(a0.mean)}).`;
  }
  return ` The same arms differ by ${points(a0.mean)} ${where}.`;
}

/** The class's own Ascension 9 games, when the other arm was ahead in them (ADR-058 item 5 v). */
function classReversal(t: AscensionTest, character: string | undefined): string {
  const c = character ? t.classes[character.toLowerCase()] : undefined;
  if (!c?.behind) return "";
  return ` In the games of your own class alone at Ascension 9 the other arm was ahead (${String(c.bOnly)} pairs against ${String(c.aOnly)}, ${pText(c.p)}).`;
}

function whereYouAre(level: number): string {
  switch (standingOf(level)) {
    case "between":
      return `Your run is at Ascension ${String(level)}, between the two levels tested; nothing was tested at it.`;
    case "tested":
      return "Your run is at Ascension 9, the level that was tested.";
    case "beyond":
      return `Your run is at Ascension ${String(level)}, which adds a second boss that the simulator never plays (gap G1): beyond anything tested here.`;
    case "zero":
      return "";
  }
}

/** The note while the Ascension 9 test is registered and has not been run. */
function registeredText(level: number, adr: string): string {
  const status = `A test at Ascension 9 is registered (${adr}) and has not been run`;
  switch (standingOf(level)) {
    case "between":
      return `This was measured at Ascension 0 only. Your run is at Ascension ${String(level)}. ${status}, so none of this has been tested at your level, and the levels between 0 and 9 will not be tested either.`;
    case "tested":
      return `This was measured at Ascension 0 only. Your run is at Ascension 9. ${status}, so none of this has been tested at your level.`;
    case "beyond":
      return `This was measured at Ascension 0 only. Your run is at Ascension ${String(level)}, which adds a second boss that the simulator never plays (gap G1), so no test covers it. ${status}.`;
    case "zero":
      return "";
  }
}

/**
 * The line a run at Ascension 1 to 10 gets under a finding: what Ascension the finding was measured at and, once the Ascension 9 test has
 * been run, how it came out, whichever way that was, with its figures, how big a passed result is beside the Ascension 0 one and, when the
 * run's own class went the other way in its own games, that (ADR-058 item 5 ii and v). Nothing for a run at Ascension 0, whose Ascension
 * the player has not confirmed, or when the study is not in the site's data.
 */
export function ascensionNote(
  finding: AscensionFinding,
  level: number,
  confirmed: boolean,
  data: AscensionData = ASCENSION,
  character?: string,
): AscensionNoteText | null {
  if (!data.registered || !confirmed || level <= 0) return null;
  const test = ascensionTest(finding, data);
  if (!test) {
    return { kind: "registered", text: registeredText(level, data.adr ?? "ADR-058") };
  }
  const tail = `${beside(test)}${classReversal(test, character)} ${whereYouAre(level)}`;
  switch (test.verdict) {
    case "passed": {
      // the card values were never played against the hand-written rules with the relics kept at Ascension 0 before the twin
      const lead =
        finding === "values"
          ? "The pair behind this panel was tested in simulation at Ascension 9, and at Ascension 0 with the relics kept (the sets now shown had not been played against the hand-written rules in that game before)."
          : "Tested in simulation at Ascension 0 and at Ascension 9.";
      return {
        kind: "passed",
        text: `${lead} At Ascension 9, ${figures(finding, test)}.${tail}`,
      };
    }
    case "not-shown":
      return {
        kind: "not-shown",
        text: `Measured at Ascension 0. At Ascension 9 the held-out test did not show it ahead: ${figures(finding, test)}. That is not the same as showing that it does not help.${tail}`,
      };
    case "reversed":
      return {
        kind: "reversed",
        text: `Measured at Ascension 0. At Ascension 9 the held-out test had the other arm ahead: ${figures(finding, test)}.${tail}`,
      };
  }
}
