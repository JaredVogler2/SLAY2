import {
  SYNERGY_EVIDENCE,
  verdictOf,
  type PooledTest,
  type SynergyEvidence,
  type SynergyKeepTest,
  type SynergyTest,
  type TestProfile,
} from "../../src/lib/synergy-evidence";

/**
 * A made-up result of the registered test of the synergy term, for the tests of what the pages say about each way it can come out.
 * The numbers are consistent with each other (an exact McNemar p-value from the discordant pairs); none of them is a simulation.
 */
export const CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"] as const;

/** Exact two-sided McNemar p-value from the two kinds of discordant pair. */
export function mcnemarP(a: number, b: number): number {
  const n = a + b;
  const k = Math.min(a, b);
  let logTerm = -n * Math.LN2;
  let cdf = Math.exp(logTerm);
  for (let i = 1; i <= k; i++) {
    logTerm += Math.log((n - i + 1) / i);
    cdf += Math.exp(logTerm);
  }
  return Math.min(1, 2 * cdf);
}

/** A pooled comparison whose five classes each contribute a fifth of the discordant pairs. */
export function fixturePooled(
  id: string,
  aOnly: number,
  bOnly: number,
  extra: Partial<PooledTest> = {},
): PooledTest {
  const both = 5000;
  const neither = 3000;
  const total = aOnly + bOnly + both + neither;
  const rate = (x: number) => x / total;
  const table = { a_only: aOnly, b_only: bOnly, both, neither, mcnemar_p: mcnemarP(aOnly, bOnly) };
  const share = (x: number) => x / CLASSES.length;
  return {
    id,
    contentSha256: "ab".repeat(32),
    pairedSeeds: 10000,
    bothCompleted: total,
    excludedNotCompleted: 10000 - total,
    notFinished: { a: 31, b: 27 },
    reachedAct2: {
      definition: "the run got past the Act-1 boss",
      a: { games: total, rate: rate(aOnly + both), wilson95: [0.5, 0.6] },
      b: { games: total, rate: rate(bOnly + both), wilson95: [0.5, 0.6] },
      pairedTable: table,
    },
    reachedAct3: {
      definition: "the run got past the Act-2 boss",
      a: { games: total, rate: 0.04, wilson95: [0.03, 0.05] },
      b: { games: total, rate: 0.035, wilson95: [0.03, 0.05] },
      pairedTable: { a_only: 60, b_only: 40, both: 300, neither: 9000, mcnemar_p: 0.06 },
    },
    wins: {
      a: 30,
      b: 25,
      pairedTable: { a_only: 10, b_only: 5, both: 20, neither: 9965, mcnemar_p: 0.3 },
    },
    floorDifference: { meanAMinusB: 0.4, ci95: [0.2, 0.6] },
    clusteredDifference: { meanAMinusB: (aOnly - bOnly) / total, ci95: [0.01, 0.03] },
    members: CLASSES.map((character) => ({
      character,
      a: { batchId: `a-${character}`, wins: 6 },
      b: { batchId: `b-${character}`, wins: 5 },
      pairedSeeds: 2000,
      bothCompleted: Math.round(total / 5),
      reachedAct2: {
        a: rate(aOnly + both),
        b: rate(bOnly + both),
        pairedTable: {
          a_only: share(aOnly),
          b_only: share(bOnly),
          both: share(both),
          neither: share(neither),
          mcnemar_p: 0.5,
        },
      },
      meanFloorDifference: 0.4,
    })),
    ...extra,
  };
}

const ARM_PROFILE = {
  games: 10000,
  offers: 40000,
  skipped: 4000,
  skipRate: { value: 0.1, ci95: [0.09, 0.11] },
  bossDecks: 9000,
  atBoss: {
    unmet: { n: 9000, mean: -0.42, ci95: [-0.45, -0.39] },
    scaler: { n: 9000, mean: 0.2, ci95: [0.18, 0.22] },
    engines: { n: 9000, mean: 0.1, ci95: [0.08, 0.12] },
    quality: { n: 9000, mean: 50, ci95: [49, 51] },
    deck_size: { n: 9000, mean: 14, ci95: [13.9, 14.1] },
  },
} as const;

const PROFILE: TestProfile = {
  sha256: "cd".repeat(32),
  astar: { ...ARM_PROFILE, skipped: 3200, skipRate: { value: 0.08, ci95: [0.07, 0.09] } },
  d0star: ARM_PROFILE,
  difference: {
    pairs: 8800,
    measures: {
      unmet: { n: 8800, mean: 0.11, ci95: [0.09, 0.13] },
      scaler: { n: 8800, mean: 0.01, ci95: [0, 0.02] },
      engines: { n: 8800, mean: 0.01, ci95: [0, 0.02] },
      quality: { n: 8800, mean: -0.3, ci95: [-0.5, -0.1] },
      deck_size: { n: 8800, mean: -0.2, ci95: [-0.3, -0.1] },
    },
  },
};

export function fixtureTest(aOnly: number, bOnly: number, margin = 0): SynergyTest {
  const primary = fixturePooled("pooled-astar-vs-d0star", aOnly, bOnly);
  const test: SynergyTest = {
    tableSha256: SYNERGY_EVIDENCE.table.sha256,
    alpha: 0.05,
    astar: { arm: "d2", needs: 1, scalers: 0.7, engines: 0.25, margin },
    selection: {
      phase1: {
        sha256: "11".repeat(32),
        differences: {
          d1: { difference: 0.004, ci95: [-0.004, 0.012], pairs: 4900, mcnemarP: 0.3 },
          d2: { difference: 0.009, ci95: [0.001, 0.017], pairs: 4900, mcnemarP: 0.03 },
        },
      },
      phase2: {
        sha256: "22".repeat(32),
        differences: {
          m1: { difference: -0.002, ci95: [-0.01, 0.006], pairs: 4900, mcnemarP: 0.6 },
        },
      },
    },
    primary,
    verdict: "x",
    noTermAtZero: margin === 0 ? null : fixturePooled("pooled-astar-vs-d0", 560, 500),
    measured: fixturePooled("pooled-astar-vs-rules_v3", 300, 700),
    profile: PROFILE,
  };
  return { ...test, verdict: verdictOf(test) };
}

/** A made-up result of the same test repeated with the relics kept (ADR-054): one pooled comparison, nothing else. */
export function fixtureKeepTest(aOnly: number, bOnly: number): SynergyKeepTest {
  const primary = fixturePooled("pooled-astar-vs-d0star-keep", aOnly, bOnly);
  const test: SynergyKeepTest = {
    tableSha256: SYNERGY_EVIDENCE.table.sha256,
    alpha: 0.05,
    astar: { arm: "d2", needs: 1, scalers: 0.7, engines: 0, margin: 0 },
    primary,
    verdict: "x",
    profile: null,
  };
  return { ...test, verdict: verdictOf(test) };
}

/** The evidence with the first test as given and the repeated test not run (whatever the real files hold). */
export function withTest(test: SynergyTest | null): SynergyEvidence {
  return { ...SYNERGY_EVIDENCE, b2: test, b2keep: null };
}

/** The evidence with both registered tests as given. */
export function withTests(
  first: SynergyTest | null,
  keep: SynergyKeepTest | null,
): SynergyEvidence {
  return { ...SYNERGY_EVIDENCE, b2: first, b2keep: keep };
}
