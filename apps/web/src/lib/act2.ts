import act2 from "@/content/act2.generated.json";
import { formatP } from "@/lib/stat-format";

/**
 * The Act-2 study (ADR-060): does anything about the card picks change how often a simulated run gets past the second boss? Exported by
 * scripts/export-site-data.mjs, which reads the registration, the fit, the development screen and, once they exist, the three held-out
 * tests strictly (every batch, hash, count and p-value is checked there). Nothing here is typed in: the words below only choose a sentence
 * for the numbers the exporter read.
 */
export type Act2TestKey = "L" | "P" | "V";

/** How a test came out by the rule registered before it (ADR-060 item 4, a partition of the outcomes). */
export type Act2Verdict = "passed" | "not-shown" | "reversed";

export interface Act2Moved {
  readonly id: string;
  readonly shown: number;
  readonly value: number;
  readonly delta: number;
  readonly ci95: readonly number[];
  readonly decks: number;
}

export interface Act2FitClass {
  readonly character: string;
  readonly file: string;
  readonly sha256: string;
  readonly fitted: boolean;
  readonly reason: string | null;
  readonly bossFights: number;
  readonly passed: number;
  readonly gain: number | null;
  readonly bestL2: number | null;
  readonly indicatorPenalty: number | null;
  readonly logLoss: {
    readonly baseRate: number;
    readonly scaleOnly: number;
    readonly full: number;
  } | null;
  readonly scaleOnly: { readonly estimate: number; readonly ci95: readonly number[] | null } | null;
  readonly moved: readonly Act2Moved[];
  readonly movedCount: number;
  readonly signFlips: number;
  readonly cards: number;
}

export interface Act2DevRow {
  readonly arm: string;
  readonly lateThreshold: number | null;
  readonly pairs: number;
  readonly excluded: number;
  readonly shares: { readonly arm: number; readonly baseline: number };
  readonly difference: number;
  readonly armOnly: number;
  readonly baselineOnly: number;
  readonly p: number;
  readonly eligible: boolean;
  readonly actOne: { readonly arm: number; readonly baseline: number; readonly differs: number };
  readonly wins: { readonly arm: number; readonly baseline: number };
}

export interface Act2ClassResult {
  readonly character: string;
  readonly pairs: number;
  readonly shares: { readonly arm: number; readonly baseline: number };
  readonly difference: number;
  readonly armOnly: number;
  readonly baselineOnly: number;
  readonly p: number;
  /** at the class level (0.01, uncorrected): the arm ahead, S ahead, or neither */
  readonly verdict: "arm" | "baseline" | "level";
  readonly actOne: {
    readonly arm: number;
    readonly baseline: number;
    readonly armOnly: number;
    readonly baselineOnly: number;
  };
  readonly wins: { readonly arm: number; readonly baseline: number };
  readonly meanFloorDifference: number;
}

export interface Act2Test {
  readonly key: Act2TestKey;
  readonly arm: string;
  readonly file: string;
  readonly sha256: string;
  readonly pairs: number;
  readonly pairedSeeds: number;
  readonly excluded: number;
  readonly notFinished: { readonly a: number; readonly b: number };
  readonly shares: { readonly arm: number; readonly baseline: number };
  readonly games: { readonly arm: number; readonly baseline: number };
  readonly difference: number;
  /** the whole-seed interval at the level the test is read at (1 - 0.05 / 3) */
  readonly ci: readonly number[];
  readonly ci95: readonly number[];
  readonly armOnly: number;
  readonly baselineOnly: number;
  readonly p: number;
  /** the reading: the primary test's verdict, unless the observed-endpoint analysis or the share of dropped pairs withholds it (ADR-060 addendum B) */
  readonly verdict: Act2Verdict;
  readonly primaryVerdict: Act2Verdict;
  readonly downgrade: "robustness" | "excluded" | null;
  /** the share of the pairs the primary test dropped because an episode did not end in a win or a death */
  readonly excludedFraction: number;
  /** every pair whose two endpoints are known, a game that ended in an error after the Act-2 boss counted as a pass */
  readonly robust: {
    readonly pairs: number;
    readonly droppedUnknown: number;
    readonly erroredAfterTheBoss: { readonly arm: number; readonly baseline: number };
    readonly shares: { readonly arm: number; readonly baseline: number };
    readonly difference: number;
    readonly armOnly: number;
    readonly baselineOnly: number;
    readonly p: number;
  };
  readonly actOne: {
    readonly shares: { readonly arm: number; readonly baseline: number };
    readonly armOnly: number;
    readonly baselineOnly: number;
    readonly p: number;
  };
  readonly wins: { readonly arm: number; readonly baseline: number; readonly p: number };
  readonly floorDifference: { readonly meanAMinusB: number; readonly ci95: readonly number[] };
  readonly perClass: readonly Act2ClassResult[];
}

export interface Act2Data {
  readonly adr: string;
  readonly registered: boolean;
  readonly level: number;
  readonly classLevel: number;
  readonly screenLevel: number;
  readonly gate: number;
  readonly seeds: number;
  /** part 2 of the registration (the frozen choices) is in the record */
  readonly frozen: boolean;
  readonly fit: { readonly classes: readonly Act2FitClass[]; readonly anyFitted: boolean } | null;
  readonly dev: {
    readonly file: string;
    readonly sha256: string;
    readonly slice: { readonly partition: string; readonly offset: number; readonly n: number };
    readonly arms: readonly Act2DevRow[];
    readonly P: {
      readonly advance: boolean;
      readonly arm: string | null;
      readonly lateThreshold: number | null;
    };
    readonly V: { readonly advance: boolean; readonly anyClassFitted: boolean };
  } | null;
  readonly tests: {
    readonly results: Partial<Record<Act2TestKey, Act2Test>>;
    readonly determinism: {
      readonly shared: number;
      readonly identical: number;
      readonly different: number;
    };
  } | null;
}

/** The exporter's output, typed by what the reader emits (the JSON file's own type would freeze whichever stage the repository is at). */
export const ACT2 = act2 as unknown as Act2Data | { readonly registered: false };

export function act2Data(): Act2Data | null {
  return ACT2.registered ? ACT2 : null;
}

export type Act2Stage = "registered" | "fit" | "screen" | "tests";
export function stageOf(d: Act2Data): Act2Stage {
  return d.tests ? "tests" : d.dev ? "screen" : d.fit ? "fit" : "registered";
}

export const TEST_INFO: Record<
  Act2TestKey,
  { readonly title: string; readonly arm: string; readonly asks: string }
> = {
  L: {
    title: "The old lead",
    arm: "takes only cards worth 0.2 or more, in every act",
    asks: "Does a pickier pilot get more runs past the second boss when it is pickier from the first card reward on? (the lead of the tuning screen of ADR-036, which was neither reproduced nor refuted)",
  },
  P: {
    title: "A pickier second act",
    arm: "plays as the baseline except that, in Act 2 only, it takes a card only if it is worth more than the threshold the development screen chose",
    asks: "Does being pickier only in the second act get more runs past the second boss?",
  },
  V: {
    title: "Card values refitted for the second boss",
    arm: "plays as the baseline except that, in Act 2 only, it follows each class's values refitted for the Act-2 boss",
    asks: "Does a pilot that follows the ranking measured at the second boss, in the second act, get more runs past it?",
  },
};

export const VERDICT_TEXT: Record<Act2Verdict, string> = {
  passed: "ahead of the baseline",
  "not-shown": "not shown ahead",
  reversed: "behind the baseline",
};

export const CLASS_VERDICT_TEXT: Record<Act2ClassResult["verdict"], string> = {
  arm: "ahead",
  baseline: "behind",
  level: "not shown",
};

/** What a late-threshold candidate means, in words (-100 and 100 are the two ends of the dose). */
export function thresholdLabel(t: number | null): string {
  if (t === null) return "";
  if (t <= -100) return "takes the best card offered, whatever its value";
  if (t >= 100) return "never takes a card";
  return `takes a card only if it is worth more than ${String(t)}`;
}

export const ARM_LABEL: Record<string, string> = {
  lead: "Pickier in every act (0.2)",
  pall: "Act 2: take the best card offered",
  p010: "Act 2: threshold 0.1",
  p020: "Act 2: threshold 0.2",
  p035: "Act 2: threshold 0.35",
  p050: "Act 2: threshold 0.5",
  pnone: "Act 2: take no card",
  v: "Act 2: the refitted values",
};

/** Points of a share, with its sign. */
export function pts(x: number, digits = 1): string {
  return `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(digits)} points`;
}

export function pctShare(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)} %`;
}

export { formatP };

/** The one-sentence reading of a test, by its verdict and with its figures. */
export function testSentence(t: Act2Test): string {
  const d = pts(t.difference);
  const ci = `${pts(t.ci[0] ?? 0)} to ${pts(t.ci[1] ?? 0)}`;
  switch (t.verdict) {
    case "passed":
      return `Ahead of the baseline by ${d} (interval ${ci}; exact ${formatP(t.p)}): ${pctShare(t.shares.arm)} of ${t.pairs.toLocaleString("en-US")} paired games got past the Act-2 boss against ${pctShare(t.shares.baseline)}.`;
    case "reversed":
      return `Behind the baseline by ${pts(-t.difference)} (interval ${ci}; exact ${formatP(t.p)}): ${pctShare(t.shares.arm)} against ${pctShare(t.shares.baseline)} in ${t.pairs.toLocaleString("en-US")} paired games.`;
    case "not-shown":
      return `No difference shown: ${pctShare(t.shares.arm)} against ${pctShare(t.shares.baseline)} in ${t.pairs.toLocaleString("en-US")} paired games (${d}, interval ${ci}; exact ${formatP(t.p)}).`;
  }
}

/** Whether a test changes who gets past the first boss (the lead does; a rule that differs from the baseline in Act 2 only cannot). */
export function hasPrice(t: Act2Test): boolean {
  return t.actOne.armOnly + t.actOne.baselineOnly > 0;
}

/**
 * What a rule that differs from the baseline before the second act costs, or gains, at the first boss and in floors reached. ADR-060 item 4
 * asks every page that shows such a rule's result at the second boss to show this beside it: a rule that gets more runs past the second
 * boss by losing more at the first is a different thing from one that does not.
 */
export function priceSentence(t: Act2Test): string {
  const a = t.actOne;
  const d = a.shares.arm - a.shares.baseline;
  const f = t.floorDifference.meanAMinusB;
  const pairs = (x: number): string => x.toLocaleString("en-US");
  return `${d < 0 ? "What it costs" : "What it changes"} at the first boss: ${pctShare(a.shares.arm)} of the paired games got past it against ${pctShare(a.shares.baseline)} (${pts(d)}; ${pairs(a.armOnly)} pairs in which only the rule did, ${pairs(a.baselineOnly)} in which only the baseline did), and the runs reached ${Math.abs(f).toFixed(2)} floors ${f < 0 ? "fewer" : "more"} on average.`;
}

/** The second analysis of a test: the same comparison on every pair whose two endpoints are known (errors after the Act-2 boss are passes). */
export function robustSentence(t: Act2Test): string {
  const r = t.robust;
  return `Checked again on the ${r.pairs.toLocaleString("en-US")} pairs whose two endpoints are known, with the games that ended in an error after the Act-2 boss counted as passes (${String(r.erroredAfterTheBoss.arm)} of the rule's, ${String(r.erroredAfterTheBoss.baseline)} of the baseline's): ${pctShare(r.shares.arm)} against ${pctShare(r.shares.baseline)} (${pts(r.difference)}, ${String(r.armOnly)} against ${String(r.baselineOnly)} pairs, exact ${formatP(r.p)}).`;
}

/** Why a result the primary test would have called ahead or behind is read as not shown (empty when nothing was withheld). */
export function downgradeNote(t: Act2Test): string {
  if (t.downgrade === null) return "";
  const was = t.primaryVerdict === "passed" ? "ahead" : "behind";
  return t.downgrade === "excluded"
    ? `The primary test alone would read the rule as ${was}, but ${pctShare(t.excludedFraction)} of the pairs were dropped because a game did not end in a win or a death (the rule written down first allows a tenth), so the result is read as not shown.`
    : `The primary test alone would read the rule as ${was}, but the check on every pair with known endpoints does not show the same difference at an exact p below 0.05, so the result is read as not shown.`;
}
