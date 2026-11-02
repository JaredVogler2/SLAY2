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
 * `scripts/lib/thresh.mjs` reads the threshold study (ADR-062) only when everything it rests on belongs together. These tests build a small repository (the
 * record with the hashes it quotes, the batches of the arms, the development selection, the pooled results, the per-class comparisons, the all-pairs analysis
 * and the design checks; no simulated game is involved, the counts are only consistent with each other) and break one thing at a time.
 */
const repo = join(__dirname, "..", "..", "..");
const CLASSES = ["ironclad", "defect"] as const;
type Cls = (typeof CLASSES)[number];
const EXACT: Record<Cls, string> = { ironclad: "Ironclad", defect: "Defect" };
const SHOWN: Record<Cls, string> = {
  ironclad: "ironclad-a0-v2.json",
  defect: "defect-a0-keep-v1.json",
};
const GRID = { t010: 0.1, t020: 0.2, t030: 0.3, t045: 0.45, t060: 0.6, tnone: 100 } as const;
type Tag = keyof typeof GRID;
const TAGS = Object.keys(GRID) as Tag[];
const DEV_HEAD = "d".repeat(40);
const VAL_HEAD = "e".repeat(40);
const SEEDS_FILE = "experiments/seeds/ironclad-a0-v4.json";
const MARKER1 = "Registration of ADR-062 (part 1, frozen choices)";
const MARKER2 = "Frozen choices of ADR-062 (part 2)";

type Json = Record<string, unknown>;
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

/** The nets of the screen (arm-only minus S-only wins on the development pairs): 0.2 is the best unless a world says otherwise. */
const NETS_QUIET: Record<Tag, number> = {
  t010: 5,
  t020: 20,
  t030: 12,
  t045: 8,
  t060: -3,
  tnone: -20,
};
const NETS_PEAK: Record<Tag, number> = { ...NETS_QUIET, t030: 70 };

interface Options {
  /** how far the study has got: the registration alone, the development screen, the held-out tests */
  stage?: "registered" | "screened" | "tested";
  frozen?: boolean;
  partTwo?: boolean;
  quoted?: boolean;
  /** the screen's nets; the default has 0.2 on top (nothing advances), NETS_PEAK has 0.3 far ahead (it advances) */
  nets?: Record<Tag, number>;
  /** the discordant wins of each class (arm-only, baseline-only), per test; a test left out gets (100, 100) */
  tests?: Partial<Record<"T1" | "T2" | "T3", Pairs>>;
  /** the discordant wins of the all-pairs analysis, per test (default: those of the primary test) */
  robust?: Partial<Record<"T1" | "T2" | "T3", Pairs>>;
  /** the pairs each class keeps in a primary test (default 14,000 of 15,000) */
  kept?: number;
  noRobustness?: boolean;
  noVerification?: boolean;
  /** a test of an arm that differs from S about the Act-1 boss, which it cannot (the design's own check) */
  breakBoss?: "T1" | "T2" | "T3";
  markerTwice?: boolean;
  /** the arm named by the record's `ARM_` line (default: the arm the screen sent forward, if it is not 0.2) */
  named?: string | null;
}

interface World {
  root: string;
  reports: Json[];
  path: (...p: string[]) => string;
  parse: Parse;
  amend: (file: string, change: (j: Json) => void, resync?: boolean) => void;
  rewriteRecord: (change: (text: string) => string) => void;
}

const bestOf = (nets: Record<Tag, number>): Tag => {
  let best: Tag = TAGS[0] ?? "t010";
  for (const tag of TAGS) if (nets[tag] > nets[best]) best = tag;
  return best;
};

async function buildWorld(options: Options = {}): Promise<World> {
  const o = {
    stage: "tested" as const,
    frozen: true,
    partTwo: true,
    quoted: true,
    nets: NETS_QUIET,
    tests: {} as NonNullable<Options["tests"]>,
    ...options,
  };
  const root = mkdtempSync(join(tmpdir(), "slay2-thresh-"));
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
  const idOf = (stage: "dev" | "val", arm: string, c: Cls) =>
    stage === "dev"
      ? `thresh-dev-${arm}-${c}-a0-veteran-keeprelics-dev2-n3000`
      : `thresh-val-${arm}-${c}-a0-veteran-keeprelics-val3-n15000`;

  // ---- the screen the nets give: the choice, its head-to-head against 0.2 and whether it advances
  const best = bestOf(o.nets);
  const headNet = o.nets[best] - o.nets.t020;
  const head =
    o.nets[best] > 0 && best !== "t020"
      ? { armOnly: 40 + headNet, baselineOnly: 40, net: headNet, p: mcnemarP(40 + headNet, 40) }
      : null;
  const advance = head !== null && head.armOnly > head.baselineOnly && head.p < 0.2;
  const tests: { key: "T1" | "T2" | "T3"; arm: string; baseline: string }[] = [
    { key: "T1", arm: "t020", baseline: "s" },
    ...(advance
      ? [
          { key: "T2" as const, arm: best, baseline: "s" },
          { key: "T3" as const, arm: best, baseline: "t020" },
        ]
      : []),
  ];
  const level = 0.05 / tests.length;

  // ---- batches: manifests (what the registration asks of them) and the exporter's reports
  const reports: Json[] = [];
  const added = new Set<string>();
  const policyOf = (arm: string, c: Cls) => {
    const values = `experiments/cardvalue/${SHOWN[c]}`;
    const eff = (extra: Json): Json => ({
      threshold: 0,
      values,
      values_sha256: shownSha(c),
      tune: { max_deck: 32 },
      ...extra,
    });
    if (arm === "s")
      return { name: "rules_v2", params: { threshold: 0, values }, effective: eff({}) };
    const late = GRID[arm as Tag];
    return {
      name: "rules_v2_late",
      params: { threshold: 0, values, late_threshold: late, late_acts: [1] },
      effective: eff({ late_acts: [1], late_threshold: late }),
    };
  };
  const addBatch = (stage: "dev" | "val", arm: string, c: Cls) => {
    const id = idOf(stage, arm, c);
    if (added.has(id)) return;
    added.add(id);
    const p = policyOf(arm, c);
    const n = stage === "dev" ? 3000 : 15000;
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
      environment: { slay2: { head: stage === "dev" ? DEV_HEAD : VAL_HEAD, dirty: false } },
      policy: { name: p.name, params: p.params, effective: { params: p.effective } },
      seeds: {
        file: SEEDS_FILE,
        file_sha256: sha(path(SEEDS_FILE)),
        n,
        partition: stage === "dev" ? "dev2" : "val3",
        sealed_partition_used: false,
      },
      simulator: { dirty: false, head: "5".repeat(40), pin_ok: true, pinned: "5".repeat(40) },
    });
    reports.push({
      id,
      policy: p.name,
      policyParams: p.params,
      character: EXACT[c],
      ascension: 0,
      profile: "veteran",
      keepRelics: true,
      partition: stage === "dev" ? "dev2" : "val3",
      seeds: n,
      classStartVerified: true,
      canonicalProcessState: true,
      completed: Math.round(n * 0.97),
      counts: {
        aborted: 0,
        harness_error: 0,
        invalid_action: 0,
        policy_error: 0,
        simulator_error: Math.round(n * 0.03),
        death: n - Math.round(n * 0.03) - 100,
        win: 100,
      },
      contentSha256: hex(id),
      sampleAudit: { ledgerOk: true, verified: 40, drawn: 40 },
    });
  };
  const screened = o.stage !== "registered";
  if (screened) for (const arm of ["s", ...TAGS]) for (const c of CLASSES) addBatch("dev", arm, c);

  // ---- the development selection
  if (screened) {
    const arms: Record<string, Json> = {};
    for (const tag of TAGS) {
      const net = o.nets[tag];
      const baselineOnly = 90;
      const armOnly = 90 + net;
      const pairs = 5700;
      const winsS = 220;
      arms[tag] = {
        threshold: GRID[tag],
        pairs,
        excluded: 300,
        wins: { arm: winsS + net, baseline: winsS },
        shares: { arm: (winsS + net) / pairs, baseline: winsS / pairs },
        difference: net / pairs,
        armOnly,
        baselineOnly,
        net,
        p: mcnemarP(armOnly, baselineOnly),
        pastAct1Boss: { arm: 0.83, baseline: 0.83 },
        pastAct2Boss: { arm: 0.3, baseline: 0.29 },
        meanFloorDifference: 0.1,
        meanDeckSize: { arm: 22, baseline: 24.3, pairs },
        identity: {
          beforePairs: 900,
          beforeDifferent: 0,
          bossPairs: 6000,
          bossDifferent: 0,
          wallClockPairs: 1,
        },
      };
    }
    write(path("experiments", "thresh", "dev-selection.json"), {
      schema: 1,
      kind: "thresh-dev-selection",
      role: "development: not a held-out result",
      slice: {
        partition: "dev2",
        n: 3000,
        classes: ["Ironclad", "Defect"],
        seedsFile: SEEDS_FILE,
      },
      baseline: "s",
      arms,
      best: { arm: best, threshold: GRID[best], net: o.nets[best] },
      headToHead: head,
      choice: {
        arm: advance ? best : null,
        threshold: advance ? GRID[best] : null,
        advance,
        reason: advance ? "ahead of 0.2 in the head-to-head" : "nothing advances",
      },
      contentSha256: Object.fromEntries(
        ["s", ...TAGS].flatMap((a) =>
          CLASSES.map((c) => [idOf("dev", a, c), hex(idOf("dev", a, c))]),
        ),
      ),
      designChecksPassed: true,
    });
  }

  // ---- the record
  const named = o.named === undefined ? (advance && best !== "t020" ? best : null) : o.named;
  const writeRecord = () => {
    const quotes = [...CLASSES.map((c) => shownSha(c)), sha(path(SEEDS_FILE))];
    const part2 = o.partTwo
      ? `**${MARKER2}.**\nDEV_HEAD=${DEV_HEAD}\n${
          screened ? sha(path("experiments", "thresh", "dev-selection.json")) : ""
        }\n${named ? `ARM_${named}\n` : ""}`
      : "";
    mkdirSync(path("docs"), { recursive: true });
    writeFileSync(
      path("docs", "DECISIONS.md"),
      `## 2026-11-02 — ADR-062: does the Act-2 pickiness result hold on seeds nobody has played, and is another threshold better?\n\nPart 1.\n${o.frozen ? `**${MARKER1}.**\n` : ""}${o.markerTwice ? `Item 7 names the heading '${MARKER1}' too.\n` : ""}${o.quoted ? quotes.join("\n") : "no hashes"}\n${part2}`,
    );
  };
  writeRecord();

  // ---- the held-out stage
  const kept = o.kept ?? 14000;
  const both = 300;
  if (o.stage === "tested") {
    const rob: Record<string, unknown> = {};
    for (const t of tests) {
      const discordant = o.tests[t.key] ?? every(100, 100);
      let sums: [number, number, number, number] = [0, 0, 0, 0];
      const members = CLASSES.map((c, i) => {
        addBatch("val", t.arm, c);
        addBatch("val", t.baseline, c);
        const [a, b] = discordant[i] ?? [0, 0];
        sums = [sums[0] + a, sums[1] + b, sums[2] + both, sums[3] + (kept - a - b - both)];
        const a1: [number, number] = o.breakBoss === t.key ? [40, 90] : [0, 0];
        const side = (arm: string, wins: number) => ({
          batchId: idOf("val", arm, c),
          contentSha256: hex(idOf("val", arm, c)),
          wins,
        });
        const winsA = side(t.arm, a + both);
        const winsB = side(t.baseline, b + both);
        write(path("experiments", "thresh", "per-class", `${t.key}-${c}.json`), {
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
          pairedSeeds: 15000,
          reachedAct2: {
            a: 0.83,
            b: 0.83,
            pairedTable: table(a1[0], a1[1], 11000, kept - 11000 - a1[0] - a1[1]),
          },
        };
      });
      const total = kept * 2;
      const [a, b, bothSum, neither] = sums;
      // the whole-seed interval: the pooled difference plus or minus z standard errors, the standard error being sqrt(discordant pairs) / pairs inflated by 15 %
      const se = (Math.sqrt(a + b) / total) * 1.15;
      const z = tests.length === 1 ? 1.96 : 2.394;
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
      const t2: [number, number, number, number] = [30, 20, 3000, total - 3050];
      const mean = (a - b) / total;
      write(path("experiments", "thresh", `pooled-thresh-${t.key}.json`), {
        kind: "pooled-paired-comparison",
        schema: 1,
        role: "held-out",
        difference: "a minus b",
        policies: { a: "x", b: "rules_v2" },
        cohort: {
          ascension: 0,
          characters: Object.values(EXACT),
          partition: "val3",
          profile: "veteran",
        },
        members,
        pairedSeeds: 30000,
        bothCompleted: total,
        excludedNotCompleted: 30000 - total,
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
          ci95: [mean - 1.96 * se, mean + 1.96 * se],
          endpoint: "win",
          ciAtLevel: { level: 1 - level, ci: [mean - z * se, mean + z * se] },
        },
        floorDifference: { meanAMinusB: 0.1, ci95: [0, 0.2] },
        contentSha256: hex(`pooled-${t.key}`),
      });
      // the all-pairs analysis: every pair of the 15,000 seeds, a game that was not won scored as not a win
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
        const rboth = Math.max(both, pa + both - ra, pb + both - rb);
        const part = {
          shared: 15000,
          primaryPairs: kept,
          pairs: 15000,
          notCompleted: { arm: 400, baseline: 400 },
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
        baseline: t.baseline,
        pooled: {
          ...tot,
          notCompleted: { arm: 800, baseline: 800 },
          p: mcnemarP(tot.armOnly, tot.baselineOnly),
          difference: (tot.arm - tot.baseline) / tot.pairs,
          primaryExcludedFraction: 1 - (2 * kept) / 30000,
        },
        perClass: per,
      };
    }
    const played = [...new Set(tests.flatMap((t) => [t.arm, t.baseline]))];
    for (const arm of played) {
      if (arm === "s") continue;
      const ids = CLASSES.flatMap((c) => [idOf("val", arm, c), idOf("val", "s", c)]);
      write(path("experiments", "thresh", "identity", `${arm}.json`), {
        kind: "thresh-identity",
        schema: 1,
        stage: "val",
        arm,
        firstAct: 1,
        beforePairs: 4800,
        beforeDifferent: 0,
        bossPairs: 30000,
        bossDifferent: 0,
        wallClockPairs: 2,
        batches: ids,
        contentSha256: Object.fromEntries(ids.map((i) => [i, hex(i)])),
      });
    }
    if (!o.noRobustness)
      write(path("experiments", "thresh", "robustness-all-pairs.json"), {
        kind: "thresh-robustness",
        schema: 1,
        level,
        tests: rob,
        contentSha256: Object.fromEntries(
          CLASSES.flatMap((c) =>
            tests.flatMap((t) =>
              [t.arm, t.baseline].map((a) => [idOf("val", a, c), hex(idOf("val", a, c))]),
            ),
          ),
        ),
      });
    if (!o.noVerification)
      write(path("experiments", "thresh", "verification.json"), {
        kind: "thresh-verification",
        schema: 1,
        files: Object.fromEntries(
          tests.map((t) => [
            `pooled-thresh-${t.key}.json`,
            {
              sha256: sha(path("experiments", "thresh", `pooled-thresh-${t.key}.json`)),
              exactChecks: 56,
              exactProblems: [],
              bootstrapChecks: 62,
              bootstrapDisagreements: [],
            },
          ]),
        ),
      });
  }
  return {
    root,
    reports,
    path,
    parse: await loadParser(),
    rewriteRecord: (change) => {
      const text = readFileSync(path("docs", "DECISIONS.md"), "utf8");
      writeFileSync(path("docs", "DECISIONS.md"), change(text));
    },
    amend: (file, change, resync = true) => {
      const before = sha(path(file));
      const j = JSON.parse(readFileSync(path(file), "utf8")) as Json;
      change(j);
      write(path(file), j);
      const after = sha(path(file));
      if (!resync) return;
      // the record quotes the selection's hash and the verification record holds the pooled files' hashes: keep them true unless a test breaks them
      if (file.endsWith("dev-selection.json"))
        writeFileSync(
          path("docs", "DECISIONS.md"),
          readFileSync(path("docs", "DECISIONS.md"), "utf8").replace(before, after),
        );
      const pooled = /pooled-thresh-(\w+)\.json$/.exec(file);
      if (pooled && existsSyncSafe(path("experiments", "thresh", "verification.json"))) {
        const v = JSON.parse(
          readFileSync(path("experiments", "thresh", "verification.json"), "utf8"),
        ) as { files: Record<string, { sha256: string }> };
        const entry = v.files[`pooled-thresh-${pooled[1]}.json`];
        if (entry) entry.sha256 = after;
        write(path("experiments", "thresh", "verification.json"), v);
      }
    },
  };
}

function existsSyncSafe(file: string): boolean {
  try {
    readFileSync(file);
    return true;
  } catch {
    return false;
  }
}

async function loadParser(): Promise<Parse> {
  const url = pathToFileURL(join(repo, "scripts", "lib", "thresh.mjs")).href;
  return ((await import(/* @vite-ignore */ url)) as { parseThresh: Parse }).parseThresh;
}

const read = (w: World) => w.parse({ root: w.root, reports: w.reports });
interface Result {
  verdict: string;
  primaryVerdict: string;
  downgrade: string | null;
  downgrades: string[];
  narrow: boolean;
  arm: string;
  baseline: string;
  wins: { arm: number; baseline: number };
  perClass: { character: string; verdict: string }[];
  verification: { bootstrapDisagreements: string[] };
}
interface Out {
  registered: boolean;
  frozen: boolean;
  partTwo: boolean;
  stage: string;
  level?: number;
  screen: {
    best: { arm: string };
    choice: { advance: boolean; arm: string | null };
    tests: { key: string; arm: string; baseline: string }[];
  } | null;
  tests: { results: Record<string, Result>; order: string[]; levelLabel: string } | null;
}

describe("the exporter reads the threshold study only when it belongs together", () => {
  it("says the study is not registered when the log has no record of it, and refuses files without one", async () => {
    const w = await buildWorld({ stage: "screened" });
    writeFileSync(w.path("docs", "DECISIONS.md"), "## ADR-061\n");
    expect(() => read(w)).toThrow(/exist but docs\/DECISIONS.md has no ADR-062/);
    rmSync(w.path("experiments", "thresh"), { recursive: true });
    expect(read(w)).toEqual({ registered: false });
  });

  it("carries the registration alone before any file exists", async () => {
    const w = await buildWorld({ stage: "registered", partTwo: false });
    const out = read(w) as unknown as Out;
    expect(out).toMatchObject({ registered: true, frozen: true, stage: "registered", tests: null });
    const unfrozen = await buildWorld({
      stage: "registered",
      partTwo: false,
      frozen: false,
      quoted: false,
    });
    expect((read(unfrozen) as unknown as Out).frozen).toBe(false);
  });

  it("refuses a selection before the registration or before part 2, and held-out output without a selection", async () => {
    const early = await buildWorld({ stage: "screened", frozen: false });
    expect(() => read(early)).toThrow(/has no registration/);
    const noPartTwo = await buildWorld({ stage: "screened", partTwo: false });
    expect(() => read(noPartTwo)).toThrow(/has no part 2/);
    const orphan = await buildWorld({ stage: "tested" });
    rmSync(orphan.path("experiments", "thresh", "dev-selection.json"));
    expect(() => read(orphan)).toThrow(/held-out output but no dev-selection.json/);
  });

  it("requires the hashes the record quotes, and the selection's among them", async () => {
    const none = await buildWorld({ stage: "screened", quoted: false });
    expect(() => read(none)).toThrow(/is not quoted in ADR-062/);
    const sel = await buildWorld({ stage: "screened" });
    sel.rewriteRecord((t) =>
      t.replace(sha(sel.path("experiments", "thresh", "dev-selection.json")), "x"),
    );
    expect(() => read(sel)).toThrow(/dev-selection.json: its SHA-256 .* is not quoted/);
  });

  it("refuses a record that names a heading twice", async () => {
    const one = await buildWorld({ stage: "registered", partTwo: false, markerTwice: true });
    expect(() => read(one)).toThrow(
      /carries the text .* 2 times; the registration heading occurs once/,
    );
    const two = await buildWorld({ stage: "screened" });
    two.rewriteRecord((t) => `${t}\nSee '${MARKER2}' again.\n`);
    expect(() => read(two)).toThrow(/the heading of part 2 occurs once/);
  });
});

describe("the development screen", () => {
  it("applies the registered rule again: with 0.2 on top nothing advances and only T1 is left, at the whole level", async () => {
    const w = await buildWorld({ stage: "screened" });
    const out = read(w) as unknown as Out;
    expect(out.stage).toBe("screened");
    expect(out.screen?.best.arm).toBe("t020");
    expect(out.screen?.choice).toMatchObject({ advance: false, arm: null });
    expect(out.screen?.tests).toEqual([{ key: "T1", arm: "t020", baseline: "s" }]);
    expect(out.level).toBeCloseTo(0.05, 12);
    expect(out.tests).toBeNull();
  });

  it("advances a threshold that is ahead of 0.2 and leaves three tests at a third of the level", async () => {
    const w = await buildWorld({ stage: "screened", nets: NETS_PEAK });
    const out = read(w) as unknown as Out;
    expect(out.screen?.best.arm).toBe("t030");
    expect(out.screen?.choice).toMatchObject({ advance: true, arm: "t030" });
    expect(out.screen?.tests.map((t) => [t.key, t.arm, t.baseline])).toEqual([
      ["T1", "t020", "s"],
      ["T2", "t030", "s"],
      ["T3", "t030", "t020"],
    ]);
    expect(out.level).toBeCloseTo(0.05 / 3, 12);
  });

  it("does not advance a choice that is not ahead of 0.2 at the head-to-head level, whatever its net", async () => {
    // 0.3 ahead by 4 net wins only: head-to-head 44 against 40, exact p far above 0.2
    const w = await buildWorld({ stage: "screened", nets: { ...NETS_QUIET, t030: 24 } });
    const out = read(w) as unknown as Out;
    expect(out.screen?.best.arm).toBe("t030");
    expect(out.screen?.choice).toMatchObject({ advance: false, arm: null });
    expect(out.screen?.tests).toHaveLength(1);
  });

  it("hands a tie to the smaller threshold and needs a net above zero", async () => {
    const tie = await buildWorld({
      stage: "screened",
      nets: { t010: 20, t020: 20, t030: 20, t045: 20, t060: 20, tnone: 20 },
    });
    const out = read(tie) as unknown as Out;
    expect(out.screen?.best.arm).toBe("t010");
    expect(out.screen?.choice.advance).toBe(false); // t010 is ahead of 0.2 by nothing: the head-to-head is a dead heat
    const down = await buildWorld({
      stage: "screened",
      nets: { t010: -5, t020: -9, t030: -4, t045: -12, t060: -1, tnone: -30 },
    });
    const d = read(down) as unknown as Out;
    expect(d.screen?.best.arm).toBe("t060");
    expect(d.screen?.choice.advance).toBe(false);
    // a net of exactly zero is not above zero, however far ahead of 0.2 (which is far behind) the choice is
    const zero = await buildWorld({
      stage: "screened",
      nets: { t010: 0, t020: -60, t030: -70, t045: -80, t060: -90, tnone: -100 },
    });
    const z = read(zero) as unknown as Out;
    expect(z.screen?.best.arm).toBe("t010");
    expect(z.screen?.choice).toMatchObject({ advance: false, arm: null });
  });

  it("refuses a selection whose choice is not what the rule gives", async () => {
    const forced = await buildWorld({ stage: "screened" });
    forced.amend("experiments/thresh/dev-selection.json", (j) => {
      j.choice = { arm: "t030", threshold: 0.3, advance: true, reason: "by hand" };
    });
    expect(() => read(forced)).toThrow(/the choice is not what the rule of item 3 gives/);
    const wrongBest = await buildWorld({ stage: "screened", nets: NETS_PEAK });
    wrongBest.amend("experiments/thresh/dev-selection.json", (j) => {
      j.best = { arm: "t020", threshold: 0.2, net: 20 };
    });
    expect(() => read(wrongBest)).toThrow(
      /the largest net wins are t030's \(70\) by the rule of item 3/,
    );
    const noHead = await buildWorld({ stage: "screened", nets: NETS_PEAK });
    noHead.amend("experiments/thresh/dev-selection.json", (j) => {
      j.headToHead = null;
    });
    expect(() => read(noHead)).toThrow(/the head-to-head of t030 against 0.2 is missing/);
    const extra = await buildWorld({ stage: "screened" });
    extra.amend("experiments/thresh/dev-selection.json", (j) => {
      j.headToHead = { armOnly: 1, baselineOnly: 1, net: 0, p: 1 };
    });
    expect(() => read(extra)).toThrow(/a head-to-head is written where the rule reads none/);
  });

  it("refuses a selection whose arithmetic does not add up", async () => {
    const net = await buildWorld({ stage: "screened" });
    net.amend("experiments/thresh/dev-selection.json", (j) => {
      ((j.arms as Json).t010 as Json).net = 7;
    });
    expect(() => read(net)).toThrow(
      /t010: its net wins are not the arm-only minus the S-only wins/,
    );
    const p = await buildWorld({ stage: "screened" });
    p.amend("experiments/thresh/dev-selection.json", (j) => {
      ((j.arms as Json).t045 as Json).p = 0.5;
    });
    expect(() => read(p)).toThrow(/t045: its p is not the exact McNemar p of its counts/);
    const wins = await buildWorld({ stage: "screened" });
    wins.amend("experiments/thresh/dev-selection.json", (j) => {
      (((j.arms as Json).tnone as Json).wins as Json).arm = 10;
    });
    expect(() => read(wins)).toThrow(
      /tnone: the net wins are not the difference of the two arms' wins/,
    );
    const pairs = await buildWorld({ stage: "screened" });
    pairs.amend("experiments/thresh/dev-selection.json", (j) => {
      ((j.arms as Json).t060 as Json).excluded = 10;
    });
    expect(() => read(pairs)).toThrow(/t060: its pairs, wins and shares do not add up/);
    const thr = await buildWorld({ stage: "screened" });
    thr.amend("experiments/thresh/dev-selection.json", (j) => {
      ((j.arms as Json).t030 as Json).threshold = 0.35;
    });
    expect(() => read(thr)).toThrow(/t030: its threshold is not 0.3/);
    const arms = await buildWorld({ stage: "screened" });
    arms.amend("experiments/thresh/dev-selection.json", (j) => {
      delete (j.arms as Json).tnone;
    });
    expect(() => read(arms)).toThrow(/the arms are not the six thresholds/);
  });

  it("stops on a design check that did not pass, and on a selection that is not the registered slice", async () => {
    const d = await buildWorld({ stage: "screened" });
    d.amend("experiments/thresh/dev-selection.json", (j) => {
      (((j.arms as Json).t020 as Json).identity as Json).beforeDifferent = 1;
    });
    expect(() => read(d)).toThrow(/t020: not a passing design check against S/);
    const boss = await buildWorld({ stage: "screened" });
    boss.amend("experiments/thresh/dev-selection.json", (j) => {
      (((j.arms as Json).t045 as Json).identity as Json).bossDifferent = 2;
    });
    expect(() => read(boss)).toThrow(/t045: not a passing design check against S/);
    const slice = await buildWorld({ stage: "screened" });
    slice.amend("experiments/thresh/dev-selection.json", (j) => {
      (j.slice as Json).partition = "dev";
    });
    expect(() => read(slice)).toThrow(/not the development screen of the registration/);
    const checks = await buildWorld({ stage: "screened" });
    checks.amend("experiments/thresh/dev-selection.json", (j) => {
      j.designChecksPassed = false;
    });
    expect(() => read(checks)).toThrow(/not the development screen of the registration/);
  });

  it("requires part 2 to name exactly the arm that went forward, and the commit the stage was played from", async () => {
    const missing = await buildWorld({ stage: "screened", nets: NETS_PEAK, named: null });
    expect(() => read(missing)).toThrow(/part 2 names the arms ''; the screen sent forward 't030'/);
    const extra = await buildWorld({ stage: "screened", nets: NETS_PEAK, named: "t045" });
    expect(() => read(extra)).toThrow(
      /part 2 names the arms 't045'; the screen sent forward 't030'/,
    );
    const stray = await buildWorld({ stage: "screened", named: "t030" });
    expect(() => read(stray)).toThrow(/names the arms 't030'; the screen sent forward ''/);
    const head = await buildWorld({ stage: "screened" });
    head.rewriteRecord((t) => t.replace(/DEV_HEAD=[0-9a-f]{40}/, "DEV_HEAD=" + "f".repeat(40)));
    expect(() => read(head)).toThrow(/not all played from the commit part 2 quotes/);
    const noHead = await buildWorld({ stage: "screened" });
    noHead.rewriteRecord((t) => t.replace(/DEV_HEAD=[0-9a-f]{40}/, "nothing"));
    expect(() => read(noHead)).toThrow(/has to quote the development commit once/);
  });

  it("refuses development batches that are not what the registration asks of them", async () => {
    const dirty = await buildWorld({ stage: "screened" });
    dirty.amend(
      "experiments/batches/thresh-dev-s-defect-a0-veteran-keeprelics-dev2-n3000/manifest.json",
      (j) => {
        ((j.environment as Json).slay2 as Json).dirty = true;
      },
    );
    expect(() => read(dirty)).toThrow(/uncommitted changes/);
    const thr = await buildWorld({ stage: "screened" });
    thr.amend(
      "experiments/batches/thresh-dev-t045-ironclad-a0-veteran-keeprelics-dev2-n3000/manifest.json",
      (j) => {
        (((j.policy as Json).effective as Json).params as Json).late_threshold = 0.5;
      },
    );
    expect(() => read(thr)).toThrow(/its threshold in Act 2 is not 0.45/);
    const act = await buildWorld({ stage: "screened" });
    act.amend(
      "experiments/batches/thresh-dev-t030-defect-a0-veteran-keeprelics-dev2-n3000/manifest.json",
      (j) => {
        (((j.policy as Json).effective as Json).params as Json).late_acts = [2];
      },
    );
    expect(() => read(act)).toThrow(/with the late rule on Act 2 only/);
    const content = await buildWorld({ stage: "screened" });
    const target = content.reports.find((r) => String(r.id).startsWith("thresh-dev-s-ironclad"));
    if (target) target.contentSha256 = "0".repeat(64);
    expect(() => read(content)).toThrow(
      /it was not made from the content of thresh-dev-s-ironclad/,
    );
    const partition = await buildWorld({ stage: "screened" });
    const other = partition.reports.find((r) => String(r.id).startsWith("thresh-dev-t010-defect"));
    if (other) other.partition = "dev";
    expect(other).toBeDefined();
    expect(() => read(partition)).toThrow(/it is not the 3000 dev2 seeds/);
    const base = await buildWorld({ stage: "screened" });
    const s = base.reports.find((r) => String(r.id).startsWith("thresh-dev-s-defect"));
    if (s) s.policy = "rules_v2_late";
    expect(() => read(base)).toThrow(/its policy is rules_v2_late/);
  });
});

describe("the held-out tests", () => {
  it("reads T1 alone at the whole level when the screen advanced nothing, and applies the rule to the numbers", async () => {
    const w = await buildWorld({ tests: { T1: every(300, 200) } });
    const out = read(w) as unknown as Out;
    expect(out.stage).toBe("tested");
    expect(out.tests?.order).toEqual(["T1"]);
    expect(out.tests?.levelLabel).toBe("0.05 / 1");
    expect(out.tests?.results.T1).toMatchObject({
      verdict: "passed",
      primaryVerdict: "passed",
      downgrade: null,
      arm: "t020",
      baseline: "s",
      wins: { arm: 1200, baseline: 1000 },
    });
  });

  it("reads three tests at a third of the level when the screen advanced a threshold, T3 against 0.2", async () => {
    const w = await buildWorld({
      nets: NETS_PEAK,
      tests: { T1: every(100, 100), T2: every(300, 200), T3: every(200, 300) },
    });
    const out = read(w) as unknown as Out;
    expect(out.tests?.order).toEqual(["T1", "T2", "T3"]);
    expect(out.tests?.levelLabel).toBe("0.05 / 3");
    expect(out.tests?.results.T1?.verdict).toBe("not-shown");
    expect(out.tests?.results.T2).toMatchObject({ verdict: "passed", arm: "t030", baseline: "s" });
    expect(out.tests?.results.T3).toMatchObject({
      verdict: "reversed",
      arm: "t030",
      baseline: "t020",
    });
  });

  it("reads a gain that is significant at 0.05 but not at 0.05 / 3 as not shown, and one whose interval reaches zero as not shown", async () => {
    // 123 against 89 (62, 45 and 61, 44): the exact p is 0.0196, the inflated interval at 0.05 still excludes zero; at 0.05 / 3 the p is above the level
    const pairs: Pairs = [
      [62, 45],
      [61, 44],
    ];
    const alone = await buildWorld({ tests: { T1: pairs } });
    expect((read(alone) as unknown as Out).tests?.results.T1?.verdict).toBe("passed");
    const split = await buildWorld({ nets: NETS_PEAK, tests: { T1: pairs } });
    expect((read(split) as unknown as Out).tests?.results.T1?.verdict).toBe("not-shown");
    const wide = await buildWorld({ tests: { T1: every(300, 200) } });
    wide.amend("experiments/thresh/pooled-thresh-T1.json", (j) => {
      ((j.clusteredDifference as Json).ciAtLevel as Json).ci = [-0.001, 0.05];
    });
    expect((read(wide) as unknown as Out).tests?.results.T1?.verdict).toBe("not-shown");
  });

  it("calls a pass whose interval's lower end is under a quarter of the difference a narrow pass", async () => {
    const w = await buildWorld({ tests: { T1: every(300, 200) } });
    expect((read(w) as unknown as Out).tests?.results.T1?.narrow).toBe(false);
    w.amend("experiments/thresh/pooled-thresh-T1.json", (j) => {
      const cl = j.clusteredDifference as { meanAMinusB: number; ciAtLevel: { ci: number[] } };
      cl.ciAtLevel.ci = [cl.meanAMinusB * 0.2, cl.meanAMinusB * 1.8];
      (j.clusteredDifference as { ci95: number[] }).ci95 = [
        cl.meanAMinusB * 0.3,
        cl.meanAMinusB * 1.7,
      ];
    });
    expect((read(w) as unknown as Out).tests?.results.T1).toMatchObject({
      verdict: "passed",
      narrow: true,
    });
  });

  it("refuses the wrong set of tests: a missing one, or one the screen did not leave", async () => {
    const missing = await buildWorld({ nets: NETS_PEAK });
    rmSync(missing.path("experiments", "thresh", "pooled-thresh-T3.json"));
    expect(() => read(missing)).toThrow(/run together, once/);
    const extra = await buildWorld({ nets: NETS_QUIET });
    writeFileSync(extra.path("experiments", "thresh", "pooled-thresh-T2.json"), "{}");
    expect(() => read(extra)).toThrow(/run together, once/);
  });

  it("refuses a pooled file whose interval is not of the wins endpoint or not at the level of the tests it belongs to", async () => {
    const a = await buildWorld({});
    a.amend("experiments/thresh/pooled-thresh-T1.json", (j) => {
      (j.clusteredDifference as Json).endpoint = "act2";
    });
    expect(() => read(a)).toThrow(/not of the wins endpoint/);
    // a file read at the level of three tests where one is played (or the reverse) is not the registered level
    const b = await buildWorld({ nets: NETS_PEAK });
    b.amend("experiments/thresh/pooled-thresh-T2.json", (j) => {
      ((j.clusteredDifference as Json).ciAtLevel as Json).level = 0.95;
    });
    expect(() => read(b)).toThrow(/no whole-seed interval at level/);
    const c = await buildWorld({});
    c.amend("experiments/thresh/pooled-thresh-T1.json", (j) => {
      (j.clusteredDifference as Json).meanAMinusB = 0.2;
    });
    expect(() => read(c)).toThrow(/not the difference of its two win shares/);
    const d = await buildWorld({});
    d.amend("experiments/thresh/pooled-thresh-T1.json", (j) => {
      (j.cohort as Json).partition = "val2";
    });
    expect(() => read(d)).toThrow(/not a held-out comparison/);
    const e = await buildWorld({});
    e.amend("experiments/thresh/pooled-thresh-T1.json", (j) => {
      j.members = (j.members as Json[]).slice(0, 1);
    });
    expect(() => read(e)).toThrow(/it must pool ironclad and defect, once each/);
  });

  it("refuses arms that are not the ones registered", async () => {
    const thr = await buildWorld({});
    thr.amend(
      "experiments/batches/thresh-val-t020-ironclad-a0-veteran-keeprelics-val3-n15000/manifest.json",
      (j) => {
        (((j.policy as Json).effective as Json).params as Json).late_threshold = 0.3;
      },
    );
    expect(() => read(thr)).toThrow(/its threshold in Act 2 is not 0.2/);
    const base = await buildWorld({});
    base.amend(
      "experiments/batches/thresh-val-s-defect-a0-veteran-keeprelics-val3-n15000/manifest.json",
      (j) => {
        (((j.policy as Json).effective as Json).params as Json).late_threshold = 0.2;
      },
    );
    expect(() => read(base)).toThrow(/it is not rules_v2 with .* at threshold 0/);
    const swapped = await buildWorld({ nets: NETS_PEAK });
    swapped.amend("experiments/thresh/pooled-thresh-T3.json", (j) => {
      const members = j.members as { b: { batchId: string; contentSha256: string } }[];
      const first = members[0];
      if (first) {
        first.b.batchId = "thresh-val-s-ironclad-a0-veteran-keeprelics-val3-n15000";
        first.b.contentSha256 = hex(first.b.batchId);
      }
    });
    expect(() => read(swapped)).toThrow(
      /batch thresh-val-s-ironclad.* \(ironclad, t020\): its policy is rules_v2/,
    );
  });

  it("stops when two arms that are S until Act 2 differ about the Act-1 boss (the design's own check)", async () => {
    const w = await buildWorld({ nets: NETS_PEAK, breakBoss: "T2" });
    expect(() => read(w)).toThrow(/differ about the Act-1 boss in 260 pairs/);
  });

  it("refuses per-class files that do not add up to the pooled table, and batches that were not played from a clean tree or one commit", async () => {
    const w = await buildWorld({ tests: { T1: every(300, 200) } });
    w.amend("experiments/thresh/per-class/T1-defect.json", (j) => {
      const tab = j.pairedWinTable as { a_only: number; both: number };
      tab.a_only += 1;
      tab.both -= 1;
    });
    expect(() => read(w)).toThrow(/do not add up to the pooled one|exact McNemar p/);
    const dirty = await buildWorld({});
    dirty.amend(
      "experiments/batches/thresh-val-s-defect-a0-veteran-keeprelics-val3-n15000/manifest.json",
      (j) => {
        ((j.environment as Json).slay2 as Json).dirty = true;
      },
    );
    expect(() => read(dirty)).toThrow(/uncommitted changes/);
    const heads = await buildWorld({ nets: NETS_PEAK });
    heads.amend(
      "experiments/batches/thresh-val-t030-defect-a0-veteran-keeprelics-val3-n15000/manifest.json",
      (j) => {
        ((j.environment as Json).slay2 as Json).head = "b".repeat(40);
      },
    );
    expect(() => read(heads)).toThrow(/played from 2 different commits/);
  });

  it("carries the class results at the class level, win by win", async () => {
    const w = await buildWorld({
      tests: {
        T1: [
          [400, 100],
          [90, 140],
        ],
      },
    });
    const out = read(w) as unknown as Out;
    expect(out.tests?.results.T1?.perClass.map((c) => [c.character, c.verdict])).toEqual([
      ["ironclad", "arm"],
      ["defect", "baseline"],
    ]);
  });

  it("reads a gain as passed only if the all-pairs analysis agrees, and says why when it withholds it", async () => {
    const ok = await buildWorld({ tests: { T1: every(300, 200) } });
    expect((read(ok) as unknown as Out).tests?.results.T1).toMatchObject({
      verdict: "passed",
      downgrade: null,
    });
    for (const [label, robust] of [
      ["finds nothing", every(250, 250)],
      ["has the other arm ahead", every(200, 300)],
      ["is ahead at a p above 0.05", every(255, 245)],
    ] as const) {
      const w = await buildWorld({ tests: { T1: every(300, 200) }, robust: { T1: robust } });
      expect(
        (read(w) as unknown as Out).tests?.results.T1,
        `the all-pairs analysis ${label}`,
      ).toMatchObject({ verdict: "not-shown", primaryVerdict: "passed", downgrade: "robustness" });
    }
  });

  it("withholds a reading when more than a tenth of the pairs were dropped, names every condition, and reads a reversal under the same conditions", async () => {
    const dropped = await buildWorld({ tests: { T1: every(300, 200) }, kept: 13000 });
    expect((read(dropped) as unknown as Out).tests?.results.T1).toMatchObject({
      verdict: "not-shown",
      downgrade: "excluded",
    });
    const both = await buildWorld({
      tests: { T1: every(300, 200) },
      kept: 13000,
      robust: { T1: every(250, 250) },
    });
    expect((read(both) as unknown as Out).tests?.results.T1).toMatchObject({
      downgrade: "excluded",
      downgrades: ["excluded", "robustness"],
    });
    const reversed = await buildWorld({ tests: { T1: every(200, 300) } });
    expect((read(reversed) as unknown as Out).tests?.results.T1).toMatchObject({
      verdict: "reversed",
      downgrade: null,
    });
    const reversedButNot = await buildWorld({
      tests: { T1: every(200, 300) },
      robust: { T1: every(250, 250) },
    });
    expect((read(reversedButNot) as unknown as Out).tests?.results.T1).toMatchObject({
      verdict: "not-shown",
      primaryVerdict: "reversed",
      downgrade: "robustness",
    });
  });

  it("refuses results without the all-pairs analysis or with one that is not the tests' own", async () => {
    const none = await buildWorld({ noRobustness: true });
    expect(() => read(none)).toThrow(/robustness-all-pairs.json is missing/);
    const wrongLevel = await buildWorld({ nets: NETS_PEAK });
    wrongLevel.amend("experiments/thresh/robustness-all-pairs.json", (j) => {
      j.level = 0.05;
    });
    expect(() => read(wrongLevel)).toThrow(
      /not the all-pairs analysis of the tests the screen left/,
    );
    const wrongTests = await buildWorld({ nets: NETS_PEAK });
    wrongTests.amend("experiments/thresh/robustness-all-pairs.json", (j) => {
      delete (j.tests as Json).T3;
    });
    expect(() => read(wrongTests)).toThrow(
      /not the all-pairs analysis of the tests the screen left/,
    );
    const pvalue = await buildWorld({});
    pvalue.amend("experiments/thresh/robustness-all-pairs.json", (j) => {
      ((j.tests as Json).T1 as { pooled: Json }).pooled.p = 0.5;
    });
    expect(() => read(pvalue)).toThrow(/its p is not the exact McNemar p of its counts/);
    const sums = await buildWorld({});
    sums.amend("experiments/thresh/robustness-all-pairs.json", (j) => {
      const defect = ((j.tests as Json).T1 as { perClass: Record<string, Json | undefined> })
        .perClass.Defect;
      if (defect) defect.armOnly = 1;
    });
    expect(() => read(sums)).toThrow(/do not add up to the pooled one/);
    const hash = await buildWorld({});
    hash.amend("experiments/thresh/robustness-all-pairs.json", (j) => {
      (j.contentSha256 as Record<string, string>)[
        "thresh-val-s-defect-a0-veteran-keeprelics-val3-n15000"
      ] = "f".repeat(64);
    });
    expect(() => read(hash)).toThrow(/it was not made from the content of thresh-val-s-defect/);
    const other = await buildWorld({});
    other.amend("experiments/thresh/robustness-all-pairs.json", (j) => {
      ((j.tests as Json).T1 as { pooled: Json }).pooled.primaryExcludedFraction = 0.2;
    });
    expect(() => read(other)).toThrow(/its excluded share is not the pooled file's/);
    const pair = await buildWorld({ nets: NETS_PEAK });
    pair.amend("experiments/thresh/robustness-all-pairs.json", (j) => {
      ((j.tests as Json).T3 as { baseline: string }).baseline = "s";
    });
    expect(() => read(pair)).toThrow(/no analysis of test T3 for t030 against t020/);
  });

  it("stops when an arm that is S until Act 2 is not S's record for record", async () => {
    const broken = await buildWorld({ nets: NETS_PEAK });
    broken.amend("experiments/thresh/identity/t030.json", (j) => {
      j.beforeDifferent = 2;
    });
    expect(() => read(broken)).toThrow(/identity\/t030.json: not a passing design check/);
    const boss = await buildWorld({});
    boss.amend("experiments/thresh/identity/t020.json", (j) => {
      j.bossDifferent = 1;
    });
    expect(() => read(boss)).toThrow(/identity\/t020.json: not a passing design check/);
    const empty = await buildWorld({});
    empty.amend("experiments/thresh/identity/t020.json", (j) => {
      j.beforePairs = 0;
    });
    expect(() => read(empty)).toThrow(/not a passing design check/);
    const none = await buildWorld({});
    rmSync(none.path("experiments", "thresh", "identity", "t020.json"));
    expect(() => read(none)).toThrow(/identity\/t020.json: not a passing design check/);
    const made = await buildWorld({});
    made.amend("experiments/thresh/identity/t020.json", (j) => {
      (j.contentSha256 as Record<string, string>)[
        "thresh-val-t020-defect-a0-veteran-keeprelics-val3-n15000"
      ] = "0".repeat(64);
    });
    expect(() => read(made)).toThrow(
      /identity\/t020.json: it was not made from the content of thresh-val-t020-defect/,
    );
    const batches = await buildWorld({});
    batches.amend("experiments/thresh/identity/t020.json", (j) => {
      (j.batches as string[]).pop();
    });
    expect(() => read(batches)).toThrow(/not made from the batches of t020 and S/);
    const stray = await buildWorld({});
    writeFileSync(stray.path("experiments", "thresh", "identity", "t060.json"), "{}");
    expect(() => read(stray)).toThrow(/a design-check record of an arm that was not played/);
  });

  it("requires the independent recomputation of every pooled file, and carries what its resample disagreed about", async () => {
    const none = await buildWorld({ noVerification: true });
    expect(() => read(none)).toThrow(/verification.json is missing/);
    const stale = await buildWorld({});
    stale.amend(
      "experiments/thresh/pooled-thresh-T1.json",
      (j) => {
        (j.floorDifference as Json).meanAMinusB = 0.2;
      },
      false,
    );
    expect(() => read(stale)).toThrow(/no passing recomputation of pooled-thresh-T1.json/);
    const bad = await buildWorld({});
    bad.amend("experiments/thresh/verification.json", (j) => {
      ((j.files as Json)["pooled-thresh-T1.json"] as { exactProblems: string[] }).exactProblems = [
        "pooled wins a_only: the file says 1, the episodes give 2",
      ];
    });
    expect(() => read(bad)).toThrow(/no passing recomputation of pooled-thresh-T1.json/);
    const soft = await buildWorld({ tests: { T1: every(300, 200) } });
    soft.amend("experiments/thresh/verification.json", (j) => {
      (
        (j.files as Json)["pooled-thresh-T1.json"] as { bootstrapDisagreements: string[] }
      ).bootstrapDisagreements = [
        "the whole-seed 95 % interval, upper end: the file says 0.007, an independent resample gives 0.010",
      ];
    });
    const out = read(soft) as unknown as Out;
    expect(out.tests?.results.T1).toMatchObject({ verdict: "passed" });
    expect(out.tests?.results.T1?.verification.bootstrapDisagreements).toHaveLength(1);
    const kind = await buildWorld({});
    kind.amend("experiments/thresh/verification.json", (j) => {
      j.kind = "acts-verification";
    });
    expect(() => read(kind)).toThrow(/not a verification record of schema 1/);
  });

  it("checks that the intervals nest around the estimate", async () => {
    const w = await buildWorld({ tests: { T1: every(300, 200) } });
    w.amend("experiments/thresh/pooled-thresh-T1.json", (j) => {
      const cl = j.clusteredDifference as { ci95: number[]; meanAMinusB: number };
      cl.ci95 = [cl.meanAMinusB - 0.01, cl.meanAMinusB + 0.01]; // wider than the interval at the level
    });
    expect(() => read(w)).toThrow(/its two intervals do not nest around the pooled difference/);
    const off = await buildWorld({ tests: { T1: every(300, 200) } });
    off.amend("experiments/thresh/pooled-thresh-T1.json", (j) => {
      const cl = j.clusteredDifference as { ciAtLevel: { ci: number[] }; meanAMinusB: number };
      cl.ciAtLevel.ci = [cl.meanAMinusB + 0.001, cl.meanAMinusB + 0.01];
    });
    expect(() => read(off)).toThrow(/its two intervals do not nest around the pooled difference/);
  });
});

describe("the partitions that are development", () => {
  it("are the harness's, so a batch on dev2 is never shown as held out", async () => {
    const url = pathToFileURL(join(repo, "scripts", "lib", "pooled.mjs")).href;
    const lib = (await import(/* @vite-ignore */ url)) as {
      DEVELOPMENT_PARTITIONS: string[];
      roleOf: (partition: string) => string;
    };
    const py = readFileSync(join(repo, "sim", "slay2_sim", "manifest.py"), "utf8");
    const listed = /DEVELOPMENT_PARTITIONS\s*=\s*\(([^)]*)\)/.exec(py)?.[1] ?? "";
    const harness = [...listed.matchAll(/"([a-z0-9]+)"/g)].map((m) => m[1]);
    expect([...lib.DEVELOPMENT_PARTITIONS].sort()).toEqual([...harness].sort());
    expect(lib.roleOf("dev2")).toBe("development (dev2 partition): not a held-out result");
    expect(lib.roleOf("train")).toMatch(/^development/);
    for (const held of ["val", "val2", "val3"]) expect(lib.roleOf(held)).toBe("held-out");
  });
});

// ---- the reading code, condition by condition ----------------------------------------------------------------------------------------------------------
// The world-level tests above build whole repositories; these call the exported rule itself, so that each element of item 5 of the record (a strict comparison,
// a divisor, a direction, a level) has a test that fails when it is changed.
interface Head {
  armOnly: number;
  baselineOnly: number;
  p: number;
}
interface Primary extends Head {
  ci: [number, number];
  level: number;
}
interface Reading {
  verdict: string;
  primary: string;
  downgrade: string | null;
  downgrades: string[];
}
interface Lib {
  parseThresh: (a: { root: string; reports: Json[]; sizes?: { dev: number; val: number } }) => Json;
  parseThreshWith: (
    a: { root: string; reports: Json[] },
    sizes: { dev: number; val: number },
  ) => Json;
  verdictOf: (a: Primary) => string;
  readingOf: (a: Primary & { robust: Head; excludedFraction: number }) => Reading;
  isNarrow: (a: { verdict: string; difference: number; ci: [number, number] }) => boolean;
  advanceOf: (best: string, net: number, head: Head | null) => boolean;
  bestOf: (nets: Record<string, number>) => string;
  testsOf: (choice: {
    advance: boolean;
    arm: string | null;
  }) => { key: string; arm: string; baseline: string }[];
}
async function loadLib(): Promise<Lib> {
  const url = pathToFileURL(join(repo, "scripts", "lib", "thresh.mjs")).href;
  return (await import(/* @vite-ignore */ url)) as Lib;
}
const ci = (lo: number, hi: number): [number, number] => [lo, hi];
const UP: Primary = { armOnly: 300, baselineOnly: 200, p: 1e-6, ci: ci(0.001, 0.02), level: 0.05 };
const DOWN: Primary = {
  armOnly: 200,
  baselineOnly: 300,
  p: 1e-6,
  ci: ci(-0.02, -0.001),
  level: 0.05,
};

describe("the reading rule of item 5, condition by condition", () => {
  it("passes only an arm that is ahead at a p below the level with an interval that excludes zero, and reverses only the mirror image", async () => {
    const L = await loadLib();
    expect(L.verdictOf(UP)).toBe("passed");
    expect(L.verdictOf({ ...UP, ci: ci(0, 0.02) })).toBe("not-shown");
    expect(L.verdictOf({ ...UP, p: 0.05 })).toBe("not-shown");
    expect(L.verdictOf({ ...UP, p: 0.049999 })).toBe("passed");
    expect(L.verdictOf({ ...UP, armOnly: 250, baselineOnly: 250 })).toBe("not-shown");
    expect(L.verdictOf({ ...UP, armOnly: 200, baselineOnly: 300 })).toBe("not-shown");
    expect(L.verdictOf(DOWN)).toBe("reversed");
    expect(L.verdictOf({ ...DOWN, ci: ci(-0.02, 0) })).toBe("not-shown");
    expect(L.verdictOf({ ...DOWN, ci: ci(-0.02, 0.001) })).toBe("not-shown");
    expect(L.verdictOf({ ...DOWN, p: 0.05 })).toBe("not-shown");
    expect(L.verdictOf({ ...DOWN, armOnly: 300, baselineOnly: 200 })).toBe("not-shown");
  });

  it("needs the all-pairs analysis to agree at an exact p below 0.05 and at most a tenth of the pairs dropped, and names every condition that withheld a reading", async () => {
    const L = await loadLib();
    const agree: Head = { armOnly: 262, baselineOnly: 238, p: 0.01 };
    const behind: Head = { armOnly: 238, baselineOnly: 262, p: 0.01 };
    const read = (primary: Primary, robust: Head, excludedFraction = 0.02) =>
      L.readingOf({ ...primary, robust, excludedFraction });
    expect(read(UP, agree)).toEqual({
      verdict: "passed",
      primary: "passed",
      downgrade: null,
      downgrades: [],
    });
    expect(read(UP, { ...agree, p: 0.049999 }).verdict).toBe("passed");
    for (const p of [0.05, 0.2, 0.6])
      expect(read(UP, { ...agree, p })).toMatchObject({
        verdict: "not-shown",
        primary: "passed",
        downgrade: "robustness",
      });
    expect(read(UP, behind)).toMatchObject({ verdict: "not-shown", downgrade: "robustness" });
    expect(read(UP, agree, 0.1).verdict).toBe("passed");
    expect(read(UP, agree, 0.1001)).toMatchObject({
      verdict: "not-shown",
      downgrade: "excluded",
      downgrades: ["excluded"],
    });
    expect(read(UP, { ...agree, p: 0.2 }, 0.3)).toMatchObject({
      downgrade: "excluded",
      downgrades: ["excluded", "robustness"],
    });
    // the mirror image: a reversal needs the all-pairs analysis to have the baseline ahead
    expect(read(DOWN, behind)).toEqual({
      verdict: "reversed",
      primary: "reversed",
      downgrade: null,
      downgrades: [],
    });
    expect(read(DOWN, agree)).toMatchObject({
      verdict: "not-shown",
      primary: "reversed",
      downgrade: "robustness",
    });
    expect(read(DOWN, { ...behind, p: 0.2 })).toMatchObject({
      verdict: "not-shown",
      downgrade: "robustness",
    });
    // a primary test that shows nothing names no condition
    expect(read({ ...UP, p: 0.5 }, agree)).toEqual({
      verdict: "not-shown",
      primary: "not-shown",
      downgrade: null,
      downgrades: [],
    });
  });

  it("calls a pass narrow when the lower end of its interval is under a quarter of the difference, and nothing else narrow", async () => {
    const L = await loadLib();
    expect(L.isNarrow({ verdict: "passed", difference: 0.01, ci: ci(0.0024, 0.02) })).toBe(true);
    expect(L.isNarrow({ verdict: "passed", difference: 0.01, ci: ci(0.0026, 0.02) })).toBe(false);
    expect(L.isNarrow({ verdict: "not-shown", difference: 0.01, ci: ci(0.0001, 0.02) })).toBe(
      false,
    );
    expect(L.isNarrow({ verdict: "reversed", difference: -0.01, ci: ci(-0.02, -0.0001) })).toBe(
      false,
    );
  });

  it("advances the screen's choice only if its net is above zero, it is not 0.2 and it is ahead of 0.2 at an exact p below 0.20", async () => {
    const L = await loadLib();
    const head = (armOnly: number, baselineOnly: number, p: number): Head => ({
      armOnly,
      baselineOnly,
      p,
    });
    expect(L.advanceOf("t030", 10, head(60, 40, 0.05))).toBe(true);
    expect(L.advanceOf("t030", 10, head(60, 40, 0.19999))).toBe(true);
    expect(L.advanceOf("t030", 10, head(40, 60, 0.05))).toBe(false);
    expect(L.advanceOf("t030", 10, head(60, 40, 0.2))).toBe(false);
    expect(L.advanceOf("t030", 10, head(50, 50, 0.01))).toBe(false);
    expect(L.advanceOf("t030", 0, head(60, 40, 0.01))).toBe(false);
    expect(L.advanceOf("t030", -3, head(60, 40, 0.01))).toBe(false);
    expect(L.advanceOf("t020", 10, head(60, 40, 0.01))).toBe(false);
    expect(() => L.advanceOf("t030", 10, null)).toThrow(/head-to-head/);
  });

  it("hands a tie of the screen to the smaller threshold and leaves the tests T1 alone, or T1, T2 and T3 with T3 against 0.2", async () => {
    const L = await loadLib();
    const flat = { t010: 5, t020: 5, t030: 5, t045: 5, t060: 5, tnone: 5 };
    expect(L.bestOf(flat)).toBe("t010");
    expect(L.bestOf({ ...flat, tnone: 6 })).toBe("tnone");
    expect(L.bestOf({ ...flat, t045: 9, t060: 9 })).toBe("t045");
    expect(L.testsOf({ advance: false, arm: null })).toEqual([
      { key: "T1", arm: "t020", baseline: "s" },
    ]);
    expect(L.testsOf({ advance: true, arm: "t030" })).toEqual([
      { key: "T1", arm: "t020", baseline: "s" },
      { key: "T2", arm: "t030", baseline: "s" },
      { key: "T3", arm: "t030", baseline: "t020" },
    ]);
  });
});

describe("what the reader refuses or carries that the world-level tests above leave open", () => {
  it.each(["a_only", "b_only", "both", "neither"] as const)(
    "refuses a class whose %s does not add up to the pooled table, its other counts and its p being right",
    async (field) => {
      const w = await buildWorld({ tests: { T1: every(300, 200) } });
      w.amend("experiments/thresh/per-class/T1-defect.json", (j) => {
        const tab = j.pairedWinTable as {
          a_only: number;
          b_only: number;
          both: number;
          neither: number;
          mcnemar_p: number;
        };
        tab[field] += 1;
        tab.mcnemar_p = mcnemarP(tab.a_only, tab.b_only);
      });
      expect(() => read(w)).toThrow(
        new RegExp(`the classes' ${field} \\(\\d+\\) do not add up to the pooled one`),
      );
    },
  );

  it("carries the number of pairs the wall clock stopped, in the screen and in each design check, and refuses a record that lacks it", async () => {
    const w = await buildWorld({ nets: NETS_PEAK });
    const out = read(w) as unknown as {
      screen: { rows: Record<string, { wallClockPairs: number }> };
      identity: Record<string, { wallClockPairs: number }>;
    };
    expect(Object.values(out.screen.rows).map((r) => r.wallClockPairs)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(
      Object.fromEntries(Object.entries(out.identity).map(([k, v]) => [k, v.wallClockPairs])),
    ).toEqual({
      t020: 2,
      t030: 2,
    });
    for (const bad of [undefined, -1, 1.5, "2"]) {
      const broken = await buildWorld({ nets: NETS_PEAK });
      broken.amend("experiments/thresh/identity/t030.json", (j) => {
        if (bad === undefined) delete j.wallClockPairs;
        else j.wallClockPairs = bad;
      });
      expect(() => read(broken)).toThrow(/not a passing design check of t030/);
    }
    for (const bad of [undefined, -1]) {
      const dev = await buildWorld({ stage: "screened", nets: NETS_PEAK });
      dev.amend("experiments/thresh/dev-selection.json", (j) => {
        const identity = ((j.arms as Record<string, Json>).t030 as { identity: Json }).identity;
        if (bad === undefined) delete identity.wallClockPairs;
        else identity.wallClockPairs = bad;
      });
      expect(() => read(dev)).toThrow(/not a passing design check against S/);
    }
  });

  it("takes the registered sizes only: a `sizes` property of the argument is not looked at, and the entry point of the tests is another function", async () => {
    const w = await buildWorld({ nets: NETS_PEAK });
    const L = await loadLib();
    const args = { root: w.root, reports: w.reports };
    const registered = L.parseThresh(args);
    expect(L.parseThresh({ ...args, sizes: { dev: 64, val: 400 } })).toEqual(registered);
    expect(() => L.parseThreshWith(args, { dev: 64, val: 400 })).toThrow();
    expect(L.parseThreshWith(args, { dev: 3000, val: 15000 })).toEqual(registered);
  });
});
