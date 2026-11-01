import type {
  ActsClassResult,
  ActsData,
  ActsDowngrade,
  ActsTest,
  ActsTestKey,
  ActsVerdict,
} from "../../src/lib/acts";
import { mcnemarP } from "./synergy-test";

/**
 * A made-up result of the acts study (ADR-061), for the tests of what the pages say about each way it can come out. The numbers are consistent
 * with each other (an exact McNemar p-value from the discordant pairs, shares from the counts); none of them is a simulation.
 */
const CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"] as const;
const PAIRS = 14_500;
const KEYS: readonly ActsTestKey[] = ["L", "A1", "A2", "A3"];
const ACTS: Record<ActsTestKey, readonly number[]> = { L: [0, 1, 2], A1: [0], A2: [1], A3: [2] };
const ARM: Record<ActsTestKey, string> = { L: "lead", A1: "a1", A2: "a2", A3: "a3" };

/** The discordant wins (arm only, baseline only) of a verdict; "not-shown" is a dead heat. */
const DISCORDANT: Record<ActsVerdict, readonly [number, number]> = {
  passed: [300, 200],
  reversed: [200, 300],
  "not-shown": [100, 100],
};

export interface ActsFixtureOptions {
  /** the conditions that withhold a reading the primary test would have granted (only meaningful for a verdict of not-shown) */
  readonly downgrades?: Partial<Record<ActsTestKey, readonly ActsDowngrade[]>>;
  readonly disagreements?: Partial<Record<ActsTestKey, number>>;
}

function classRow(
  character: (typeof CLASSES)[number],
  i: number,
  arm: readonly [number, number],
): ActsClassResult {
  // Ironclad and Defect carry the wins; Silent and Necrobinder have none
  const winners = character === "ironclad" || character === "defect";
  const [a, b] = winners ? [Math.round(arm[0] * 0.45), Math.round(arm[1] * 0.45)] : [0, 0];
  const both = winners ? 40 : 0;
  const pairs = 2_900;
  const p = mcnemarP(a, b);
  return {
    character,
    pairs,
    wins: { arm: a + both, baseline: b + both },
    shares: { arm: (a + both) / pairs, baseline: (b + both) / pairs },
    difference: (a - b) / pairs,
    armOnly: a,
    baselineOnly: b,
    p,
    verdict: p >= 0.01 || a === b ? "level" : a > b ? "arm" : "baseline",
    actOne: { arm: 0.6 + i / 100, baseline: 0.6 + i / 100 },
    meanFloorDifference: 0,
  };
}

export function actsTest(
  key: ActsTestKey,
  verdict: ActsVerdict,
  options: ActsFixtureOptions = {},
): ActsTest {
  const [a, b] = DISCORDANT[verdict];
  const both = 100;
  const baselineWins = b + both;
  const armWins = a + both;
  const diff = (a - b) / PAIRS;
  const downgrades = options.downgrades?.[key] ?? [];
  const reading: ActsVerdict = downgrades.length > 0 ? "not-shown" : verdict;
  const price = ACTS[key].includes(0);
  const first = Math.min(...ACTS[key]);
  const sameAfterOne = first >= 1;
  const sameAfterTwo = first >= 2;
  const act1 = sameAfterOne ? [0, 0] : [650, 1200];
  const act2 = sameAfterTwo ? [0, 0] : [900, 700];
  return {
    key,
    arm: ARM[key],
    acts: ACTS[key],
    file: `experiments/acts/pooled-acts-${key}.json`,
    sha256: key.toLowerCase().padEnd(64, "ab"),
    pairs: PAIRS,
    pairedSeeds: 15_000,
    excluded: 500,
    notFinished: { a: 250, b: 250 },
    shares: { arm: armWins / PAIRS, baseline: baselineWins / PAIRS },
    wins: { arm: armWins, baseline: baselineWins },
    difference: diff,
    ci: [diff - 0.0012, diff + 0.0012],
    ci95: [diff - 0.001, diff + 0.001],
    armOnly: a,
    baselineOnly: b,
    p: mcnemarP(a, b),
    verdict: reading,
    primaryVerdict: verdict,
    downgrade: downgrades[0] ?? null,
    downgrades,
    excludedFraction: downgrades.includes("excluded") ? 0.14 : 0.033,
    verification: {
      exactChecks: 92,
      bootstrapChecks: 98,
      bootstrapDisagreements: Array.from(
        { length: options.disagreements?.[key] ?? 0 },
        (_, i) => `interval end ${String(i)} differs`,
      ),
    },
    robust: {
      pairs: 15_000,
      notCompleted: { arm: 480, baseline: 510 },
      wins: { arm: armWins, baseline: baselineWins },
      shares: { arm: armWins / 15_000, baseline: baselineWins / 15_000 },
      difference: diff,
      armOnly: downgrades.includes("robustness") ? 250 : a,
      baselineOnly: downgrades.includes("robustness") ? 250 : b,
      p: downgrades.includes("robustness") ? 1 : mcnemarP(a, b),
    },
    actOne: {
      shares: { arm: price ? 0.61 : 0.67, baseline: 0.67 },
      armOnly: act1[0] ?? 0,
      baselineOnly: act1[1] ?? 0,
      p: 1e-30,
    },
    actTwo: {
      shares: { arm: 0.114, baseline: 0.105 },
      armOnly: act2[0] ?? 0,
      baselineOnly: act2[1] ?? 0,
      p: 0.005,
    },
    floorDifference: { meanAMinusB: price ? -0.78 : 0.01, ci95: [-0.9, -0.6] },
    perClass: CLASSES.map((c, i) => classRow(c, i, [a, b])),
  };
}

/** The study at the stage "registered" (no tests), or with the four tests as the verdicts say. */
export function actsFixture(
  verdicts: Partial<Record<ActsTestKey, ActsVerdict>> | null,
  options: ActsFixtureOptions = {},
): ActsData {
  const base = {
    adr: "ADR-061",
    registered: true,
    level: 0.0125,
    classLevel: 0.01,
    seeds: 3_000,
    frozen: true,
  } as const;
  if (verdicts === null) return { ...base, tests: null };
  const results = Object.fromEntries(
    KEYS.map((k) => [k, actsTest(k, verdicts[k] ?? "not-shown", options)]),
  ) as Record<ActsTestKey, ActsTest>;
  return { ...base, tests: { results } };
}
