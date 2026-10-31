// @vitest-environment node
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

import { afterEach, describe, expect, it, vi } from "vitest";

import { mcnemarP } from "./fixtures/synergy-test";

vi.setConfig({ testTimeout: 30_000 });

/**
 * `scripts/lib/insights.mjs` reads the committed experiment files for the insights page (ADR-059) and refuses anything that does not belong
 * together: a comparison whose arms are not the ones the page says, a table that does not add up, a p-value that is not the exact one,
 * a late-drivers file fitted from another batch than the one on disk, a batch whose episodes are not what its manifest counts. These
 * tests make small made-up inputs (the counts are consistent with each other; no simulated game is involved) and break one thing at a time,
 * and read the real files once.
 */
const repo = join(__dirname, "..", "..", "..");
type Json = Record<string, unknown>;
/** The floors of the three bosses the exploration batches record (the exporter reads them from the late-drivers file). */
const BOSS_FLOORS = (
  JSON.parse(readFileSync(join(repo, "experiments", "insights", "late-drivers.json"), "utf8")) as {
    bossFloors: number[];
  }
).bossFloors;
interface Insights {
  readComparison: (a: {
    where: string;
    path: string;
    arms: [RegExp, RegExp];
    expect?: Json;
  }) => Json & {
    difference: number;
    ci95: number[];
    method: string;
    pairs: number;
    members: Record<string, unknown> | null;
  };
  parseLevers: (root: string) => { id: string; rows: { when: string; evidence: string }[] }[];
  parseLateDrivers: (root: string) => {
    features: { id: string; matters: string; classesAgreeing: number; classesAlone: number }[];
  } & Json;
  parseRunsEnd: (root: string, bossFloors: number[]) => Json[];
  parseGames: (root: string, reports: Json[]) => Json;
  parseInventory: (root: string) => Json;
  parseAscensionLadder: (root: string) => Json;
}

/** The first element of a list a test has just built, or a failure that says so. */
function head<T>(xs: readonly T[]): T {
  const x = xs[0];
  if (x === undefined) throw new Error("an empty list");
  return x;
}

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "slay2-insights-"));
  dirs.push(d);
  return d;
};

async function load(): Promise<Insights> {
  const url = pathToFileURL(join(repo, "scripts", "lib", "insights.mjs")).href;
  return (await import(/* @vite-ignore */ url)) as Insights;
}

// ---- a made-up comparison

const CLASSES = ["Ironclad", "Silent", "Regent", "Necrobinder", "Defect"];
interface Spec {
  aOnly: number;
  bOnly: number;
  both: number;
  neither: number;
}
const SPEC: Spec = { aOnly: 300, bOnly: 200, both: 1000, neither: 500 };

function table(s: Spec): Json {
  return {
    a_only: s.aOnly,
    b_only: s.bOnly,
    both: s.both,
    neither: s.neither,
    mcnemar_p: mcnemarP(s.aOnly, s.bOnly),
  };
}

function pooled(
  over: {
    spec?: Spec;
    first?: string;
    second?: string;
    partition?: string;
    ascension?: number;
    role?: string;
    tweak?: (t: Json) => void;
  } = {},
): Json {
  const s = over.spec ?? SPEC;
  const n = s.aOnly + s.bOnly + s.both + s.neither;
  const rateA = (s.aOnly + s.both) / n;
  const rateB = (s.bOnly + s.both) / n;
  const diff = rateA - rateB;
  const t: Json = {
    kind: "pooled-paired-comparison",
    schema: 1,
    role: over.role ?? "held-out",
    contentSha256: "f".repeat(64),
    bothCompleted: n,
    cohort: {
      partition: over.partition ?? "val",
      ascension: over.ascension ?? 0,
      profile: "veteran",
      characters: CLASSES,
    },
    members: CLASSES.map((c) => ({
      character: c,
      a: { batchId: `${over.first ?? "alpha"}-${c.toLowerCase()}-a0` },
      b: { batchId: `${over.second ?? "beta"}-${c.toLowerCase()}-a0` },
      bothCompleted: n / 5,
      reachedAct2: { a: rateA, b: rateB },
    })),
    reachedAct2: {
      a: { games: s.aOnly + s.both, rate: rateA },
      b: { games: s.bOnly + s.both, rate: rateB },
      pairedTable: table(s),
    },
    clusteredDifference: {
      meanAMinusB: diff,
      ci95: [diff - 0.02, diff + 0.02],
      method: "percentile bootstrap over seeds",
    },
  };
  over.tweak?.(t);
  return t;
}

function paired(over: { spec?: Spec; tweak?: (t: Json) => void } = {}): Json {
  const s = over.spec ?? SPEC;
  const n = s.aOnly + s.bOnly + s.both + s.neither;
  const t: Json = {
    kind: "paired-comparison",
    schema: 1,
    role: "held-out",
    contentSha256: "e".repeat(64),
    bothCompleted: n,
    cohort: { partition: "val", ascension: 0, profile: "veteran", character: "Ironclad" },
    a: { batchId: "alpha-ironclad-a0" },
    b: { batchId: "beta-ironclad-a0" },
    reachedAct2: {
      a: { games: s.aOnly + s.both, rate: (s.aOnly + s.both) / n },
      b: { games: s.bOnly + s.both, rate: (s.bOnly + s.both) / n },
      pairedTable: table(s),
    },
  };
  over.tweak?.(t);
  return t;
}

function write(body: Json): string {
  const dir = tmp();
  const path = join(dir, "c.json");
  writeFileSync(path, JSON.stringify(body));
  return path;
}

const ARMS: [RegExp, RegExp] = [/^alpha-/, /^beta-/];
const EXPECT = { partition: "val", ascension: 0, role: "held-out" };

describe("reading one comparison", () => {
  it("reads a pooled comparison: the shares from its table, the whole-seed interval of the file, five classes", async () => {
    const { readComparison } = await load();
    const r = readComparison({ where: "t", path: write(pooled()), arms: ARMS, expect: EXPECT });
    expect(r.first).toBeCloseTo(1300 / 2000, 12);
    expect(r.second).toBeCloseTo(1200 / 2000, 12);
    expect(r.difference).toBeCloseTo(0.05, 12);
    expect(r.method).toBe("resampling whole seeds");
    expect(r.ci95[0]).toBeCloseTo(0.03, 12);
    expect(r.classes).toBe(5);
    expect(Object.keys(r.members ?? {})).toHaveLength(5);
  });

  it("reads a paired comparison of one class and gives the paired Wald interval of its table, which it says it is", async () => {
    const { readComparison } = await load();
    const r = readComparison({ where: "t", path: write(paired()), arms: ARMS, expect: EXPECT });
    const n = 2000;
    const d = (300 - 200) / n;
    const se = Math.sqrt(500 - (100 * 100) / n) / n;
    expect(r.difference).toBeCloseTo(d, 12);
    expect(r.ci95[0]).toBeCloseTo(d - 1.96 * se, 12);
    expect(r.ci95[1]).toBeCloseTo(d + 1.96 * se, 12);
    expect(r.method).toBe("paired Wald interval");
    expect(r.members).toBeNull();
  });

  it("refuses a file that is not a paired comparison of schema 1", async () => {
    const { readComparison } = await load();
    const bad = pooled({ tweak: (t) => (t.kind = "something-else") });
    expect(() =>
      readComparison({ where: "t", path: write(bad), arms: ARMS, expect: EXPECT }),
    ).toThrow(/not a paired comparison/);
    const v2 = pooled({ tweak: (t) => (t.schema = 2) });
    expect(() =>
      readComparison({ where: "t", path: write(v2), arms: ARMS, expect: EXPECT }),
    ).toThrow(/schema 1/);
  });

  it("refuses arms that are not the ones the page names, in either position", async () => {
    const { readComparison } = await load();
    expect(() =>
      readComparison({
        where: "t",
        path: write(pooled({ first: "gamma" })),
        arms: ARMS,
        expect: EXPECT,
      }),
    ).toThrow(/first arm/);
    expect(() =>
      readComparison({
        where: "t",
        path: write(pooled({ second: "gamma" })),
        arms: ARMS,
        expect: EXPECT,
      }),
    ).toThrow(/second arm/);
    // a file with the arms the other way round is a different comparison
    expect(() =>
      readComparison({
        where: "t",
        path: write(pooled({ first: "beta", second: "alpha" })),
        arms: ARMS,
        expect: EXPECT,
      }),
    ).toThrow(/first arm/);
  });

  it("refuses the wrong seeds, the wrong Ascension and a role that is not the one named", async () => {
    const { readComparison } = await load();
    expect(() =>
      readComparison({
        where: "t",
        path: write(pooled({ partition: "dev" })),
        arms: ARMS,
        expect: EXPECT,
      }),
    ).toThrow(/val seeds/);
    expect(() =>
      readComparison({
        where: "t",
        path: write(pooled({ ascension: 9 })),
        arms: ARMS,
        expect: EXPECT,
      }),
    ).toThrow(/Ascension 0/);
    expect(() =>
      readComparison({
        where: "t",
        path: write(pooled({ role: "development (dev partition): not a held-out result" })),
        arms: ARMS,
        expect: EXPECT,
      }),
    ).toThrow(/role/);
    // a development file is read as development, and only as that
    const dev = pooled({
      partition: "dev",
      role: "development (dev partition): not a held-out result",
    });
    expect(
      readComparison({
        where: "t",
        path: write(dev),
        arms: ARMS,
        expect: { partition: "dev", ascension: 0, role: "development" },
      }).pairs,
    ).toBe(2000);
  });

  it("refuses a table that does not add up to the pairs both arms completed", async () => {
    const { readComparison } = await load();
    const bad = pooled({
      tweak: (t) => ((t.reachedAct2 as { pairedTable: Json }).pairedTable.neither = 499),
    });
    expect(() =>
      readComparison({ where: "t", path: write(bad), arms: ARMS, expect: EXPECT }),
    ).toThrow(/does not add up/);
  });

  it("refuses a p-value that is not the exact McNemar p-value of the counts", async () => {
    const { readComparison } = await load();
    const bad = pooled({
      tweak: (t) => ((t.reachedAct2 as { pairedTable: Json }).pairedTable.mcnemar_p = 0.01),
    });
    expect(() =>
      readComparison({ where: "t", path: write(bad), arms: ARMS, expect: EXPECT }),
    ).toThrow(/exact McNemar/);
  });

  it("refuses a share that is not what the table gives, a pooled difference that is not the table's, and an interval that does not hold it", async () => {
    const { readComparison } = await load();
    const share = pooled({ tweak: (t) => ((t.reachedAct2 as { a: Json }).a.rate = 0.7) });
    expect(() =>
      readComparison({ where: "t", path: write(share), arms: ARMS, expect: EXPECT }),
    ).toThrow(/share/);
    const diff = pooled({ tweak: (t) => ((t.clusteredDifference as Json).meanAMinusB = 0.06) });
    expect(() =>
      readComparison({ where: "t", path: write(diff), arms: ARMS, expect: EXPECT }),
    ).toThrow(/pooled difference/);
    const ci = pooled({ tweak: (t) => ((t.clusteredDifference as Json).ci95 = [0.06, 0.08]) });
    expect(() =>
      readComparison({ where: "t", path: write(ci), arms: ARMS, expect: EXPECT }),
    ).toThrow(/interval/);
  });
});

// ---- the real files

describe("the levers, read from the committed files", () => {
  it("reads every lever, each row from the file that is named, and labels each with the kind of evidence it is", async () => {
    const { parseLevers } = await load();
    const levers = parseLevers(repo);
    expect(levers.map((l) => l.id).sort()).toEqual(
      [
        "card-values",
        "opening-relic",
        "relics-along-the-way",
        "search",
        "synergy",
        "thresholds",
        "values-remeasured",
      ].sort(),
    );
    const kinds = new Set(levers.flatMap((l) => l.rows.map((r) => r.evidence)));
    expect([...kinds].sort()).toEqual(["descriptive", "development", "registered"]);
    // the only development result is the measurement of what the relics a run gains are worth, and the only descriptive one is the twin
    const dev = levers.flatMap((l) =>
      l.rows.filter((r) => r.evidence === "development").map(() => l.id),
    );
    expect(dev).toEqual(["relics-along-the-way"]);
    const twin = levers.flatMap((l) =>
      l.rows.filter((r) => r.evidence === "descriptive").map(() => `${l.id}/a0`),
    );
    expect(twin).toEqual(["card-values/a0"]);
  });

  it("refuses a lever file whose arms are not the pilots it names", async () => {
    const { parseLevers } = await load();
    const root = tmp();
    // a copy of the files the levers read, with the synergy test's file replaced by one whose arms are the wrong way round
    for (const rel of [
      "experiments/ascension9",
      "experiments/synergy/keep-val",
      "experiments/neow/pooled-neow-values-keep-v1-vs-rules_v2-keeprelics-val.json",
      "experiments/cardvalue/pooled-keepvals-vs-curvals-val.json",
      "experiments/comparisons/rules_v3-vs-rules_v2-ironclad-a0-veteran-val.json",
      "experiments/comparisons/search_v3-all-vs-rules_v2-ironclad-a0-veteran-val.json",
      "experiments/g14/pooled-keeprelics-vs-base-dev.json",
    ]) {
      mkdirSync(join(root, rel, ".."), { recursive: true });
      cpSync(join(repo, rel), join(root, rel), { recursive: true });
    }
    expect(parseLevers(root)).toHaveLength(7);
    const path = join(root, "experiments/synergy/keep-val/pooled-astar-vs-d0star.json");
    const body = JSON.parse(readFileSync(path, "utf8")) as {
      members: { a: { batchId: string }; b: { batchId: string } }[];
    };
    for (const m of body.members) [m.a.batchId, m.b.batchId] = [m.b.batchId, m.a.batchId];
    writeFileSync(path, JSON.stringify(body));
    expect(() => parseLevers(root)).toThrow(/first arm/);
  });
});

// ---- where runs end

const SHOWN = (c: string, a: number): string =>
  `rules_v2-shownvals-${c}-a${String(a)}-veteran-keeprelics-val-n2000`;
const CLS = ["ironclad", "silent", "regent", "necrobinder", "defect"];

function copyBatches(): string {
  const root = tmp();
  for (const a of [0, 9])
    for (const c of CLS) {
      const rel = join("experiments", "batches", SHOWN(c, a));
      mkdirSync(join(root, rel), { recursive: true });
      cpSync(join(repo, rel), join(root, rel), { recursive: true });
    }
  return root;
}

describe("where runs end", () => {
  it("counts the deaths by act, the wins and the killers, and the three acts and the wins add up to the completed games", async () => {
    const { parseRunsEnd } = await load();
    const ends = parseRunsEnd(repo, BOSS_FLOORS) as {
      id: string;
      completed: number;
      diedAct1: number;
      diedAct2: number;
      diedAct3: number;
      won: number;
      killersByAct: {
        deaths: number;
        unrecorded: number;
        top: { enemy: string; deaths: number }[];
      }[];
    }[];
    expect(ends.map((e) => e.id)).toEqual(["a0", "a9"]);
    for (const e of ends) {
      expect(e.diedAct1 + e.diedAct2 + e.diedAct3 + e.won).toBe(e.completed);
      expect(e.killersByAct.map((k) => k.deaths)).toEqual([e.diedAct1, e.diedAct2, e.diedAct3]);
      for (const k of e.killersByAct) {
        expect(k.top.reduce((s, t) => s + t.deaths, 0) + k.unrecorded).toBeLessThanOrEqual(
          k.deaths,
        );
        expect(k.top.every((t) => t.enemy !== "null")).toBe(true);
      }
    }
  });

  it("counts the deaths in a boss fight as the deaths on the floor of the act's boss, recounted here from the episode files", async () => {
    const { parseRunsEnd } = await load();
    const ends = parseRunsEnd(repo, BOSS_FLOORS) as {
      ascension: number;
      bossAct1: number;
      bossAct2: number;
      bossAct3: number;
      diedAct1: number;
      diedAct2: number;
      diedAct3: number;
      perClass: { character: string; bossAct1: number; bossAct2: number; bossAct3: number }[];
    }[];
    for (const e of ends) {
      const recount = [0, 0, 0];
      for (const c of CLS) {
        const dir = join(repo, "experiments", "batches", SHOWN(c, e.ascension));
        const lines = gunzipSync(readFileSync(join(dir, "episodes.jsonl.gz")))
          .toString("utf8")
          .split("\n")
          .filter(Boolean);
        const mine = [0, 0, 0];
        for (const line of lines) {
          const ep = JSON.parse(line) as { outcome: string; act: number; floor: number };
          if (ep.outcome === "death" && ep.floor === BOSS_FLOORS[ep.act])
            mine[ep.act] = (mine[ep.act] ?? 0) + 1;
        }
        const row = e.perClass.find((x) => x.character === c);
        expect([row?.bossAct1, row?.bossAct2, row?.bossAct3]).toEqual(mine);
        for (let a = 0; a < 3; a++) recount[a] = (recount[a] ?? 0) + (mine[a] ?? 0);
      }
      expect([e.bossAct1, e.bossAct2, e.bossAct3]).toEqual(recount);
      // a death in a boss fight is one of the deaths of its act, and a boss fight ends some runs and not all
      expect(e.bossAct1).toBeLessThan(e.diedAct1);
      expect(e.bossAct2).toBeLessThan(e.diedAct2);
      expect(e.bossAct3).toBeLessThan(e.diedAct3);
      expect(e.bossAct1 + e.bossAct2 + e.bossAct3).toBeGreaterThan(0);
    }
  });

  it("tags a fight as a boss fight only if every death in it was on a boss floor, and the lists name the bosses of acts 1 and 2", async () => {
    const { parseRunsEnd } = await load();
    const ends = parseRunsEnd(repo, BOSS_FLOORS) as {
      killersByAct: { top: { enemy: string; deaths: number; atBoss: number }[] }[];
    }[];
    for (const e of ends)
      for (const k of e.killersByAct)
        for (const t of k.top) expect([0, t.deaths]).toContain(t.atBoss);
    const a0 = head(ends);
    const bosses = (act: number): string[] =>
      (a0.killersByAct[act]?.top ?? []).filter((t) => t.atBoss === t.deaths).map((t) => t.enemy);
    expect(bosses(0)).toEqual(expect.arrayContaining(["VANTOM", "CEREMONIAL_BEAST", "KIN_PRIEST"]));
    expect(bosses(1)).toEqual(expect.arrayContaining(["THE_INSATIABLE", "KNOWLEDGE_DEMON"]));
    expect(a0.killersByAct[0]?.top.find((t) => t.enemy === "FOGMOG")?.atBoss).toBe(0);
  });

  it("refuses floors that are not three increasing whole numbers", async () => {
    const { parseRunsEnd } = await load();
    const root = copyBatches();
    for (const bad of [[16, 31], [31, 16, 45], [16, 16, 45], [16, 31.5, 45], [0, 31, 45], []])
      expect(() => parseRunsEnd(root, bad)).toThrow(/three increasing whole numbers/);
    expect(parseRunsEnd(root, BOSS_FLOORS)).toHaveLength(2);
  });

  it("refuses a batch whose manifest is not the game the page says (relics dropped), and episodes that are not what the manifest counts", async () => {
    const { parseRunsEnd } = await load();
    const root = copyBatches();
    expect(parseRunsEnd(root, BOSS_FLOORS)).toHaveLength(2);
    const manifest = join(root, "experiments", "batches", SHOWN("silent", 0), "manifest.json");
    const original = readFileSync(manifest, "utf8");
    const m = JSON.parse(original) as {
      config: { keep_relics: boolean };
      summary: { completed: number };
    };
    m.config.keep_relics = false;
    writeFileSync(manifest, JSON.stringify(m));
    expect(() => parseRunsEnd(root, BOSS_FLOORS)).toThrow(/not the batch the insights page says/);
    m.config.keep_relics = true;
    m.summary.completed += 1;
    writeFileSync(manifest, JSON.stringify(m));
    expect(() => parseRunsEnd(root, BOSS_FLOORS)).toThrow(/not what the manifest counts/);
    writeFileSync(manifest, original);
    expect(parseRunsEnd(root, BOSS_FLOORS)).toHaveLength(2);
  });
});

// ---- what matters at the second boss

function lateFile(
  features: Json[],
  over: { role?: string; tweak?: (t: Json) => void } = {},
): { root: string; sha: string } {
  const root = tmp();
  const batch = "explore-x-a0-keeprelics-dev-o5000-n5000";
  const sha = "9".repeat(64);
  mkdirSync(join(root, "experiments", "cardvalue", batch), { recursive: true });
  writeFileSync(
    join(root, "experiments", "cardvalue", batch, "manifest.json"),
    JSON.stringify({ content_sha256: sha }),
  );
  mkdirSync(join(root, "experiments", "insights"), { recursive: true });
  const t: Json = {
    schema: 1,
    kind: "late-drivers",
    role: over.role ?? "exploratory",
    batches: [
      {
        batchId: batch,
        character: "Ironclad",
        keepRelics: true,
        ascension: 0,
        contentSha256: sha,
        completed: 100,
      },
    ],
    bootstrap: { draws: 10 },
    bossFloors: [16, 31, 45],
    endpoints: {
      act1: { runs: 100, passed: 60, rate: 0.6 },
      act2: { runs: 40, passed: 8, rate: 0.2 },
    },
    classes: {},
    features,
    perClass: {
      Ironclad: { act1: { f: 0.3, g: -0.3, h: 0.1 }, act2: { f: 0.6, g: -0.05, h: 0.1 } },
      Defect: null,
    },
  };
  over.tweak?.(t);
  writeFileSync(join(root, "experiments", "insights", "late-drivers.json"), JSON.stringify(t));
  return { root, sha };
}

function feature(id: string, b1: number, b2: number, diffCi: [number, number]): Json {
  const side = (b: number): Json => ({
    beta: b,
    ci95: [b - 0.1, b + 0.1],
    oddsRatio: Math.exp(b),
    oddsRatioCi95: [Math.exp(b - 0.1), Math.exp(b + 0.1)],
  });
  return {
    id,
    label: id,
    unit: "per x",
    act1: side(b1),
    act2: side(b2),
    difference: { beta: b2 - b1, ci95: diffCi },
  };
}

describe("what matters at the second boss", () => {
  it("reads the direction of each difference against the direction of the effect at the first boss", async () => {
    const { parseLateDrivers } = await load();
    const { root } = lateFile([
      feature("f", 0.3, 0.6, [0.1, 0.5]), // helps at the first boss, helps more at the second: later
      feature("g", -0.3, -0.05, [0.1, 0.4]), // hurts at the first boss and hurts less at the second: it matters less (earlier)
      feature("h", 0.1, 0.1, [-0.1, 0.1]), // no difference
    ]);
    const t = parseLateDrivers(root);
    const by = Object.fromEntries(t.features.map((x) => [x.id, x]));
    expect(by.f?.matters).toBe("later");
    expect(by.g?.matters).toBe("earlier");
    expect(by.h?.matters).toBe("same");
    // the classes that can be fitted alone: how many of them move the way the pooled difference does
    expect(by.f).toMatchObject({ classesAgreeing: 1, classesAlone: 1 });
    expect(by.g).toMatchObject({ classesAgreeing: 1, classesAlone: 1 });
  });

  it("refuses a file that is not the exploratory reading, a batch that is not the one it was fitted from, and numbers that do not belong together", async () => {
    const { parseLateDrivers } = await load();
    const ok = [feature("f", 0.3, 0.6, [0.1, 0.5])];
    expect(() => parseLateDrivers(lateFile(ok, { role: "registered" }).root)).toThrow(
      /exploratory/,
    );
    const hash = lateFile(ok, {
      tweak: (t) => (head(t.batches as { contentSha256: string }[]).contentSha256 = "8".repeat(64)),
    });
    expect(() => parseLateDrivers(hash.root)).toThrow(/not the batch it was fitted from/);
    const dropped = lateFile(ok, {
      tweak: (t) => (head(t.batches as { keepRelics: boolean }[]).keepRelics = false),
    });
    expect(() => parseLateDrivers(dropped.root)).toThrow(/relics-kept/);
    const rate = lateFile(ok, {
      tweak: (t) => ((t.endpoints as { act2: { rate: number } }).act2.rate = 0.5),
    });
    expect(() => parseLateDrivers(rate.root)).toThrow(/not consistent/);
    const or = JSON.parse(JSON.stringify(ok)) as { act1: { oddsRatio: number } }[];
    head(or).act1.oddsRatio = 2;
    expect(() => parseLateDrivers(lateFile(or as unknown as Json[]).root)).toThrow(/exp\(beta\)/);
    const diff = JSON.parse(JSON.stringify(ok)) as { difference: { beta: number } }[];
    head(diff).difference.beta = 0.9;
    expect(() => parseLateDrivers(lateFile(diff as unknown as Json[]).root)).toThrow(/difference/);
    const hold = JSON.parse(JSON.stringify(ok)) as { act2: { ci95: number[] } }[];
    head(hold).act2.ci95 = [0.7, 0.9];
    expect(() => parseLateDrivers(lateFile(hold as unknown as Json[]).root)).toThrow(
      /interval does not hold/,
    );
  });

  it("carries the floors of the three bosses and refuses a file whose floors are missing, not whole numbers or not increasing", async () => {
    const { parseLateDrivers } = await load();
    const ok = [feature("f", 0.3, 0.6, [0.1, 0.5])];
    expect(parseLateDrivers(lateFile(ok).root).bossFloors).toEqual([16, 31, 45]);
    for (const bad of [
      undefined,
      [16, 31],
      [31, 16, 45],
      [16, 16, 45],
      [16, 31.5, 45],
      [0, 31, 45],
    ])
      expect(() =>
        parseLateDrivers(lateFile(ok, { tweak: (t) => (t.bossFloors = bad) }).root),
      ).toThrow(/bossFloors/);
  });

  it("reads the committed file: eleven features, the first boss and the second, and no class agreeing more often than there are classes", async () => {
    const { parseLateDrivers } = await load();
    const t = parseLateDrivers(repo);
    expect(t.features).toHaveLength(11);
    for (const f of t.features) expect(f.classesAgreeing).toBeLessThanOrEqual(f.classesAlone);
  });
});

// ---- the game's size and the counts

describe("how much has been played, and what the game holds", () => {
  it("sums the ledger without the withdrawn batches and counts the batches that fitted values or checked a precondition separately", async () => {
    const { parseGames } = await load();
    const root = tmp();
    mkdirSync(join(root, "experiments", "cardvalue", "explore-a"), { recursive: true });
    writeFileSync(
      join(root, "experiments", "cardvalue", "explore-a", "manifest.json"),
      JSON.stringify({ seeds: { n: 100 }, summary: { completed: 98 } }),
    );
    mkdirSync(join(root, "experiments", "neow", "explore-b"), { recursive: true });
    writeFileSync(
      join(root, "experiments", "neow", "explore-b", "manifest.json"),
      JSON.stringify({ seeds: { n: 50 }, summary: { completed: 49 } }),
    );
    mkdirSync(join(root, "experiments", "neow", "precondition-keep", "p"), { recursive: true });
    writeFileSync(
      join(root, "experiments", "neow", "precondition-keep", "p", "manifest.json"),
      JSON.stringify({ seeds: { n: 10 }, summary: { completed: 10 } }),
    );
    const reports = [
      { role: "held-out", seeds: 2000, completed: 1990, counts: { win: 5 } },
      {
        role: "development (dev partition): not a held-out result",
        seeds: 500,
        completed: 495,
        counts: { win: 1 },
      },
      { role: "void", seeds: 9999, completed: 9999, counts: { win: 9 } },
    ];
    expect(parseGames(root, reports)).toEqual({
      batches: 2,
      started: 2500,
      completed: 2485,
      wins: 6,
      exploration: { batches: 3, started: 160, completed: 157 },
    });
  });

  it("reads the inventory of the game as counts only", async () => {
    const { parseInventory } = await load();
    const inv = parseInventory(repo) as { counts: Record<string, { total: number }>; note: string };
    for (const k of [
      "cards",
      "relics",
      "potions",
      "events",
      "enchantments",
      "monsters",
      "powers",
      "characters",
    ]) {
      expect(inv.counts[k]?.total, k).toBeGreaterThan(0);
    }
    // only numbers under the counts: no name, id or text of the game
    const onlyNumbers = (v: unknown): boolean =>
      typeof v === "number" ||
      (typeof v === "object" && v !== null && Object.values(v).every(onlyNumbers));
    expect(onlyNumbers(inv.counts)).toBe(true);
    expect(inv.note).toMatch(/no name, id or text/i);
    const root = tmp();
    mkdirSync(join(root, "experiments", "insights"), { recursive: true });
    writeFileSync(
      join(root, "experiments", "insights", "game-inventory.json"),
      JSON.stringify({ kind: "other", schema: 1 }),
    );
    expect(() => parseInventory(root)).toThrow(/not an inventory/);
  });

  it("reads the ladder of Ascensions from the twin at Ascension 0 and the registered test at 9, class by class", async () => {
    const { parseAscensionLadder } = await load();
    const t = parseAscensionLadder(repo) as {
      pooled: { a0: { first: number }; a9: { first: number } };
      perClass: { character: string; a0: { first: number }; a9: { first: number } }[];
    };
    expect(t.perClass.map((c) => c.character)).toEqual([
      "ironclad",
      "silent",
      "regent",
      "necrobinder",
      "defect",
    ]);
    expect(t.pooled.a0.first).toBeGreaterThan(t.pooled.a9.first);
    for (const c of t.perClass) expect(c.a0.first).toBeGreaterThan(c.a9.first);
  });
});
