// @vitest-environment node
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { mcnemarP } from "./fixtures/synergy-test";

vi.setConfig({ testTimeout: 30_000 });

/**
 * `scripts/lib/underdocks.mjs` reads the Underdocks transfer study (ADR-064) only when everything it rests on belongs together. These
 * tests build a small repository (the registration with the hashes it quotes, the files the arms read, thirty synthetic batches played in
 * Underdocks, the three pooled results and the Overgrowth twins they are set beside; no simulated game is involved, the counts are only
 * consistent with each other) and break one thing at a time.
 */
const repo = join(__dirname, "..", "..", "..");
const CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"] as const;
const EXACT: Record<string, string> = {
  ironclad: "Ironclad",
  silent: "Silent",
  regent: "Regent",
  necrobinder: "Necrobinder",
  defect: "Defect",
};
const HEAD = "a".repeat(40);

type Json = Record<string, unknown>;
type Key = "synergy" | "values" | "neow";
type Verdict = "passed" | "not-shown" | "reversed";
type Parse = (args: {
  root: string;
  reports: Json[];
  udReports: Json[];
  synergyChoice: () => { config: Record<string, number>; margin: number };
}) => Json;

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function loadParser(): Promise<Parse> {
  const url = pathToFileURL(join(repo, "scripts", "lib", "underdocks.mjs")).href;
  const mod = (await import(/* @vite-ignore */ url)) as { parseUnderdocks: Parse };
  return mod.parseUnderdocks;
}

const hex = (seed: string): string => createHash("sha256").update(seed).digest("hex");
const sha = (file: string): string => createHash("sha256").update(readFileSync(file)).digest("hex");

const SHOWN: Record<string, string> = {
  ironclad: "ironclad-a0-v2.json",
  silent: "silent-a0-keep-v1.json",
  regent: "regent-a0-keep-v1.json",
  necrobinder: "necrobinder-a0-keep-v1.json",
  defect: "defect-a0-keep-v1.json",
};
const FIRST = (cls: string): string => `${cls}-a0-v1.json`;
const NEOW_VALUES = "experiments/neow/neow-values-keep-v1.json";
const SEEDS_FILE = "experiments/seeds/ironclad-a0-v2.json";

const ARMS: Record<Key, [string, string]> = {
  synergy: ["advisor_v1-astar", "advisor_v1-d0star"],
  values: ["rules_v2-shownvals", "rules_v1"],
  neow: ["rules_v2_neow_values-keepvals", "rules_v2"],
};
const FILES: Record<Key, string> = {
  synergy: "pooled-ud-t1-synergy-astar-vs-d0star.json",
  values: "pooled-ud-t2-values-shown-vs-rules_v1.json",
  neow: "pooled-ud-t3-neow-keep-v1-vs-rules_v2.json",
};
/** The id of a batch of the study (Act 1 in Underdocks) and of its twin in `experiments/batches` (Act 1 in Overgrowth). */
const id = (arm: string, cls: string): string =>
  `${arm}-${cls}-a0-veteran-keeprelics-underdocks-val-n2000`;
const twinId = (arm: string, cls: string): string =>
  `${arm}-${cls}-a0-veteran-keeprelics-val-n2000`;
/** The Overgrowth test of the same two arms, which each result is set beside (the files the reader names). */
const TWINS: Record<Key, { file: string; policies: [string, string] }> = {
  synergy: {
    file: "experiments/synergy/keep-val/pooled-astar-vs-d0star.json",
    policies: ["advisor_v1", "advisor_v1"],
  },
  values: {
    file: "experiments/ascension9/pooled-a0keep-t2-values-shown-vs-rules_v1.json",
    policies: ["rules_v2", "rules_v1"],
  },
  neow: {
    file: "experiments/neow/pooled-neow-values-keep-v1-vs-rules_v2-keeprelics-val.json",
    policies: ["rules_v2_neow_values", "rules_v2"],
  },
};

const table = (aOnly: number, bOnly: number, both: number, neither: number): Json => ({
  a_only: aOnly,
  b_only: bOnly,
  both,
  neither,
  mcnemar_p: mcnemarP(aOnly, bOnly),
});

function endpoint(aOnly: number, bOnly: number, both: number, neither: number): Json {
  const total = aOnly + bOnly + both + neither;
  return {
    a: { games: aOnly + both, rate: (aOnly + both) / total, wilson95: [0.1, 0.2] },
    b: { games: bOnly + both, rate: (bOnly + both) / total, wilson95: [0.1, 0.2] },
    definition: "the run got past the Act-1 boss",
    pairedTable: table(aOnly, bOnly, both, neither),
  };
}

/** The pooled file `slay2_sim pool` writes, with the discordant pairs of each class (first arm only, second arm only). */
function pooledFile(
  key: Key,
  discordant: readonly (readonly [number, number])[],
  o: {
    ci?: readonly [number, number] | null | undefined;
    level?: number | undefined;
  } = {},
): Json {
  const both = 300;
  const neither = 1200;
  const per = discordant.map(([a, b]) => a + b + both + neither);
  const aOnly = discordant.reduce((n, [a]) => n + a, 0);
  const bOnly = discordant.reduce((n, [, b]) => n + b, 0);
  const total = per.reduce((n, x) => n + x, 0);
  const [armA, armB] = ARMS[key];
  const members = CLASSES.map((cls, i) => {
    const [a, b] = discordant[i] ?? [0, 0];
    const n = per[i] ?? 1;
    return {
      a: { batchId: id(armA, cls), contentSha256: hex(id(armA, cls)), wins: 0 },
      b: { batchId: id(armB, cls), contentSha256: hex(id(armB, cls)), wins: 0 },
      bothCompleted: n,
      character: EXACT[cls],
      meanFloorDifference: 0.4,
      pairedSeeds: 2000,
      reachedAct2: {
        a: (a + both) / n,
        b: (b + both) / n,
        pairedTable: table(a, b, both, neither),
      },
    };
  });
  const mean = (aOnly - bOnly) / total;
  const half = 0.008;
  const ci = o.ci === undefined ? ([mean - half, mean + half] as const) : o.ci;
  return {
    bothCompleted: total,
    clusteredDifference: {
      ci95: [mean - half * 0.8, mean + half * 0.8],
      meanAMinusB: mean,
      ...(ci === null ? {} : { ciAtLevel: { level: o.level ?? 1 - 0.05 / 3, ci } }),
    },
    cohort: {
      ascension: 0,
      characters: Object.values(EXACT),
      partition: "val",
      profile: "veteran",
    },
    contentSha256: hex(`pooled-${key}`),
    difference: "a minus b",
    excludedNotCompleted: 10000 - total,
    floorDifference: { ci95: [0.1, 0.7], meanAMinusB: 0.4 },
    kind: "pooled-paired-comparison",
    members,
    pairedSeeds: 10000,
    policies: { a: armA, b: armB },
    reachedAct2: endpoint(aOnly, bOnly, both * 5, neither * 5),
    reachedAct3: endpoint(50, 40, 300, total - 390),
    role: "held-out",
    schema: 1,
    wins: { a: 0, b: 0, pairedTable: table(0, 0, 0, total) },
  };
}

/**
 * The all-pairs analysis robustness.py writes for the three tests. It holds every pair, so it holds the pairs the primary test kept (the same discordant pairs)
 * and the pairs the primary test dropped; ``extra`` gives, per class, the discordant pairs it finds among those (first arm only, second arm only).
 */
function robustnessFile(
  results: Partial<Record<Key, readonly (readonly [number, number])[]>>,
  extra: Partial<Record<Key, readonly (readonly [number, number])[]>> = {},
): Json {
  const tests: Json = {};
  const contentSha256: Record<string, string> = {};
  for (const key of ["synergy", "values", "neow"] as const) {
    const primary = results[key];
    if (!primary) continue;
    const added = extra[key] ?? [];
    const [armA, armB] = ARMS[key];
    const perClass: Json = {};
    const sum = {
      shared: 0,
      primaryPairs: 0,
      pairs: 0,
      armOnly: 0,
      baselineOnly: 0,
      arm: 0,
      baseline: 0,
    };
    const notCompleted = { arm: 0, baseline: 0 };
    CLASSES.forEach((cls, i) => {
      const [pa, pb] = primary[i] ?? [0, 0];
      const [xa, xb] = added[i] ?? [0, 0];
      const n = pa + pb + 1500; // the pairs the primary test kept in this class
      const dropped = 2000 - n;
      if (xa + xb > dropped)
        throw new Error(
          "the fixture puts more discordant pairs among the dropped pairs than there are",
        );
      const both = 300 + (dropped - xa - xb); // the dropped pairs that are not discordant are taken to be past the boss in both games
      const row = {
        shared: 2000,
        primaryPairs: n,
        pairs: 2000,
        armOnly: pa + xa,
        baselineOnly: pb + xb,
        arm: pa + xa + both,
        baseline: pb + xb + both,
        notCompleted: { arm: dropped, baseline: dropped },
        p: mcnemarP(pa + xa, pb + xb),
      };
      perClass[EXACT[cls] ?? cls] = row;
      for (const k of Object.keys(sum) as (keyof typeof sum)[]) sum[k] += row[k];
      notCompleted.arm += dropped;
      notCompleted.baseline += dropped;
      contentSha256[id(armA, cls)] = hex(id(armA, cls));
      contentSha256[id(armB, cls)] = hex(id(armB, cls));
    });
    tests[key] = {
      arm: armA,
      baseline: armB,
      pooled: {
        ...sum,
        notCompleted,
        p: mcnemarP(sum.armOnly, sum.baselineOnly),
        difference: (sum.arm - sum.baseline) / sum.pairs,
        primaryExcludedFraction: 1 - sum.primaryPairs / sum.shared,
      },
      perClass,
    };
  }
  return {
    kind: "underdocks-robustness",
    schema: 1,
    label: "fixture",
    maxExcludedFraction: 0.1,
    level: 0.05,
    tests,
    contentSha256,
  };
}

const everyClass = (a: number, b: number): readonly (readonly [number, number])[] =>
  CLASSES.map(() => [a, b] as const);

interface Options {
  /** the decision log carries the registration */
  registered?: boolean;
  /** the SHA-256 of every file an arm reads is quoted in the registration */
  quoted?: boolean;
  /** ... but only in a record that comes after it, not in the registration itself */
  quotedLater?: boolean;
  /** the precondition: passed (default), failed, or not run (false: no file) */
  precondition?: boolean | "absent";
  /** the pooled results: per test, the discordant pairs of each class; absent = not run */
  results?: Partial<Record<Key, readonly (readonly [number, number])[]>>;
  /** the whole-seed interval at the level of the test, per test (default: the mean plus and minus 0.8 points); null leaves it out */
  ci?: Partial<Record<Key, readonly [number, number] | null>>;
  /** the level the interval is written at (default 1 - 0.05 / 3) */
  ciLevel?: number;
  /** the pooled difference of the Overgrowth twins (default 0.05); false leaves the files out */
  ogMean?: number | false;
  /** the all-pairs analysis, per test: the discordant pairs it finds in each class among the pairs the primary test dropped (first arm only, second arm only;
   * default none); false leaves the file out */
  allPairs?: Partial<Record<Key, readonly (readonly [number, number])[]>> | false;
}

interface World {
  root: string;
  reports: Json[];
  udReports: Json[];
  path: (...parts: string[]) => string;
  /** rewrite the manifest (and, when it changes what the report says, the report) of one batch of the study */
  amend: (batch: string, change: (manifest: Json, report: Json) => void) => void;
  /** a second batch with the content of the first under another name (it passes every check the first does) */
  copy: (from: string, to: string) => void;
  parse: Parse;
}

const CHOICE = { config: { needs: 1, scalers: 0.7, engines: 0 }, margin: 0 };
/** What both arms of the synergy test carry in their effective parameters besides the term itself (the real manifests list them all). */
const ADVISOR_EFFECTIVE = {
  explore: 0.0,
  relics: false,
  replicate: 0,
  risk: "balanced",
  scalers: 0.7,
  tune: { elite_value: 0.5, heal_below: 0.7, max_deck: 32 },
};

async function buildWorld(options: Options = {}): Promise<World> {
  const o = {
    registered: true,
    quoted: true,
    precondition: true as boolean | "absent",
    results: {},
    ogMean: 0.05 as number | false,
    ...options,
  };
  const root = mkdtempSync(join(tmpdir(), "slay2-ud-"));
  dirs.push(root);
  const path = (...parts: string[]) => join(root, ...parts);
  const write = (file: string, body: unknown) => {
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, JSON.stringify(body));
  };
  // the value files the arms read (made up, one per name) and the one fit the repository really carries
  const valueFiles: string[] = [];
  for (const cls of CLASSES) {
    for (const name of [SHOWN[cls] ?? "", FIRST(cls)]) {
      write(path("experiments", "cardvalue", name), { kind: "fixture", name });
      if (!valueFiles.includes(name)) valueFiles.push(name);
    }
  }
  write(path("experiments", "cardvalue", "site-sets.json"), {
    sets: CLASSES.map((c) => ({ file: SHOWN[c] })),
  });
  mkdirSync(path("experiments", "neow"), { recursive: true });
  cpSync(join(repo, NEOW_VALUES), path(NEOW_VALUES));
  write(path(SEEDS_FILE), { kind: "fixture", seeds: "the val seeds" });
  const seedsSha = sha(path(SEEDS_FILE));
  const quotes = [
    ...valueFiles.map((f) => sha(path("experiments", "cardvalue", f))),
    sha(path(NEOW_VALUES)),
  ];
  mkdirSync(path("docs"), { recursive: true });
  if (o.registered) {
    writeFileSync(
      path("docs", "DECISIONS.md"),
      `## 2026-11-02 — ADR-064: do the three results that hold in Act 1's Overgrowth hold in its other version, Underdocks?\n\n${o.quoted ? quotes.join("\n") : "no hashes"}\n` +
        (options.quotedLater
          ? `\n## 2026-11-03 — ADR-066: something else\n\n${quotes.join("\n")}\n`
          : ""),
    );
    if (o.precondition !== "absent") {
      write(path("experiments", "underdocks", "precondition.json"), {
        kind: "underdocks-precondition",
        schema: 1,
        passed: o.precondition,
        pooledShownValues: {
          underdocks: { completed: 483, pastActOneBoss: 231, rate: 0.4783 },
          overgrowth: { completed: 491, pastActOneBoss: 334, rate: 0.6802 },
        },
        arms: Object.fromEntries(
          ["astar", "d0star", "shown", "v1", "neow", "base", "ogshown"].map((arm) => [
            arm,
            { classes: Object.fromEntries(CLASSES.map((c) => [c, { games: 100 }])) },
          ]),
        ),
      });
    }
  } else {
    writeFileSync(path("docs", "DECISIONS.md"), "## ADR-057\n");
  }

  // the batches of the tests (only those whose pooled result is asked for) and the reports the exporter would have made of them
  const udReports: Json[] = [];
  const reports: Json[] = [];
  const neowSha = sha(path(NEOW_VALUES));
  const policyOf = (arm: string, cls: string): { name: string; params: Json; effective: Json } => {
    const valuesFile = (f: string) => `experiments/cardvalue/${f}`;
    const fileSha = (f: string) => sha(path(valuesFile(f)));
    const first = valuesFile(FIRST(cls));
    // Ironclad's baseline names no file: it follows the policy's default one, the first set
    const baseParams: Json =
      cls === "ironclad" ? { threshold: 0 } : { threshold: 0, values: first };
    const baseEffective: Json = {
      threshold: 0,
      tune: { elite_value: 2.0, heal_below: 0.7 },
      values: first,
      values_sha256: fileSha(FIRST(cls)),
    };
    switch (arm) {
      case "advisor_v1-astar":
        return {
          name: "advisor_v1",
          params: { engines: 0, margin: 0, needs: 1, scalers: 0.7 },
          effective: { ...ADVISOR_EFFECTIVE, margin: 0.0, needs: 1, engines: 0, synergy: 1.0 },
        };
      case "advisor_v1-d0star":
        // the real manifest writes the defaults of the term's parameters as numbers of another type (0.0, 1.0): the same numbers
        return {
          name: "advisor_v1",
          params: { synergy: 0, margin: 0 },
          effective: { ...ADVISOR_EFFECTIVE, margin: 0, needs: 1.0, engines: 0.0, synergy: 0 },
        };
      case "rules_v2-shownvals": {
        const f = valuesFile(SHOWN[cls] ?? "");
        return {
          name: "rules_v2",
          params: { threshold: 0, values: f },
          effective: { threshold: 0, values: f, values_sha256: fileSha(SHOWN[cls] ?? "") },
        };
      }
      case "rules_v1":
        return { name: "rules_v1", params: {}, effective: {} };
      case "rules_v2_neow_values-keepvals":
        return {
          name: "rules_v2_neow_values",
          params: { ...baseParams, neow_values: NEOW_VALUES },
          effective: { ...baseEffective, neow_values: NEOW_VALUES, neow_values_sha256: neowSha },
        };
      default:
        return { name: "rules_v2", params: baseParams, effective: baseEffective };
    }
  };
  const batches = new Map<string, { manifest: Json; report: Json }>();
  const addBatch = (arm: string, cls: string) => {
    const bid = id(arm, cls);
    if (batches.has(bid)) return;
    const policy = policyOf(arm, cls);
    const manifest: Json = {
      batch_id: bid,
      config: {
        act1: "underdocks",
        ascension: 0,
        character: EXACT[cls],
        keep_relics: true,
        max_steps: 20000,
        profile: "veteran",
        wall_seconds: 900.0,
      },
      environment: { slay2: { head: HEAD, dirty: false } },
      policy: { name: policy.name, params: policy.params, effective: { params: policy.effective } },
      seeds: {
        file: SEEDS_FILE,
        file_sha256: seedsSha,
        n: 2000,
        partition: "val",
        sealed_partition_used: false,
      },
      simulator: { dirty: false, head: "5".repeat(40), pin_ok: true, pinned: "5".repeat(40) },
    };
    const report: Json = {
      id: bid,
      policy: policy.name,
      policyParams: policy.params,
      character: EXACT[cls],
      ascension: 0,
      profile: "veteran",
      keepRelics: true,
      partition: "val",
      seeds: 2000,
      classStartVerified: true,
      canonicalProcessState: true,
      completed: 1960,
      counts: {
        aborted: 0,
        harness_error: 0,
        invalid_action: 0,
        policy_error: 0,
        simulator_error: 30,
        step_limit: 10,
        death: 1960,
        win: 0,
      },
      contentSha256: hex(bid),
      sampleAudit: { ledgerOk: true, verified: 40, drawn: 40 },
    };
    batches.set(bid, { manifest, report });
    write(path("experiments", "underdocks", "batches", bid, "manifest.json"), manifest);
    udReports.push(report);
  };
  for (const [key, discordant] of Object.entries(o.results) as [
    Key,
    readonly (readonly [number, number])[],
  ][]) {
    for (const cls of CLASSES) for (const arm of ARMS[key]) addBatch(arm, cls);
    write(
      path("experiments", "underdocks", FILES[key]),
      pooledFile(key, discordant, { ci: o.ci?.[key], level: o.ciLevel }),
    );
  }
  if (Object.keys(o.results).length > 0 && o.allPairs !== false) {
    write(
      path("experiments", "underdocks", "robustness-all-pairs.json"),
      robustnessFile(o.results, o.allPairs ?? {}),
    );
  }
  // the Overgrowth twins of the three tests: earlier studies' pooled files over batches of experiments/batches
  if (Object.keys(o.results).length > 0 && o.ogMean !== false) {
    for (const key of ["synergy", "values", "neow"] as const) {
      const twin = TWINS[key];
      const [armA, armB] = ARMS[key];
      for (const cls of CLASSES) {
        for (const arm of [armA, armB]) reports.push({ id: twinId(arm, cls) });
      }
      write(path(twin.file), {
        kind: "pooled-paired-comparison",
        schema: 1,
        role: "held-out",
        cohort: { ascension: 0, partition: "val", profile: "veteran" },
        policies: { a: twin.policies[0], b: twin.policies[1] },
        members: CLASSES.map((c) => ({
          a: { batchId: twinId(armA, c) },
          b: { batchId: twinId(armB, c) },
        })),
        bothCompleted: 9865,
        reachedAct2: { a: { rate: 0.4 + o.ogMean }, b: { rate: 0.4 } },
        clusteredDifference: {
          meanAMinusB: o.ogMean,
          ci95: [o.ogMean - 0.01, o.ogMean + 0.01],
        },
      });
    }
  }
  return {
    root,
    reports,
    udReports,
    path,
    amend: (batch, change) => {
      const b = batches.get(batch);
      if (!b) throw new Error(`no batch ${batch}`);
      change(b.manifest, b.report);
      write(path("experiments", "underdocks", "batches", batch, "manifest.json"), b.manifest);
    },
    copy: (from, to) => {
      const b = batches.get(from);
      if (!b) throw new Error(`no batch ${from}`);
      const manifest = { ...b.manifest, batch_id: to };
      const report = { ...b.report, id: to, contentSha256: hex(to) };
      batches.set(to, { manifest, report });
      write(path("experiments", "underdocks", "batches", to, "manifest.json"), manifest);
      udReports.push(report);
    },
    parse: await loadParser(),
  };
}

const read = (w: World) =>
  w.parse({
    root: w.root,
    reports: w.reports,
    udReports: w.udReports,
    synergyChoice: () => CHOICE,
  });
const all = (a: number, b: number) => ({
  synergy: everyClass(a, b),
  values: everyClass(a, b),
  neow: everyClass(a, b),
});

type Tests = Record<
  Key,
  {
    verdict: Verdict;
    size: string | null;
    overgrowth: { mean: number; adr: string; file: string };
    classes: Record<string, { ahead: boolean; behind: boolean; p: number }>;
    reachedAct2: { pairedTable: { mcnemar_p: number } };
  }
>;

describe("the exporter reads the Underdocks study only when it belongs together", () => {
  it("says the study is not registered when the decision log has no record of it, and refuses results without one", async () => {
    const none = await buildWorld({ registered: false });
    expect(read(none)).toEqual({ registered: false });
    mkdirSync(none.path("experiments", "underdocks"), { recursive: true });
    expect(() => read(none)).toThrow(/has no ADR-064/);
  });

  it("carries the registration and its precondition before any result exists", async () => {
    const w = await buildWorld();
    const out = read(w) as {
      registered: boolean;
      tests: unknown;
      level: number;
      classLevel: number;
      seeds: number;
      adr: string;
      precondition: { games: number; sha256: string; pooledShownValues: Json };
    };
    expect(out.registered).toBe(true);
    expect(out.adr).toBe("ADR-064");
    expect(out.tests).toBeNull();
    expect(out.level).toBeCloseTo(0.05 / 3, 12);
    expect(out.classLevel).toBe(0.01);
    expect(out.seeds).toBe(2000);
    expect(out.precondition.games).toBe(3500);
    expect(out.precondition.sha256).toBe(
      sha(w.path("experiments", "underdocks", "precondition.json")),
    );
    expect(out.precondition.pooledShownValues).toMatchObject({
      underdocks: { completed: 483, pastActOneBoss: 231 },
      overgrowth: { completed: 491, pastActOneBoss: 334 },
    });
  });

  it("is registered with no precondition file yet: then it carries neither", async () => {
    const w = await buildWorld({ precondition: "absent" });
    expect(read(w)).toEqual({ adr: "ADR-064", registered: true, precondition: null, tests: null });
  });

  it("refuses a precondition that did not pass, or that is not one", async () => {
    const failed = await buildWorld({ precondition: false });
    expect(() => read(failed)).toThrow(/not a passed precondition/);
    const other = await buildWorld();
    const file = other.path("experiments", "underdocks", "precondition.json");
    const body = JSON.parse(readFileSync(file, "utf8")) as Json;
    body.kind = "ascension9-precondition";
    writeFileSync(file, JSON.stringify(body));
    expect(() => read(other)).toThrow(/not a passed precondition/);
  });

  it("reads the three tests together and applies the registered reading rule to the numbers alone", async () => {
    const w = await buildWorld({
      results: {
        synergy: everyClass(300, 200),
        values: everyClass(250, 250),
        neow: everyClass(200, 300),
      },
    });
    const out = read(w) as { tests: Tests; heads: string[]; bosses: string[] };
    expect(out.tests.synergy.verdict).toBe("passed");
    expect(out.tests.values.verdict).toBe("not-shown");
    expect(out.tests.neow.verdict).toBe("reversed");
    expect(out.heads).toEqual([HEAD]);
    expect(out.bosses).toEqual(["LagavulinMatriarchBoss", "SoulFyshBoss", "WaterfallGiantBoss"]);
    // the result is the pooled file, with its own hash
    const file = w.path("experiments", "underdocks", FILES.synergy);
    expect((out.tests.synergy as unknown as { sha256: string }).sha256).toBe(sha(file));
  });

  it("reads a difference that is significant at 0.05 but not at 0.05 / 3 as not shown", async () => {
    // 5 x (260, 240): 1,300 against 1,200, exact p about 0.045: below 0.05, above 0.0167
    const w = await buildWorld({ results: { ...all(250, 250), synergy: everyClass(260, 240) } });
    const out = read(w) as { tests: Tests };
    const p = out.tests.synergy.reachedAct2.pairedTable.mcnemar_p;
    expect(p).toBeGreaterThan(0.05 / 3);
    expect(p).toBeLessThan(0.05);
    expect(out.tests.synergy.verdict).toBe("not-shown");
  });

  it("reads the level to the count: a pooled p just below 0.05 / 3 passes, one just above does not", async () => {
    // pooled 1,311 against 1,189 (exact p 0.0155) and 1,310 against 1,190 (0.0173); the seed interval at the level is the mean plus and
    // minus 0.8 points, which excludes zero in both, so the exact p alone decides
    const just = async (discordant: readonly (readonly [number, number])[]) => {
      const out = read(
        await buildWorld({ results: { ...all(250, 250), synergy: discordant } }),
      ) as {
        tests: Tests;
      };
      return out.tests.synergy;
    };
    const below = await just([
      [262, 238],
      [262, 238],
      [262, 238],
      [262, 238],
      [263, 237],
    ]);
    expect(below.reachedAct2.pairedTable.mcnemar_p).toBeLessThan(0.05 / 3);
    expect(below.verdict).toBe("passed");
    const above = await just(everyClass(262, 238));
    expect(above.reachedAct2.pairedTable.mcnemar_p).toBeGreaterThan(0.05 / 3);
    expect(above.verdict).toBe("not-shown");
  });

  it("flags each class's own games at the class level: the first arm ahead at p below 0.01, or the other arm", async () => {
    const w = await buildWorld({
      results: {
        synergy: everyClass(300, 200),
        values: everyClass(300, 200),
        neow: [
          [300, 200], // clearly ahead
          [210, 190], // ahead, p about 0.3
          [200, 300], // behind, p tiny
          [256, 200], // ahead, exact p 0.0099: just below the class level
          [255, 200], // ahead, exact p 0.0113: just above it, so not clear
        ],
      },
    });
    const out = read(w) as { tests: Tests };
    const c = out.tests.neow.classes;
    expect(c.ironclad).toMatchObject({ ahead: true, behind: false });
    expect(c.silent).toMatchObject({ ahead: false, behind: false });
    expect(c.regent).toMatchObject({ ahead: false, behind: true });
    expect(c.necrobinder).toMatchObject({ ahead: true, behind: false });
    expect(c.defect).toMatchObject({ ahead: false, behind: false });
    expect(Object.keys(out.tests.synergy.classes).sort()).toEqual([...CLASSES].sort());
  });

  it("reads the pooled difference with the whole-seed interval at the level of the test: significant is not enough", async () => {
    // (300, 200) in every class: p tiny, mean +5 points; the interval is the mean plus and minus 0.8 points
    const base = { results: all(300, 200) };
    const passed = read(await buildWorld(base)) as { tests: Tests };
    expect(passed.tests.synergy.verdict).toBe("passed");
    // significant, first arm ahead, but the interval at the level reaches zero: not shown
    const touches = read(await buildWorld({ ...base, ci: { synergy: [-0.002, 0.1] } })) as {
      tests: Tests;
    };
    expect(touches.tests.synergy.verdict).toBe("not-shown");
    expect(touches.tests.values.verdict).toBe("passed");
    // significant, the other arm ahead, interval reaching zero from below: not shown, not reversed
    const behind = read(
      await buildWorld({
        results: { ...all(300, 200), neow: everyClass(200, 300) },
        ci: { neow: [-0.1, 0.001] },
      }),
    ) as { tests: Tests };
    expect(behind.tests.neow.verdict).toBe("not-shown");
    // an interval that ends exactly at zero does not exclude it; one just off zero does
    const verdictOf = async (key: Key, o: Options) =>
      (read(await buildWorld(o)) as { tests: Tests }).tests[key].verdict;
    expect(await verdictOf("synergy", { ...base, ci: { synergy: [0, 0.1] } })).toBe("not-shown");
    expect(await verdictOf("synergy", { ...base, ci: { synergy: [1e-9, 0.1] } })).toBe("passed");
    const other = { results: { ...all(300, 200), neow: everyClass(200, 300) } };
    expect(await verdictOf("neow", { ...other, ci: { neow: [-0.1, 0] } })).toBe("not-shown");
    expect(await verdictOf("neow", { ...other, ci: { neow: [-0.1, -1e-9] } })).toBe("reversed");
    // the interval has to be there, at the registered level, around the mean
    const noInterval = await buildWorld({ ...base, ci: { synergy: null } });
    expect(() => read(noInterval)).toThrow(/no whole-seed interval at level 0\.98/);
    const wrongLevel = await buildWorld({ ...base, ciLevel: 0.95 });
    expect(() => read(wrongLevel)).toThrow(/no whole-seed interval at level 0\.98/);
    const outsideTheMean = await buildWorld({ ...base, ci: { synergy: [0.2, 0.3] } });
    expect(() => read(outsideTheMean)).toThrow(/no whole-seed interval at level 0\.98/);
  });

  it("sets a passed result beside the Overgrowth difference of the same arms: smaller, about the same or larger", async () => {
    // the Underdocks difference is +5.0 points with an interval of 4.2 to 5.8
    const size = async (ogMean: number | false) =>
      (read(await buildWorld({ results: all(300, 200), ogMean })) as { tests: Tests }).tests;
    const smaller = await size(0.09);
    for (const key of ["synergy", "values", "neow"] as const) {
      expect(smaller[key].size).toBe("smaller");
      expect(smaller[key].overgrowth).toMatchObject({ mean: 0.09, file: TWINS[key].file });
    }
    expect(smaller.synergy.overgrowth.adr).toBe("ADR-054");
    expect(smaller.values.overgrowth.adr).toBe("ADR-058");
    expect(smaller.neow.overgrowth.adr).toBe("ADR-055");
    expect((await size(0.05)).synergy.size).toBe("about-the-same");
    expect((await size(0.01)).synergy.size).toBe("larger");
    // a result is not shipped without the Overgrowth test it is set beside: the size words are part of what a passed result says (item 5)
    await expect(size(false)).rejects.toThrow(
      /the Overgrowth test ADR-054 that synergy is set beside is missing/,
    );
    // a test that did not pass has the Overgrowth difference but no size
    const w = await buildWorld({ results: { ...all(300, 200), synergy: everyClass(250, 250) } });
    const notShown = (read(w) as { tests: Tests }).tests.synergy;
    expect(notShown.size).toBeNull();
    expect(notShown.overgrowth).toMatchObject({ mean: 0.05 });
    // nor does a reversed one
    const r = await buildWorld({ results: { ...all(300, 200), neow: everyClass(200, 300) } });
    expect((read(r) as { tests: Tests }).tests.neow.size).toBeNull();
  });

  it("counts the ends of the interval as inside it when the size words are chosen", async () => {
    // the Underdocks difference is +5.0 points, the interval at the level written out as 4.2 to 5.8
    const ci = { synergy: [0.042, 0.058] as const, neow: [0.042, 0.058] as const };
    const sizeAt = async (ogMean: number) =>
      (read(await buildWorld({ results: all(300, 200), ci, ogMean })) as { tests: Tests }).tests
        .synergy.size;
    expect(await sizeAt(0.0581)).toBe("smaller");
    expect(await sizeAt(0.058)).toBe("about-the-same");
    expect(await sizeAt(0.042)).toBe("about-the-same");
    expect(await sizeAt(0.0419)).toBe("larger");
  });

  it("carries the shares of the Overgrowth twin, so that a page can say whether both arms fell", async () => {
    const out = read(await buildWorld({ results: all(300, 200), ogMean: 0.07 })) as {
      tests: Record<
        Key,
        { overgrowth: { a: number; b: number; bothCompleted: number; ci95: number[] } }
      >;
    };
    expect(out.tests.synergy.overgrowth.a).toBeCloseTo(0.47, 12);
    expect(out.tests.synergy.overgrowth.b).toBeCloseTo(0.4, 12);
    expect(out.tests.synergy.overgrowth.bothCompleted).toBe(9865);
    expect(out.tests.synergy.overgrowth.ci95).toHaveLength(2);
  });

  describe("and refuses an Overgrowth twin that is not the earlier study's held-out test of the same arms", () => {
    const run = async (options: Options = {}) => buildWorld({ results: all(300, 200), ...options });
    const edit = (w: World, key: Key, change: (body: Json) => void) => {
      const file = w.path(TWINS[key].file);
      const body = JSON.parse(readFileSync(file, "utf8")) as Json;
      change(body);
      writeFileSync(file, JSON.stringify(body));
    };

    it("passes when nothing is broken", async () => {
      const w = await run();
      expect(() => read(w)).not.toThrow();
    });

    it("a twin that is a development comparison, at another Ascension, or not held out", async () => {
      for (const change of [
        (b: Json) => {
          (b.cohort as Json).partition = "dev";
        },
        (b: Json) => {
          (b.cohort as Json).ascension = 9;
        },
        (b: Json) => {
          b.role = "development (dev partition): not a held-out result";
        },
        (b: Json) => {
          b.kind = "paired-comparison";
        },
      ]) {
        const w = await run();
        edit(w, "values", change);
        expect(() => read(w)).toThrow(
          /not the held-out Ascension 0 test ADR-058 read in Overgrowth/,
        );
      }
    });

    it("a twin of other arms", async () => {
      const w = await run();
      edit(w, "neow", (b) => {
        b.policies = { a: "rules_v2", b: "rules_v2_neow_values" };
      });
      expect(() => read(w)).toThrow(/its arms are rules_v2 and rules_v2_neow_values/);
    });

    it("a twin whose batches are not batches of experiments/batches", async () => {
      const w = await run();
      edit(w, "synergy", (b) => {
        const first = (b.members as { a: { batchId: string } }[])[0];
        if (first)
          first.a.batchId = "advisor_v1-astar-ironclad-a0-veteran-keeprelics-underdocks-val-n2000";
      });
      expect(() => read(w)).toThrow(/is not a batch of experiments\/batches/);
    });
  });

  it("refuses some of the results without the others: the three tests are run together, once", async () => {
    const w = await buildWorld({
      results: { synergy: everyClass(300, 200), values: everyClass(300, 200) },
    });
    expect(() => read(w)).toThrow(/runs the three tests together, once/);
  });

  describe("and refuses a result whose batches are not the ones the registration names", () => {
    const run = async (options: Options = {}) => buildWorld({ results: all(300, 200), ...options });

    it("passes when nothing is broken", async () => {
      const w = await run();
      expect(() => read(w)).not.toThrow();
    });

    it("a batch played with Act 1 in Overgrowth, or with no Act 1 named", async () => {
      const a = await run();
      a.amend(id("rules_v1", "silent"), (m) => {
        (m.config as Json).act1 = "overgrowth";
      });
      expect(() => read(a)).toThrow(/it was not played with Act 1 in Underdocks/);
      // the default is left out of a manifest: a batch with no act1 is an Overgrowth batch
      const b = await run();
      b.amend(id("advisor_v1-astar", "regent"), (m) => {
        delete (m.config as Json).act1;
      });
      expect(() => read(b)).toThrow(/it was not played with Act 1 in Underdocks/);
    });

    it("a pooled file that names batches of experiments/batches (Overgrowth) instead of the study's", async () => {
      const w = await run();
      const og = twinId("rules_v1", "ironclad");
      w.reports.push({ id: og });
      const file = w.path("experiments", "underdocks", FILES.values);
      const body = JSON.parse(readFileSync(file, "utf8")) as {
        members: { b: { batchId: string; contentSha256: string } }[];
      };
      const first = body.members[0];
      if (first) {
        first.b.batchId = og;
        first.b.contentSha256 = hex(og);
      }
      writeFileSync(file, JSON.stringify(body));
      expect(() => read(w)).toThrow(/is not an evidence batch/);
    });

    it("a batch played at another Ascension", async () => {
      const w = await run();
      w.amend(id("rules_v1", "silent"), (_m, r) => {
        r.ascension = 9;
      });
      expect(() => read(w)).toThrow(/not Ascension 0 with the veteran profile/);
    });

    it("a batch played without the relics kept", async () => {
      const w = await run();
      w.amend(id("advisor_v1-d0star", "regent"), (_m, r) => {
        r.keepRelics = false;
      });
      expect(() => read(w)).toThrow(/not played with the relics kept \(ADR-064\)/);
    });

    it("a batch whose games were not checked against the class they were played as", async () => {
      const w = await run();
      w.amend(id("rules_v2", "defect"), (_m, r) => {
        r.classStartVerified = false;
      });
      expect(() => read(w)).toThrow(/not checked against the class/);
    });

    it("a batch with no passing sample audit", async () => {
      const w = await run();
      w.amend(id("advisor_v1-astar", "ironclad"), (_m, r) => {
        r.sampleAudit = { ledgerOk: true, verified: 39, drawn: 40 };
      });
      expect(() => read(w)).toThrow(/no passing sample audit/);
    });

    it("an A* arm that is not A*, or that charges the page's price for a slot", async () => {
      const w = await run();
      w.amend(id("advisor_v1-astar", "necrobinder"), (m) => {
        const eff = (m.policy as { effective: { params: Json } }).effective.params;
        eff.scalers = 1;
      });
      expect(() => read(w)).toThrow(/not those of A\*/);
      // ADR-065's price is not part of this study: the arms of T1 charge version 1's price (the price left out of the manifest)
      for (const named of [{ size: 1 }, { size_from: 20 }]) {
        const priced = await run();
        priced.amend(id("advisor_v1-astar", "silent"), (m) => {
          Object.assign((m.policy as { effective: { params: Json } }).effective.params, named);
        });
        expect(() => read(priced)).toThrow(/version 1's price of a slot/);
        const otherArm = await run();
        otherArm.amend(id("advisor_v1-d0star", "silent"), (m) => {
          Object.assign((m.policy as { effective: { params: Json } }).effective.params, named);
        });
        expect(() => read(otherArm)).toThrow(/version 1's price of a slot/);
      }
    });

    it("a no-term arm that has the term, or counts relics", async () => {
      const a = await run();
      a.amend(id("advisor_v1-d0star", "silent"), (m) => {
        (m.policy as { effective: { params: Json } }).effective.params.synergy = 1;
      });
      expect(() => read(a)).toThrow(/without the synergy term/);
      const b = await run();
      b.amend(id("advisor_v1-d0star", "silent"), (m) => {
        (m.policy as { effective: { params: Json } }).effective.params.relics = true;
      });
      expect(() => read(b)).toThrow(/without the synergy term/);
    });

    it("a values arm that follows another file than the one the site shows", async () => {
      const w = await run();
      w.amend(id("rules_v2-shownvals", "silent"), (m, r) => {
        const first = "experiments/cardvalue/silent-a0-v1.json";
        const p = m.policy as { params: Json; effective: { params: Json } };
        p.params.values = first;
        p.effective.params.values = first;
        r.policyParams = p.params;
      });
      expect(() => read(w)).toThrow(
        /does not follow experiments\/cardvalue\/silent-a0-keep-v1.json/,
      );
    });

    it("a values arm whose manifest records another file's hash than the file on disk", async () => {
      const w = await run();
      w.amend(id("rules_v2-shownvals", "regent"), (m) => {
        (m.policy as { effective: { params: Json } }).effective.params.values_sha256 = "0".repeat(
          64,
        );
      });
      expect(() => read(w)).toThrow(/does not follow/);
    });

    it("the hand-written baseline with parameters", async () => {
      const w = await run();
      w.amend(id("rules_v1", "defect"), (m, r) => {
        (m.policy as { params: Json }).params.threshold = 0;
        r.policyParams = { threshold: 0 };
      });
      expect(() => read(w)).toThrow(/rules_v1 takes no parameters/);
    });

    it("an opening-relic arm that follows another fit", async () => {
      const w = await run();
      w.amend(id("rules_v2_neow_values-keepvals", "silent"), (m) => {
        (m.policy as { effective: { params: Json } }).effective.params.neow_values_sha256 =
          "f".repeat(64);
      });
      expect(() => read(w)).toThrow(/does not follow experiments\/neow\/neow-values-keep-v1.json/);
    });

    it("an opening-relic baseline with other card values than the first sets", async () => {
      const w = await run();
      w.amend(id("rules_v2", "silent"), (m, r) => {
        const shown = "experiments/cardvalue/silent-a0-keep-v1.json";
        const p = m.policy as { params: Json; effective: { params: Json } };
        p.params.values = shown;
        p.effective.params.values = shown;
        r.policyParams = p.params;
      });
      expect(() => read(w)).toThrow(
        /card values are not experiments\/cardvalue\/silent-a0-v1.json/,
      );
    });

    it("a batch played from a working tree with uncommitted changes", async () => {
      const w = await run();
      w.amend(id("rules_v1", "ironclad"), (m) => {
        (m.environment as { slay2: Json }).slay2.dirty = true;
      });
      expect(() => read(w)).toThrow(/uncommitted changes \(ADR-064 asks for a clean checkout\)/);
    });

    it("arms played from different commits", async () => {
      const w = await run();
      w.amend(id("rules_v1", "ironclad"), (m) => {
        (m.environment as { slay2: Json }).slay2.head = "b".repeat(40);
      });
      expect(() => read(w)).toThrow(/not all played from one commit/);
    });

    it("a pooled file whose members name other batches than the study's", async () => {
      const w = await run();
      const file = w.path("experiments", "underdocks", FILES.neow);
      const body = JSON.parse(readFileSync(file, "utf8")) as {
        members: { a: { batchId: string; contentSha256: string } }[];
      };
      const first = body.members[0];
      const other = id("rules_v2_neow_values-keepvals", "silent");
      if (first) {
        first.a.batchId = other;
        first.a.contentSha256 = hex(other);
      }
      writeFileSync(file, JSON.stringify(body));
      expect(() => read(w)).toThrow(/was played as "Silent", not as Ironclad/);
    });

    it("a pooled p-value that is not the exact McNemar p-value of its counts", async () => {
      const w = await run();
      const file = w.path("experiments", "underdocks", FILES.synergy);
      const body = JSON.parse(readFileSync(file, "utf8")) as {
        reachedAct2: { pairedTable: { mcnemar_p: number } };
      };
      body.reachedAct2.pairedTable.mcnemar_p = 0.5;
      writeFileSync(file, JSON.stringify(body));
      expect(() => read(w)).toThrow(/exact McNemar p-value/);
    });

    it("a pooled file played at another Ascension", async () => {
      const w = await run();
      const file = w.path("experiments", "underdocks", FILES.values);
      const body = JSON.parse(readFileSync(file, "utf8")) as { cohort: { ascension: number } };
      body.cohort.ascension = 9;
      writeFileSync(file, JSON.stringify(body));
      expect(() => read(w)).toThrow(/not played at Ascension 0/);
    });

    it("a file an arm reads whose hash the registration does not quote", async () => {
      const w = await run({ quoted: false });
      expect(() => read(w)).toThrow(/is not quoted in ADR-064/);
    });

    it("a file whose hash only a later record quotes", async () => {
      const w = await run({ quoted: false, quotedLater: true });
      expect(() => read(w)).toThrow(/is not quoted in ADR-064/);
    });

    it("a pooled file that names a copy of a batch instead of the batch the script's name gives", async () => {
      const w = await run();
      const original = id("rules_v1", "ironclad");
      const copy = `${original}-copy`;
      w.copy(original, copy);
      const file = w.path("experiments", "underdocks", FILES.values);
      const body = JSON.parse(readFileSync(file, "utf8")) as {
        members: { b: { batchId: string; contentSha256: string } }[];
      };
      const first = body.members[0];
      if (first) {
        first.b.batchId = copy;
        first.b.contentSha256 = hex(copy);
      }
      writeFileSync(file, JSON.stringify(body));
      expect(() => read(w)).toThrow(
        /ironclad rules_v1 is rules_v1-ironclad-a0-veteran-keeprelics-underdocks-val-n2000-copy, not rules_v1-ironclad-a0-veteran-keeprelics-underdocks-val-n2000/,
      );
    });

    it("a batch that changed after the comparison was written", async () => {
      const w = await run();
      const report = w.udReports.find((r) => r.id === id("rules_v1", "regent"));
      if (report) report.contentSha256 = "9".repeat(64);
      expect(() => read(w)).toThrow(/changed after the comparison was written/);
    });
  });

  describe("and refuses arms that differ in more than the one thing under test, and batches that fail the checks of item 10", () => {
    const run = async (options: Options = {}) => buildWorld({ results: all(300, 200), ...options });
    const effectiveOf = (m: Json) => (m.policy as { effective: { params: Json } }).effective.params;

    it("synergy arms that differ in a parameter besides the term", async () => {
      const a = await run();
      a.amend(id("advisor_v1-astar", "silent"), (m) => {
        effectiveOf(m).risk = "bold";
      });
      expect(() => read(a)).toThrow(/silent: the two arms differ in risk, not only in synergy/);
      // a nested one too
      const b = await run();
      b.amend(id("advisor_v1-d0star", "defect"), (m) => {
        (effectiveOf(m).tune as Json).heal_below = 0.5;
      });
      expect(() => read(b)).toThrow(/defect: the two arms differ in tune, not only in synergy/);
    });

    it("opening-relic arms that differ in more than the fit", async () => {
      const w = await run();
      w.amend(id("rules_v2_neow_values-keepvals", "regent"), (m) => {
        (effectiveOf(m).tune as Json).elite_value = 3;
      });
      expect(() => read(w)).toThrow(
        /regent: the two arms differ in tune, not only in neow_values and neow_values_sha256/,
      );
    });

    it("two arms played in another game, from other seeds or with another simulator", async () => {
      const cases: [string, (m: Json) => void, RegExp][] = [
        [
          "game",
          (m) => {
            (m.config as Json).max_steps = 100;
          },
          /silent: the two arms differ in their config/,
        ],
        [
          "seeds",
          (m) => {
            (m.seeds as Json).manifest_sha256 = "1".repeat(64);
          },
          /silent: the two arms differ in their seeds/,
        ],
        [
          "simulator",
          (m) => {
            (m.simulator as Json).head = "6".repeat(40);
          },
          /silent: the two arms differ in their simulator/,
        ],
      ];
      for (const [, change, pattern] of cases) {
        const w = await run();
        w.amend(id("rules_v1", "silent"), change);
        expect(() => read(w)).toThrow(pattern);
      }
    });

    it("an A* arm that counts relics or has another margin, and a values arm at another threshold", async () => {
      const relics = await run();
      relics.amend(id("advisor_v1-astar", "ironclad"), (m) => {
        effectiveOf(m).relics = true;
      });
      expect(() => read(relics)).toThrow(/not those of A\*/);
      const margin = await run();
      margin.amend(id("advisor_v1-astar", "ironclad"), (m) => {
        effectiveOf(m).margin = 0.5;
      });
      expect(() => read(margin)).toThrow(/not those of A\*/);
      // the margin the site's own choice of A* carries is read too
      const w = await run();
      expect(() =>
        w.parse({
          root: w.root,
          reports: w.reports,
          udReports: w.udReports,
          synergyChoice: () => ({ config: CHOICE.config, margin: 0.5 }),
        }),
      ).toThrow(/not those of A\*/);
      const threshold = await run();
      threshold.amend(id("rules_v2-shownvals", "silent"), (m) => {
        effectiveOf(m).threshold = 0.5;
      });
      expect(() => read(threshold)).toThrow(/does not follow .* at threshold 0/);
      const asked = await run();
      asked.amend(id("rules_v2-shownvals", "silent"), (m, r) => {
        const p = m.policy as { params: Json };
        p.params.threshold = 0.5;
        r.policyParams = { ...(r.policyParams as Json), threshold: 0.5 };
      });
      expect(() => read(asked)).toThrow(/does not follow .* at threshold 0/);
    });

    it("a batch with a game that ended in an abort, a harness error, a policy error or an invalid action", async () => {
      for (const kind of ["aborted", "harness_error", "policy_error", "invalid_action"]) {
        const w = await run();
        w.amend(id("rules_v1", "regent"), (_m, r) => {
          (r.counts as Json)[kind] = 1;
        });
        expect(() => read(w)).toThrow(
          /ended in an abort, a harness error, a policy error or an invalid action \(ADR-064 item 10\)/,
        );
      }
    });

    it("a batch of which fewer than 90 % of the games completed, or whose report has no counts", async () => {
      const edge = await run();
      edge.amend(id("rules_v1", "regent"), (_m, r) => {
        r.completed = 1800;
      });
      expect(() => read(edge)).not.toThrow();
      const few = await run();
      few.amend(id("rules_v1", "regent"), (_m, r) => {
        r.completed = 1799;
      });
      expect(() => read(few)).toThrow(/only 1799 of its 2000 games completed/);
      const none = await run();
      none.amend(id("rules_v1", "regent"), (_m, r) => {
        delete r.counts;
      });
      expect(() => read(none)).toThrow(/report has no counts/);
    });

    it("a batch played with a simulator that is not the pinned, clean one, or from other seeds than the registered file", async () => {
      const cases: [(m: Json) => void, RegExp][] = [
        [
          (m) => {
            (m.simulator as Json).pin_ok = false;
          },
          /not played with the pinned, clean simulator/,
        ],
        [
          (m) => {
            (m.simulator as Json).dirty = true;
          },
          /not played with the pinned, clean simulator/,
        ],
        [
          (m) => {
            (m.seeds as Json).file_sha256 = "0".repeat(64);
          },
          /its seeds are not those of experiments\/seeds\/ironclad-a0-v2.json/,
        ],
        [
          (m) => {
            (m.seeds as Json).file = "experiments/seeds/other.json";
          },
          /its seeds are not those of experiments\/seeds\/ironclad-a0-v2.json/,
        ],
        [
          (m) => {
            (m.seeds as Json).sealed_partition_used = true;
          },
          /its seeds are not those of experiments\/seeds\/ironclad-a0-v2.json/,
        ],
      ];
      for (const [change, pattern] of cases) {
        const w = await run();
        w.amend(id("advisor_v1-astar", "necrobinder"), change);
        expect(() => read(w)).toThrow(pattern);
      }
    });

    it("a pooled difference that is not the one its table of pairs gives", async () => {
      const w = await run();
      const file = w.path("experiments", "underdocks", FILES.synergy);
      const body = JSON.parse(readFileSync(file, "utf8")) as {
        clusteredDifference: { meanAMinusB: number; ciAtLevel: { ci: number[] } };
      };
      // +50 points with an interval around it, over counts that give +5 points
      body.clusteredDifference.meanAMinusB = 0.5;
      body.clusteredDifference.ciAtLevel.ci = [0.4, 0.6];
      writeFileSync(file, JSON.stringify(body));
      expect(() => read(w)).toThrow(/is not the one its table of pairs gives/);
    });

    it("an interval that is not two numbers in order", async () => {
      for (const ci95 of [["0.01", "0.09"], [0.09, 0.01], [0.01], null]) {
        const w = await run();
        const file = w.path("experiments", "underdocks", FILES.synergy);
        const body = JSON.parse(readFileSync(file, "utf8")) as {
          clusteredDifference: { ci95: unknown };
        };
        body.clusteredDifference.ci95 = ci95;
        writeFileSync(file, JSON.stringify(body));
        expect(() => read(w)).toThrow(/not a number, or an interval is not one/);
      }
    });
  });
});

interface AllPairs {
  pairs: number;
  aOnly: number;
  bOnly: number;
  aRate: number;
  bRate: number;
  p: number;
  difference: number;
  excludedFraction: number;
}
type Reading = Tests[Key] & {
  primary: Verdict;
  withheld: string | null;
  downgrades: string[];
  allPairs: AllPairs;
};

describe("the all-pairs analysis is a condition of the reading rule (ADR-064 item 5)", () => {
  const readTests = async (o: Options) =>
    (read(await buildWorld(o)) as { tests: Record<Key, Reading> }).tests;
  // a pass the primary test is clear about, with 200 of each class's 2,000 pairs dropped (a tenth: the most that is allowed): 950 pairs for the first arm
  // against 550 for the second, p about 1e-26
  const clear = everyClass(190, 110);

  it("is carried with each test, and a pass it agrees with stands", async () => {
    const t = await readTests({ results: all(300, 200) });
    for (const key of ["synergy", "values", "neow"] as const) {
      expect(t[key].verdict).toBe("passed");
      expect(t[key].primary).toBe("passed");
      expect(t[key].withheld).toBeNull();
      expect(t[key].downgrades).toEqual([]);
      expect(t[key].allPairs).toMatchObject({
        pairs: 10000,
        aOnly: 1500,
        bOnly: 1000,
        excludedFraction: 0,
      });
      expect(t[key].allPairs.difference).toBeCloseTo(500 / 10000, 12);
      expect(t[key].allPairs.p).toBeLessThan(1e-12);
    }
  });

  it("counts the pairs the primary test dropped, as the games ended", async () => {
    const t = await readTests({
      results: { ...all(300, 200), synergy: clear },
      allPairs: { synergy: everyClass(20, 60) },
    });
    expect(t.synergy.allPairs).toMatchObject({ pairs: 10000, aOnly: 950 + 100, bOnly: 550 + 300 });
    expect(t.synergy.allPairs.excludedFraction).toBeCloseTo(0.1, 12);
    expect(t.synergy.allPairs.difference).toBeCloseTo(200 / 10000, 12);
  });

  it("is read at 0.05 and not at the level of the test: a p between the two agrees", async () => {
    // all-pairs 950 against 860: exact p about 0.034, below 0.05 and above 0.0167
    const between = await readTests({
      results: { ...all(300, 200), synergy: clear },
      allPairs: { synergy: everyClass(0, 62) },
    });
    expect(between.synergy.allPairs.p).toBeGreaterThan(0.05 / 3);
    expect(between.synergy.allPairs.p).toBeLessThan(0.05);
    expect(between.synergy.verdict).toBe("passed");
    // three more pairs for the second arm in every class (950 against 875) put it above 0.05
    const above = await readTests({
      results: { ...all(300, 200), synergy: clear },
      allPairs: { synergy: everyClass(0, 65) },
    });
    expect(above.synergy.allPairs.p).toBeGreaterThan(0.05);
    expect(above.synergy.verdict).toBe("not-shown");
    expect(above.synergy.withheld).toBe("robustness");
  });

  it("withholds a pass the all-pairs analysis does not agree with, and says which condition withheld it", async () => {
    const t = await readTests({
      results: { ...all(300, 200), synergy: clear },
      allPairs: { synergy: everyClass(0, 80) },
    });
    expect(t.synergy.primary).toBe("passed");
    expect(t.synergy.verdict).toBe("not-shown");
    expect(t.synergy.withheld).toBe("robustness");
    expect(t.synergy.downgrades).toEqual(["robustness"]);
    expect(t.synergy.size).toBeNull(); // not passed: no size words
    expect(t.values.verdict).toBe("passed"); // the other tests are read on their own
    expect(t.neow.verdict).toBe("passed");
  });

  it("withholds a pass when the all-pairs analysis has the other arm ahead, and a reversal when it has the first arm ahead", async () => {
    const passed = await readTests({
      results: { ...all(300, 200), values: clear },
      allPairs: { values: everyClass(0, 200) },
    });
    expect(passed.values.allPairs.bOnly).toBeGreaterThan(passed.values.allPairs.aOnly);
    expect(passed.values.verdict).toBe("not-shown");
    expect(passed.values.withheld).toBe("robustness");
    const back = everyClass(110, 190);
    const reversed = await readTests({
      results: { ...all(300, 200), neow: back },
      allPairs: { neow: everyClass(200, 0) },
    });
    expect(reversed.neow.primary).toBe("reversed");
    expect(reversed.neow.verdict).toBe("not-shown");
    expect(reversed.neow.withheld).toBe("robustness");
    // a reversal it agrees with stands
    const agreed = await readTests({ results: { ...all(300, 200), neow: back } });
    expect(agreed.neow.verdict).toBe("reversed");
    expect(agreed.neow.withheld).toBeNull();
  });

  it("withholds a result when the primary test dropped more than a tenth of the pairs, to the pair", async () => {
    // 5 x (180, 120): the primary keeps 1,800 pairs of each class, 9,000 of 10,000: exactly a tenth, which is allowed
    const edge = await readTests({ results: { ...all(300, 200), synergy: everyClass(180, 120) } });
    expect(edge.synergy.allPairs.excludedFraction).toBeCloseTo(0.1, 12);
    expect(edge.synergy.verdict).toBe("passed");
    // 5 x (180, 119): 8,995 pairs kept, 10.05 % dropped
    const over = await readTests({ results: { ...all(300, 200), synergy: everyClass(180, 119) } });
    expect(over.synergy.allPairs.excludedFraction).toBeGreaterThan(0.1);
    expect(over.synergy.primary).toBe("passed");
    expect(over.synergy.verdict).toBe("not-shown");
    expect(over.synergy.withheld).toBe("excluded");
  });

  it("lists every condition that withheld a result, the first as the reason", async () => {
    const t = await readTests({
      results: { ...all(300, 200), synergy: everyClass(150, 100) },
      allPairs: { synergy: everyClass(0, 200) },
    });
    expect(t.synergy.downgrades).toEqual(["excluded", "robustness"]);
    expect(t.synergy.withheld).toBe("excluded");
  });

  it("has nothing to withhold from a test the primary did not pass", async () => {
    const t = await readTests({ results: { ...all(300, 200), synergy: everyClass(250, 250) } });
    expect(t.synergy.primary).toBe("not-shown");
    expect(t.synergy.withheld).toBeNull();
    expect(t.synergy.downgrades).toEqual([]);
  });

  describe("and is refused when it is not the analysis of these pooled files", () => {
    const run = async (options: Options = {}) => buildWorld({ results: all(300, 200), ...options });
    const edit = (w: World, change: (body: Json) => void) => {
      const file = w.path("experiments", "underdocks", "robustness-all-pairs.json");
      const body = JSON.parse(readFileSync(file, "utf8")) as Json;
      change(body);
      writeFileSync(file, JSON.stringify(body));
    };
    type Row = Record<string, unknown>;
    const entry = (body: Json, key: Key) => {
      const found = (
        body.tests as Record<
          string,
          { pooled: Row; perClass: Record<string, Row>; arm: string } | undefined
        >
      )[key];
      if (!found) throw new Error(`the fixture has no analysis of ${key}`);
      return found;
    };

    it("is missing: the pooled tests are not read without it", async () => {
      const w = await run({ allPairs: false });
      expect(() => read(w)).toThrow(/robustness-all-pairs.json is missing/);
    });

    it("exists without the pooled tests", async () => {
      const w = await buildWorld();
      mkdirSync(w.path("experiments", "underdocks"), { recursive: true });
      writeFileSync(
        w.path("experiments", "underdocks", "robustness-all-pairs.json"),
        JSON.stringify({}),
      );
      expect(() => read(w)).toThrow(/exists but the pooled tests do not/);
    });

    it("is not the analysis of the three tests", async () => {
      const kind = await run();
      edit(kind, (b) => {
        b.kind = "acts-robustness";
      });
      expect(() => read(kind)).toThrow(/not the all-pairs analysis of the three tests/);
      const keys = await run();
      edit(keys, (b) => {
        delete (b.tests as Json).neow;
      });
      expect(() => read(keys)).toThrow(/not the all-pairs analysis of the three tests/);
    });

    it("is of other arms, or its classes do not add up to the pooled counts", async () => {
      const arms = await run();
      edit(arms, (b) => {
        entry(b, "values").arm = "rules_v2";
      });
      expect(() => read(arms)).toThrow(
        /no analysis of test values for rules_v2-shownvals against rules_v1/,
      );
      const sums = await run();
      edit(sums, (b) => {
        entry(b, "synergy").pooled.armOnly = 1;
      });
      expect(() => read(sums)).toThrow(/the classes' armOnly do not add up to the pooled one/);
    });

    it("has a p that is not the exact McNemar p of its counts", async () => {
      const w = await run();
      edit(w, (b) => {
        entry(b, "neow").pooled.p = 0.5;
      });
      expect(() => read(w)).toThrow(/its p is not the exact McNemar p of its counts/);
    });

    it("does not count the pairs of the pooled file", async () => {
      const w = await run();
      edit(w, (b) => {
        const t = entry(b, "synergy");
        t.pooled.primaryPairs = (t.pooled.primaryPairs as number) - 1;
        const first = t.perClass.Ironclad;
        if (first) first.primaryPairs = (first.primaryPairs as number) - 1;
      });
      expect(() => read(w)).toThrow(/it does not count the pairs of/);
    });

    it("has counts that do not add up, or fewer games past the boss than the primary test saw", async () => {
      const diff = await run();
      edit(diff, (b) => {
        entry(b, "values").pooled.difference = 0.5;
      });
      expect(() => read(diff)).toThrow(/its counts do not add up/);
      const few = await run();
      edit(few, (b) => {
        const t = entry(b, "synergy");
        // fewer games past the boss than the pairs both arms completed: lower both arms' counts together, class by class and in the pool, so that only this
        // rule is broken
        for (const row of Object.values(t.perClass)) {
          row.arm = (row.arm as number) - 1600;
          row.baseline = (row.baseline as number) - 1600;
        }
        t.pooled.arm = (t.pooled.arm as number) - 8000;
        t.pooled.baseline = (t.pooled.baseline as number) - 8000;
        t.pooled.difference =
          ((t.pooled.arm as number) - (t.pooled.baseline as number)) / (t.pooled.pairs as number);
      });
      expect(() => read(few)).toThrow(
        /fewer games past the boss than the pairs both arms completed/,
      );
    });

    it("has discordant pairs that are not the difference of the two arms' counts", async () => {
      const w = await run();
      edit(w, (b) => {
        const t = entry(b, "neow");
        const silent = t.perClass.Silent;
        if (silent) silent.arm = (silent.arm as number) + 1;
        t.pooled.arm = (t.pooled.arm as number) + 1;
        t.pooled.difference =
          ((t.pooled.arm as number) - (t.pooled.baseline as number)) / (t.pooled.pairs as number);
      });
      expect(() => read(w)).toThrow(
        /the discordant pairs are not the difference of the two arms' counts/,
      );
    });

    it("was not made from the batches the pooled file names, or reports another excluded share", async () => {
      const hash = await run();
      edit(hash, (b) => {
        (b.contentSha256 as Record<string, string>)[id("rules_v1", "regent")] = "0".repeat(64);
      });
      expect(() => read(hash)).toThrow(/it was not made from the content of rules_v1-regent/);
      const share = await run();
      edit(share, (b) => {
        entry(b, "synergy").pooled.primaryExcludedFraction = 0.2;
      });
      expect(() => read(share)).toThrow(/its excluded share is not the pooled file's/);
    });
  });
});

describe("the real record and the data the site ships", () => {
  it("the exporter's reader accepts the repository as it stands: the registration, its precondition and, once they exist, the three tests", async () => {
    const parse = await loadParser();
    const shipped = JSON.parse(
      readFileSync(
        join(repo, "apps", "web", "src", "content", "underdocks.generated.json"),
        "utf8",
      ),
    ) as { registered: boolean; adr: string; tests: unknown };
    expect(shipped.registered).toBe(true);
    expect(shipped.adr).toBe("ADR-064");
    // the reader is the exporter's own: the file is what `node scripts/export-site-data.mjs` writes, checked by `--check` in CI; here the
    // reader's refusals are tested on the synthetic world above, and on the real record only that it quotes what it must
    expect(typeof parse).toBe("function");
    const record = readFileSync(join(repo, "docs", "DECISIONS.md"), "utf8");
    const at = record.indexOf("ADR-064: do the three results");
    expect(at).toBeGreaterThan(0);
    const next = record.indexOf("\n## ", at);
    const adr = record.slice(at, next < 0 ? undefined : next);
    // every file an arm reads has its SHA-256 quoted in the registration itself (the reader and the preflight both refuse otherwise)
    for (const f of [
      ...Object.values(SHOWN).map((n) => `experiments/cardvalue/${n}`),
      ...CLASSES.map((c) => `experiments/cardvalue/${FIRST(c)}`),
      NEOW_VALUES,
    ]) {
      expect(adr, f).toContain(sha(join(repo, f)));
    }
  });

  it("the registration has its precondition result and its power paragraph written, not a placeholder", () => {
    const record = readFileSync(join(repo, "docs", "DECISIONS.md"), "utf8");
    for (const token of ["PRECONDITION_RESULT", "POWER_PARAGRAPH", "RESULT_PARAGRAPH", "TBD"]) {
      expect(record, token).not.toContain(token);
    }
  });
});
