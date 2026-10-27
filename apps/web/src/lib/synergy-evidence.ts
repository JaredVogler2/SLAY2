import synergy from "@/content/synergy.generated.json";

/**
 * What simulated runs say about the advisor's synergy term (ADR-050): the study's own numbers, exported by
 * scripts/export-site-data.mjs from experiments/synergy/*.json, so the panel quotes them instead of retyping them.
 */
export interface Interval {
  readonly mean: number;
  readonly ci95: readonly number[];
}

export interface PartRatio {
  /** log-odds per index point of this part, relative to the same for a point of the average card rating */
  readonly toQuality: number;
  readonly ci95: readonly number[];
}

/** The same runs with the unmet-need part split into one column per mechanic (descriptive; it changes no tag). */
export interface MechanicReading {
  readonly file: string;
  readonly sha256: string;
  readonly bootstrapDraws: number;
  /** the one slope for all needs together, as stage B1 reads it */
  readonly pooled: PartRatio;
  readonly rows: readonly {
    readonly mechanic: string;
    readonly label: string;
    /** boss fights of a deck that held a card needing this mechanic */
    readonly decks: number;
    /** index points the mechanic's unmet need took from the deck, on average (negative) */
    readonly meanPoints: number;
    readonly ratio: PartRatio;
  }[];
}

/** Stage B1: the index parts read against simulated runs that brought a randomly drafted deck to the Act-1 boss. */
export interface SynergyReading {
  readonly stage: string;
  readonly file: string;
  readonly sha256: string;
  readonly outcome: string;
  readonly bossFights: number;
  readonly passRate: number;
  readonly cohorts: readonly {
    readonly name: string;
    readonly character: string;
    readonly partition: string;
    readonly bossFights: number;
  }[];
  readonly logLoss: { readonly index: number; readonly indexAndSynergy: number };
  readonly auc: { readonly index: number; readonly indexAndSynergy: number };
  /** change in held-out log loss when the synergy term is added to the index (negative: it predicts better) */
  readonly synergyAdded: Interval;
  readonly enginesAdded: Interval;
  readonly ratios: {
    readonly needs: PartRatio;
    readonly scalers: PartRatio;
    readonly engines: PartRatio;
    readonly coverage: PartRatio;
  };
  readonly beyondCards: {
    readonly logLossCards: number;
    readonly logLossCardsAndParts: number;
    readonly gap: Interval;
  };
  readonly perCohortGain: Readonly<Record<string, Interval>>;
  readonly calibratedWeights: {
    readonly unmet: number;
    readonly scaler: number;
    readonly engines: number;
  };
  readonly mechanics: MechanicReading | null;
}

interface Rate {
  readonly games: number;
  readonly rate: number;
  readonly wilson95: readonly number[];
}

interface PairedTable {
  readonly a_only: number;
  readonly b_only: number;
  readonly both: number;
  readonly neither: number;
  readonly mcnemar_p: number;
}

interface Endpoint {
  readonly definition: string;
  readonly a: Rate;
  readonly b: Rate;
  readonly pairedTable: PairedTable;
}

export interface TestMember {
  readonly character: string;
  readonly a: { readonly batchId: string; readonly wins: number };
  readonly b: { readonly batchId: string; readonly wins: number };
  readonly pairedSeeds: number;
  readonly bothCompleted: number;
  readonly reachedAct2: {
    readonly a: number;
    readonly b: number;
    readonly pairedTable: PairedTable;
  };
  readonly meanFloorDifference: number;
}

/** One pooled, paired comparison of two arms on the held-out val seeds (five classes, one exact McNemar test). */
export interface PooledTest {
  readonly id: string;
  readonly contentSha256: string;
  readonly pairedSeeds: number;
  readonly bothCompleted: number;
  readonly excludedNotCompleted: number;
  /** games of each arm that ended in a simulator error or a timeout; the pairs they were in are left out of the test */
  readonly notFinished: { readonly a: number; readonly b: number };
  readonly reachedAct2: Endpoint;
  readonly reachedAct3: Endpoint;
  readonly wins: { readonly a: number; readonly b: number; readonly pairedTable: PairedTable };
  readonly floorDifference: { readonly meanAMinusB: number; readonly ci95: readonly number[] };
  /** the pooled difference in the share past the Act-1 boss, with an interval that resamples whole seeds */
  readonly clusteredDifference: { readonly meanAMinusB: number; readonly ci95: readonly number[] };
  readonly members: readonly TestMember[];
}

interface Measure {
  readonly n: number;
  readonly mean: number | null;
  readonly ci95: readonly number[] | null;
}

/** How often an arm skipped a card reward and what the decks it brought to the Act-1 boss held (slay2_sim.synergyreport). */
export interface ArmProfileSummary {
  readonly games: number;
  readonly offers: number;
  readonly skipped: number;
  readonly skipRate: { readonly value: number | null; readonly ci95: readonly number[] | null };
  readonly bossDecks: number;
  readonly atBoss: Readonly<
    Record<"unmet" | "scaler" | "engines" | "quality" | "deck_size", Measure>
  >;
}

export interface TestProfile {
  readonly sha256: string;
  readonly astar: ArmProfileSummary;
  readonly d0star: ArmProfileSummary;
  /** A* minus d0*, paired by class and seed over the games in which both brought a deck to the boss */
  readonly difference: {
    readonly pairs: number;
    readonly measures: Readonly<
      Record<"unmet" | "scaler" | "engines" | "quality" | "deck_size", Measure>
    >;
  };
}

/** The parameters of the pilot with the synergy term (ADR-050 addendum D): what the page's index keeps of each hand-set part. */
export interface SynergyConfig {
  readonly arm: string;
  readonly needs: number;
  readonly scalers: number;
  readonly engines: number;
  /** index points a card has to add before the pilot takes it instead of skipping (0: what the page does) */
  readonly margin: number;
}

/** The reading rule of ADR-050: "ahead" is significant with A* ahead, "not-shown" is not significant, "behind" is significant with the arm without the term ahead. */
export type Verdict = "ahead" | "not-shown" | "behind";

interface Selection {
  readonly sha256: string;
  readonly differences: Readonly<
    Record<
      string,
      {
        readonly difference: number;
        readonly ci95: readonly number[];
        readonly pairs: number;
        readonly mcnemarP: number;
      }
    >
  >;
}

/** Stage B2: the one registered held-out test of the synergy term (ADR-050). */
export interface SynergyTest {
  readonly tableSha256: string;
  /** the level fixed before any of these games */
  readonly alpha: number;
  readonly astar: SynergyConfig;
  /** what the development stage compared, and the hash of each selection file the addendum quotes */
  readonly selection: { readonly phase1: Selection; readonly phase2: Selection };
  /** A* against the same pilot without the synergy term at the same margin */
  readonly primary: PooledTest;
  /** the exporter's reading of `primary` (a `Verdict`; JSON cannot carry the union): the page recomputes it with `verdictOf` */
  readonly verdict: string;
  /** A* against the index without the term at margin 0 (only when A*'s margin is not 0) */
  readonly noTermAtZero: PooledTest | null;
  /** A* against the pilot that follows the measured card values */
  readonly measured: PooledTest;
  readonly profile: TestProfile | null;
}

/**
 * The registered test repeated with the relics kept (ADR-054): the same two arms on the same kind of seeds, in a simulator whose runs
 * keep the relics they gain (the first test was played in one that drops them, gap G14). One pooled comparison was registered.
 */
export interface SynergyKeepTest {
  readonly tableSha256: string;
  readonly alpha: number;
  readonly astar: SynergyConfig;
  readonly primary: PooledTest;
  /** the exporter's reading of `primary` (a `Verdict`); the page recomputes it with `verdictOf` */
  readonly verdict: string;
  readonly profile: TestProfile | null;
}

/** Stage B1 read again on random drafts played with the relics kept, with and without the relics a run held counted (ADR-053 item 6). */
export interface KeepReading {
  readonly file: string;
  readonly sha256: string;
  readonly outcome: string;
  readonly bossFights: number;
  /** boss decks of a run that held a relic the relic table tags, and those whose index parts the relics change */
  readonly withTaggedRelic: number;
  readonly partsDiffer: number;
  readonly passRate: number;
  readonly bootstrapDraws: number;
  readonly classAlone: KeepArm;
  readonly relicsCounted: KeepArm;
  /** held-out log loss with the relics counted minus without (negative: counting them predicts better) */
  readonly relicGain: Interval;
  readonly perClass: Readonly<Record<string, Interval & { readonly rows: number }>>;
}

export interface KeepArm {
  readonly logLoss: number;
  /** change in held-out log loss when the synergy term is added to the index, read this way */
  readonly synergyAdded: Interval;
  readonly ratios: {
    readonly needs: PartRatio;
    readonly scalers: PartRatio;
    readonly engines: PartRatio;
  };
}

export interface SynergyEvidence {
  readonly table: { readonly sha256: string; readonly cards: number; readonly mechanics: number };
  readonly b1: SynergyReading | null;
  readonly keep: KeepReading | null;
  readonly b2: SynergyTest | null;
  /** the registered test repeated with the relics kept (ADR-054); null until it has been run */
  readonly b2keep: SynergyKeepTest | null;
}

export const SYNERGY_EVIDENCE: SynergyEvidence = synergy;

/** The registered reading rule applied to the primary comparison's own numbers: the exact McNemar test of A* against the arm without the term. */
export function verdictOf(test: Pick<SynergyTest, "alpha" | "primary">): Verdict {
  const t = test.primary.reachedAct2.pairedTable;
  if (t.mcnemar_p >= test.alpha) return "not-shown";
  return t.a_only > t.b_only ? "ahead" : "behind";
}

const MINUS = "\u2212";

/** A number with a typographic minus, so a negative reads as one in a table of figures; a change too small to show has no sign. */
export function num(x: number, digits: number): string {
  const text = x.toFixed(digits);
  return Number(text) === 0 ? (0).toFixed(digits) : text.replace("-", MINUS);
}

export function range(ci: readonly number[], digits: number): string {
  return `${num(ci[0] ?? 0, digits)} to ${num(ci[1] ?? 0, digits)}`;
}

/** What the index keeps of a part of the synergy term, in words ("in full" is the first judgement). */
export function kept(weight: number): string {
  if (weight >= 1) return "in full";
  if (weight <= 0) return "not at all";
  return `at ${num(weight, 2)} of its first judgement`;
}

/** "0.96 (95 % 0.78 to 1.15)": what a point of a part is worth relative to a point of average card rating. */
export function part(r: PartRatio): string {
  return `${num(r.toQuality, 2)} (95 % ${range(r.ci95, 2)})`;
}

/** "-0.0084 (95 % -0.0101 to -0.0063)": a change in held-out log loss. */
export function change(g: Interval): string {
  return `${num(g.mean, 4)} (95 % ${range(g.ci95, 4)})`;
}
