// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { mcnemarP } from "./fixtures/synergy-test";

vi.setConfig({ testTimeout: 30_000 });

/**
 * `scripts/lib/act2.mjs` reads the Act-2 study (ADR-060) only when everything it rests on belongs together. These tests build a small
 * repository (the record with the hashes it quotes, the fit, the development screen, the batches of the held-out arms and the pooled
 * results; no simulated game is involved, the counts are only consistent with each other) and break one thing at a time.
 */
const repo = join(__dirname, "..", "..", "..");
const CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"] as const;
type Cls = (typeof CLASSES)[number];
const EXACT: Record<Cls, string> = {
  ironclad: "Ironclad",
  silent: "Silent",
  regent: "Regent",
  necrobinder: "Necrobinder",
  defect: "Defect",
};
const HEAD = "a".repeat(40);
const SEEDS_FILE = "experiments/seeds/ironclad-a0-v2.json";
const MARKER = "Frozen choices of ADR-060 (part 2)";
const P_TAGS: Record<string, number> = {
  pall: -100,
  p010: 0.1,
  p020: 0.2,
  p035: 0.35,
  p050: 0.5,
  pnone: 100,
};

type Json = Record<string, unknown>;
type Key = "L" | "P" | "V";
type Parse = (a: { root: string; reports: Json[] }) => Json;

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const hex = (seed: string): string => createHash("sha256").update(seed).digest("hex");
const sha = (file: string): string => createHash("sha256").update(readFileSync(file)).digest("hex");
const SHOWN: Record<Cls, string> = {
  ironclad: "ironclad-a0-v2.json",
  silent: "silent-a0-keep-v1.json",
  regent: "regent-a0-keep-v1.json",
  necrobinder: "necrobinder-a0-keep-v1.json",
  defect: "defect-a0-keep-v1.json",
};
const table = (a: number, b: number, both: number, neither: number): Json => ({
  a_only: a,
  b_only: b,
  both,
  neither,
  mcnemar_p: mcnemarP(a, b),
});

interface Options {
  frozen?: boolean;
  quoted?: boolean;
  /** the classes whose fit passed the gate (default: Ironclad and Defect) */
  fitted?: readonly Cls[];
  /** the development screen: the chosen late threshold's tag (or null for none) and whether V qualified */
  dev?: false | { P: string | null; V: boolean };
  /** the discordant pairs of each class at the Act-2 endpoint, per test played (arm-only, S-only) */
  tests?: Partial<Record<Key, readonly (readonly [number, number])[]>>;
  /** pairs in which L differs about the Act-1 boss (it should: it differs from Act 1 on) */
  actOneDiffers?: number;
  /** a test of an arm that must not differ from S in Act 1 and nevertheless does (the design's own check) */
  breakActOne?: Key;
}

interface World {
  root: string;
  reports: Json[];
  path: (...p: string[]) => string;
  parse: Parse;
  amend: (file: string, change: (j: Json) => void) => void;
}

async function buildWorld(options: Options = {}): Promise<World> {
  const o = {
    frozen: true,
    quoted: true,
    fitted: ["ironclad", "defect"] as readonly Cls[],
    dev: { P: "p020", V: false },
    tests: {},
    ...options,
  };
  const root = mkdtempSync(join(tmpdir(), "slay2-a2-"));
  dirs.push(root);
  const path = (...p: string[]) => join(root, ...p);
  const write = (file: string, body: unknown) => {
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, JSON.stringify(body));
  };
  write(path("experiments", "cardvalue", "site-sets.json"), {
    sets: CLASSES.map((c) => ({ file: SHOWN[c] })),
  });
  write(path(SEEDS_FILE), { kind: "fixture" });
  for (const c of CLASSES)
    write(path("experiments", "cardvalue", SHOWN[c]), { kind: "fixture", c });
  const shownSha = (c: Cls) => sha(path("experiments", "cardvalue", SHOWN[c]));
  // ---- the fit
  for (const c of CLASSES) {
    const fitted = o.fitted.includes(c);
    const tiny = c === "silent";
    const gain = tiny ? null : fitted ? 0.0265 : -0.0004;
    write(path("experiments", "cardvalue", `${c}-a0-act2-v1.json`), {
      schema: 1,
      kind: "card-values",
      outcome: "the run gets past the Act-2 boss",
      act: 2,
      character: EXACT[c],
      ascension: 0,
      profile: "veteran",
      keepRelics: true,
      prior: { file: `experiments/cardvalue/${SHOWN[c]}`, sha256: shownSha(c) },
      boss_fights: tiny ? 118 : 900,
      passed: tiny ? 2 : 300,
      fitted,
      reason: fitted ? null : "kept",
      gate: {
        required: 0.002,
        passed: fitted,
        bestL2: tiny ? null : 30,
        gain,
        minFights: 100,
        minOutcomes: 30,
        grid: [1],
      },
      crossValidation: tiny
        ? undefined
        : {
            baselineLogLoss: 0.462,
            baselineLogLossOfTheBaseRate: 0.59,
            gain,
            indicatorPenalty: { chosen: 10 },
          },
      scaleOnly: tiny ? null : { estimate: 0.25, ci95: [0.2, 0.3] },
      cards: [
        {
          id: "ANGER",
          beta: fitted ? 0.03 : 0.83,
          shown_beta: 0.83,
          delta: -0.23,
          delta_ci95: [-0.4, -0.05],
          games_with_card: 400,
        },
        {
          id: "BASH",
          beta: fitted ? 0.5 : 0.4,
          shown_beta: 0.4,
          delta: 0.1,
          delta_ci95: [-0.1, 0.3],
          games_with_card: 500,
        },
      ],
    });
  }
  // ---- the development screen
  const rows: Record<string, Json> = {};
  const row = (arm: string, aOnly: number, bOnly: number, lateThreshold: number | null): Json => {
    const base = 0.1;
    const diff = (aOnly - bOnly) / 3000;
    const r = {
      pairs: 3000,
      excluded: 0,
      pastAct2Boss: { arm: base + diff, baseline: base },
      difference: diff,
      armOnly: aOnly,
      baselineOnly: bOnly,
      p: mcnemarP(aOnly, bOnly),
      pastAct1Boss: { arm: 0.6, baseline: 0.6 },
      actOneDiffers: arm === "lead" ? 40 : 0,
      wins: { arm: 3, baseline: 3 },
      meanFloorDifference: 0,
      lateThreshold,
      eligible: diff > 0 && mcnemarP(aOnly, bOnly) < 0.1,
    };
    rows[arm] = r;
    return r;
  };
  const anyFit = o.fitted.length > 0;
  if (o.dev !== false) {
    row("lead", 100, 140, null);
    for (const [tag, t] of Object.entries(P_TAGS))
      row(tag, tag === o.dev.P ? 130 : 100, tag === o.dev.P ? 80 : 100, t);
    if (anyFit) row("v", o.dev.V ? 120 : 100, o.dev.V ? 70 : 100, null);
    write(path("experiments", "act2", "dev-selection.json"), {
      schema: 1,
      kind: "act2-dev-selection",
      role: "development: not a held-out result",
      slice: { partition: "dev", offset: 1000, n: 600 },
      fittedClasses: Object.fromEntries(CLASSES.map((c) => [EXACT[c], o.fitted.includes(c)])),
      baseline: "s",
      arms: rows,
      P: {
        advance: o.dev.P !== null,
        arm: o.dev.P,
        lateThreshold: o.dev.P ? P_TAGS[o.dev.P] : null,
      },
      V: { advance: anyFit && o.dev.V, anyClassFitted: anyFit },
      L: { advance: true },
      actOneIdentical: true,
    });
  }
  // ---- the record
  mkdirSync(path("docs"), { recursive: true });
  const quotes = [
    ...CLASSES.flatMap((c) => [
      sha(path("experiments", "cardvalue", `${c}-a0-act2-v1.json`)),
      shownSha(c),
    ]),
    ...(o.dev !== false ? [sha(path("experiments", "act2", "dev-selection.json"))] : []),
  ];
  writeFileSync(
    path("docs", "DECISIONS.md"),
    `## 2026-10-31 — ADR-060: does anything about the card picks change how often a run gets past the second boss?\n\nPart 1.\n${o.frozen ? `**${MARKER}.**\n` : ""}${o.quoted ? quotes.join("\n") : "no hashes"}\n`,
  );
  // ---- the batches, the pooled files, the per-class files and the determinism records of the tests played
  const reports: Json[] = [];
  const idOf = (arm: string, c: Cls) => `act2-${arm}-${c}-a0-veteran-keeprelics-val-n2000`;
  const policyOf = (arm: string, c: Cls): { name: string; params: Json; effective: Json } => {
    const values = `experiments/cardvalue/${SHOWN[c]}`;
    const eff = (extra: Json, thr = 0): Json => ({
      threshold: thr,
      values,
      values_sha256: shownSha(c),
      tune: { max_deck: 32 },
      ...extra,
    });
    if (arm === "s")
      return { name: "rules_v2", params: { threshold: 0, values }, effective: eff({}) };
    if (arm === "lead")
      return { name: "rules_v2", params: { threshold: 0.2, values }, effective: eff({}, 0.2) };
    if (arm === "v") {
      const f = `experiments/cardvalue/${c}-a0-act2-v1.json`;
      return {
        name: "rules_v2_late",
        params: { threshold: 0, values, late_values: f, late_threshold: 0 },
        effective: eff({
          late_acts: [1],
          late_threshold: 0,
          late_values: f,
          late_values_sha256: sha(path(f)),
        }),
      };
    }
    const t = P_TAGS[arm] ?? 0;
    return {
      name: "rules_v2_late",
      params: { threshold: 0, values, late_threshold: t },
      effective: eff({ late_acts: [1], late_threshold: t }),
    };
  };
  const added = new Set<string>();
  const manifests = new Map<string, Json>();
  const addBatch = (arm: string, c: Cls) => {
    const id = idOf(arm, c);
    if (added.has(id)) return;
    added.add(id);
    const p = policyOf(arm, c);
    const manifest: Json = {
      batch_id: id,
      config: {
        ascension: 0,
        character: EXACT[c],
        keep_relics: true,
        max_steps: 20000,
        profile: "veteran",
        wall_seconds: 900.0,
      },
      environment: { slay2: { head: HEAD, dirty: false } },
      policy: { name: p.name, params: p.params, effective: { params: p.effective } },
      seeds: {
        file: SEEDS_FILE,
        file_sha256: sha(path(SEEDS_FILE)),
        n: 2000,
        partition: "val",
        sealed_partition_used: false,
      },
      simulator: { dirty: false, head: "5".repeat(40), pin_ok: true, pinned: "5".repeat(40) },
    };
    manifests.set(id, manifest);
    write(path("experiments", "batches", id, "manifest.json"), manifest);
    reports.push({
      id,
      policy: p.name,
      policyParams: p.params,
      character: EXACT[c],
      ascension: 0,
      profile: "veteran",
      keepRelics: true,
      partition: "val",
      seeds: 2000,
      classStartVerified: true,
      canonicalProcessState: true,
      completed: 1950,
      counts: {
        aborted: 0,
        harness_error: 0,
        invalid_action: 0,
        policy_error: 0,
        simulator_error: 40,
        step_limit: 10,
        death: 1900,
        win: 50,
      },
      contentSha256: hex(id),
      sampleAudit: { ledgerOk: true, verified: 40, drawn: 40 },
    });
  };
  const armOf = (k: Key) =>
    k === "L" ? "lead" : k === "V" ? "v" : ((o.dev !== false ? o.dev.P : null) ?? "p020");
  for (const [k, discordant] of Object.entries(o.tests) as [
    Key,
    readonly (readonly [number, number])[],
  ][]) {
    const arm = armOf(k);
    const n = 1950;
    let sums: [number, number, number, number] = [0, 0, 0, 0];
    const members = CLASSES.map((c, i) => {
      addBatch(arm, c);
      addBatch("s", c);
      const [a, b] = discordant[i] ?? [0, 0];
      const both = 100;
      const act1: [number, number] =
        k === "L" || o.breakActOne === k ? [o.actOneDiffers ?? 40, 90] : [0, 0];
      sums = [sums[0] + a, sums[1] + b, sums[2] + both, sums[3] + (n - a - b - both)];
      write(path("experiments", "act2", "per-class", `${k}-${c}.json`), {
        kind: "paired-comparison",
        a: { batchId: idOf(arm, c), contentSha256: hex(idOf(arm, c)), wins: 5 },
        b: { batchId: idOf("s", c), contentSha256: hex(idOf("s", c)), wins: 5 },
        bothCompleted: n,
        reachedAct3: {
          a: { games: a + both, rate: (a + both) / n },
          b: { games: b + both, rate: (b + both) / n },
          pairedTable: table(a, b, both, n - a - b - both),
        },
      });
      return {
        a: { batchId: idOf(arm, c), contentSha256: hex(idOf(arm, c)), wins: 5 },
        b: { batchId: idOf("s", c), contentSha256: hex(idOf("s", c)), wins: 5 },
        bothCompleted: n,
        character: EXACT[c],
        meanFloorDifference: 0.1,
        pairedSeeds: 2000,
        reachedAct2: {
          a: 0.6,
          b: 0.6,
          pairedTable: table(act1[0], act1[1], 1000, n - 1000 - act1[0] - act1[1]),
        },
      };
    });
    const total = n * 5;
    const [a, b, both, neither] = sums;
    const t1: [number, number, number, number] = [0, 0, 0, 0];
    for (const m of members) {
      const tab = m.reachedAct2.pairedTable as Record<string, number>;
      t1[0] += tab.a_only ?? 0;
      t1[1] += tab.b_only ?? 0;
      t1[2] += tab.both ?? 0;
      t1[3] += tab.neither ?? 0;
    }
    const mean = (a - b) / total;
    write(path("experiments", "act2", `pooled-act2-${k}.json`), {
      kind: "pooled-paired-comparison",
      schema: 1,
      role: "held-out",
      difference: "a minus b",
      policies: { a: "x", b: "rules_v2" },
      cohort: {
        ascension: 0,
        characters: Object.values(EXACT),
        partition: "val",
        profile: "veteran",
      },
      members,
      pairedSeeds: 10000,
      bothCompleted: total,
      excludedNotCompleted: 10000 - total,
      wins: { a: 25, b: 25, pairedTable: table(0, 0, 25, total - 25) },
      reachedAct2: {
        definition: "past the Act-1 boss",
        a: { games: t1[0] + t1[2], rate: (t1[0] + t1[2]) / total, wilson95: [0, 1] },
        b: { games: t1[1] + t1[2], rate: (t1[1] + t1[2]) / total, wilson95: [0, 1] },
        pairedTable: table(t1[0], t1[1], t1[2], t1[3]),
      },
      reachedAct3: {
        definition: "past the Act-2 boss",
        a: { games: a + both, rate: (a + both) / total, wilson95: [0, 1] },
        b: { games: b + both, rate: (b + both) / total, wilson95: [0, 1] },
        pairedTable: table(a, b, both, neither),
      },
      clusteredDifference: {
        meanAMinusB: mean,
        ci95: [mean - 0.004, mean + 0.004],
        endpoint: "act2",
        ciAtLevel: { level: 1 - 0.05 / 3, ci: [mean - 0.005, mean + 0.005] },
      },
      floorDifference: { meanAMinusB: 0.1, ci95: [0, 0.2] },
      contentSha256: hex(`pooled-${k}`),
    });
  }
  if (Object.keys(o.tests).length > 0) {
    for (const c of CLASSES)
      write(path("experiments", "act2", "determinism", `${c}.json`), {
        shared: 1950,
        identical: 1950,
        different: 0,
      });
  }
  return {
    root,
    reports,
    path,
    parse: await loadParser(),
    amend: (file, change) => {
      const j = JSON.parse(readFileSync(path(file), "utf8")) as Json;
      change(j);
      write(path(file), j);
    },
  };
}

async function loadParser(): Promise<Parse> {
  const url = pathToFileURL(join(repo, "scripts", "lib", "act2.mjs")).href;
  return ((await import(/* @vite-ignore */ url)) as { parseAct2: Parse }).parseAct2;
}

const read = (w: World) => w.parse({ root: w.root, reports: w.reports });
const every = (a: number, b: number): readonly (readonly [number, number])[] =>
  CLASSES.map(() => [a, b] as const);
interface Out {
  fit: { classes: { character: string; fitted: boolean }[] } | null;
  dev: { P: { arm: string | null } } | null;
  tests: { results: Record<string, { verdict: string }> } | null;
  frozen: boolean;
}

describe("the exporter reads the Act-2 study only when it belongs together", () => {
  it("says the study is not registered when the log has no record of it, and refuses files without one", async () => {
    const w = await buildWorld();
    writeFileSync(w.path("docs", "DECISIONS.md"), "## ADR-059\n");
    expect(() => read(w)).toThrow(/exist but docs\/DECISIONS.md has no ADR-060/);
    for (const c of CLASSES) rmSync(w.path("experiments", "cardvalue", `${c}-a0-act2-v1.json`));
    rmSync(w.path("experiments", "act2"), { recursive: true });
    expect(read(w)).toEqual({ registered: false });
  });

  it("carries the registration alone before any file exists", async () => {
    const w = await buildWorld();
    for (const c of CLASSES) rmSync(w.path("experiments", "cardvalue", `${c}-a0-act2-v1.json`));
    rmSync(w.path("experiments", "act2"), { recursive: true });
    const out = read(w) as unknown as Out & { registered: boolean; level: number };
    expect(out.registered).toBe(true);
    expect(out.fit).toBeNull();
    expect(out.level).toBeCloseTo(0.05 / 3, 12);
  });

  it("reads the fit, and refuses a fit that is only partly there", async () => {
    const w = await buildWorld({ dev: false });
    const out = read(w) as unknown as Out;
    expect(out.fit?.classes.map((c) => [c.character, c.fitted])).toEqual([
      ["ironclad", true],
      ["silent", false],
      ["regent", false],
      ["necrobinder", false],
      ["defect", true],
    ]);
    expect(out.dev).toBeNull();
    rmSync(w.path("experiments", "cardvalue", "regent-a0-act2-v1.json"));
    expect(() => read(w)).toThrow(/run once, for all five/);
  });

  it("refuses a fit whose verdict is not what its gain and the gate say, and a class that keeps its shown values with other values", async () => {
    const lie = await buildWorld({ dev: false });
    lie.amend("experiments/cardvalue/regent-a0-act2-v1.json", (j) => {
      j.fitted = true;
      (j.gate as Json).passed = true;
    });
    expect(() => read(lie)).toThrow(/"fitted" is not what its gain/);
    const moved = await buildWorld({ dev: false });
    moved.amend("experiments/cardvalue/regent-a0-act2-v1.json", (j) => {
      const [first] = j.cards as Json[];
      if (first) first.beta = 0.1;
    });
    expect(() => read(moved)).toThrow(/keeps its shown values has ANGER at 0.1/);
    const prior = await buildWorld({ dev: false });
    prior.amend("experiments/cardvalue/ironclad-a0-act2-v1.json", (j) => {
      (j.prior as Json).sha256 = "0".repeat(64);
    });
    expect(() => read(prior)).toThrow(/its prior is not the file the site shows/);
    const gate = await buildWorld({ dev: false });
    gate.amend("experiments/cardvalue/ironclad-a0-act2-v1.json", (j) => {
      (j.gate as Json).required = 0.001;
    });
    expect(() => read(gate)).toThrow(/its gate is not 0.002/);
  });

  it("re-applies the screening rule: the chosen threshold is the eligible one with the largest gain, and V follows from its row", async () => {
    const w = await buildWorld({ dev: { P: "p035", V: true } });
    const out = read(w) as unknown as Out;
    expect(out.dev?.P.arm).toBe("p035");
    // a selection that names another threshold than the rule gives
    w.amend("experiments/act2/dev-selection.json", (j) => {
      (j.P as Json).arm = "p020";
      (j.P as Json).lateThreshold = 0.2;
    });
    expect(() => read(w)).toThrow(/P is p020, the rule gives p035/);
    const v = await buildWorld({ dev: { P: null, V: false } });
    v.amend("experiments/act2/dev-selection.json", (j) => {
      (j.V as Json).advance = true;
    });
    expect(() => read(v)).toThrow(
      /V advances, the rule says otherwise|does not|rule says otherwise/,
    );
  });

  it("refuses a screen with a p-value that is not the exact one of its counts, or an eligibility the rule does not give", async () => {
    const p = await buildWorld();
    p.amend("experiments/act2/dev-selection.json", (j) => {
      ((j.arms as Json).pnone as Json).p = 0.02;
    });
    expect(() => read(p)).toThrow(/pnone's p .* is not the exact McNemar p/);
    const e = await buildWorld();
    e.amend("experiments/act2/dev-selection.json", (j) => {
      ((j.arms as Json).lead as Json).eligible = true;
    });
    expect(() => read(e)).toThrow(/lead's eligibility is not what the rule says/);
  });

  it("stops when an arm that differs from S in Act 2 only differs from it in Act 1 (the design's own check)", async () => {
    const w = await buildWorld();
    w.amend("experiments/act2/dev-selection.json", (j) => {
      ((j.arms as Json).p010 as Json).actOneDiffers = 3;
    });
    expect(() => read(w)).toThrow(/differs in Act 1|its Act-1 check is not what its rows say/);
  });

  it("requires the hashes the registration quotes once part 2 is in the record, and only then", async () => {
    const unfrozen = await buildWorld({ frozen: false, quoted: false });
    expect((read(unfrozen) as unknown as Out).frozen).toBe(false);
    const w = await buildWorld({ frozen: true, quoted: false });
    expect(() => read(w)).toThrow(/is not quoted in ADR-060/);
  });

  it("refuses pooled results before part 2, and results that are not the ones the screen sent forward", async () => {
    const early = await buildWorld({ frozen: false, tests: { L: every(60, 60) } });
    expect(() => read(early)).toThrow(/has no part 2/);
    const wrong = await buildWorld({ tests: { L: every(60, 60) }, dev: { P: "p020", V: false } }); // P went forward and has no result
    expect(() => read(wrong)).toThrow(/runs them together, once/);
    const extra = await buildWorld({
      tests: { L: every(60, 60), V: every(60, 60) },
      dev: { P: null, V: false },
    });
    expect(() => read(extra)).toThrow(/runs them together, once/);
  });

  it("applies the registered reading rule to the numbers alone", async () => {
    const w = await buildWorld({
      dev: { P: "p020", V: true },
      tests: { L: every(250, 250), P: every(300, 200), V: every(200, 300) },
    });
    const out = read(w) as unknown as Out;
    expect(out.tests?.results.L?.verdict).toBe("not-shown");
    expect(out.tests?.results.P?.verdict).toBe("passed");
    expect(out.tests?.results.V?.verdict).toBe("reversed");
  });

  it("reads a gain that is significant at 0.05 but not at 0.05 / 3 as not shown, and one whose interval reaches zero as not shown", async () => {
    // 5 x (260, 240): 1,300 against 1,200, exact p about 0.045
    const w = await buildWorld({
      dev: { P: "p020", V: false },
      tests: { L: every(250, 250), P: every(260, 240) },
    });
    expect((read(w) as unknown as Out).tests?.results.P?.verdict).toBe("not-shown");
    const wide = await buildWorld({
      dev: { P: "p020", V: false },
      tests: { L: every(250, 250), P: every(300, 200) },
    });
    wide.amend("experiments/act2/pooled-act2-P.json", (j) => {
      ((j.clusteredDifference as Json).ciAtLevel as Json).ci = [-0.001, 0.05];
    });
    expect((read(wide) as unknown as Out).tests?.results.P?.verdict).toBe("not-shown");
  });

  it("refuses a pooled file whose interval is not of the Act-2 endpoint or not at the level of the tests", async () => {
    const a = await buildWorld({
      dev: { P: "p020", V: false },
      tests: { L: every(250, 250), P: every(300, 200) },
    });
    a.amend("experiments/act2/pooled-act2-P.json", (j) => {
      delete (j.clusteredDifference as Json).endpoint;
    });
    expect(() => read(a)).toThrow(/not of the Act-2 endpoint/);
    const b = await buildWorld({
      dev: { P: "p020", V: false },
      tests: { L: every(250, 250), P: every(300, 200) },
    });
    b.amend("experiments/act2/pooled-act2-P.json", (j) => {
      ((j.clusteredDifference as Json).ciAtLevel as Json).level = 0.95;
    });
    expect(() => read(b)).toThrow(/no whole-seed interval at level/);
  });

  it("refuses arms that are not the ones registered: a late threshold other than the chosen one, a missing refit, an Act-1 difference", async () => {
    const t = await buildWorld({
      dev: { P: "p020", V: true },
      tests: { L: every(250, 250), P: every(300, 200), V: every(300, 200) },
    });
    t.amend(
      "experiments/batches/act2-p020-defect-a0-veteran-keeprelics-val-n2000/manifest.json",
      (j) => {
        (((j.policy as Json).effective as Json).params as Json).late_threshold = 0.35;
      },
    );
    // the exporter reads the report the parser is given, which follows the manifest: change it as the real exporter would
    const report = t.reports.find(
      (r) => r.id === "act2-p020-defect-a0-veteran-keeprelics-val-n2000",
    );
    expect(report).toBeDefined();
    (report?.policyParams as Json).late_threshold = 0.35;
    expect(() => read(t)).toThrow(/Act-2 threshold is not 0.2/);
    const v = await buildWorld({
      dev: { P: "p020", V: true },
      tests: { L: every(250, 250), P: every(300, 200), V: every(300, 200) },
    });
    v.amend(
      "experiments/batches/act2-v-ironclad-a0-veteran-keeprelics-val-n2000/manifest.json",
      (j) => {
        (((j.policy as Json).effective as Json).params as Json).late_values =
          "experiments/cardvalue/regent-a0-act2-v1.json";
      },
    );
    expect(() => read(v)).toThrow(
      /does not follow experiments\/cardvalue\/ironclad-a0-act2-v1.json in Act 2/,
    );
    const a1 = await buildWorld({
      dev: { P: "p020", V: false },
      tests: { L: every(250, 250), P: every(300, 200) },
      breakActOne: "P",
    });
    expect(() => read(a1)).toThrow(
      /arms that differ from S in Act 2 only differ about the Act-1 boss in 650 pairs/,
    );
  });

  it("refuses per-class files that do not add up to the pooled table, and batches that were not played from a clean tree", async () => {
    const w = await buildWorld({
      dev: { P: "p020", V: false },
      tests: { L: every(250, 250), P: every(300, 200) },
    });
    w.amend("experiments/act2/per-class/P-defect.json", (j) => {
      const tab = (j.reachedAct3 as { pairedTable: { a_only: number; both: number } }).pairedTable;
      tab.a_only += 1;
      tab.both -= 1;
    });
    expect(() => read(w)).toThrow(/do not add up to the pooled one|exact McNemar p/);
    const dirty = await buildWorld({
      dev: { P: "p020", V: false },
      tests: { L: every(250, 250), P: every(300, 200) },
    });
    dirty.amend(
      "experiments/batches/act2-s-silent-a0-veteran-keeprelics-val-n2000/manifest.json",
      (j) => {
        ((j.environment as Json).slay2 as Json).dirty = true;
      },
    );
    expect(() => read(dirty)).toThrow(/uncommitted changes/);
  });

  it("carries the class results at the class level and the determinism record", async () => {
    const w = await buildWorld({
      dev: { P: "p020", V: false },
      tests: {
        L: every(250, 250),
        P: [
          [400, 100],
          [200, 200],
          [120, 120],
          [260, 140],
          [90, 140],
        ],
      },
    });
    const out = read(w) as unknown as {
      tests: {
        determinism: { shared: number; identical: number };
        results: { P: { perClass: { character: string; verdict: string }[] } };
      };
    };
    expect(out.tests.determinism).toEqual({ shared: 9750, identical: 9750, different: 0 });
    expect(out.tests.results.P.perClass.map((c) => [c.character, c.verdict])).toEqual([
      ["ironclad", "arm"],
      ["silent", "level"],
      ["regent", "level"],
      ["necrobinder", "arm"],
      ["defect", "baseline"],
    ]);
  });
});
