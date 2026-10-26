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
}

export interface SynergyEvidence {
  readonly table: { readonly sha256: string; readonly cards: number; readonly mechanics: number };
  readonly b1: SynergyReading | null;
}

export const SYNERGY_EVIDENCE: SynergyEvidence = synergy;

const MINUS = "\u2212";

/** A number with a typographic minus, so a negative reads as one in a table of figures; a change too small to show has no sign. */
export function num(x: number, digits: number): string {
  const text = x.toFixed(digits);
  return Number(text) === 0 ? (0).toFixed(digits) : text.replace("-", MINUS);
}

export function range(ci: readonly number[], digits: number): string {
  return `${num(ci[0] ?? 0, digits)} to ${num(ci[1] ?? 0, digits)}`;
}

/** "0.96 (95 % 0.78 to 1.15)": what a point of a part is worth relative to a point of average card rating. */
export function part(r: PartRatio): string {
  return `${num(r.toQuality, 2)} (95 % ${range(r.ci95, 2)})`;
}

/** "-0.0084 (95 % -0.0101 to -0.0063)": a change in held-out log loss. */
export function change(g: Interval): string {
  return `${num(g.mean, 4)} (95 % ${range(g.ci95, 4)})`;
}
