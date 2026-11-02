import thresh from "@/content/thresh.generated.json";
import { formatP } from "@/lib/stat-format";

/**
 * The threshold study (ADR-062): does the Act-2 result of ADR-061 hold on seeds nobody has played, and is another threshold better? Exported by
 * scripts/export-site-data.mjs, which reads the registration and, as they exist, the development screen and the held-out tests strictly (every batch, hash,
 * count and p-value is checked there, the selection rule is applied again, and the reading rule that the registration froze is applied there). Nothing here
 * is typed in: the words below only choose a sentence for the numbers the exporter read, and the meaning of each outcome is the one ADR-062 item 9 wrote
 * down before any game of the study.
 */
export type ThreshTag = "t010" | "t020" | "t030" | "t045" | "t060" | "tnone";
export const THRESH_TAGS: readonly ThreshTag[] = ["t010", "t020", "t030", "t045", "t060", "tnone"];
export type ThreshTestKey = "T1" | "T2" | "T3";
export const THRESH_TEST_KEYS: readonly ThreshTestKey[] = ["T1", "T2", "T3"];

/** How a test came out by the rule registered before it (ADR-062 item 5, a partition of the outcomes). */
export type ThreshVerdict = "passed" | "not-shown" | "reversed";
export type ThreshDowngrade = "excluded" | "robustness";

interface Pair {
  readonly arm: number;
  readonly baseline: number;
}

/** One threshold of the development screen, against S, in the pooled pairs of the two classes (development numbers: they decide only what is played next). */
export interface ThreshScreenRow {
  readonly tag: ThreshTag;
  readonly threshold: number;
  readonly pairs: number;
  readonly excluded: number;
  readonly wins: Pair;
  readonly shares: Pair;
  readonly difference: number;
  readonly armOnly: number;
  readonly baselineOnly: number;
  readonly net: number;
  readonly p: number;
  readonly pastAct1Boss: Pair;
  readonly pastAct2Boss: Pair;
  readonly meanFloorDifference: number;
  readonly meanDeckSize: {
    readonly arm: number | null;
    readonly baseline: number | null;
    readonly pairs: number;
  } | null;
  /** the pairs in which a game was stopped by the wall clock, which the design check does not compare */
  readonly wallClockPairs: number;
}

export interface ThreshHead {
  readonly armOnly: number;
  readonly baselineOnly: number;
  readonly net: number;
  readonly p: number;
  readonly pairs: number;
}

export interface ThreshScreen {
  readonly rows: Record<ThreshTag, ThreshScreenRow>;
  readonly best: { readonly arm: ThreshTag; readonly threshold: number; readonly net: number };
  /** the best threshold against 0.2 (null where the rule reads none: the best is 0.2 itself, or its net is not above zero) */
  readonly headToHead: ThreshHead | null;
  readonly choice: {
    readonly arm: ThreshTag | null;
    readonly threshold: number | null;
    readonly advance: boolean;
    readonly reason: string;
  };
  readonly tests: readonly {
    readonly key: ThreshTestKey;
    readonly arm: string;
    readonly baseline: string;
  }[];
  readonly level: number;
  readonly role: string;
}

export interface ThreshClassResult {
  readonly character: string;
  readonly pairs: number;
  readonly wins: Pair;
  readonly shares: Pair;
  readonly difference: number;
  readonly armOnly: number;
  readonly baselineOnly: number;
  readonly p: number;
  /** at the class level (0.01, uncorrected): the arm ahead, the baseline ahead, or neither */
  readonly verdict: "arm" | "baseline" | "level";
  readonly actOne: Pair;
  readonly meanFloorDifference: number;
}

export interface ThreshTest {
  readonly key: ThreshTestKey;
  readonly arm: string;
  readonly baseline: string;
  readonly file: string;
  readonly sha256: string;
  readonly pairs: number;
  readonly pairedSeeds: number;
  readonly excluded: number;
  readonly shares: Pair;
  readonly wins: Pair;
  readonly difference: number;
  /** the whole-seed interval at the level the test is read at (1 minus 0.05 divided by the number of tests played) */
  readonly ci: readonly number[];
  readonly ci95: readonly number[];
  readonly armOnly: number;
  readonly baselineOnly: number;
  readonly p: number;
  readonly verdict: ThreshVerdict;
  readonly primaryVerdict: ThreshVerdict;
  readonly downgrade: ThreshDowngrade | null;
  /** every condition that withheld the reading, not only the first */
  readonly downgrades: readonly ThreshDowngrade[];
  readonly narrow: boolean;
  readonly excludedFraction: number;
  readonly verification: {
    readonly exactChecks: number;
    readonly bootstrapChecks: number;
    readonly bootstrapDisagreements: readonly string[];
  };
  /** every pair of seeds both batches hold, a game that did not end in a win counted as not won */
  readonly robust: {
    readonly pairs: number;
    readonly notCompleted: Pair;
    readonly wins: Pair;
    readonly shares: Pair;
    readonly difference: number;
    readonly armOnly: number;
    readonly baselineOnly: number;
    readonly p: number;
  };
  readonly actOne: {
    readonly shares: Pair;
    readonly armOnly: number;
    readonly baselineOnly: number;
    readonly p: number;
  };
  readonly actTwo: {
    readonly shares: Pair;
    readonly armOnly: number;
    readonly baselineOnly: number;
    readonly p: number;
  };
  readonly floorDifference: { readonly meanAMinusB: number; readonly ci95: readonly number[] };
  readonly perClass: readonly ThreshClassResult[];
}

export type ThreshStage = "registered" | "screened" | "tested";

export interface ThreshData {
  readonly adr: string;
  readonly registered: true;
  readonly frozen: boolean;
  /** part 2 of the record (the frozen choices) is in it: the development stage is over and the held-out run can be played */
  readonly partTwo: boolean;
  readonly studyLevel: number;
  readonly classLevel: number;
  readonly seeds: number;
  readonly devSeeds: number;
  readonly stage: ThreshStage;
  readonly level?: number;
  readonly devHead?: string;
  readonly screen: ThreshScreen | null;
  readonly tests: {
    readonly results: Partial<Record<ThreshTestKey, ThreshTest>>;
    readonly order: readonly ThreshTestKey[];
    readonly level: number;
    readonly levelLabel: string;
  } | null;
  readonly identity?: Record<
    string,
    { readonly beforePairs: number; readonly bossPairs: number; readonly wallClockPairs: number }
  >;
}

/** The exporter's output, typed by what the reader emits (the JSON file's own type would freeze whichever stage the repository is at). */
export const THRESH = thresh as unknown as ThreshData | { readonly registered: false };

export function threshData(): ThreshData | null {
  return THRESH.registered ? THRESH : null;
}

export function stageOf(d: ThreshData): ThreshStage {
  return d.stage;
}

export { formatP };

/** The threshold a tag stands for, as a person reads it. */
export const THRESHOLD_TEXT: Record<ThreshTag, string> = {
  t010: "0.1",
  t020: "0.2",
  t030: "0.3",
  t045: "0.45",
  t060: "0.6",
  tnone: "no card at all",
};

const isTag = (x: string): x is ThreshTag => (THRESH_TAGS as readonly string[]).includes(x);

/** "S" for the baseline, otherwise the threshold of the arm. */
export function armName(arm: string): string {
  if (arm === "s") return "the baseline";
  return isTag(arm)
    ? arm === "tnone"
      ? "taking no card in Act 2"
      : `the threshold ${THRESHOLD_TEXT[arm]}`
    : arm;
}

export function armShort(arm: string): string {
  if (arm === "s") return "baseline";
  return isTag(arm) ? THRESHOLD_TEXT[arm] : arm;
}

export interface ThreshTestInfo {
  readonly title: string;
  readonly asks: string;
}

/** What a test is, from its key and the arm the screen sent forward (T2 and T3 exist only then). */
export function testInfo(t: Pick<ThreshTest, "key" | "arm" | "baseline">): ThreshTestInfo {
  if (t.key === "T1")
    return {
      title: "Replication: 0.2 in Act 2",
      asks: "Does taking a card in Act 2 only if it is worth more than 0.2 win more games than the baseline on seeds nobody has played? (ADR-061's Act-2 result, repeated.)",
    };
  const choice = armShort(t.arm);
  if (t.key === "T2")
    return {
      title: `The screen's choice (${choice}) against the baseline`,
      asks: `Does the threshold the development screen chose, ${choice}, win more games than the baseline on seeds neither the screen nor ADR-061 used?`,
    };
  return {
    title: `The screen's choice (${choice}) against 0.2`,
    asks: `Does ${choice} win more games than 0.2, the threshold ADR-061 tested? (The pooled difference is the choice's minus 0.2's.)`,
  };
}

/** What a verdict says of the arm of a test against its baseline. */
export function verdictText(t: Pick<ThreshTest, "key" | "verdict">): string {
  const base = t.key === "T3" ? "0.2" : "the baseline";
  switch (t.verdict) {
    case "passed":
      return `wins more than ${base}`;
    case "reversed":
      return `wins fewer than ${base}`;
    case "not-shown":
      return `not shown to win more than ${base}`;
  }
}

export const CLASS_VERDICT_TEXT: Record<ThreshClassResult["verdict"], string> = {
  arm: "ahead",
  baseline: "behind",
  level: "not shown",
};

const n = (x: number): string => x.toLocaleString("en-US");

/** Points of a share, with its sign (wins are rare, so two digits). */
export function pts(x: number, digits = 2): string {
  return `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(digits)} points`;
}

export function pctShare(x: number, digits = 2): string {
  return `${(x * 100).toFixed(digits)} %`;
}

/** The net wins of a threshold against its baseline, with its sign. */
export function netText(x: number): string {
  return `${x >= 0 ? "+" : "−"}${n(Math.abs(x))}`;
}

/** The level of the interval a test is read at, as a percentage: 1 minus 0.05 divided by the number of tests played. */
export function levelText(level: number): string {
  return `${((1 - level) * 100).toFixed(2)} %`;
}

/** The level a test is read at, as the reader labels it ("0.05 / 3"); one test is read at the whole level, shown as "0.05". */
export function levelLabelText(label: string): string {
  return label.replace(/ \/ 1$/, "");
}

/** A floors figure with its sign (two decimals). */
const signedFloors = (x: number): string => `${x < 0 ? "−" : "+"}${Math.abs(x).toFixed(2)}`;

/** The tags of the arms as a person reads them, for the reason strings the reader writes ("t045" is 0.45). */
function plainTags(s: string): string {
  return s
    .replace(/\bt(010|020|030|045|060)\b/g, (m) => THRESHOLD_TEXT[m as ThreshTag])
    .replace(/\btnone\b/g, "taking no card in Act 2");
}

/** The one-sentence reading of a test, by its verdict and with its figures. */
export function testSentence(t: ThreshTest, level: number): string {
  const d = pts(t.difference);
  const ci = `${pts(t.ci[0] ?? 0)} to ${pts(t.ci[1] ?? 0)}`;
  const iv = levelText(level);
  const base = t.key === "T3" ? "0.2" : "the baseline";
  switch (t.verdict) {
    case "passed":
      return `Won more: ${pctShare(t.shares.arm)} of ${n(t.pairs)} paired games were won against ${pctShare(t.shares.baseline)} for ${base} (${d}; ${iv} interval ${ci}; exact ${formatP(t.p)}).`;
    case "reversed":
      return `Won fewer: ${pctShare(t.shares.arm)} against ${pctShare(t.shares.baseline)} for ${base} in ${n(t.pairs)} paired games (${d}; ${iv} interval ${ci}; exact ${formatP(t.p)}).`;
    case "not-shown":
      return `No difference shown: ${pctShare(t.shares.arm)} against ${pctShare(t.shares.baseline)} for ${base} won in ${n(t.pairs)} paired games (${d}; ${iv} interval ${ci}; exact ${formatP(t.p)}).`;
  }
}

/** Says so when a pass is narrow: the lower end of the interval is under a quarter of the difference (the rule of ADR-062 item 5, applied by the reader). */
export function narrowSentence(t: ThreshTest): string {
  const lo = t.ci[0] ?? 0;
  return `A narrow pass: the lower end of the interval is only ${pts(lo)} (about ${n(Math.round(lo * t.pairs))} games in ${n(t.pairs)} pairs), under a quarter of the difference, so it shows a direction and not a size.`;
}

/** Why a result the primary test would have called ahead or behind is read as not shown, naming every condition (empty when nothing was withheld). */
export function downgradeNote(t: ThreshTest): string {
  if (t.downgrades.length === 0) return "";
  const was = t.primaryVerdict === "passed" ? "ahead" : "behind";
  const reasons = t.downgrades.map((d) =>
    d === "excluded"
      ? `${pctShare(t.excludedFraction, 1)} of the pairs were dropped because a game did not end in a win or a death (the rule written down first allows a tenth)`
      : "the check on all pairs does not show the same difference at an exact p below 0.05",
  );
  return `The primary test alone would read the arm as ${was}, but the result is read as not shown because ${reasons.join(", and because ")}.`;
}

/** Which pairs were left out of the first analysis and why; how many lost both games (the two counts overlap) is derived from the counts the reader exports. */
export function excludedSentence(t: ThreshTest): string {
  const both = t.robust.notCompleted.arm + t.robust.notCompleted.baseline - t.excluded;
  return `${n(t.excluded)} of ${n(t.pairedSeeds)} pairs were left out of the first analysis because a game did not finish (a simulator error, a step or turn limit or a timeout), never read as a loss${both > 0 ? `; ${n(both)} of them lost both games` : ""}.`;
}

/**
 * The boss shares and the floors beside a test's reading (ADR-062 item 5: every page that says "passed" also gives the shares past the first and the second
 * boss). An arm plays the baseline's game until its first card reward of Act 2, which comes after the first boss, so that share is the same in every pair.
 */
export function bossSentence(t: ThreshTest): string {
  const a1 = t.actOne;
  const a2 = t.actTwo;
  const same = a1.armOnly === 0 && a1.baselineOnly === 0;
  const firstBoss = same
    ? `${pctShare(a1.shares.baseline, 1)} of the paired games got past the first boss with either arm, the same in every pair by construction`
    : `${pctShare(a1.shares.arm, 1)} of the paired games got past the first boss against ${pctShare(a1.shares.baseline, 1)} (${n(a1.armOnly)} pairs in which only the arm did, ${n(a1.baselineOnly)} in which only the baseline did)`;
  const f = t.floorDifference;
  const range = `95 % interval ${signedFloors(f.ci95[0] ?? 0)} to ${signedFloors(f.ci95[1] ?? 0)}`;
  const floors =
    Math.abs(f.meanAMinusB) < 0.005
      ? `the runs reached the same number of floors on average, to two decimals (${range})`
      : `the runs reached ${Math.abs(f.meanAMinusB).toFixed(2)} floors ${f.meanAMinusB < 0 ? "fewer" : "more"} on average (${range})`;
  return `Along the way: ${firstBoss}; ${pctShare(a2.shares.arm, 1)} got past the second boss against ${pctShare(a2.shares.baseline, 1)} (${n(a2.armOnly)} pairs only the arm, ${n(a2.baselineOnly)} only the baseline, exact ${formatP(a2.p)}; secondary and uncorrected); ${floors}.`;
}

/** The second analysis of a test: the same comparison on every pair, a game that did not end in a win counting as not won. */
export function robustSentence(t: ThreshTest): string {
  const r = t.robust;
  return `Checked again on all ${n(r.pairs)} pairs of games, a game that did not end in a win counting as not won (${n(r.notCompleted.arm)} of the arm's games and ${n(r.notCompleted.baseline)} of the baseline's ended in an error, a limit or a timeout): ${pctShare(r.shares.arm)} against ${pctShare(r.shares.baseline)} (${pts(r.difference)}, ${n(r.armOnly)} against ${n(r.baselineOnly)} pairs, exact ${formatP(r.p)}). An errored game cannot have been won; neither analysis says it would have been lost.`;
}

/** What the independent recomputation said about the intervals (empty when it agreed; the pooled file's interval governs either way). */
export function verificationNote(t: ThreshTest): string {
  const k = t.verification.bootstrapDisagreements.length;
  if (k === 0) return "";
  return `An independent resample of the intervals disagreed about ${String(k)} interval end${k === 1 ? "" : "s"} by more than the tolerance written down first; the interval above is the one the registration says governs, and the disagreement decides nothing.`;
}

/**
 * What the development screen found, in the words of the registered rule (ADR-062 item 3). The screen is a nomination on development seeds, not evidence: it
 * says which threshold goes forward to the held-out tests and nothing about whether any threshold is better.
 */
export function screenSentence(s: ThreshScreen): string {
  const best = s.best;
  const row = s.rows[best.arm];
  const label = THRESHOLD_TEXT[best.arm];
  const lead = `The threshold with the most net wins against the baseline on the development seeds was ${label} (${netText(best.net)} net wins in ${n(row.pairs)} pairs).`;
  if (s.choice.advance && s.choice.arm) {
    const h = s.headToHead;
    return `${lead} It goes forward: it is ahead of 0.2 in a head-to-head on the same development seeds${h ? ` (${n(h.armOnly)} games only it won against ${n(h.baselineOnly)} only 0.2 won, exact ${formatP(h.p)})` : ""}, so the held-out run tests it against the baseline and against 0.2 as well as repeating the test of 0.2.`;
  }
  return `${lead} Nothing goes forward beyond 0.2 (${plainTags(s.choice.reason)}), so the held-out run repeats the test of 0.2 against the baseline and nothing else. That is not evidence that the thresholds are alike.`;
}

function list(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] ?? ""}`;
}

/**
 * What each outcome means, as ADR-062 item 9 wrote it before any game of the study was played. Each test is read on its own, whatever the others show.
 * Returns the sentences in the order they are shown.
 */
export function meaningOf(results: Partial<Record<ThreshTestKey, ThreshTest>>): readonly string[] {
  const out: string[] = [];
  const t1 = results.T1;
  if (t1?.verdict === "passed")
    out.push(
      "T1 passed: the Act-2 result of ADR-061 is shown again on seeds nobody had played, pooled over Ironclad and Defect (each class on its own is in the table). It does not say why, and it does not say that 0.2 is the best threshold.",
    );
  else if (t1?.verdict === "reversed")
    out.push(
      "T1 reversed: the baseline won more than the pilot that skips cards in Act 2, which contradicts ADR-061's result and is reported as plainly as a gain would be.",
    );
  else if (t1)
    out.push(
      "T1 not shown: these games do not show that 0.2 in Act 2 wins more than the baseline. The record said beforehand that this is the expected outcome of a real effect a third the size ADR-061 saw and a likely one between a third and a half (its earlier figure was probably an overestimate), so it is not evidence of no effect, and ADR-061's result stands as one narrow pass of four tests, not replicated.",
    );
  const t2 = results.T2;
  if (t2)
    out.push(
      t2.verdict === "passed"
        ? `T2 passed: ${armShort(t2.arm)} wins more than the baseline on seeds neither the screen nor ADR-061 used.`
        : t2.verdict === "reversed"
          ? `T2 reversed: ${armShort(t2.arm)} wins fewer games than the baseline.`
          : `T2 not shown: these games do not show that ${armShort(t2.arm)} wins more than the baseline.`,
    );
  const t3 = results.T3;
  if (t3)
    out.push(
      t3.verdict === "passed"
        ? `T3 passed: ${armShort(t3.arm)} wins more than 0.2, so the threshold matters.`
        : t3.verdict === "reversed"
          ? `T3 reversed: ${armShort(t3.arm)} wins fewer games than 0.2.`
          : `T3 not shown: these games do not separate ${armShort(t3.arm)} from 0.2, which says nothing about their equality.`,
    );
  if (t2 && t1 && t2.verdict === "passed" && t1.verdict !== "passed")
    out.push(
      "A pass of T2 together with a T1 that is not shown is possible and is reported as it came out, as one of three tests read at 0.016667.",
    );
  return out;
}

/** A test's name inside a sentence ("the replication of 0.2 in Act 2"). */
function inSentence(t: Pick<ThreshTest, "key" | "arm">): string {
  if (t.key === "T1") return "the replication of 0.2 in Act 2";
  const choice = armShort(t.arm);
  return `the screen's choice (${choice}) against ${t.key === "T2" ? "the baseline" : "0.2"}`;
}

/** One sentence that says how the tests that were played came out (the cards carry every figure and caveat). */
export function resultLine(results: Partial<Record<ThreshTestKey, ThreshTest>>): string {
  const played = THRESH_TEST_KEYS.flatMap((k) => (results[k] ? [results[k]] : []));
  const part = (ts: readonly ThreshTest[]): string =>
    list(
      ts.map(
        (t) =>
          `${inSentence(t)} (${pctShare(t.shares.arm)} against ${pctShare(t.shares.baseline)} of the paired games won, ${pts(t.difference)})`,
      ),
    );
  const by = (v: ThreshVerdict) => played.filter((t) => t.verdict === v);
  const out: string[] = [];
  if (by("passed").length > 0) out.push(`Read as winning more games: ${part(by("passed"))}`);
  if (by("reversed").length > 0) out.push(`Read as winning fewer games: ${part(by("reversed"))}`);
  if (by("not-shown").length > 0)
    out.push(
      `${by("not-shown").length === played.length ? "None of the tests was shown to differ from its baseline" : "Not shown to differ"}: ${part(by("not-shown"))}`,
    );
  return `${out.join(". ")}.`;
}

/**
 * What follows for the advisor, as ADR-062 item 8 wrote it before any game was played: nothing changes because of this study alone; a simulated second
 * opinion could be offered only for a threshold whose own held-out test against the baseline passed, in a separate change with its own review.
 */
export function advisorNote(
  results: Partial<Record<ThreshTestKey, ThreshTest>>,
): readonly string[] {
  const out: string[] = ["The advisor does not change because of this study alone."];
  const passed: ThreshTest[] = [];
  for (const k of THRESH_TEST_KEYS) {
    const t = results[k];
    if (k !== "T3" && t?.verdict === "passed") passed.push(t);
  }
  if (passed.length === 0)
    out.push(
      "No threshold was shown to win more games than the baseline on these seeds, so there is nothing to offer, and nothing already published is withdrawn.",
    );
  else
    out.push(
      `${list(passed.map((t) => armShort(t.arm)))} passed its own test against the baseline. The project decided in advance (ADR-061, addendum B; ADR-062 item 8) that a simulated second opinion for such a threshold may be added as an opt-in, labelled as a simulated pilot's result with these figures beside it, for Ironclad and Defect only and in a separate change with its own review; this page does not add it.`,
    );
  return out;
}

/**
 * The first step after the held-out tests, for the open question "what wins a run": what the replication (T1) leaves undecided, in the order the project means to close it. Written for each
 * way T1 can come out before any held-out game was played; a pass of T2 is named beside it. Nothing already published is withdrawn by a reading that is not a pass (ADR-062 item 8).
 */
export function nextStep(results: Partial<Record<ThreshTestKey, ThreshTest>>): string {
  const t1 = results.T1;
  const t2 = results.T2;
  const choice =
    t2?.verdict === "passed"
      ? ` The development screen's choice, ${armName(t2.arm)}, also won more games than the baseline on seeds nobody had played (T2).`
      : "";
  const elsewhere =
    "Look for what moves the later acts elsewhere than in the card picks: the elite thresholds tuned again with the relics kept, or the relics themselves (the next two questions).";
  if (t1?.verdict === "passed")
    return `The Act-2 result of ADR-061 was shown again on seeds nobody had played (ADR-062).${choice} The advisor is unchanged: an opt-in, labelled simulated second opinion for 0.2 in Ironclad and Defect is a separate change with its own review, and other thresholds are still untested on held-out seeds; nothing about the live game has been compared.`;
  if (t1?.verdict === "reversed")
    return `ADR-062 contradicted the Act-2 result of ADR-061 on seeds nobody had played: the baseline won more. Nothing already published is withdrawn; that result was one narrow pass of four tests and has now been contradicted.${choice} ${elsewhere}`;
  return `ADR-062 did not show the Act-2 result of ADR-061 again on seeds nobody had played; not shown is not evidence of no effect, and the earlier result stands as one narrow pass of four tests, not replicated.${choice} ${elsewhere}`;
}
