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
 * `scripts/lib/ascension9.mjs` reads the Ascension 9 transfer study (ADR-058) only when everything it rests on belongs together. These
 * tests build a small repository (the registration with the hashes it quotes, the files the arms read, thirty synthetic batches and
 * the three pooled results; no simulated game is involved, the counts are only consistent with each other) and break one thing at a
 * time.
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
  synergyChoice: () => { config: Record<string, number>; margin: number };
}) => Json;

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function loadParser(): Promise<Parse> {
  const url = pathToFileURL(join(repo, "scripts", "lib", "ascension9.mjs")).href;
  const mod = (await import(/* @vite-ignore */ url)) as { parseAscensionNine: Parse };
  return mod.parseAscensionNine;
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
  synergy: "pooled-a9-t1-synergy-astar-vs-d0star.json",
  values: "pooled-a9-t2-values-shown-vs-rules_v1.json",
  neow: "pooled-a9-t3-neow-keep-v1-vs-rules_v2.json",
};
const idAt = (arm: string, cls: string, ascension: number): string =>
  `${arm}-${cls}-a${String(ascension)}-veteran-keeprelics-val-n2000`;
const id = (arm: string, cls: string): string => idAt(arm, cls, 9);
// the twin of the card-value test at Ascension 0 with the relics kept
const TWIN_FILE = "pooled-a0keep-t2-values-shown-vs-rules_v1.json";
// the Ascension 0 tests of the same arms that the exporter reads for the size words
const A0_FILES: Partial<Record<Key, string>> = {
  synergy: "experiments/synergy/keep-val/pooled-astar-vs-d0star.json",
  neow: "experiments/neow/pooled-neow-values-keep-v1-vs-rules_v2-keeprelics-val.json",
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
    ascension?: number;
    ci?: readonly [number, number] | null | undefined;
    level?: number | undefined;
  } = {},
): Json {
  const ascension = o.ascension ?? 9;
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
      a: {
        batchId: idAt(armA, cls, ascension),
        contentSha256: hex(idAt(armA, cls, ascension)),
        wins: 0,
      },
      b: {
        batchId: idAt(armB, cls, ascension),
        contentSha256: hex(idAt(armB, cls, ascension)),
        wins: 0,
      },
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
      ascension,
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

const everyClass = (a: number, b: number): readonly (readonly [number, number])[] =>
  CLASSES.map(() => [a, b] as const);

interface Options {
  /** the decision log carries the registration */
  registered?: boolean;
  /** the SHA-256 of every file an arm reads is quoted in the registration */
  quoted?: boolean;
  /** ... but only in a record that comes after it (ADR-059), not in the registration itself */
  quotedLater?: boolean;
  /** the precondition passed */
  precondition?: boolean;
  /** the pooled results: per test, the discordant pairs of each class; absent = not run */
  results?: Partial<Record<Key, readonly (readonly [number, number])[]>>;
  /** the twin of the card-value test at Ascension 0 (default: present whenever there are results): its discordant pairs, or false for none */
  twin?: readonly (readonly [number, number])[] | false;
  /** the whole-seed interval at the level of the test, per test (default: the mean plus and minus 0.8 points); null leaves it out */
  ci?: Partial<Record<Key, readonly [number, number] | null>>;
  /** the level the interval is written at (default 1 - 0.05 / 3) */
  ciLevel?: number;
  /** the pooled difference of the Ascension 0 tests of the same arms (default 0.05); false leaves the files out */
  a0Mean?: number | false;
}

interface World {
  root: string;
  reports: Json[];
  path: (...parts: string[]) => string;
  /** rewrite the manifest (and, when it changes what the report says, the report) of one batch */
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
    precondition: true,
    results: {},
    a0Mean: 0.05,
    ...options,
  };
  const root = mkdtempSync(join(tmpdir(), "slay2-a9-"));
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
  if (o.registered) {
    mkdirSync(path("docs"), { recursive: true });
    writeFileSync(
      path("docs", "DECISIONS.md"),
      `## 2026-10-27 — ADR-058: do the three results that hold at Ascension 0 hold at Ascension 9?\n\n${o.quoted ? quotes.join("\n") : "no hashes"}\n` +
        (options.quotedLater
          ? `\n## 2026-10-28 — ADR-059: something else\n\n${quotes.join("\n")}\n`
          : ""),
    );
  } else {
    mkdirSync(path("docs"), { recursive: true });
    writeFileSync(path("docs", "DECISIONS.md"), "## ADR-057\n");
  }
  if (o.registered) {
    write(path("experiments", "ascension9", "precondition.json"), {
      kind: "ascension9-precondition",
      schema: 1,
      passed: o.precondition,
      pooledShownValues: {
        ascension0: { completed: 491, pastActOneBoss: 334, rate: 0.6802 },
        ascension9: { completed: 499, pastActOneBoss: 140, rate: 0.2806 },
      },
      arms: {
        shown: { classes: Object.fromEntries(CLASSES.map((c) => [c, { games: 100 }])) },
        base: { classes: Object.fromEntries(CLASSES.map((c) => [c, { games: 100 }])) },
      },
    });
    write(path("experiments", "ascension9", "ascension-check.json"), {
      kind: "ascension-check",
      schema: 1,
      allClaimsHold: true,
      claims: { "A1 elites 5 -> 8": true, "A4 potion slots 3 -> 2": true },
    });
  }

  // the batches of the three tests (only those whose pooled result is asked for) and the reports the exporter would have made of them
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
  const addBatch = (arm: string, cls: string, ascension = 9) => {
    const bid = idAt(arm, cls, ascension);
    if (batches.has(bid)) return;
    const policy = policyOf(arm, cls);
    const manifest: Json = {
      batch_id: bid,
      config: {
        ascension,
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
      ascension,
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
    write(path("experiments", "batches", bid, "manifest.json"), manifest);
    reports.push(report);
  };
  for (const [key, discordant] of Object.entries(o.results) as [
    Key,
    readonly (readonly [number, number])[],
  ][]) {
    for (const cls of CLASSES) for (const arm of ARMS[key]) addBatch(arm, cls);
    write(
      path("experiments", "ascension9", FILES[key]),
      pooledFile(key, discordant, { ci: o.ci?.[key], level: o.ciLevel }),
    );
  }
  // the twin of the card-value test at Ascension 0, and the Ascension 0 tests of the other arms
  if (Object.keys(o.results).length > 0 && o.twin !== false) {
    for (const cls of CLASSES) for (const arm of ARMS.values) addBatch(arm, cls, 0);
    write(
      path("experiments", "ascension9", TWIN_FILE),
      pooledFile("values", o.twin ?? everyClass(300, 100), { ascension: 0 }),
    );
  }
  if (o.a0Mean !== false) {
    for (const key of ["synergy", "neow"] as const) {
      const a0 = A0_FILES[key];
      if (!a0) continue;
      const [armA, armB] = ARMS[key];
      write(path(a0), {
        kind: "pooled-paired-comparison",
        schema: 1,
        role: "held-out",
        cohort: { ascension: 0, partition: "val", profile: "veteran" },
        policies: {
          a: key === "synergy" ? "advisor_v1" : "rules_v2_neow_values",
          b: key === "synergy" ? "advisor_v1" : "rules_v2",
        },
        bothCompleted: 9865,
        reachedAct2: { a: { rate: 0.4 + o.a0Mean }, b: { rate: 0.4 } },
        clusteredDifference: { meanAMinusB: o.a0Mean, ci95: [o.a0Mean - 0.01, o.a0Mean + 0.01] },
        note: `${armA} against ${armB}`,
      });
    }
  }
  return {
    root,
    reports,
    path,
    amend: (batch, change) => {
      const b = batches.get(batch);
      if (!b) throw new Error(`no batch ${batch}`);
      change(b.manifest, b.report);
      write(path("experiments", "batches", batch, "manifest.json"), b.manifest);
    },
    copy: (from, to) => {
      const b = batches.get(from);
      if (!b) throw new Error(`no batch ${from}`);
      const manifest = { ...b.manifest, batch_id: to };
      const report = { ...b.report, id: to, contentSha256: hex(to) };
      batches.set(to, { manifest, report });
      write(path("experiments", "batches", to, "manifest.json"), manifest);
      reports.push(report);
    },
    parse: await loadParser(),
  };
}

const read = (w: World) =>
  w.parse({ root: w.root, reports: w.reports, synergyChoice: () => CHOICE });
const all = (a: number, b: number) => ({
  synergy: everyClass(a, b),
  values: everyClass(a, b),
  neow: everyClass(a, b),
});

describe("the exporter reads the Ascension 9 study only when it belongs together", () => {
  it("says the study is not registered when the decision log has no record of it, and refuses results without one", async () => {
    const none = await buildWorld({ registered: false });
    expect(read(none)).toEqual({ registered: false });
    mkdirSync(none.path("experiments", "ascension9"), { recursive: true });
    expect(() => read(none)).toThrow(/has no ADR-058/);
  });

  it("carries the registration, its precondition and the check of the simulator before any result exists", async () => {
    const w = await buildWorld();
    const out = read(w) as {
      registered: boolean;
      tests: unknown;
      level: number;
      precondition: { games: number };
      ascensionCheck: { claims: string[] };
    };
    expect(out.registered).toBe(true);
    expect(out.tests).toBeNull();
    expect(out.level).toBeCloseTo(0.05 / 3, 12);
    expect(out.precondition.games).toBe(1000);
    expect(out.ascensionCheck.claims).toEqual(["A1 elites 5 -> 8", "A4 potion slots 3 -> 2"]);
  });

  it("refuses a precondition that did not pass", async () => {
    const w = await buildWorld({ precondition: false });
    expect(() => read(w)).toThrow(/not a passed precondition/);
  });

  it("reads the three tests together and applies the registered reading rule to the numbers alone", async () => {
    const w = await buildWorld({
      results: {
        synergy: everyClass(300, 200),
        values: everyClass(250, 250),
        neow: everyClass(200, 300),
      },
    });
    const out = read(w) as { tests: Record<Key, { verdict: Verdict }> };
    expect(out.tests.synergy.verdict).toBe("passed");
    expect(out.tests.values.verdict).toBe("not-shown");
    expect(out.tests.neow.verdict).toBe("reversed");
  });

  it("reads a difference that is significant at 0.05 but not at 0.05 / 3 as not shown", async () => {
    // 5 x (260, 240): 1,300 against 1,200, exact p about 0.045: below 0.05, above 0.0167
    const w = await buildWorld({ results: { ...all(250, 250), synergy: everyClass(260, 240) } });
    const out = read(w) as {
      tests: Record<Key, { verdict: Verdict; reachedAct2: { pairedTable: { mcnemar_p: number } } }>;
    };
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
        tests: Record<
          Key,
          { verdict: Verdict; reachedAct2: { pairedTable: { mcnemar_p: number } } }
        >;
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
    const out = read(w) as {
      tests: Record<
        Key,
        { classes: Record<string, { ahead: boolean; behind: boolean; p: number }> }
      >;
    };
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
    const passed = read(await buildWorld(base)) as { tests: Record<Key, { verdict: Verdict }> };
    expect(passed.tests.synergy.verdict).toBe("passed");
    // significant, first arm ahead, but the interval at the level reaches zero: not shown
    const touches = read(await buildWorld({ ...base, ci: { synergy: [-0.002, 0.1] } })) as {
      tests: Record<Key, { verdict: Verdict }>;
    };
    expect(touches.tests.synergy.verdict).toBe("not-shown");
    expect(touches.tests.values.verdict).toBe("passed");
    // significant, the other arm ahead, interval reaching zero from below: not shown, not reversed
    const behind = read(
      await buildWorld({
        results: { ...all(300, 200), neow: everyClass(200, 300) },
        ci: { neow: [-0.1, 0.001] },
      }),
    ) as { tests: Record<Key, { verdict: Verdict }> };
    expect(behind.tests.neow.verdict).toBe("not-shown");
    // an interval that ends exactly at zero does not exclude it; one just off zero does
    const verdictOf = async (key: Key, o: Options) =>
      (read(await buildWorld(o)) as { tests: Record<Key, { verdict: Verdict }> }).tests[key]
        .verdict;
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

  it("sets a passed result beside the Ascension 0 difference of the same arms: smaller, about the same or larger", async () => {
    // the Ascension 9 difference is +5.0 points with an interval of 4.2 to 5.8
    const size = async (a0Mean: number | false) => {
      const out = read(await buildWorld({ results: all(300, 200), a0Mean })) as {
        tests: Record<Key, { size: string | null; a0: { mean: number; adr: string } | null }>;
      };
      return out.tests;
    };
    const smaller = await size(0.09);
    expect(smaller.synergy.size).toBe("smaller");
    expect(smaller.neow.size).toBe("smaller");
    expect(smaller.synergy.a0).toMatchObject({ mean: 0.09, adr: "ADR-054" });
    expect(smaller.neow.a0).toMatchObject({ mean: 0.09, adr: "ADR-055" });
    expect((await size(0.05)).synergy.size).toBe("about-the-same");
    expect((await size(0.01)).synergy.size).toBe("larger");
    // the twin is the card-value test's own Ascension 0 difference (300 pairs against 100 in each class: 1,000 of 9,500)
    const twin = (await size(0.05)).values;
    expect(twin.a0?.mean).toBeCloseTo(1000 / 9500, 6);
    // the Ascension 9 interval (4.2 to 5.8 points) lies below the twin's +10.5 points
    expect(twin.size).toBe("smaller");
    // a result is not shipped without the Ascension 0 test it is set beside: the size words are part of what a passed result says (item 4)
    await expect(size(false)).rejects.toThrow(
      /the Ascension 0 test ADR-054 that synergy is set beside is missing/,
    );
    // a test that did not pass has the Ascension 0 difference but no size
    const w = await buildWorld({ results: { ...all(300, 200), synergy: everyClass(250, 250) } });
    const notShown = (read(w) as { tests: Record<Key, { size: string | null; a0: unknown }> }).tests
      .synergy;
    expect(notShown.size).toBeNull();
    expect(notShown.a0).not.toBeNull();
  });

  it("counts the ends of the interval as inside it when the size words are chosen", async () => {
    // the Ascension 9 difference is +5.0 points, the interval at the level written out as 4.2 to 5.8
    const ci = { synergy: [0.042, 0.058] as const, neow: [0.042, 0.058] as const };
    const sizeAt = async (a0Mean: number) =>
      (
        read(await buildWorld({ results: all(300, 200), ci, a0Mean })) as {
          tests: Record<Key, { size: string | null }>;
        }
      ).tests.synergy.size;
    expect(await sizeAt(0.0581)).toBe("smaller");
    expect(await sizeAt(0.058)).toBe("about-the-same");
    expect(await sizeAt(0.042)).toBe("about-the-same");
    expect(await sizeAt(0.0419)).toBe("larger");
  });

  it("reads the twin of the card-value test at Ascension 0 beside the test, and refuses it played anywhere else", async () => {
    const w = await buildWorld({ results: all(300, 200) });
    const out = read(w) as {
      tests: Record<Key, { twin?: { file: string; reachedAct2: { a: { rate: number } } } }>;
    };
    expect(out.tests.values.twin?.file).toBe(`experiments/ascension9/${TWIN_FILE}`);
    expect(out.tests.synergy.twin).toBeUndefined();
    // a twin whose batch was played at Ascension 9
    const bad = await buildWorld({ results: all(300, 200) });
    bad.amend(idAt("rules_v1", "silent", 0), (_m, r) => {
      r.ascension = 9;
    });
    expect(() => read(bad)).toThrow(/not Ascension 0 with the veteran profile/);
  });

  it("refuses some of the results without the others: the three tests and the twin are run together, once", async () => {
    const w = await buildWorld({
      results: { synergy: everyClass(300, 200), values: everyClass(300, 200) },
    });
    expect(() => read(w)).toThrow(/runs the three tests and the twin of the second together, once/);
    const noTwin = await buildWorld({ results: all(300, 200), twin: false });
    expect(() => read(noTwin)).toThrow(
      /runs the three tests and the twin of the second together, once/,
    );
  });

  describe("and refuses a result whose batches are not the ones the registration names", () => {
    const run = async (options: Options = {}) => buildWorld({ results: all(300, 200), ...options });

    it("passes when nothing is broken", async () => {
      const w = await run();
      expect(() => read(w)).not.toThrow();
    });

    it("a batch played at another Ascension", async () => {
      const w = await run();
      w.amend(id("rules_v1", "silent"), (_m, r) => {
        r.ascension = 0;
      });
      expect(() => read(w)).toThrow(/not Ascension 9 with the veteran profile/);
    });

    it("a batch played without the relics kept", async () => {
      const w = await run();
      w.amend(id("advisor_v1-d0star", "regent"), (_m, r) => {
        r.keepRelics = false;
      });
      expect(() => read(w)).toThrow(/not played with the relics kept \(ADR-058\)/);
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

    it("an A* arm that is not A*", async () => {
      const w = await run();
      w.amend(id("advisor_v1-astar", "necrobinder"), (m) => {
        const eff = (m.policy as { effective: { params: Json } }).effective.params;
        eff.scalers = 1;
      });
      expect(() => read(w)).toThrow(/not those of A\*/);
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
      expect(() => read(w)).toThrow(/uncommitted changes \(ADR-058 asks for a clean checkout\)/);
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
      const file = w.path("experiments", "ascension9", FILES.neow);
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
      const file = w.path("experiments", "ascension9", FILES.synergy);
      const body = JSON.parse(readFileSync(file, "utf8")) as {
        reachedAct2: { pairedTable: { mcnemar_p: number } };
      };
      body.reachedAct2.pairedTable.mcnemar_p = 0.5;
      writeFileSync(file, JSON.stringify(body));
      expect(() => read(w)).toThrow(/exact McNemar p-value/);
    });

    it("a pooled file played at another Ascension", async () => {
      const w = await run();
      const file = w.path("experiments", "ascension9", FILES.values);
      const body = JSON.parse(readFileSync(file, "utf8")) as { cohort: { ascension: number } };
      body.cohort.ascension = 0;
      writeFileSync(file, JSON.stringify(body));
      expect(() => read(w)).toThrow(/not played at Ascension 9/);
    });

    it("a file an arm reads whose hash the registration does not quote", async () => {
      const w = await run({ quoted: false });
      expect(() => read(w)).toThrow(/is not quoted in ADR-058/);
    });

    it("a file whose hash only a later record quotes", async () => {
      const w = await run({ quoted: false, quotedLater: true });
      expect(() => read(w)).toThrow(/is not quoted in ADR-058/);
    });

    it("a pooled file that names a copy of a batch instead of the batch the script's name gives", async () => {
      const w = await run();
      const original = id("rules_v1", "ironclad");
      const copy = `${original}-copy`;
      w.copy(original, copy);
      const file = w.path("experiments", "ascension9", FILES.values);
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
        /ironclad rules_v1 is rules_v1-ironclad-a9-veteran-keeprelics-val-n2000-copy, not rules_v1-ironclad-a9-veteran-keeprelics-val-n2000/,
      );
    });
  });

  describe("and refuses arms that differ in more than the one thing under test, and batches that fail the checks of item 9", () => {
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
          /ended in an abort, a harness error, a policy error or an invalid action \(ADR-058 item 9\)/,
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
      const file = w.path("experiments", "ascension9", FILES.synergy);
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
        const file = w.path("experiments", "ascension9", FILES.synergy);
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
