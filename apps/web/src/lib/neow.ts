import { OPENING_OPTIONS, getOpeningOption, type OpeningKind } from "@slay2/game-data";

import neow from "@/content/neow.generated.json";

/**
 * What simulated runs say about the opening Ancient's relics (ADR-041): the value of each relic as measured from randomised
 * choices, and the one held-out test of a pilot that takes the best-measured relic. Exported by scripts/export-site-data.mjs.
 */
export interface RelicMeasurement {
  /** the simulator's label for the relic */
  readonly label: string;
  readonly kind: string;
  /** log-odds of getting past the Act-1 boss from taking this relic, relative to the average relic taken */
  readonly beta: number;
  readonly ci95: readonly number[];
  readonly taken: number;
  readonly offered: number;
  readonly passRateTaken: number;
  readonly passRateOfferedNotTaken: number;
  /** games with this relic that ended in a simulator error or a timeout (never counted as losses) */
  readonly excluded: number;
  /** true when that count is higher than chance explains: the value rests on the games that finished */
  readonly exclusionFlag: boolean;
}

export interface ClassBaseline {
  readonly character: string;
  readonly games: number;
  readonly passRate: number;
  /** log-odds of getting past the Act-1 boss for this class with the average relic (the fit's intercept plus the class offset) */
  readonly baselineLogOdds: number;
}

export interface NeowValues {
  readonly file: string;
  readonly sha256: string;
  readonly outcome: string;
  readonly ascension: number;
  readonly profile: string;
  readonly games: number;
  readonly excludedGames: number;
  readonly passRate: number;
  readonly classes: readonly ClassBaseline[];
  readonly model: {
    readonly l2: number;
    readonly folds: number;
    readonly bootstrapDraws: number;
    readonly minTaken: number;
    readonly cvLogLoss: number;
    readonly cvAuc: number;
    readonly baselineLogLoss: number;
  };
  readonly batches: readonly { readonly id: string; readonly contentSha256: string }[];
  readonly relics: readonly RelicMeasurement[];
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

export interface NeowMember {
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

/** The held-out test of a pilot that takes the best-measured relic against one that takes the first helpful relic (ADR-041). */
export interface NeowTest {
  readonly id: string;
  readonly contentSha256: string;
  readonly valuesSha256: string;
  readonly a: string;
  readonly b: string;
  /** significance level fixed before the test */
  readonly alpha: number;
  readonly pairedSeeds: number;
  readonly bothCompleted: number;
  readonly excludedNotCompleted: number;
  readonly reachedAct2: Endpoint;
  readonly reachedAct3: Endpoint;
  readonly wins: {
    readonly a: number;
    readonly b: number;
    readonly pairedTable: PairedTable;
  };
  readonly floorDifference: { readonly meanAMinusB: number; readonly ci95: readonly number[] };
  readonly members: readonly NeowMember[];
  readonly role: string;
  /** improved the primary endpoint at the pre-registered level */
  readonly passed: boolean;
}

export interface NeowData {
  readonly values: NeowValues | null;
  readonly test: NeowTest | null;
}

/** The data the exporter wrote: what the pages show. Tests pass their own `NeowData` to the functions below. */
export const NEOW: NeowData = neow;
const DATA = NEOW;

export function neowValues(data: NeowData = DATA): NeowValues | null {
  return data.values;
}

export function neowTest(data: NeowData = DATA): NeowTest | null {
  return data.test;
}

/**
 * Whether taking the best-measured relic beat taking the first helpful one in the pre-registered held-out test. Until it has,
 * and when it did not, the values are shown as measurements and the site never says what a pilot "would take".
 */
export function ruleValidated(data: NeowData = DATA): boolean {
  return data.test?.passed === true;
}

// ---- the simulator's labels onto the catalog's option ids ("Neows Talisman" is NEOWS_TALISMAN)
const squash = (s: string): string => s.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
const ID_BY_SQUASHED = new Map(OPENING_OPTIONS.map((o) => [squash(o.id), o.id]));

/** The catalog option id of a measured relic's label, or nothing when the catalog does not know it. */
export function optionIdOfLabel(label: string): string | undefined {
  return ID_BY_SQUASHED.get(squash(label));
}

export interface RelicValue extends RelicMeasurement {
  /** the catalog option id */
  readonly id: string;
  readonly name: string;
  readonly optionKind: OpeningKind;
}

/** Every measured relic with its catalog id, best first. A label the catalog does not know is dropped (a test pins that none is). */
export function relicValues(data: NeowData = DATA): readonly RelicValue[] {
  const out: RelicValue[] = [];
  for (const r of data.values?.relics ?? []) {
    const id = optionIdOfLabel(r.label);
    const option = id ? getOpeningOption(id) : undefined;
    if (id && option) {
      out.push({ ...r, id, name: option.name, optionKind: option.kind });
    }
  }
  return out.sort((a, b) => b.beta - a.beta || (a.id < b.id ? -1 : 1));
}

export function relicValue(optionId: string, data: NeowData = DATA): RelicValue | undefined {
  return relicValues(data).find((r) => r.id === optionId);
}

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

/** What the simulated runs of a class got to, and the log-odds that go with it (the average relic's chance). */
export function classBaseline(character: string, data: NeowData = DATA): ClassBaseline | undefined {
  return data.values?.classes.find((c) => c.character === character);
}

export interface Chance {
  /** chance of getting past the Act-1 boss, 0 to 1 */
  readonly mid: number;
  readonly lo: number;
  readonly hi: number;
}

/**
 * The simulated chance of getting past the Act-1 boss for a class that takes a relic: the class's chance with the average
 * relic moved by the relic's value, and by the ends of its 95 % interval. The fit has one value per relic for all classes and
 * a separate starting point per class, so the same value moves a class that rarely gets past the boss (Silent, 36 %) by more
 * points than one that almost always does (Defect, 90 %).
 */
export function chanceWith(
  character: string,
  r: Pick<RelicMeasurement, "beta" | "ci95">,
  data: NeowData = DATA,
): Chance | undefined {
  const base = classBaseline(character, data);
  const [lo, hi] = r.ci95;
  if (!base || lo === undefined || hi === undefined) {
    return undefined;
  }
  return {
    mid: sigmoid(base.baselineLogOdds + r.beta),
    lo: sigmoid(base.baselineLogOdds + lo),
    hi: sigmoid(base.baselineLogOdds + hi),
  };
}

/** A class's chance with the average relic. */
export function averageChance(character: string, data: NeowData = DATA): number | undefined {
  const base = classBaseline(character, data);
  return base ? sigmoid(base.baselineLogOdds) : undefined;
}

/** One relic on the table in front of the player. */
export interface OfferLine {
  readonly id: string;
  readonly name: string;
  readonly kind: OpeningKind;
  /** the measurement, or nothing when the relic was not measured (it then counts as the average, as in the tested rule) */
  readonly value: RelicValue | undefined;
}

/**
 * `clear`: the best of the offer is measured to be better than the next, the 95 % intervals do not overlap.
 * `close`: they overlap (or one is unmeasured), the simulated runs cannot tell them apart.
 * `alone`: one relic is on the table, `none`: nothing is.
 */
export type Separation = "clear" | "close" | "alone" | "none";

export interface OfferAssessment {
  /** in the order the player gave them */
  readonly lines: readonly OfferLine[];
  /** the relic the tested rule takes: the largest value, ties to the first of the player's slots; nothing for an empty offer */
  readonly best: OfferLine | undefined;
  readonly runnerUp: OfferLine | undefined;
  readonly separation: Separation;
}

const valueOf = (l: OfferLine): number => l.value?.beta ?? 0;

/**
 * Compare the relics Neow offered. The rule is the one that was tested (ADR-041 item 4): take the offered relic with the largest
 * measured value, the first of the player's slots on a tie; a relic that was not measured counts as 0, the average. Whether the
 * result may be shown as advice is `ruleValidated`'s call, not this function's.
 */
export function assessOffer(offered: readonly string[], data: NeowData = DATA): OfferAssessment {
  const lines: OfferLine[] = [];
  for (const id of offered) {
    const option = getOpeningOption(id);
    if (option && !lines.some((l) => l.id === id)) {
      lines.push({ id, name: option.name, kind: option.kind, value: relicValue(id, data) });
    }
  }
  if (lines.length === 0) {
    return { lines, best: undefined, runnerUp: undefined, separation: "none" };
  }
  // a stable sort by value, descending: the first slot wins a tie
  const ranked = lines
    .map((line, slot) => ({ line, slot }))
    .sort((a, b) => valueOf(b.line) - valueOf(a.line) || a.slot - b.slot)
    .map((x) => x.line);
  const best = ranked[0];
  const runnerUp = ranked[1];
  if (!best || !runnerUp) {
    return { lines, best, runnerUp: undefined, separation: "alone" };
  }
  const bestLow = best.value?.ci95[0];
  const nextHigh = runnerUp.value?.ci95[1];
  const clear = bestLow !== undefined && nextHigh !== undefined && bestLow > nextHigh;
  return { lines, best, runnerUp, separation: clear ? "clear" : "close" };
}

/**
 * What the site may say about an offer. `take` is the only verdict that names a relic as the one a simulated pilot would take,
 * and it exists only after the registered test showed that such a pilot got past the Act-1 boss more often than one that took
 * the first helpful relic (ADR-041 item 5); with a failed or missing test the measurements are shown and nothing is advised.
 */
export type OfferVerdict =
  | { readonly kind: "empty" }
  | { readonly kind: "single" }
  | { readonly kind: "untested" }
  | { readonly kind: "not-improved"; readonly test: NeowTest }
  | {
      readonly kind: "take";
      readonly best: OfferLine;
      readonly runnerUp: OfferLine;
      readonly separation: "clear" | "close";
      readonly test: NeowTest;
    };

export function offerVerdict(a: OfferAssessment, data: NeowData = DATA): OfferVerdict {
  if (a.separation === "none") {
    return { kind: "empty" };
  }
  if (a.separation === "alone" || !a.best || !a.runnerUp) {
    return { kind: "single" };
  }
  const test = data.test;
  if (test === null) {
    return { kind: "untested" };
  }
  if (!test.passed) {
    return { kind: "not-improved", test };
  }
  return {
    kind: "take",
    best: a.best,
    runnerUp: a.runnerUp,
    separation: a.separation,
    test,
  };
}

const pct1 = (x: number): string => `${(x * 100).toFixed(1)}%`;
const pText = (p: number): string =>
  p === 0 ? "p < 1e-300" : `p = ${p < 1e-4 ? p.toExponential(1) : p.toPrecision(2)}`;

export type NeowCoverageState = "validated" | "measured" | "untested" | "none";

/** Where the opening-relic values stand, in words, read from the data: nothing, measured, tested without improvement, or tested and improved. */
export function neowCoverage(data: NeowData = DATA): {
  readonly state: NeowCoverageState;
  readonly detail: string;
} {
  const v = data.values;
  if (!v) {
    return { state: "none", detail: "not measured yet" };
  }
  const measured = `${String(v.relics.length)} relics measured in ${v.games.toLocaleString("en-US")} simulated games`;
  const t = data.test;
  if (!t) {
    return { state: "untested", detail: `${measured}, not tested against play yet` };
  }
  const result = `${pct1(t.reachedAct2.a.rate)} of ${t.bothCompleted.toLocaleString("en-US")} held-out simulated games got past the Act-1 boss against ${pct1(t.reachedAct2.b.rate)} when the first helpful relic was taken (${pText(t.reachedAct2.pairedTable.mcnemar_p)})`;
  return t.passed
    ? {
        state: "validated",
        detail: `${measured}; taking the best-measured relic: ${result}`,
      }
    : {
        state: "measured",
        detail: `${measured}; taking the best-measured relic did not beat the first helpful one at the pre-registered level: ${result}`,
      };
}
