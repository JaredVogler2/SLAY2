// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { mcnemarP } from "./fixtures/synergy-test";

vi.setConfig({ testTimeout: 30_000 });

/**
 * `scripts/lib/skip.mjs` reads the price-of-a-slot check (ADR-065) only when everything it rests on belongs together. These tests build a small repository
 * (the registration, a passed precondition, the five batches of the slot arm and the five baselines of each leg as synthetic manifests and reports, the two pooled
 * legs and the reading) and break one thing at a time; no simulated game is involved, the counts are only consistent with each other.
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
const HEAD = "b".repeat(40);

type Json = Record<string, unknown>;
type LegKey = "og" | "ud";
type Arm = "s1" | "s0";
type Parse = (args: {
  root: string;
  reports: Json[];
  udReports: Json[];
  skipReports: Json[];
}) => Json;

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function loadParser(): Promise<Parse> {
  const url = pathToFileURL(join(repo, "scripts", "lib", "skip.mjs")).href;
  const mod = (await import(/* @vite-ignore */ url)) as { parseSkip: Parse };
  return mod.parseSkip;
}

const hex = (seed: string): string => createHash("sha256").update(seed).digest("hex");
const tail = (leg: LegKey): string => (leg === "ud" ? "-underdocks" : "");
const id = (arm: Arm, cls: string, leg: LegKey): string =>
  `advisor_v1-${arm === "s1" ? "slot" : "astar"}-${cls}-a0-veteran-keeprelics${tail(leg)}-val-n2000`;

const A_STAR = { engines: 0, margin: 0, needs: 1, scalers: 0.7 };
const S1_NAMED = { ...A_STAR, size: 1, size_from: 20 };
const EFFECTIVE = {
  explore: 0,
  margin: 0,
  relics: false,
  replicate: 0,
  risk: "balanced",
  scalers: 0.7,
  synergy: 1,
};

/** What one leg of the fixture says. */
interface LegSpec {
  /** the discordant pairs of each class: first the slot arm only, then the baseline only (default 60 and 60) */
  discordant?: readonly (readonly [number, number])[];
  /** the 95 % whole-seed interval of the pooled difference in the share past the boss (default -0.4 to +0.4 points) */
  boss?: readonly [number, number];
  /** the 95 % paired interval of the mean floors (default -0.1 to +0.1) */
  floors?: readonly [number, number];
}
interface Options {
  registered?: boolean;
  precondition?: boolean;
  legs?: Partial<Record<LegKey, LegSpec>>;
  /** write reading.json (default true when a leg is in) */
  reading?: boolean;
}

const table = (a: number, b: number, both: number, neither: number): Json => ({
  a_only: a,
  b_only: b,
  both,
  neither,
  mcnemar_p: mcnemarP(a, b),
});
const endpoint = (a: number, b: number, both: number, neither: number): Json => {
  const n = a + b + both + neither;
  return {
    a: { games: a + both, rate: (a + both) / n, wilson95: [0.1, 0.2] },
    b: { games: b + both, rate: (b + both) / n, wilson95: [0.1, 0.2] },
    pairedTable: table(a, b, both, neither),
  };
};

function pooled(leg: LegKey, spec: LegSpec): Json {
  const discordant = spec.discordant ?? CLASSES.map(() => [60, 60] as const);
  const both = 300;
  const neither = 1400;
  const members = CLASSES.map((cls, i) => {
    const [a, b] = discordant[i] ?? [60, 60];
    const n = a + b + both + neither;
    return {
      a: { batchId: id("s1", cls, leg), contentSha256: hex(id("s1", cls, leg)), wins: 1 },
      b: { batchId: id("s0", cls, leg), contentSha256: hex(id("s0", cls, leg)), wins: 1 },
      bothCompleted: n,
      character: EXACT[cls],
      meanFloorDifference: 0.01,
      pairedSeeds: 2000,
      reachedAct2: {
        a: (a + both) / n,
        b: (b + both) / n,
        pairedTable: table(a, b, both, neither),
      },
    };
  });
  const aOnly = discordant.reduce((n, [a]) => n + a, 0);
  const bOnly = discordant.reduce((n, [, b]) => n + b, 0);
  const total = members.reduce((n, m) => n + m.bothCompleted, 0);
  const [bossLo, bossHi] = spec.boss ?? [-0.004, 0.004];
  const [floorsLo, floorsHi] = spec.floors ?? [-0.1, 0.1];
  return {
    kind: "pooled-paired-comparison",
    schema: 1,
    role: "held-out",
    cohort: {
      ascension: 0,
      characters: Object.values(EXACT),
      partition: "val",
      profile: "veteran",
    },
    contentSha256: hex(`pooled-${leg}`),
    policies: { a: "advisor_v1", b: "advisor_v1" },
    members,
    pairedSeeds: 10000,
    bothCompleted: total,
    excludedNotCompleted: 10000 - total,
    reachedAct2: endpoint(aOnly, bOnly, both * 5, neither * 5),
    reachedAct3: endpoint(50, 40, 300, total - 390),
    wins: { a: 5, b: 5, pairedTable: table(3, 3, 2, total - 8) },
    floorDifference: { ci95: [floorsLo, floorsHi], meanAMinusB: (floorsLo + floorsHi) / 2 },
    clusteredDifference: { ci95: [bossLo, bossHi], meanAMinusB: (bossLo + bossHi) / 2 },
  };
}

interface World {
  root: string;
  reports: Json[];
  udReports: Json[];
  skipReports: Json[];
  path: (...parts: string[]) => string;
  /** change a batch's manifest and the report that stands for it */
  amend: (
    leg: LegKey,
    arm: Arm,
    cls: string,
    change: (manifest: Json, report: Json) => void,
  ) => void;
  parse: () => Json;
}

async function buildWorld(options: Options = {}): Promise<World> {
  const o = { registered: true, precondition: true, legs: {}, ...options } as Required<
    Pick<Options, "registered" | "precondition" | "legs">
  > &
    Options;
  const parse = await loadParser();
  const root = mkdtempSync(join(tmpdir(), "slay2-skip-"));
  dirs.push(root);
  const path = (...parts: string[]) => join(root, ...parts);
  const write = (file: string, body: unknown) => {
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, JSON.stringify(body));
  };
  write(path("docs", "DECISIONS.md"), "x");
  writeFileSync(
    path("docs", "DECISIONS.md"),
    o.registered
      ? "## 2026-11-02 — ADR-065: the advisor charges for a slot (index v2)\n\nthe record\n"
      : "nothing here\n",
  );
  if (o.precondition) {
    const arm = { classes: Object.fromEntries(CLASSES.map((c) => [c, { games: 100 }])) };
    write(path("experiments", "skip", "precondition.json"), {
      kind: "skip-precondition",
      schema: 1,
      passed: true,
      minimumGapInSkipShare: 0.02,
      legs: { og: { s0: arm, s1: arm }, ud: { s0: arm, s1: arm } },
    });
  }
  const reports: Json[] = [];
  const udReports: Json[] = [];
  const skipReports: Json[] = [];
  const manifestDir = (leg: LegKey, arm: Arm): string =>
    arm === "s1"
      ? path("experiments", "skip", "batches")
      : leg === "og"
        ? path("experiments", "batches")
        : path("experiments", "underdocks", "batches");
  const bucket = (leg: LegKey, arm: Arm): Json[] =>
    arm === "s1" ? skipReports : leg === "og" ? reports : udReports;
  const registry = new Map<string, { manifest: Json; report: Json; file: string }>();
  for (const leg of Object.keys(o.legs) as LegKey[]) {
    for (const arm of ["s1", "s0"] as const) {
      for (const cls of CLASSES) {
        const batch = id(arm, cls, leg);
        const manifest: Json = {
          batch_id: batch,
          config: {
            ascension: 0,
            character: EXACT[cls],
            keep_relics: true,
            profile: "veteran",
            ...(leg === "ud" ? { act1: "underdocks" } : {}),
          },
          policy: {
            name: "advisor_v1",
            params: arm === "s1" ? S1_NAMED : A_STAR,
            effective: {
              params: { ...EFFECTIVE, ...(arm === "s1" ? { size: 1, size_from: 20 } : {}) },
            },
          },
          environment: { slay2: { dirty: false, head: HEAD } },
        };
        const report: Json = {
          id: batch,
          policy: "advisor_v1",
          policyParams: arm === "s1" ? S1_NAMED : A_STAR,
          character: EXACT[cls],
          ascension: 0,
          profile: "veteran",
          keepRelics: true,
          partition: "val",
          seeds: 2000,
          completed: 1980,
          canonicalProcessState: true,
          classStartVerified: true,
          contentSha256: hex(batch),
          sampleAudit: { drawn: 40, verified: 40, ledgerOk: true },
        };
        const file = join(manifestDir(leg, arm), batch, "manifest.json");
        write(file, manifest);
        bucket(leg, arm).push(report);
        registry.set(`${leg}/${arm}/${cls}`, { manifest, report, file });
      }
    }
    write(path("experiments", "skip", `pooled-slot-${leg}.json`), pooled(leg, o.legs[leg] ?? {}));
  }
  const legs = Object.keys(o.legs) as LegKey[];
  if (legs.length > 0 && (o.reading ?? true)) {
    write(path("experiments", "skip", "reading.json"), readingFile(legs, o.legs));
  }
  return {
    root,
    reports,
    udReports,
    skipReports,
    path,
    amend: (leg, arm, cls, change) => {
      const e = registry.get(`${leg}/${arm}/${cls}`);
      if (!e) throw new Error("no such batch in the fixture");
      change(e.manifest, e.report);
      write(e.file, e.manifest);
    },
    parse: () => parse({ root, reports, udReports, skipReports }),
  };
}

/** What reading.py writes for the legs that are in (the verdict by its margins; the shares of card rewards skipped). */
function readingFile(legs: LegKey[], specs: Partial<Record<LegKey, LegSpec>>): Json {
  const verdict = (s: LegSpec): string => {
    const [b] = s.boss ?? [-0.004, 0.004];
    const [f] = s.floors ?? [-0.1, 0.1];
    return b > -0.01 && f > -0.25 ? "not behind" : "not shown to be harmless";
  };
  return {
    kind: "skip-reading",
    schema: 1,
    legs: Object.fromEntries(legs.map((l) => [l, { verdict: verdict(specs[l] ?? {}) }])),
    skipShares: Object.fromEntries(
      legs.map((l) => [
        l,
        {
          s1: {
            cardRewards: 5000,
            skipped: 350,
            share: 0.07,
            byAct: { act1: { cardRewards: 2000, skipped: 10, share: 0.005 } },
          },
          s0: { cardRewards: 5000, skipped: 50, share: 0.01 },
        },
      ]),
    ),
    harmless: legs.length === 2 && legs.every((l) => verdict(specs[l] ?? {}) === "not behind"),
  };
}

type Leg = Json & {
  verdict: string;
  notBehind: { firstBoss: boolean; meanFloors: boolean };
  classes: Record<string, Json>;
};
const result = (out: Json): { legs: Record<string, Leg>; harmless: boolean | null } =>
  out.result as { legs: Record<string, Leg>; harmless: boolean | null };

describe("the registration and the stages before a result", () => {
  it("says nothing when ADR-065 is not in the decision log", async () => {
    const w = await buildWorld({ registered: false });
    expect(w.parse()).toEqual({ registered: false });
  });

  it("refuses a pooled result in a repository whose decision log has no ADR-065", async () => {
    const w = await buildWorld({ registered: false, legs: { og: {} } });
    expect(() => w.parse()).toThrow(/has no ADR-065/);
  });

  it("is registered, with the price, the margins and the precondition's games, and has no result before the legs exist", async () => {
    const w = await buildWorld();
    const out = w.parse();
    expect(out).toMatchObject({
      adr: "ADR-065",
      registered: true,
      price: { from: 20, perCard: 1, legacyFrom: 30, legacyPerCard: 0.6 },
      margins: { firstBossShare: -0.01, meanFloors: -0.25, interval: 0.95 },
      classLevel: 0.01,
      seeds: 2000,
      precondition: { games: 2000, minimumGapInSkipShare: 0.02 },
      result: null,
    });
  });

  it("refuses a precondition that did not pass", async () => {
    const w = await buildWorld();
    writeFileSync(
      w.path("experiments", "skip", "precondition.json"),
      JSON.stringify({ kind: "skip-precondition", schema: 1, passed: false, legs: {} }),
    );
    expect(() => w.parse()).toThrow(/not a passed precondition/);
  });

  it("refuses a reading when no leg has been pooled", async () => {
    const w = await buildWorld();
    writeFileSync(
      w.path("experiments", "skip", "reading.json"),
      JSON.stringify({ kind: "skip-reading", schema: 1 }),
    );
    expect(() => w.parse()).toThrow(/no pooled leg does/);
  });
});

describe("the rule of ADR-065 item 4, applied to the numbers", () => {
  it("reads two legs that are not behind as harmless as far as the simulation can see", async () => {
    const w = await buildWorld({ legs: { og: {}, ud: {} } });
    const r = result(w.parse());
    expect(r.harmless).toBe(true);
    for (const leg of ["og", "ud"]) {
      expect(r.legs[leg]?.verdict).toBe("not-behind");
      expect(r.legs[leg]?.notBehind).toEqual({ firstBoss: true, meanFloors: true });
    }
    expect(r.legs.ud).toMatchObject({ act1: "underdocks", pairs: 10000 });
    expect(r.legs.og).toMatchObject({ act1: "overgrowth" });
    expect(r.legs.og?.skipShares).toMatchObject({
      s1: { share: 0.07, skipped: 350 },
      s0: { share: 0.01 },
    });
  });

  it("reads one leg alone as unfinished, whichever leg it is", async () => {
    for (const leg of ["og", "ud"] as const) {
      const w = await buildWorld({ legs: { [leg]: {} } });
      const r = result(w.parse());
      expect(Object.keys(r.legs)).toEqual([leg]);
      expect(r.harmless).toBeNull();
    }
  });

  it("is not behind only if the lower end of the interval at the first boss is above -1.0 point, to the last digit", async () => {
    for (const [lo, expected] of [
      [-0.0099, true],
      [-0.01, false],
      [-0.0101, false],
    ] as const) {
      const w = await buildWorld({ legs: { og: { boss: [lo, 0.01] } } });
      const leg = result(w.parse()).legs.og;
      expect(leg?.notBehind.firstBoss, String(lo)).toBe(expected);
      expect(leg?.verdict).toBe(expected ? "not-behind" : "not-shown-harmless");
    }
  });

  it("is not behind only if the lower end of the interval of the mean floors is above -0.25, to the last digit", async () => {
    for (const [lo, expected] of [
      [-0.249, true],
      [-0.25, false],
      [-0.4, false],
    ] as const) {
      const w = await buildWorld({ legs: { ud: { floors: [lo, 0.2] } } });
      const leg = result(w.parse()).legs.ud;
      expect(leg?.notBehind.meanFloors, String(lo)).toBe(expected);
      expect(leg?.verdict).toBe(expected ? "not-behind" : "not-shown-harmless");
    }
  });

  it("needs both conditions, and both legs, for the price to be harmless", async () => {
    const w = await buildWorld({
      legs: { og: {}, ud: { boss: [-0.02, 0.01], floors: [-0.4, 0.1] } },
    });
    const r = result(w.parse());
    expect(r.legs.ud).toMatchObject({
      verdict: "not-shown-harmless",
      notBehind: { firstBoss: false, meanFloors: false },
    });
    expect(r.legs.og?.verdict).toBe("not-behind");
    expect(r.harmless).toBe(false);
  });

  it("does not let a leg that is far ahead make up for the other being behind", async () => {
    const w = await buildWorld({
      legs: { og: { boss: [0.02, 0.05], floors: [0.5, 0.9] }, ud: { boss: [-0.03, -0.01] } },
    });
    const r = result(w.parse());
    expect(r.legs.og?.verdict).toBe("not-behind");
    expect(r.harmless).toBe(false);
  });

  it("marks a class whose own games had version 1's price ahead at p below 0.01, and one that had the slot price ahead, and no other", async () => {
    const discordant = [
      [40, 120], // behind: 120 against 40, p far below 0.01
      [120, 40], // ahead
      [60, 75], // not clear (p about 0.28)
      [60, 60],
      [55, 80], // p about 0.04: above the class level
    ] as const;
    const w = await buildWorld({ legs: { og: { discordant } } });
    const classes = result(w.parse()).legs.og?.classes ?? {};
    expect(classes.ironclad).toMatchObject({ behind: true, ahead: false, onlyS1: 40, onlyS0: 120 });
    expect(classes.silent).toMatchObject({ behind: false, ahead: true });
    for (const c of ["regent", "necrobinder", "defect"])
      expect(classes[c], c).toMatchObject({ behind: false, ahead: false });
  });
});

describe("what the reader refuses", () => {
  it("refuses a pooled file whose sides are the other way round", async () => {
    const w = await buildWorld({ legs: { og: {} } });
    const file = w.path("experiments", "skip", "pooled-slot-og.json");
    const body = JSON.parse((await import("node:fs")).readFileSync(file, "utf8")) as {
      members: { a: Json; b: Json }[];
    };
    for (const m of body.members) [m.a, m.b] = [m.b, m.a];
    writeFileSync(file, JSON.stringify(body));
    expect(() => w.parse()).toThrow(
      /\(ironclad, s1\): it is advisor_v1-astar-ironclad-a0-veteran-keeprelics-val-n2000, not advisor_v1-slot-ironclad-a0-veteran-keeprelics-val-n2000/,
    );
  });

  it("refuses a batch whose content is not the one the comparison was written from", async () => {
    const w = await buildWorld({ legs: { og: {} } });
    w.amend("og", "s1", "silent", (_m, report) => {
      report.contentSha256 = hex("something else");
    });
    expect(() => w.parse()).toThrow(/changed after the comparison was written/);
  });

  it("refuses the slot arm without its price among its named parameters", async () => {
    const w = await buildWorld({ legs: { ud: {} } });
    w.amend("ud", "s1", "regent", (m, r) => {
      (m.policy as Json).params = A_STAR;
      r.policyParams = A_STAR;
    });
    expect(() => w.parse()).toThrow(
      /\(regent, s1\): its parameters are not those of A\* with the price of a slot/,
    );
  });

  it("refuses a baseline that names a price", async () => {
    const w = await buildWorld({ legs: { ud: {} } });
    w.amend("ud", "s0", "regent", (m, r) => {
      (m.policy as Json).params = S1_NAMED;
      r.policyParams = S1_NAMED;
    });
    expect(() => w.parse()).toThrow(
      /\(regent, s0\): its parameters are not those of A\* \(ADR-050 addendum D\)/,
    );
  });

  it("refuses a slot batch whose effective price is not the registered one", async () => {
    const w = await buildWorld({ legs: { og: {} } });
    w.amend("og", "s1", "defect", (m) => {
      (((m.policy as Json).effective as Json).params as Json).size_from = 25;
    });
    expect(() => w.parse()).toThrow(/effective price of a slot is not 1.0 from the 21st card/);
  });

  it("refuses a baseline that carries a price in its effective parameters", async () => {
    const w = await buildWorld({ legs: { og: {} } });
    w.amend("og", "s0", "necrobinder", (m) => {
      (((m.policy as Json).effective as Json).params as Json).size = 0.6;
    });
    expect(() => w.parse()).toThrow(/names a price of a slot/);
  });

  it("refuses a batch played in the other Act 1 than its leg's", async () => {
    const w = await buildWorld({ legs: { ud: {} } });
    w.amend("ud", "s0", "ironclad", (m) => {
      (m.config as Json).act1 = "overgrowth";
    });
    expect(() => w.parse()).toThrow(/Act 1 in overgrowth, not in underdocks/);
    const v = await buildWorld({ legs: { og: {} } });
    v.amend("og", "s1", "ironclad", (m) => {
      (m.config as Json).act1 = "underdocks";
    });
    expect(() => v.parse()).toThrow(/Act 1 in underdocks, not in overgrowth/);
  });

  it("refuses a slot batch played from a dirty tree, or from different commits", async () => {
    const dirty = await buildWorld({ legs: { og: {} } });
    dirty.amend("og", "s1", "silent", (m) => {
      ((m.environment as Json).slay2 as Json).dirty = true;
    });
    expect(() => dirty.parse()).toThrow(/uncommitted changes/);
    const other = await buildWorld({ legs: { ud: {} } });
    other.amend("ud", "s1", "silent", (m) => {
      ((m.environment as Json).slay2 as Json).head = "c".repeat(40);
    });
    expect(() => other.parse()).toThrow(/not all played from one commit/);
  });

  it("refuses a batch that is not the class it is filed under, or not the veteran profile, or not with the relics kept", async () => {
    const klass = await buildWorld({ legs: { og: {} } });
    klass.amend("og", "s1", "regent", (_m, r) => {
      r.character = "Silent";
    });
    expect(() => klass.parse()).toThrow(/played as "Silent", not as Regent/);
    const relics = await buildWorld({ legs: { og: {} } });
    relics.amend("og", "s0", "regent", (_m, r) => {
      r.keepRelics = false;
    });
    expect(() => relics.parse()).toThrow(/relics kept/);
  });

  it("refuses a batch without a passing sample audit of at least 40 games", async () => {
    const w = await buildWorld({ legs: { og: {} } });
    w.amend("og", "s0", "defect", (_m, r) => {
      r.sampleAudit = { drawn: 39, verified: 39, ledgerOk: true };
    });
    expect(() => w.parse()).toThrow(/no passing sample audit of at least 40 games/);
  });

  it("refuses a pooled file whose p-value is not the exact one of its counts", async () => {
    const w = await buildWorld({ legs: { og: {} } });
    const file = w.path("experiments", "skip", "pooled-slot-og.json");
    const body = JSON.parse((await import("node:fs")).readFileSync(file, "utf8")) as {
      reachedAct2: { pairedTable: { mcnemar_p: number } };
    };
    body.reachedAct2.pairedTable.mcnemar_p = 0.0001;
    writeFileSync(file, JSON.stringify(body));
    expect(() => w.parse()).toThrow(/not the exact McNemar p-value of its counts/);
  });
});

describe("the reading the study's own script writes", () => {
  it("has to be there once both legs are, and has to agree with the numbers", async () => {
    const missing = await buildWorld({ legs: { og: {}, ud: {} }, reading: false });
    expect(() => missing.parse()).toThrow(/not reading\.json/);
    const w = await buildWorld({ legs: { og: {}, ud: { boss: [-0.02, 0.0] } } });
    const file = w.path("experiments", "skip", "reading.json");
    const body = JSON.parse((await import("node:fs")).readFileSync(file, "utf8")) as {
      legs: Record<string, { verdict: string }>;
      harmless: boolean;
    };
    body.legs.ud = { verdict: "not behind" };
    writeFileSync(file, JSON.stringify(body));
    expect(() => w.parse()).toThrow(
      /says not behind for the ud leg; the numbers say not shown to be harmless/,
    );
  });

  it("has to agree about the overall verdict", async () => {
    const w = await buildWorld({ legs: { og: {}, ud: {} } });
    const file = w.path("experiments", "skip", "reading.json");
    const body = JSON.parse((await import("node:fs")).readFileSync(file, "utf8")) as {
      harmless: boolean;
    };
    body.harmless = false;
    writeFileSync(file, JSON.stringify(body));
    expect(() => w.parse()).toThrow(/its overall verdict is not the one of the two legs/);
  });

  it("is not needed while only one leg is in", async () => {
    const w = await buildWorld({ legs: { og: {} }, reading: false });
    expect(result(w.parse()).legs.og?.skipShares).toBeNull();
  });
});
