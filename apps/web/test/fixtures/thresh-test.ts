import type {
  ThreshClassResult,
  ThreshData,
  ThreshDowngrade,
  ThreshHead,
  ThreshScreen,
  ThreshScreenRow,
  ThreshStage,
  ThreshTag,
  ThreshTest,
  ThreshTestKey,
  ThreshVerdict,
} from "../../src/lib/thresh";
import { mcnemarP } from "./synergy-test";

/**
 * A made-up result of the threshold study (ADR-062), for the tests of what the pages say at each stage and for each way the tests can come out. The numbers are
 * consistent with each other (an exact McNemar p-value from the discordant pairs, shares from the counts); none of them is a simulation.
 */
const CLASSES = ["ironclad", "defect"] as const;
const TAGS: readonly ThreshTag[] = ["t010", "t020", "t030", "t045", "t060", "tnone"];
const GRID: Record<ThreshTag, number> = {
  t010: 0.1,
  t020: 0.2,
  t030: 0.3,
  t045: 0.45,
  t060: 0.6,
  tnone: 100,
};
const DEV_PAIRS = 5_700;
const DEV_DISCORDANT = 195;
const PAIRS = 28_000;
const BASE_WINS = 300;

/** The discordant wins (arm only, baseline only) of a verdict; "not-shown" is a dead heat. */
const DISCORDANT: Record<ThreshVerdict, readonly [number, number]> = {
  passed: [300, 200],
  reversed: [200, 300],
  "not-shown": [100, 100],
};

export const QUIET_NETS: Record<ThreshTag, number> = {
  t010: 5,
  t020: 20,
  t030: 12,
  t045: 8,
  t060: -3,
  tnone: -20,
};
export const PEAK_NETS: Record<ThreshTag, number> = { ...QUIET_NETS, t030: 70 };

export interface ThreshFixtureOptions {
  readonly stage: ThreshStage;
  /** the screen's nets (default: 0.2 on top, so nothing goes forward); a peak elsewhere that beats 0.2 head to head goes forward */
  readonly nets?: Record<ThreshTag, number>;
  readonly verdicts?: Partial<Record<ThreshTestKey, ThreshVerdict>>;
  /** the conditions that withhold a reading the primary test would have granted (only meaningful for a verdict of not-shown) */
  readonly downgrades?: Partial<Record<ThreshTestKey, readonly ThreshDowngrade[]>>;
  readonly disagreements?: Partial<Record<ThreshTestKey, number>>;
  /** make the pass of the first test narrow */
  readonly narrow?: boolean;
}

function screenRow(tag: ThreshTag, net: number): ThreshScreenRow {
  const armOnly = Math.round((DEV_DISCORDANT + net) / 2);
  const baselineOnly = DEV_DISCORDANT - armOnly;
  const both = 90;
  const real = armOnly - baselineOnly;
  return {
    tag,
    threshold: GRID[tag],
    pairs: DEV_PAIRS,
    excluded: 44,
    wins: { arm: armOnly + both, baseline: baselineOnly + both },
    shares: { arm: (armOnly + both) / DEV_PAIRS, baseline: (baselineOnly + both) / DEV_PAIRS },
    difference: real / DEV_PAIRS,
    armOnly,
    baselineOnly,
    net: real,
    p: mcnemarP(armOnly, baselineOnly),
    pastAct1Boss: { arm: 0.67, baseline: 0.67 },
    pastAct2Boss: { arm: 0.11, baseline: 0.105 },
    meanFloorDifference: 0.4,
    meanDeckSize: {
      arm: 24.3 - (GRID[tag] > 1 ? 3.7 : GRID[tag] * 6),
      baseline: 24.3,
      pairs: DEV_PAIRS,
    },
    wallClockPairs: 0,
  };
}

function screen(nets: Record<ThreshTag, number>, advance: boolean): ThreshScreen {
  const rows = Object.fromEntries(TAGS.map((t) => [t, screenRow(t, nets[t])])) as Record<
    ThreshTag,
    ThreshScreenRow
  >;
  let best: ThreshTag = TAGS[0] ?? "t010";
  for (const t of TAGS) if (rows[t].net > rows[best].net) best = t;
  const row = rows[best];
  const head: ThreshHead | null =
    row.net > 0 && best !== "t020"
      ? advance
        ? { armOnly: 120, baselineOnly: 70, net: 50, p: mcnemarP(120, 70), pairs: DEV_PAIRS }
        : { armOnly: 90, baselineOnly: 85, net: 5, p: mcnemarP(90, 85), pairs: DEV_PAIRS }
      : null;
  const tests = [
    { key: "T1" as const, arm: "t020", baseline: "s" },
    ...(advance
      ? [
          { key: "T2" as const, arm: best, baseline: "s" },
          { key: "T3" as const, arm: best, baseline: "t020" },
        ]
      : []),
  ];
  return {
    rows,
    best: { arm: best, threshold: GRID[best], net: row.net },
    headToHead: head,
    choice: {
      arm: advance ? best : null,
      threshold: advance ? GRID[best] : null,
      advance,
      reason: advance
        ? `${best} is ahead of 0.2 in the head-to-head`
        : best === "t020"
          ? "0.2 itself had the largest net wins, so the held-out run has nothing to add to T1"
          : `${best} is not ahead of 0.2 in the head-to-head at an exact p below 0.2`,
    },
    tests,
    level: 0.05 / tests.length,
    role: "development: not a held-out result",
  };
}

function classRow(
  character: (typeof CLASSES)[number],
  arm: readonly [number, number],
): ThreshClassResult {
  const a = Math.round(arm[0] * 0.55);
  const b = Math.round(arm[1] * 0.55);
  const both = 150;
  const pairs = 14_000;
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
    actOne: { arm: 0.67, baseline: 0.67 },
    meanFloorDifference: 0.3,
  };
}

export function threshTest(
  key: ThreshTestKey,
  arm: string,
  baseline: string,
  verdict: ThreshVerdict,
  options: Pick<ThreshFixtureOptions, "downgrades" | "disagreements" | "narrow"> = {},
): ThreshTest {
  const [a, b] = DISCORDANT[verdict];
  const baselineWins = BASE_WINS + b;
  const armWins = BASE_WINS + a;
  const diff = (a - b) / PAIRS;
  const downgrades = options.downgrades?.[key] ?? [];
  const reading: ThreshVerdict = downgrades.length > 0 ? "not-shown" : verdict;
  const narrow = options.narrow === true && key === "T1" && reading === "passed";
  const lo = narrow ? diff * 0.1 : diff - 0.0012;
  return {
    key,
    arm,
    baseline,
    file: `experiments/thresh/pooled-thresh-${key}.json`,
    sha256: key.toLowerCase().padEnd(64, "ab"),
    pairs: PAIRS,
    pairedSeeds: 30_000,
    excluded: 2_000,
    shares: { arm: armWins / PAIRS, baseline: baselineWins / PAIRS },
    wins: { arm: armWins, baseline: baselineWins },
    difference: diff,
    ci: [lo, diff + 0.0012],
    ci95: [lo, diff + 0.001],
    armOnly: a,
    baselineOnly: b,
    p: mcnemarP(a, b),
    verdict: reading,
    primaryVerdict: verdict,
    downgrade: downgrades[0] ?? null,
    downgrades,
    narrow,
    excludedFraction: downgrades.includes("excluded") ? 0.14 : 0.067,
    verification: {
      exactChecks: 56,
      bootstrapChecks: 60,
      bootstrapDisagreements: Array.from(
        { length: options.disagreements?.[key] ?? 0 },
        (_, i) => `interval end ${String(i)} differs`,
      ),
    },
    robust: {
      pairs: 30_000,
      notCompleted: { arm: 900, baseline: 950 },
      wins: { arm: armWins, baseline: baselineWins },
      shares: { arm: armWins / 30_000, baseline: baselineWins / 30_000 },
      difference: diff,
      armOnly: downgrades.includes("robustness") ? 250 : a,
      baselineOnly: downgrades.includes("robustness") ? 250 : b,
      p: downgrades.includes("robustness") ? 1 : mcnemarP(a, b),
    },
    actOne: { shares: { arm: 0.67, baseline: 0.67 }, armOnly: 0, baselineOnly: 0, p: 1 },
    actTwo: { shares: { arm: 0.114, baseline: 0.105 }, armOnly: 900, baselineOnly: 700, p: 0.005 },
    floorDifference: { meanAMinusB: 0.4, ci95: [0.2, 0.6] },
    perClass: CLASSES.map((c) => classRow(c, [a, b])),
  };
}

/** The study at the stage "registered" (nothing), "screened" (the development screen) or "tested" (the screen and the tests the verdicts name). */
export function threshFixture(options: ThreshFixtureOptions): ThreshData {
  const base = {
    adr: "ADR-062",
    registered: true,
    frozen: true,
    studyLevel: 0.05,
    classLevel: 0.01,
    seeds: 15_000,
    devSeeds: 3_000,
  } as const;
  if (options.stage === "registered")
    return { ...base, partTwo: false, stage: "registered", screen: null, tests: null };
  const nets = options.nets ?? QUIET_NETS;
  const peak = TAGS.reduce<ThreshTag>((b, t) => (nets[t] > nets[b] ? t : b), "t010");
  const advance = nets[peak] > 0 && peak !== "t020" && nets[peak] - nets.t020 >= 30;
  const scr = screen(nets, advance);
  if (options.stage === "screened")
    return {
      ...base,
      partTwo: true,
      stage: "screened",
      level: scr.level,
      devHead: "d".repeat(40),
      screen: scr,
      tests: null,
    };
  const results = Object.fromEntries(
    scr.tests.map((t) => [
      t.key,
      threshTest(t.key, t.arm, t.baseline, options.verdicts?.[t.key] ?? "not-shown", options),
    ]),
  ) as Partial<Record<ThreshTestKey, ThreshTest>>;
  return {
    ...base,
    partTwo: true,
    stage: "tested",
    level: scr.level,
    devHead: "d".repeat(40),
    screen: scr,
    tests: {
      results,
      order: scr.tests.map((t) => t.key),
      level: scr.level,
      levelLabel: `0.05 / ${String(scr.tests.length)}`,
    },
    identity: Object.fromEntries(
      scr.tests
        .filter((t) => t.arm !== "s" && t.key !== "T3")
        .map((t) => [t.arm, { beforePairs: 4_800, bossPairs: 28_000, wallClockPairs: 2 }]),
    ),
  };
}
