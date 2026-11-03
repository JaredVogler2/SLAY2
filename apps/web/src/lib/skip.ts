import skipJson from "@/content/skip.generated.json";

/**
 * What a simulation says about the advisor's price of a slot (ADR-065): from the 21st card on, each card added costs one index point, so that the index
 * recommends skipping when nothing earns its place. The price is a judgement; the registered check asks only whether it does gross harm where a simulation can
 * see it (the pilot that charges it against the pilot that charges version 1's price, in each version of Act 1, five classes pooled, 2,000 held-out seeds each).
 * Exported by scripts/export-site-data.mjs from the registered record and, once they exist, the two pooled legs, read by the rule of the registration.
 */
export type SkipLegKey = "og" | "ud";

/** How a leg came out by the rule (ADR-065 item 4): not behind, or not shown to be harmless. */
export type SkipVerdict = "not-behind" | "not-shown-harmless";

type Interval = readonly [number, number];

export interface SkipClassRow {
  readonly pairs: number;
  readonly s1: number;
  readonly s0: number;
  readonly onlyS1: number;
  readonly onlyS0: number;
  readonly p: number;
  /** the baseline (version 1's price) was ahead in the class's own games at the class level (0.01, uncorrected) */
  readonly behind: boolean;
  /** the price of a slot was ahead there at that level */
  readonly ahead: boolean;
  readonly meanFloors: number;
}

interface SkipShare {
  readonly share: number | null;
  readonly cardRewards: number;
  readonly skipped: number;
}

export interface SkipLeg {
  readonly act1: "overgrowth" | "underdocks";
  readonly file: string;
  readonly sha256: string;
  readonly pairs: number;
  readonly bothCompleted: number;
  readonly excludedNotCompleted: number;
  readonly pastActOneBoss: {
    readonly s1: number;
    readonly s0: number;
    readonly onlyS1: number;
    readonly onlyS0: number;
    readonly exactP: number;
    readonly difference: number;
    readonly interval95: Interval;
  };
  readonly meanFloors: { readonly difference: number; readonly interval95: Interval };
  readonly wins: {
    readonly s1: number;
    readonly s0: number;
    readonly onlyS1: number;
    readonly onlyS0: number;
  };
  readonly notBehind: { readonly firstBoss: boolean; readonly meanFloors: boolean };
  readonly verdict: SkipVerdict;
  readonly classes: Readonly<Record<string, SkipClassRow>>;
  readonly skipShares: null | {
    readonly s1: SkipShare & { readonly byAct?: Readonly<Record<string, SkipShare>> };
    readonly s0: SkipShare;
  };
}

export interface SkipRegistered {
  readonly adr: string;
  readonly registered: true;
  readonly price: {
    readonly from: number;
    readonly perCard: number;
    readonly legacyFrom: number;
    readonly legacyPerCard: number;
  };
  readonly margins: {
    readonly firstBossShare: number;
    readonly meanFloors: number;
    readonly interval: number;
  };
  readonly classLevel: number;
  readonly seeds: number;
  readonly precondition: null | {
    readonly file: string;
    readonly sha256: string;
    readonly games: number;
    readonly minimumGapInSkipShare: number;
  };
  readonly result: null | {
    readonly legs: Readonly<Partial<Record<SkipLegKey, SkipLeg>>>;
    /** both legs not behind (null while only one leg is in) */
    readonly harmless: boolean | null;
  };
}

export type SkipData = SkipRegistered | { readonly registered: false };

export const SKIP = skipJson as unknown as SkipData;

export const LEG_NAMES: Readonly<Record<SkipLegKey, string>> = {
  og: "Overgrowth",
  ud: "Underdocks",
};

/** Where the check stands: not registered, registered and not run, one leg in, both legs not behind, or at least one leg not shown harmless. */
export type SkipStage = "none" | "registered" | "partial" | "harmless" | "not-shown";

export function skipLegs(data: SkipData): readonly [SkipLegKey, SkipLeg][] {
  if (!data.registered || !data.result) return [];
  return (["og", "ud"] as const).flatMap((k) => {
    const leg = data.result?.legs[k];
    return leg ? [[k, leg] as [SkipLegKey, SkipLeg]] : [];
  });
}

export function skipStage(data: SkipData = SKIP): SkipStage {
  if (!data.registered) return "none";
  const legs = skipLegs(data);
  if (legs.length === 0) return "registered";
  if (legs.some(([, leg]) => leg.verdict === "not-shown-harmless")) return "not-shown";
  return legs.length === 2 ? "harmless" : "partial";
}

const percent = (x: number): string => `${(x * 100).toFixed(1)} %`;
const sign = (x: number, digits: number): string =>
  `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(digits)}`;
const points = (x: number): string => `${sign(x * 100, 2)} points`;
const games = (n: number): string => n.toLocaleString("en-US");
const pText = (p: number): string =>
  p === 0 ? "p < 1e-300" : p < 1e-4 ? `p = ${p.toExponential(1)}` : `p = ${p.toPrecision(2)}`;

/** One leg's figures in words: the share past the first boss with its interval, and the mean floors with theirs. */
export function skipLegFigures(leg: SkipLeg): string {
  const b = leg.pastActOneBoss;
  const f = leg.meanFloors;
  return `${games(leg.bothCompleted)} paired games: the pilot that charges for a slot got past the Act 1 boss in ${percent(b.s1)} of them against ${percent(b.s0)} for version 1's price (${points(b.difference)}, 95 % interval ${sign(b.interval95[0] * 100, 2)} to ${sign(b.interval95[1] * 100, 2)}), and its mean floors reached differ by ${sign(f.difference, 2)} (95 % interval ${sign(f.interval95[0], 2)} to ${sign(f.interval95[1], 2)})`;
}

/** Which of the two conditions a leg failed, in words. */
function failed(leg: SkipLeg, data: SkipRegistered): string {
  const parts: string[] = [];
  if (!leg.notBehind.firstBoss)
    parts.push(
      `the lower end of the interval at the first boss is ${sign(leg.pastActOneBoss.interval95[0] * 100, 2)} points, not above ${sign(data.margins.firstBossShare * 100, 1)}`,
    );
  if (!leg.notBehind.meanFloors)
    parts.push(
      `the lower end of the interval of the floors is ${sign(leg.meanFloors.interval95[0], 2)}, not above ${sign(data.margins.meanFloors, 2)}`,
    );
  return parts.join(", and ");
}

const PRICE =
  "The price of a slot (one index point for every card from the 21st on) is a judgement, not a measurement.";

/**
 * What the advisor says beside a recommendation that the price touched (the deck has more than 20 cards): the state of the registered check, with its figures,
 * and nothing about winning (the pilot wins too few games for the check to see a benefit, and does not try).
 */
export function skipSentence(data: SkipData = SKIP): string | null {
  if (!data.registered) return null;
  const legs = skipLegs(data);
  switch (skipStage(data)) {
    case "none":
      return null;
    case "registered":
      return `${PRICE} A simulated check that it does no gross harm (a cost of a point at the first boss or of a quarter of a floor, against version 1's price) is registered and has not been run yet.`;
    case "harmless":
      return `${PRICE} It was checked in simulation, in both versions of Act 1, and no gross harm was found: ${legs
        .map(
          ([k, leg]) =>
            `in ${LEG_NAMES[k]} the pilot that charges it got past the first boss in ${percent(leg.pastActOneBoss.s1)} of its games against ${percent(leg.pastActOneBoss.s0)} for version 1's price`,
        )
        .join(
          ", and ",
        )}. A cost of a point at the first boss or of a quarter of a floor is ruled out; whether it helps could not be measured.`;
    case "partial": {
      const waiting = (["og", "ud"] as const).filter((k) => !legs.some(([done]) => done === k));
      return `${PRICE} The simulated check is half done: ${legs
        .map(
          ([k, leg]) =>
            `in ${LEG_NAMES[k]} the pilot that charges it got past the first boss in ${percent(leg.pastActOneBoss.s1)} of its games against ${percent(leg.pastActOneBoss.s0)} for version 1's price, which is not behind by the margins registered`,
        )
        .join(
          ", and ",
        )}; ${waiting.map((k) => LEG_NAMES[k]).join(" and ")} is still to come, and the check counts only when both are in.`;
    }
    case "not-shown":
      return `${PRICE} The simulated check did not show it harmless in ${legs
        .filter(([, leg]) => leg.verdict === "not-shown-harmless")
        .map(([k]) => LEG_NAMES[k])
        .join(
          " and ",
        )}: that is not a finding of harm, only that a gross harm could not be ruled out. The Methods page has the figures.`;
  }
}

/** Said on the line of a class whose own games had version 1's price ahead at the first boss (ADR-065 item 5), or null. */
export function skipClassLine(character: string, data: SkipData = SKIP): string | null {
  const lines = skipLegs(data).flatMap(([k, leg]) => {
    const row = leg.classes[character];
    return row?.behind
      ? [
          `In the simulated ${LEG_NAMES[k]} games of your own class alone, version 1's price came out ahead at the first boss: ${games(row.onlyS0)} pairs got past it only with version 1's price against ${games(row.onlyS1)} only with the price of a slot (${pText(row.p)}).`,
        ]
      : [];
  });
  return lines.length > 0 ? lines.join(" ") : null;
}

/** The figures and the verdict of each leg that is in, for the Methods page. */
export function skipLegSummary(
  key: SkipLegKey,
  leg: SkipLeg,
  data: SkipRegistered,
): { readonly title: string; readonly verdict: string; readonly text: string } {
  return {
    title: LEG_NAMES[key],
    verdict: leg.verdict === "not-behind" ? "not behind" : "not shown to be harmless",
    text:
      leg.verdict === "not-behind"
        ? `${skipLegFigures(leg)}.`
        : `${skipLegFigures(leg)}. The leg is not shown to be harmless: ${failed(leg, data)}.`,
  };
}
