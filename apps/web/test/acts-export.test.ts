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
 * `scripts/lib/acts.mjs` reads the acts study (ADR-061) only when everything it rests on belongs together. These tests build a small repository
 * (the record with the hashes it quotes, the batches of the five arms, the pooled results, the per-class comparisons, the all-pairs analysis and the
 * identity checks; no simulated game is involved, the counts are only consistent with each other) and break one thing at a time.
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
const SEEDS_FILE = "experiments/seeds/ironclad-a0-v3.json";
const MARKER = "Registration of ADR-061 (frozen choices)";
const SHOWN: Record<Cls, string> = {
  ironclad: "ironclad-a0-v2.json",
  silent: "silent-a0-keep-v1.json",
  regent: "regent-a0-keep-v1.json",
  necrobinder: "necrobinder-a0-keep-v1.json",
  defect: "defect-a0-keep-v1.json",
};
const TESTS = [
  { key: "L", arm: "lead", acts: null, first: 0 },
  { key: "A1", arm: "a1", acts: [0], first: 0 },
  { key: "A2", arm: "a2", acts: [1], first: 1 },
  { key: "A3", arm: "a3", acts: [2], first: 2 },
] as const;

type Json = Record<string, unknown>;
type Key = "L" | "A1" | "A2" | "A3";
type Pairs = readonly (readonly [number, number])[];
type Parse = (a: { root: string; reports: Json[] }) => Json;

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const hex = (seed: string): string => createHash("sha256").update(seed).digest("hex");
const sha = (file: string): string => createHash("sha256").update(readFileSync(file)).digest("hex");
const table = (a: number, b: number, both: number, neither: number): Json => ({
  a_only: a,
  b_only: b,
  both,
  neither,
  mcnemar_p: mcnemarP(a, b),
});
const every = (a: number, b: number): Pairs => CLASSES.map(() => [a, b] as const);

interface Options {
  frozen?: boolean;
  quoted?: boolean;
  /** the discordant wins of each class (arm-only, S-only), per test; a test left out gets none (a dead heat) */
  tests?: Partial<Record<Key, Pairs>> | false;
  /** a test of an arm that is S in the early acts and nevertheless differs from S about a boss before its act (the design's own check) */
  breakBoss?: Key;
  /** the discordant wins of the all-pairs analysis, per test (default: those of the primary test) */
  robust?: Partial<Record<Key, Pairs>>;
  /** the pairs each class keeps in the primary test (default 2,900 of 3,000) */
  kept?: number;
  noRobustness?: boolean;
  noIdentity?: boolean;
}

interface World {
  root: string;
  reports: Json[];
  path: (...p: string[]) => string;
  parse: Parse;
  amend: (file: string, change: (j: Json) => void) => void;
}

async function buildWorld(options: Options = {}): Promise<World> {
  const o = { frozen: true, quoted: true, tests: {} as Partial<Record<Key, Pairs>>, ...options };
  const root = mkdtempSync(join(tmpdir(), "slay2-acts-"));
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
  // ---- the record
  mkdirSync(path("docs"), { recursive: true });
  const quotes = [...CLASSES.map((c) => shownSha(c)), sha(path(SEEDS_FILE))];
  writeFileSync(
    path("docs", "DECISIONS.md"),
    `## 2026-11-01 — ADR-061: which acts carry the effect of a pickier card rule, and does it reach winning?\n\nPart 1.\n${o.frozen ? `**${MARKER}.**\n` : ""}${o.quoted ? quotes.join("\n") : "no hashes"}\n`,
  );
  const reports: Json[] = [];
  const reportsById = new Map<string, Json>();
  const idOf = (arm: string, c: Cls) => `acts-${arm}-${c}-a0-veteran-keeprelics-val2-n3000`;
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
    const acts = TESTS.find((t) => t.arm === arm)?.acts ?? [1];
    return {
      name: "rules_v2_late",
      params: { threshold: 0, values, late_threshold: 0.2, late_acts: acts },
      effective: eff({ late_acts: acts, late_threshold: 0.2 }),
    };
  };
  const added = new Set<string>();
  const addBatch = (arm: string, c: Cls) => {
    const id = idOf(arm, c);
    if (added.has(id)) return;
    added.add(id);
    const p = policyOf(arm, c);
    write(path("experiments", "batches", id, "manifest.json"), {
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
        n: 3000,
        partition: "val2",
        sealed_partition_used: false,
      },
      simulator: { dirty: false, head: "5".repeat(40), pin_ok: true, pinned: "5".repeat(40) },
    });
    const report = {
      id,
      policy: p.name,
      policyParams: p.params,
      character: EXACT[c],
      ascension: 0,
      profile: "veteran",
      keepRelics: true,
      partition: "val2",
      seeds: 3000,
      classStartVerified: true,
      canonicalProcessState: true,
      completed: 2900,
      counts: {
        aborted: 0,
        harness_error: 0,
        invalid_action: 0,
        policy_error: 0,
        simulator_error: 90,
        step_limit: 10,
        death: 2800,
        win: 100,
      },
      contentSha256: hex(id),
      sampleAudit: { ledgerOk: true, verified: 40, drawn: 40 },
    };
    reports.push(report);
    reportsById.set(id, report);
  };
  // ---- the batches, the pooled files, the per-class files, the all-pairs analysis and the identity checks of the tests played
  const kept = o.kept ?? 2900;
  const both = 20; // games both arms win
  const rob: Record<string, unknown> = {};
  if (o.tests !== false) {
    for (const t of TESTS) {
      const discordant = o.tests[t.key] ?? every(100, 100);
      let sums: [number, number, number, number] = [0, 0, 0, 0];
      const members = CLASSES.map((c, i) => {
        addBatch(t.arm, c);
        addBatch("s", c);
        const [a, b] = discordant[i] ?? [0, 0];
        sums = [sums[0] + a, sums[1] + b, sums[2] + both, sums[3] + (kept - a - b - both)];
        // the Act-1 boss: an arm that is S in Act 1 cannot differ about it; the others do
        const a1: [number, number] = t.first >= 1 && o.breakBoss !== t.key ? [0, 0] : [40, 90];
        const winsA = {
          batchId: idOf(t.arm, c),
          contentSha256: hex(idOf(t.arm, c)),
          wins: a + both,
        };
        const winsB = { batchId: idOf("s", c), contentSha256: hex(idOf("s", c)), wins: b + both };
        write(path("experiments", "acts", "per-class", `${t.key}-${c}.json`), {
          kind: "paired-comparison",
          a: winsA,
          b: winsB,
          bothCompleted: kept,
          pairedWinTable: table(a, b, both, kept - a - b - both),
        });
        return {
          a: winsA,
          b: winsB,
          bothCompleted: kept,
          character: EXACT[c],
          meanFloorDifference: 0.1,
          pairedSeeds: 3000,
          reachedAct2: {
            a: 0.6,
            b: 0.6,
            pairedTable: table(a1[0], a1[1], 1000, kept - 1000 - a1[0] - a1[1]),
          },
        };
      });
      const total = kept * 5;
      const [a, b, bothSum, neither] = sums;
      const t1 = [0, 1, 2, 3].map((k) =>
        members.reduce(
          (n, m) =>
            n +
            ((m.reachedAct2.pairedTable as Record<string, number>)[
              ["a_only", "b_only", "both", "neither"][k] ?? ""
            ] ?? 0),
          0,
        ),
      ) as [number, number, number, number];
      // the Act-2 boss: an arm that is S until act 3 cannot differ about it either
      const same2 = t.first >= 2 && o.breakBoss !== t.key;
      const t2: [number, number, number, number] = same2
        ? [0, 0, 800, total - 800]
        : [30, 20, 400, total - 450];
      const mean = (a - b) / total;
      write(path("experiments", "acts", `pooled-acts-${t.key}.json`), {
        kind: "pooled-paired-comparison",
        schema: 1,
        role: "held-out",
        difference: "a minus b",
        policies: { a: "x", b: "rules_v2" },
        cohort: {
          ascension: 0,
          characters: Object.values(EXACT),
          partition: "val2",
          profile: "veteran",
        },
        members,
        pairedSeeds: 15000,
        bothCompleted: total,
        excludedNotCompleted: 15000 - total,
        wins: { a: a + bothSum, b: b + bothSum, pairedTable: table(a, b, bothSum, neither) },
        reachedAct2: {
          definition: "past the Act-1 boss",
          a: { games: t1[0] + t1[2], rate: (t1[0] + t1[2]) / total, wilson95: [0, 1] },
          b: { games: t1[1] + t1[2], rate: (t1[1] + t1[2]) / total, wilson95: [0, 1] },
          pairedTable: table(t1[0], t1[1], t1[2], t1[3]),
        },
        reachedAct3: {
          definition: "past the Act-2 boss",
          a: { games: t2[0] + t2[2], rate: (t2[0] + t2[2]) / total, wilson95: [0, 1] },
          b: { games: t2[1] + t2[2], rate: (t2[1] + t2[2]) / total, wilson95: [0, 1] },
          pairedTable: table(t2[0], t2[1], t2[2], t2[3]),
        },
        clusteredDifference: {
          meanAMinusB: mean,
          ci95: [mean - 0.003, mean + 0.003],
          endpoint: "win",
          ciAtLevel: { level: 1 - 0.05 / 4, ci: [mean - 0.004, mean + 0.004] },
        },
        floorDifference: { meanAMinusB: 0.1, ci95: [0, 0.2] },
        contentSha256: hex(`pooled-${t.key}`),
      });
      // the all-pairs analysis: every pair of the 3,000 seeds, a game that was not won scored as not a win
      const mine = o.robust?.[t.key] ?? discordant;
      const per: Record<string, Json> = {};
      const tot = {
        shared: 0,
        primaryPairs: 0,
        pairs: 0,
        armOnly: 0,
        baselineOnly: 0,
        arm: 0,
        baseline: 0,
      };
      CLASSES.forEach((c, i) => {
        const [ra, rb] = mine[i] ?? [0, 0];
        const [pa, pb] = discordant[i] ?? [0, 0];
        // the pairs both arms won are at least those of the primary test, which is a subset of these pairs
        const rboth = Math.max(both, pa + both - ra, pb + both - rb);
        const part = {
          shared: 3000,
          primaryPairs: kept,
          pairs: 3000,
          notCompleted: { arm: 100, baseline: 100 },
          armOnly: ra,
          baselineOnly: rb,
          arm: ra + rboth,
          baseline: rb + rboth,
          p: mcnemarP(ra, rb),
        };
        per[EXACT[c]] = part;
        for (const k of Object.keys(tot) as (keyof typeof tot)[]) tot[k] += part[k];
      });
      rob[t.key] = {
        arm: t.arm,
        pooled: {
          ...tot,
          notCompleted: { arm: 500, baseline: 500 },
          p: mcnemarP(tot.armOnly, tot.baselineOnly),
          difference: (tot.arm - tot.baseline) / tot.pairs,
          primaryExcludedFraction: 1 - (5 * kept) / 15000,
        },
        perClass: per,
      };
      if (!o.noIdentity && t.first > 0)
        write(path("experiments", "acts", "identity", `${t.key}.json`), {
          kind: "acts-identity",
          schema: 1,
          test: t.key,
          arm: t.arm,
          firstAct: t.first,
          beforePairs: 1200,
          beforeDifferent: 0,
        });
    }
    if (!o.noRobustness)
      write(path("experiments", "acts", "robustness-all-pairs.json"), {
        kind: "acts-robustness",
        schema: 1,
        tests: rob,
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
  const url = pathToFileURL(join(repo, "scripts", "lib", "acts.mjs")).href;
  return ((await import(/* @vite-ignore */ url)) as { parseActs: Parse }).parseActs;
}

const read = (w: World) => w.parse({ root: w.root, reports: w.reports });
interface Out {
  registered: boolean;
  frozen: boolean;
  level: number;
  tests: {
    results: Record<
      string,
      {
        verdict: string;
        primaryVerdict: string;
        downgrade: string | null;
        perClass: { character: string; verdict: string }[];
        wins: { arm: number; baseline: number };
      }
    >;
  } | null;
}
const ALL = {
  L: every(100, 100),
  A1: every(100, 100),
  A2: every(100, 100),
  A3: every(100, 100),
} as const;
const withTests = (t: Partial<Record<Key, Pairs>>): Partial<Record<Key, Pairs>> => ({
  ...ALL,
  ...t,
});

describe("the exporter reads the acts study only when it belongs together", () => {
  it("says the study is not registered when the log has no record of it, and refuses files without one", async () => {
    const w = await buildWorld({ tests: withTests({}) });
    writeFileSync(w.path("docs", "DECISIONS.md"), "## ADR-060\n");
    expect(() => read(w)).toThrow(/exist but docs\/DECISIONS.md has no ADR-061/);
    rmSync(w.path("experiments", "acts"), { recursive: true });
    expect(read(w)).toEqual({ registered: false });
  });

  it("carries the registration alone before any file exists", async () => {
    const w = await buildWorld({ tests: false });
    const out = read(w) as unknown as Out;
    expect(out.registered).toBe(true);
    expect(out.frozen).toBe(true);
    expect(out.tests).toBeNull();
    expect(out.level).toBeCloseTo(0.05 / 4, 12);
    const unfrozen = await buildWorld({ tests: false, frozen: false, quoted: false });
    expect((read(unfrozen) as unknown as Out).frozen).toBe(false);
  });

  it("requires the hashes the registration quotes, and refuses results before the registration", async () => {
    const w = await buildWorld({ tests: withTests({}), quoted: false });
    expect(() => read(w)).toThrow(/is not quoted in ADR-061/);
    const early = await buildWorld({ tests: withTests({}), frozen: false });
    expect(() => read(early)).toThrow(/has no registration/);
  });

  it("runs the four tests together, once: a missing test is refused", async () => {
    const w = await buildWorld({ tests: withTests({}) });
    rmSync(w.path("experiments", "acts", "pooled-acts-A3.json"));
    expect(() => read(w)).toThrow(/runs the four tests together, once/);
  });

  it("applies the registered reading rule to the numbers alone", async () => {
    const w = await buildWorld({
      tests: withTests({
        L: every(300, 200),
        A1: every(100, 100),
        A2: every(200, 300),
        A3: every(150, 120),
      }),
    });
    const out = read(w) as unknown as Out;
    expect(out.tests?.results.L?.verdict).toBe("passed");
    expect(out.tests?.results.A1?.verdict).toBe("not-shown");
    expect(out.tests?.results.A2?.verdict).toBe("reversed");
    // (750, 600) is a clear gain, p far below 0.0125 -> passed too; make sure the wins are the arm's and S's
    expect(out.tests?.results.A3?.verdict).toBe("passed");
    expect(out.tests?.results.L?.wins).toEqual({ arm: 1600, baseline: 1100 });
  });

  it("reads a gain that is significant at 0.05 but not at 0.05 / 4 as not shown, and one whose interval reaches zero as not shown", async () => {
    // 5 x (30, 23): 150 against 115, exact p about 0.032, above 0.0125
    const w = await buildWorld({ tests: withTests({ L: every(30, 23) }) });
    expect((read(w) as unknown as Out).tests?.results.L?.verdict).toBe("not-shown");
    const wide = await buildWorld({ tests: withTests({ L: every(300, 200) }) });
    wide.amend("experiments/acts/pooled-acts-L.json", (j) => {
      ((j.clusteredDifference as Json).ciAtLevel as Json).ci = [-0.001, 0.05];
    });
    expect((read(wide) as unknown as Out).tests?.results.L?.verdict).toBe("not-shown");
  });

  it("refuses a pooled file whose interval is not of the wins endpoint or not at the level of the tests", async () => {
    const a = await buildWorld({ tests: withTests({}) });
    a.amend("experiments/acts/pooled-acts-L.json", (j) => {
      (j.clusteredDifference as Json).endpoint = "act2";
    });
    expect(() => read(a)).toThrow(/not of the wins endpoint/);
    const b = await buildWorld({ tests: withTests({}) });
    b.amend("experiments/acts/pooled-acts-A1.json", (j) => {
      ((j.clusteredDifference as Json).ciAtLevel as Json).level = 0.95;
    });
    expect(() => read(b)).toThrow(/no whole-seed interval at level/);
    const c = await buildWorld({ tests: withTests({}) });
    c.amend("experiments/acts/pooled-acts-A2.json", (j) => {
      (j.clusteredDifference as Json).meanAMinusB = 0.2;
    });
    expect(() => read(c)).toThrow(/not the difference of its two win shares/);
  });

  it("refuses a pooled file of another partition", async () => {
    const w = await buildWorld({ tests: withTests({}) });
    w.amend("experiments/acts/pooled-acts-L.json", (j) => {
      (j.cohort as Json).partition = "val";
    });
    expect(() => read(w)).toThrow(/not a held-out comparison/);
  });

  it("refuses arms that are not the ones registered: another act, another threshold, a lead that is not the lead", async () => {
    const act = await buildWorld({ tests: withTests({}) });
    act.amend(
      "experiments/batches/acts-a2-defect-a0-veteran-keeprelics-val2-n3000/manifest.json",
      (j) => {
        (((j.policy as Json).effective as Json).params as Json).late_acts = [2];
      },
    );
    expect(() => read(act)).toThrow(/with the late rule on \[1\] only/);
    const thr = await buildWorld({ tests: withTests({}) });
    thr.amend(
      "experiments/batches/acts-a3-ironclad-a0-veteran-keeprelics-val2-n3000/manifest.json",
      (j) => {
        (((j.policy as Json).effective as Json).params as Json).late_threshold = 0.35;
      },
    );
    expect(() => read(thr)).toThrow(/its threshold in the act is not 0.2/);
    const lead = await buildWorld({ tests: withTests({}) });
    lead.amend(
      "experiments/batches/acts-lead-silent-a0-veteran-keeprelics-val2-n3000/manifest.json",
      (j) => {
        (((j.policy as Json).effective as Json).params as Json).late_acts = [0, 1, 2];
      },
    );
    expect(() => read(lead)).toThrow(/it is not rules_v2 with .* at threshold 0.2/);
    const base = await buildWorld({ tests: withTests({}) });
    const report = base.reports.find(
      (r) => r.id === "acts-s-regent-a0-veteran-keeprelics-val2-n3000",
    );
    expect(report).toBeDefined();
    if (report) report.policy = "rules_v2_late";
    expect(() => read(base)).toThrow(/its policy is rules_v2_late/);
  });

  it("stops when an arm that is S in the early acts differs from S about a boss before its act (the design's own check)", async () => {
    const a2 = await buildWorld({ tests: withTests({}), breakBoss: "A2" });
    expect(() => read(a2)).toThrow(
      /an arm that is S until act 2 differs from S about the Act-1 boss in 650 pairs/,
    );
    const a3 = await buildWorld({ tests: withTests({}), breakBoss: "A3" });
    expect(() => read(a3)).toThrow(
      /an arm that is S until act 3 differs from S about the Act-1 boss/,
    );
  });

  it("refuses per-class files that do not add up to the pooled table, and batches that were not played from a clean tree", async () => {
    const w = await buildWorld({ tests: withTests({ L: every(300, 200) }) });
    w.amend("experiments/acts/per-class/L-defect.json", (j) => {
      const tab = j.pairedWinTable as { a_only: number; both: number };
      tab.a_only += 1;
      tab.both -= 1;
    });
    expect(() => read(w)).toThrow(/do not add up to the pooled one|exact McNemar p/);
    const dirty = await buildWorld({ tests: withTests({}) });
    dirty.amend(
      "experiments/batches/acts-s-silent-a0-veteran-keeprelics-val2-n3000/manifest.json",
      (j) => {
        ((j.environment as Json).slay2 as Json).dirty = true;
      },
    );
    expect(() => read(dirty)).toThrow(/uncommitted changes/);
    const heads = await buildWorld({ tests: withTests({}) });
    heads.amend(
      "experiments/batches/acts-a1-defect-a0-veteran-keeprelics-val2-n3000/manifest.json",
      (j) => {
        ((j.environment as Json).slay2 as Json).head = "b".repeat(40);
      },
    );
    expect(() => read(heads)).toThrow(/played from 2 different commits/);
  });

  it("carries the class results at the class level, win by win", async () => {
    const w = await buildWorld({
      tests: withTests({
        L: [
          [400, 100],
          [0, 0],
          [12, 20],
          [0, 0],
          [90, 140],
        ],
      }),
    });
    const out = read(w) as unknown as Out;
    expect(out.tests?.results.L?.perClass.map((c) => [c.character, c.verdict])).toEqual([
      ["ironclad", "arm"],
      ["silent", "level"],
      ["regent", "level"],
      ["necrobinder", "level"],
      ["defect", "baseline"],
    ]);
  });

  it("reads a gain as passed only if the all-pairs analysis agrees, and says why when it withholds it", async () => {
    const agrees = await buildWorld({ tests: withTests({ L: every(300, 200) }) });
    const ok = read(agrees) as unknown as Out;
    expect(ok.tests?.results.L).toMatchObject({
      verdict: "passed",
      primaryVerdict: "passed",
      downgrade: null,
    });
    // the primary says ahead; the all-pairs analysis finds nothing
    const disagrees = await buildWorld({
      tests: withTests({ L: every(300, 200) }),
      robust: { L: every(250, 250) },
    });
    expect((read(disagrees) as unknown as Out).tests?.results.L).toMatchObject({
      verdict: "not-shown",
      primaryVerdict: "passed",
      downgrade: "robustness",
    });
    // the other arm is ahead in the all-pairs analysis: the same
    const opposite = await buildWorld({
      tests: withTests({ L: every(300, 200) }),
      robust: { L: every(200, 300) },
    });
    expect((read(opposite) as unknown as Out).tests?.results.L).toMatchObject({
      verdict: "not-shown",
      downgrade: "robustness",
    });
    // ahead, but at a p above 0.05
    const weak = await buildWorld({
      tests: withTests({ L: every(300, 200) }),
      robust: { L: every(255, 245) },
    });
    expect((read(weak) as unknown as Out).tests?.results.L).toMatchObject({
      verdict: "not-shown",
      downgrade: "robustness",
    });
  });

  it("withholds a reading when more than a tenth of the pairs were dropped, and reads a reversal under the same conditions", async () => {
    const dropped = await buildWorld({ tests: withTests({ L: every(300, 200) }), kept: 2600 });
    expect((read(dropped) as unknown as Out).tests?.results.L).toMatchObject({
      verdict: "not-shown",
      primaryVerdict: "passed",
      downgrade: "excluded",
    });
    const reversed = await buildWorld({ tests: withTests({ A3: every(200, 300) }) });
    expect((read(reversed) as unknown as Out).tests?.results.A3).toMatchObject({
      verdict: "reversed",
      downgrade: null,
    });
    const reversedButNot = await buildWorld({
      tests: withTests({ A3: every(200, 300) }),
      robust: { A3: every(250, 250) },
    });
    expect((read(reversedButNot) as unknown as Out).tests?.results.A3).toMatchObject({
      verdict: "not-shown",
      primaryVerdict: "reversed",
      downgrade: "robustness",
    });
  });

  it("refuses results without the all-pairs analysis or with one that is not the tests' own", async () => {
    const none = await buildWorld({ tests: withTests({}), noRobustness: true });
    expect(() => read(none)).toThrow(/robustness-all-pairs.json is missing/);
    const wrong = await buildWorld({ tests: withTests({}) });
    wrong.amend("experiments/acts/robustness-all-pairs.json", (j) => {
      delete (j.tests as Json).A3;
    });
    expect(() => read(wrong)).toThrow(/not the all-pairs analysis of the four tests/);
    const pvalue = await buildWorld({ tests: withTests({}) });
    pvalue.amend("experiments/acts/robustness-all-pairs.json", (j) => {
      ((j.tests as Json).L as { pooled: Json }).pooled.p = 0.5;
    });
    expect(() => read(pvalue)).toThrow(/its p is not the exact McNemar p of its counts/);
    const sums = await buildWorld({ tests: withTests({}) });
    sums.amend("experiments/acts/robustness-all-pairs.json", (j) => {
      const silent = ((j.tests as Json).L as { perClass: Record<string, Json | undefined> })
        .perClass.Silent;
      if (silent) silent.armOnly = 1;
    });
    expect(() => read(sums)).toThrow(/do not add up to the pooled one/);
    const other = await buildWorld({ tests: withTests({}) });
    other.amend("experiments/acts/robustness-all-pairs.json", (j) => {
      ((j.tests as Json).A1 as { pooled: Json }).pooled.primaryExcludedFraction = 0.2;
    });
    expect(() => read(other)).toThrow(/its excluded share is not the pooled file's/);
    const fewer = await buildWorld({ tests: withTests({}) });
    fewer.amend("experiments/acts/robustness-all-pairs.json", (j) => {
      const t = (j.tests as Json).A2 as { pooled: Json; perClass: Record<string, Json> };
      for (const c of Object.values(t.perClass)) c.arm = 0;
      t.pooled.arm = 0;
    });
    expect(() => read(fewer)).toThrow(
      /fewer wins than the pairs both arms completed|do not add up/,
    );
  });

  it("stops when an arm that is S in the early acts is not S's record for record", async () => {
    const noCheck = await buildWorld({ tests: withTests({}), noIdentity: true });
    expect(() => read(noCheck)).toThrow(/identity\/A2.json: not a passing identity check/);
    const broken = await buildWorld({ tests: withTests({}) });
    broken.amend("experiments/acts/identity/A3.json", (j) => {
      j.beforeDifferent = 2;
    });
    expect(() => read(broken)).toThrow(/identity\/A3.json: not a passing identity check/);
    const empty = await buildWorld({ tests: withTests({}) });
    empty.amend("experiments/acts/identity/A2.json", (j) => {
      j.beforePairs = 0;
    });
    expect(() => read(empty)).toThrow(/not a passing identity check/);
  });
});
