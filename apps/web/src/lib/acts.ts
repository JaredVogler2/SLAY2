import acts from "@/content/acts.generated.json";
import { formatP } from "@/lib/stat-format";

/**
 * The acts study (ADR-061): does a pickier card rule win more games, and in which act? Exported by scripts/export-site-data.mjs, which reads the
 * registration and, once they exist, the four held-out tests strictly (every batch, hash, count and p-value is checked there, and the reading rule
 * that the registration froze is applied there). Nothing here is typed in: the words below only choose a sentence for the numbers the exporter
 * read, and the meaning of each combination of outcomes is the one ADR-061 item 8 wrote down before any game of the study.
 */
export type ActsTestKey = "L" | "A1" | "A2" | "A3";
export const ACTS_KEYS: readonly ActsTestKey[] = ["L", "A1", "A2", "A3"];

/** How a test came out by the rule registered before it (ADR-061 item 4, a partition of the outcomes). */
export type ActsVerdict = "passed" | "not-shown" | "reversed";
export type ActsDowngrade = "excluded" | "robustness";

export interface ActsClassResult {
  readonly character: string;
  readonly pairs: number;
  readonly wins: { readonly arm: number; readonly baseline: number };
  readonly shares: { readonly arm: number; readonly baseline: number };
  readonly difference: number;
  readonly armOnly: number;
  readonly baselineOnly: number;
  readonly p: number;
  /** at the class level (0.01, uncorrected): the arm ahead, S ahead, or neither */
  readonly verdict: "arm" | "baseline" | "level";
  readonly actOne: { readonly arm: number; readonly baseline: number };
  readonly meanFloorDifference: number;
}

export interface ActsTest {
  readonly key: ActsTestKey;
  readonly arm: string;
  /** the acts, counted from 0, whose card rewards the rule decides with the pickier threshold */
  readonly acts: readonly number[];
  readonly file: string;
  readonly sha256: string;
  readonly pairs: number;
  readonly pairedSeeds: number;
  readonly excluded: number;
  readonly notFinished: { readonly a: number; readonly b: number };
  /** the share of the pairs' games that were won, the arm's and the baseline's */
  readonly shares: { readonly arm: number; readonly baseline: number };
  readonly wins: { readonly arm: number; readonly baseline: number };
  readonly difference: number;
  /** the whole-seed interval at the level the test is read at (1 - 0.05 / 4) */
  readonly ci: readonly number[];
  readonly ci95: readonly number[];
  readonly armOnly: number;
  readonly baselineOnly: number;
  readonly p: number;
  /** the reading: the primary test's verdict, unless the all-pairs analysis or the share of dropped pairs withholds it (ADR-061 item 4) */
  readonly verdict: ActsVerdict;
  readonly primaryVerdict: ActsVerdict;
  readonly downgrade: ActsDowngrade | null;
  /** every condition that withheld the reading, not only the first */
  readonly downgrades: readonly ActsDowngrade[];
  /** the share of the pairs the primary test dropped because an episode did not end in a win or a death */
  readonly excludedFraction: number;
  readonly verification: {
    readonly exactChecks: number;
    readonly bootstrapChecks: number;
    readonly bootstrapDisagreements: readonly string[];
  };
  /** every pair of seeds, a game that did not end in a win counted as not won */
  readonly robust: {
    readonly pairs: number;
    readonly notCompleted: { readonly arm: number; readonly baseline: number };
    readonly wins: { readonly arm: number; readonly baseline: number };
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
  readonly actTwo: {
    readonly shares: { readonly arm: number; readonly baseline: number };
    readonly armOnly: number;
    readonly baselineOnly: number;
    readonly p: number;
  };
  readonly floorDifference: { readonly meanAMinusB: number; readonly ci95: readonly number[] };
  readonly perClass: readonly ActsClassResult[];
}

export interface ActsData {
  readonly adr: string;
  readonly registered: boolean;
  readonly level: number;
  readonly classLevel: number;
  readonly seeds: number;
  /** the registration heading (the frozen choices) is in the record */
  readonly frozen: boolean;
  readonly tests: { readonly results: Record<ActsTestKey, ActsTest> } | null;
}

/** The exporter's output, typed by what the reader emits (the JSON file's own type would freeze whichever stage the repository is at). */
export const ACTS = acts as unknown as ActsData | { readonly registered: false };

export function actsData(): ActsData | null {
  return ACTS.registered ? ACTS : null;
}

export type ActsStage = "registered" | "tests";
export function stageOf(d: ActsData): ActsStage {
  return d.tests ? "tests" : "registered";
}

export const TEST_INFO: Record<
  ActsTestKey,
  { readonly title: string; readonly short: string; readonly arm: string; readonly asks: string }
> = {
  L: {
    title: "The old lead",
    short: "every act",
    arm: "takes only cards worth 0.2 or more, in every act",
    asks: "Does the pilot that is pickier from the first card reward on win more games?",
  },
  A1: {
    title: "Pickier in Act 1 only",
    short: "Act 1",
    arm: "plays as the baseline except that, in the card rewards of Act 1 (the one after the first boss included), it takes a card only if it is worth more than 0.2",
    asks: "Does being pickier in the first act alone win more games? (It pays the price at the first boss, and leaves a thinner deck for everything after.)",
  },
  A2: {
    title: "Pickier in Act 2 only",
    short: "Act 2",
    arm: "plays as the baseline except that, in the card rewards of Act 2 (the one after the second boss included), it takes a card only if it is worth more than 0.2",
    asks: "Does being pickier in the second act alone win more games?",
  },
  A3: {
    title: "Pickier in Act 3 only",
    short: "Act 3",
    arm: "plays as the baseline except that, in the card rewards of Act 3, it takes a card only if it is worth more than 0.2",
    asks: "Does being pickier in the third act alone win more games? (It can differ from the baseline only in the runs that reach Act 3.)",
  },
};

export const VERDICT_TEXT: Record<ActsVerdict, string> = {
  passed: "wins more than the baseline",
  "not-shown": "not shown to win more",
  reversed: "wins fewer than the baseline",
};

export const CLASS_VERDICT_TEXT: Record<ActsClassResult["verdict"], string> = {
  arm: "ahead",
  baseline: "behind",
  level: "not shown",
};

/** Points of a share, with its sign (wins are rare, so two digits). */
export function pts(x: number, digits = 2): string {
  return `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(digits)} points`;
}

export function pctShare(x: number, digits = 2): string {
  return `${(x * 100).toFixed(digits)} %`;
}

export { formatP };

const n = (x: number): string => x.toLocaleString("en-US");

/** The level of the interval a test is read at, 1 - 0.05 / 4 (ADR-061 item 3), as a percentage. */
const LEVEL_TEXT = `${((1 - 0.05 / 4) * 100).toFixed(2)} %`;

/** The one-sentence reading of a test, by its verdict and with its figures. */
export function testSentence(t: ActsTest): string {
  const d = pts(t.difference);
  const ci = `${pts(t.ci[0] ?? 0)} to ${pts(t.ci[1] ?? 0)}`;
  switch (t.verdict) {
    case "passed":
      return `Won more: ${pctShare(t.shares.arm)} of ${n(t.pairs)} paired games were won against ${pctShare(t.shares.baseline)} (${d}; ${LEVEL_TEXT} interval ${ci}; exact ${formatP(t.p)}).`;
    case "reversed":
      return `Won fewer: ${pctShare(t.shares.arm)} against ${pctShare(t.shares.baseline)} in ${n(t.pairs)} paired games (${d}; ${LEVEL_TEXT} interval ${ci}; exact ${formatP(t.p)}).`;
    case "not-shown":
      return `No difference shown: ${pctShare(t.shares.arm)} against ${pctShare(t.shares.baseline)} won in ${n(t.pairs)} paired games (${d}; ${LEVEL_TEXT} interval ${ci}; exact ${formatP(t.p)}).`;
  }
}

/** Whether the rule differs from the baseline before the second act (the lead and the Act-1 rule do; the others cannot). */
export function hasPrice(t: ActsTest): boolean {
  return t.actOne.armOnly + t.actOne.baselineOnly > 0;
}

/**
 * What the rule does along the way, said beside its wins because ADR-061 item 4 asks every page that shows a result to give the shares past
 * the first and the second boss: a rule that wins more by losing more at the first boss is a different thing from one that does not. A rule
 * that is the baseline until its act has no difference at the bosses before it, by construction, and says so.
 */
export function bossSentence(t: ActsTest): string {
  const first = Math.min(...t.acts);
  const a1 = t.actOne;
  const a2 = t.actTwo;
  const d1 = a1.shares.arm - a1.shares.baseline;
  const d2 = a2.shares.arm - a2.shares.baseline;
  const f = t.floorDifference.meanAMinusB;
  const floors = `the runs reached ${Math.abs(f).toFixed(2)} floors ${f < 0 ? "fewer" : "more"} on average`;
  if (first >= 2)
    return `Along the way: this rule plays the baseline's game until the third act, so the games that got past the first and the second boss are the same by construction (${pctShare(a2.shares.baseline, 1)} of the baseline's paired games got past the second boss, which is all the third act's picks can change); ${floors}.`;
  const firstBoss =
    first >= 1
      ? `the first boss is the same by construction (${pctShare(a1.shares.baseline, 1)} of the paired games got past it)`
      : `${pctShare(a1.shares.arm, 1)} of the paired games got past the first boss against ${pctShare(a1.shares.baseline, 1)} (${pts(d1, 1)}; ${n(a1.armOnly)} pairs in which only the rule did, ${n(a1.baselineOnly)} in which only the baseline did)`;
  return `Along the way: ${firstBoss}; ${pctShare(a2.shares.arm, 1)} got past the second boss against ${pctShare(a2.shares.baseline, 1)} (${pts(d2, 1)}; ${n(a2.armOnly)} against ${n(a2.baselineOnly)} pairs); ${floors}.`;
}

/** The second analysis of a test: the same comparison on every pair, a game that did not end in a win counting as not won. */
export function robustSentence(t: ActsTest): string {
  const r = t.robust;
  return `Checked again on all ${n(r.pairs)} pairs of seeds, a game that did not end in a win counting as not won (${n(r.notCompleted.arm)} of the rule's games and ${n(r.notCompleted.baseline)} of the baseline's ended in an error or a step limit): ${pctShare(r.shares.arm)} against ${pctShare(r.shares.baseline)} (${pts(r.difference)}, ${n(r.armOnly)} against ${n(r.baselineOnly)} pairs, exact ${formatP(r.p)}). An errored game cannot have been won; neither analysis says it would have been lost.`;
}

/** How many pairs a test left out, said where the figures are, because "excluded and counted" is a rule of the design (ADR-061 item 3). */
export function excludedSentence(t: ActsTest): string {
  return `${n(t.excluded)} of ${n(t.pairedSeeds)} pairs were left out of the first analysis because a game did not finish (a simulator error or a step limit), never read as a loss.`;
}

/** Why a result the primary test would have called ahead or behind is read as not shown, naming every condition (empty when nothing was withheld). */
export function downgradeNote(t: ActsTest): string {
  if (t.downgrades.length === 0) return "";
  const was = t.primaryVerdict === "passed" ? "ahead" : "behind";
  const reasons = t.downgrades.map((d) =>
    d === "excluded"
      ? `${pctShare(t.excludedFraction, 1)} of the pairs were dropped because a game did not end in a win or a death (the rule written down first allows a tenth)`
      : "the check on all pairs does not show the same difference at an exact p below 0.05",
  );
  return `The primary test alone would read the rule as ${was}, but the result is read as not shown because ${reasons.join(", and because ")}.`;
}

/** What the independent recomputation said about the intervals (empty when it agreed; the pooled file's interval governs either way). */
export function verificationNote(t: ActsTest): string {
  const k = t.verification.bootstrapDisagreements.length;
  if (k === 0) return "";
  return `An independent resample of the intervals disagreed about ${String(k)} interval end${k === 1 ? "" : "s"} by more than the tolerance written down first; the interval above is the one the registration says governs, and the disagreement decides nothing.`;
}

const ACT_NAME = (k: ActsTestKey): string => TEST_INFO[k].short;
function list(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] ?? ""}`;
}

/**
 * What the four verdicts mean together, as ADR-061 item 8 wrote it before any game was played (each test is read on its own, whatever the others
 * show). Returns the sentences in the order they are shown.
 */
export function meaningOf(results: Record<ActsTestKey, ActsTest>): readonly string[] {
  const l = results.L.verdict;
  const singles = (["A1", "A2", "A3"] as const).filter((k) => results[k].verdict === "passed");
  const behind = (["A1", "A2", "A3"] as const).filter((k) => results[k].verdict === "reversed");
  const out: string[] = [];
  if (l === "passed") {
    out.push(
      "The old lead won more games than the baseline on seeds nobody had played. That says that it did, not why.",
    );
    out.push(
      singles.length > 0
        ? `Being pickier in ${list(singles.map(ACT_NAME))} alone also won more games, so that act's picks alone are shown to matter; the effects of the three acts need not add up to the lead's, and 0.2 may not be the best threshold in any act.`
        : "No single act is shown to carry it. The single-act pilots have less power, so the effect may be shared between the acts, may need a thinner deck from the first act and the later picks together, or may be one act's, too small to see.",
    );
  } else if (l === "reversed") {
    out.push(
      "The pilot that follows the shown values won more games than the old lead, which is reported as plainly as a gain would be, and with the same limits: it need not be so for other thresholds.",
    );
  } else {
    out.push(
      singles.length === 0 && behind.length === 0
        ? "None of the four was shown to differ. The extra wins the old lead had on the earlier seeds were not shown to hold on these seeds; that is a statement about this sample, not about the lead."
        : "The old lead was not shown to win more or fewer games on these seeds: the extra wins it had on the earlier seeds were not shown to hold, which is a statement about this sample, not about the lead.",
    );
  }
  if (l !== "passed" && singles.length > 0)
    out.push(
      `Being pickier in ${list(singles.map(ACT_NAME))} alone won more games while the old lead, which adds the picks of the other acts, ${l === "reversed" ? "won fewer" : "was not shown to"}. This is one of four tests read at ${String(0.05 / 4)}, so a false positive is possible (about one time in eighty for a single test); it is reported as it came out.`,
    );
  if (behind.length > 0)
    out.push(
      `Being pickier in ${list(behind.map(ACT_NAME))} alone won fewer games than the baseline, which is reported as plainly as a gain would be, and with the same limits: it need not be so for other thresholds.`,
    );
  return out;
}

/** The limit the registration put beside the third-act test: it can differ from the baseline only in the runs that reach the third act. */
export function actThreeNote(t: ActsTest): string {
  return `The third-act test can differ from the baseline only in the runs that get that far (${pctShare(t.actTwo.shares.baseline, 1)} of the baseline's paired games got past the second boss), so a result of not shown there was the expected one whatever the effect.`;
}
