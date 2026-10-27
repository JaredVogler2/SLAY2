// @vitest-environment node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { mcnemarP } from "./fixtures/synergy-test";

/**
 * `scripts/export-site-data.mjs` reads the one registered held-out test of the synergy term (ADR-050, stage B2) only when everything
 * it rests on belongs together: the arms it names are the arms the batches' manifests show, A* is the configuration the development
 * stage's selection files choose by the registered rule, the batches are the class, partition, policy and seed count the pooled file
 * claims, and the two primary arms carry a passing sample audit. These tests build a small repository out of synthetic batches
 * (no simulated game is involved; the numbers are only consistent with each other) and break one thing at a time.
 */
const repo = join(__dirname, "..", "..", "..");
const script = join(repo, "scripts", "export-site-data.mjs");
const CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"] as const;
const EXACT: Record<string, string> = {
  ironclad: "Ironclad",
  silent: "Silent",
  regent: "Regent",
  necrobinder: "Necrobinder",
  defect: "Defect",
};
const CONFIGS = {
  d1: { needs: 1, scalers: 0.7, engines: 0 },
  d2: { needs: 1, scalers: 0.7, engines: 0.25 },
  d3: { needs: 1, scalers: 0.7, engines: 0.5 },
  d4: { needs: 1, scalers: 1, engines: 1 },
} as const;

type Json = Record<string, unknown>;
type Arm = "astar" | "d0star" | "d0" | "rules_v3";

interface Options {
  arm?: keyof typeof CONFIGS;
  margin?: 0 | 1.5 | 3;
  /** discordant pairs of the primary comparison, A* only / d0* only (pooled over the classes, divisible by five) */
  discordant?: [number, number];
}

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

const hex = (seed: string): string => {
  let h = "";
  for (let i = 0; h.length < 64; i++) {
    h += ((seed.charCodeAt(i % seed.length) * 2654435761 + i * 40503) >>> 0)
      .toString(16)
      .padStart(8, "0");
  }
  return h.slice(0, 64);
};

function batchId(arm: Arm, cls: string): string {
  if (arm === "rules_v3") {
    return cls === "ironclad"
      ? "rules_v3-values2-ironclad-a0-veteran-val-n2000"
      : `rules_v3-${cls}-a0-veteran-val-n2000`;
  }
  return `advisor_v1-${arm}-${cls}-a0-veteran-val-n2000`;
}

/** The parameters each arm's manifest records as the ones its pilot ran with. */
function effective(arm: Arm, o: Required<Options>): Json {
  const c = CONFIGS[o.arm];
  if (arm === "astar") return { ...c, margin: o.margin, synergy: 1, risk: "balanced" };
  if (arm === "d0star") return { needs: 1, scalers: 1, engines: 1, margin: o.margin, synergy: 0 };
  if (arm === "d0") return { needs: 1, scalers: 1, engines: 1, margin: 0, synergy: 0 };
  return {};
}

function manifest(arm: Arm, cls: string, o: Required<Options>): Json {
  const id = batchId(arm, cls);
  return {
    batch_id: id,
    canonical_process_state: true,
    class_start_verified: true,
    config: { ascension: 0, character: EXACT[cls], profile: "veteran", start_with_neow: true },
    content_sha256: hex(id),
    environment: { slay2: { head: "a".repeat(40), dirty: false } },
    episodes_gz: { sha256: hex(`${id}-gz`) },
    finished: "2026-10-27T03:00:00+00:00",
    known_simulator_gaps: [],
    policy:
      arm === "rules_v3"
        ? {
            name: "rules_v3",
            params: {
              threshold: 0,
              values: `experiments/cardvalue/${cls}-a0-${cls === "ironclad" ? "v2" : "v1"}.json`,
            },
            effective: { params: {} },
          }
        : { name: "advisor_v1", params: {}, effective: { params: effective(arm, o) } },
    seeds: { partition: "val", n: 2000, sealed_partition_used: false },
    simulator: {
      id: "sts2-rl-agent",
      pinned: "5d874e855ae1d0550d5c30416fadd7dbb0d133b7",
      parity_with_live_game: "UNVERIFIED",
    },
    summary: {
      completed: 1990,
      counts: {
        aborted: 0,
        death: 1990,
        harness_error: 0,
        invalid_action: 0,
        policy_error: 0,
        simulator_error: 10,
        timeout: 0,
        win: 0,
      },
      win_rate_of_completed: 0,
      win_rate_95ci_wilson: [0, 0.002],
    },
  };
}

function pairedTable(aOnly: number, bOnly: number, both: number, neither: number): Json {
  return { a_only: aOnly, b_only: bOnly, both, neither, mcnemar_p: mcnemarP(aOnly, bOnly) };
}

function endpoint(
  aOnly: number,
  bOnly: number,
  both: number,
  neither: number,
  definition: string,
): Json {
  const total = aOnly + bOnly + both + neither;
  return {
    a: { games: aOnly + both, rate: (aOnly + both) / total, wilson95: [0.5, 0.6] },
    b: { games: bOnly + both, rate: (bOnly + both) / total, wilson95: [0.5, 0.6] },
    definition,
    pairedTable: pairedTable(aOnly, bOnly, both, neither),
  };
}

function pooledFile(a: Arm, b: Arm, name: string, discordant: [number, number]): Json {
  const [aOnly, bOnly] = discordant;
  const both = 5000;
  const neither = 3000;
  const total = aOnly + bOnly + both + neither;
  const members = CLASSES.map((cls) => ({
    a: { batchId: batchId(a, cls), contentSha256: hex(batchId(a, cls)), wins: 0 },
    b: { batchId: batchId(b, cls), contentSha256: hex(batchId(b, cls)), wins: 0 },
    bothCompleted: total / 5,
    character: EXACT[cls],
    meanFloorDifference: 0.4,
    pairedSeeds: 2000,
    reachedAct2: {
      a: (aOnly / 5 + both / 5) / (total / 5),
      b: (bOnly / 5 + both / 5) / (total / 5),
      pairedTable: pairedTable(aOnly / 5, bOnly / 5, both / 5, neither / 5),
    },
  }));
  return {
    bothCompleted: total,
    clusteredDifference: { ci95: [0.001, 0.02], meanAMinusB: (aOnly - bOnly) / total },
    cohort: {
      ascension: 0,
      characters: Object.values(EXACT),
      partition: "val",
      profile: "veteran",
    },
    contentSha256: hex(name),
    difference: "a minus b",
    excludedNotCompleted: 10000 - total,
    floorDifference: { ci95: [0.1, 0.7], meanAMinusB: 0.4 },
    kind: "pooled-paired-comparison",
    members,
    pairedSeeds: 10000,
    policies: { a: "advisor_v1", b: b === "rules_v3" ? "rules_v3" : "advisor_v1" },
    reachedAct2: endpoint(
      aOnly,
      bOnly,
      both,
      neither,
      "the run got past the Act-1 boss (it ended in Act 2 or later, or won)",
    ),
    reachedAct3: endpoint(
      50,
      40,
      300,
      total - 390,
      "the run got past the Act-2 boss (it ended in Act 3, or won)",
    ),
    role: "held-out",
    schema: 1,
    wins: { a: 0, b: 0, pairedTable: pairedTable(0, 0, 0, total) },
  };
}

function measure(mean: number): Json {
  return { n: 9000, mean, ci95: [mean - 0.01, mean + 0.01] };
}

function armProfile(o: Required<Options>): Json {
  const arm = (name: Arm, skipped: number) => ({
    batches: Object.fromEntries(
      CLASSES.map((cls) => [
        cls,
        {
          batch_id: batchId(name, cls),
          episodes_gz_sha256: hex(`${batchId(name, cls)}-gz`),
          policy: {},
        },
      ]),
    ),
    pooled: {
      games: 9950,
      offers: 40000,
      taken: 40000 - skipped,
      skipped,
      skip_rate: { n: 40000, value: skipped / 40000, ci95: [0.05, 0.1] },
      boss_decks: 9000,
      at_boss: {
        deck_size: measure(14),
        quality: measure(50),
        coverage: measure(1),
        curve: measure(-0.2),
        unmet: measure(o.margin === 0 ? -0.4 : -0.3),
        scaler: measure(0.2),
        engines: measure(0.1),
      },
    },
  });
  return {
    kind: "arm-profile",
    schema: 1,
    arms: { astar: arm("astar", 3000), d0star: arm("d0star", 2000) },
    differences: {
      "astar-vs-d0star": {
        pooled: { pairs: 8800, measures: { unmet: measure(0.1), deck_size: measure(-0.2) } },
      },
    },
  };
}

function selection(o: Required<Options>): [Json, Json] {
  const diff = (d: number) => ({
    a_rate: 0.5 + d,
    b_rate: 0.5,
    difference: d,
    ci95: [d - 0.01, d + 0.01],
    pairs: 4900,
    mcnemar_p: 0.2,
  });
  const order = ["d1", "d2", "d3", "d4"] as const;
  // the chosen arm is clearly the best; the others are clearly worse, so that no tie decides
  const phase1 = {
    phase: 1,
    baseline: "d0",
    tie_points: 0.5,
    differences: Object.fromEntries(order.map((a) => [a, diff(a === o.arm ? 0.02 : 0.005)])),
    chosen: o.arm,
  };
  const phase2 = {
    phase: 2,
    baseline: o.arm,
    tie_points: 0.5,
    differences: {
      m1: diff(o.margin === 1.5 ? 0.01 : -0.005),
      m2: diff(o.margin === 3 ? 0.01 : -0.01),
    },
    chosen_margin: o.margin,
  };
  return [phase1, phase2];
}

function buildWorld(options: Options = {}): { root: string; path: (...parts: string[]) => string } {
  const o: Required<Options> = { arm: "d2", margin: 1.5, discordant: [600, 480], ...options };
  const root = mkdtempSync(join(tmpdir(), "slay2-b2-"));
  dirs.push(root);
  for (const name of ["packages", "sim"]) {
    symlinkSync(join(repo, name), join(root, name), "dir");
  }
  mkdirSync(join(root, "apps", "web", "src", "content"), { recursive: true });
  const path = (...parts: string[]) => join(root, ...parts);
  const write = (file: string, body: unknown) => {
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, JSON.stringify(body));
  };
  const arms: Arm[] =
    o.margin === 0 ? ["astar", "d0star", "rules_v3"] : ["astar", "d0star", "d0", "rules_v3"];
  for (const arm of arms) {
    for (const cls of CLASSES) {
      const m = manifest(arm, cls, o);
      const dir = path("experiments", "batches", batchId(arm, cls));
      write(join(dir, "manifest.json"), m);
      writeFileSync(
        join(dir, "episodes.jsonl"),
        '{"seed":1,"outcome":"death","floor":12,"act":1,"killed_by":"X","wall_seconds":1}\n',
      );
      {
        write(join(dir, "sample-audit.json"), {
          batch_id: m.batch_id,
          batch_content_sha256: m.content_sha256,
          sample: { drawn: 40, completed_in_batch: 1990, rng_seed: 0 },
          verified: 40,
          ledger: { ok: true },
          criteria: "synthetic",
        });
      }
    }
  }
  mkdirSync(path("experiments", "synergy"), { recursive: true });
  cpSync(
    join(repo, "experiments", "synergy", "b1-calibration.json"),
    path("experiments", "synergy", "b1-calibration.json"),
  );
  const [p1, p2] = selection(o);
  write(path("experiments", "synergy", "dev", "selection-phase1.json"), p1);
  write(path("experiments", "synergy", "dev", "selection-phase2.json"), p2);
  const sha12 = (file: string) =>
    createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 12);
  mkdirSync(path("docs"), { recursive: true });
  symlinkSync(join(repo, "docs", "game"), path("docs", "game"), "dir");
  writeFileSync(
    path("docs", "DECISIONS.md"),
    `**Addendum D: the development stage and A*.** selection-phase1.json ${sha12(path("experiments", "synergy", "dev", "selection-phase1.json"))}, selection-phase2.json ${sha12(path("experiments", "synergy", "dev", "selection-phase2.json"))}.\n`,
  );
  const val = (file: string, body: unknown) => {
    write(path("experiments", "synergy", "val", file), body);
  };
  val("pooled-astar-vs-d0star.json", pooledFile("astar", "d0star", "p1", o.discordant));
  if (o.margin !== 0) val("pooled-astar-vs-d0.json", pooledFile("astar", "d0", "p2", [560, 500]));
  val("pooled-astar-vs-rules_v3.json", pooledFile("astar", "rules_v3", "p3", [300, 700]));
  val("arm-profile.json", armProfile(o));
  return { root, path };
}

const run = (root: string) =>
  spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { ...process.env, SLAY2_ROOT: root },
  });

function edit(file: string, change: (body: Json) => void) {
  const body = JSON.parse(readFileSync(file, "utf8")) as Json;
  change(body);
  writeFileSync(file, JSON.stringify(body));
}

function exported(root: string): { b2: Json | null } {
  return JSON.parse(
    readFileSync(join(root, "apps", "web", "src", "content", "synergy.generated.json"), "utf8"),
  ) as { b2: Json | null };
}

describe("the arms the exporter knows are the arms the study runs", () => {
  it("are the four configurations of scripts/studies/synergy/common.sh", () => {
    const shell = readFileSync(join(repo, "scripts", "studies", "synergy", "common.sh"), "utf8");
    const arms = [...shell.matchAll(/(d[1-4])\) echo '(\{.*?\})' ;;/g)].map(
      (m) => [m[1], JSON.parse(m[2] ?? "{}") as Json] as const,
    );
    expect(Object.fromEntries(arms)).toEqual(CONFIGS);
  });
});

describe("the exporter reads the registered synergy test only when it belongs together", () => {
  it("exports nothing for the test while its pooled result does not exist", () => {
    const w = buildWorld();
    rmSync(w.path("experiments", "synergy", "val"), { recursive: true });
    const r = run(w.root);
    expect(r.status, r.stderr).toBe(0);
    expect(exported(w.root).b2).toBeNull();
  });

  it("reads a consistent result: the configuration, the margin, the verdict and the selection hashes", () => {
    const w = buildWorld({ arm: "d3", margin: 3, discordant: [600, 480] });
    const r = run(w.root);
    expect(r.status, r.stderr).toBe(0);
    const b2 = exported(w.root).b2 as Json & {
      astar: Json;
      primary: Json;
      verdict: string;
      noTermAtZero: unknown;
      profile: Json | null;
    };
    expect(b2.astar).toEqual({ arm: "d3", needs: 1, scalers: 0.7, engines: 0.5, margin: 3 });
    expect(b2.verdict).toBe("ahead");
    expect(b2.noTermAtZero).not.toBeNull();
    expect(b2.profile).not.toBeNull();
    expect((b2.primary as { members: unknown[] }).members).toHaveLength(5);
    expect((b2 as unknown as { alpha: number }).alpha).toBe(0.05);
  });

  it.each([
    [[480, 600], "behind"],
    [[500, 500], "not-shown"],
    [[600, 480], "ahead"],
  ] as const)("reads the registered rule from the numbers: %j is %s", (discordant, verdict) => {
    const w = buildWorld({ discordant: [discordant[0], discordant[1]] });
    const r = run(w.root);
    expect(r.status, r.stderr).toBe(0);
    expect((exported(w.root).b2 as { verdict: string }).verdict).toBe(verdict);
  });

  it("needs no comparison with the no-margin arm when the margin is 0, and refuses one", () => {
    const w = buildWorld({ margin: 0 });
    expect(run(w.root).status).toBe(0);
    expect((exported(w.root).b2 as { noTermAtZero: unknown }).noTermAtZero).toBeNull();
    writeFileSync(
      w.path("experiments", "synergy", "val", "pooled-astar-vs-d0.json"),
      readFileSync(w.path("experiments", "synergy", "val", "pooled-astar-vs-d0star.json")),
    );
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("at margin 0 it is the primary comparison");
  });

  it("refuses a margin other than 0 without the comparison with the index at margin 0", () => {
    const w = buildWorld({ margin: 1.5 });
    rmSync(w.path("experiments", "synergy", "val", "pooled-astar-vs-d0.json"));
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("pooled-astar-vs-d0.json");
  });

  it("refuses a result without the comparison with the measured-values pilot", () => {
    const w = buildWorld();
    rmSync(w.path("experiments", "synergy", "val", "pooled-astar-vs-rules_v3.json"));
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("pooled-astar-vs-rules_v3.json");
  });

  it("refuses a result whose development stage left no selection file", () => {
    const w = buildWorld();
    rmSync(w.path("experiments", "synergy", "dev", "selection-phase2.json"));
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("selection-phase2.json is missing");
  });

  it("refuses a selection file that chose differently from the rule applied to its own numbers", () => {
    const w = buildWorld({ arm: "d2" });
    edit(w.path("experiments", "synergy", "dev", "selection-phase1.json"), (p) => {
      p.chosen = "d4";
    });
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("the rule of ADR-050 chooses d2 from its numbers");
  });

  it("refuses a margin the selection did not choose", () => {
    const w = buildWorld({ margin: 1.5 });
    edit(w.path("experiments", "synergy", "dev", "selection-phase2.json"), (p) => {
      p.chosen_margin = 3;
    });
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("the rule of ADR-050 chooses 1.5 from its numbers");
  });

  it("refuses A* batches that ran with other parameters than the configuration the development stage chose", () => {
    const w = buildWorld({ arm: "d2" });
    edit(w.path("experiments", "batches", batchId("astar", "silent"), "manifest.json"), (m) => {
      ((m.policy as Json).effective as { params: Json }).params.engines = 0.5;
    });
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(
      "its parameters are not the configuration the development stage chose",
    );
  });

  it("refuses a d0* arm that changed more than the synergy term (another margin)", () => {
    const w = buildWorld({ margin: 1.5 });
    edit(w.path("experiments", "batches", batchId("d0star", "regent"), "manifest.json"), (m) => {
      ((m.policy as Json).effective as { params: Json }).params.margin = 0;
    });
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("it is not the index without the synergy term at A*'s margin");
  });

  it("refuses a batch that is not the 2,000 val seeds, or not the class the pooled file says", () => {
    const seeds = buildWorld();
    edit(seeds.path("experiments", "batches", batchId("astar", "defect"), "manifest.json"), (m) => {
      (m.seeds as Json).n = 1000;
    });
    const a = run(seeds.root);
    expect(a.status).not.toBe(0);
    expect(a.stderr).toContain("it is not the 2000 val seeds");
    const dev = buildWorld();
    edit(dev.path("experiments", "batches", batchId("astar", "defect"), "manifest.json"), (m) => {
      (m.seeds as Json).partition = "dev";
    });
    const b = run(dev.root);
    expect(b.status).not.toBe(0);
    expect(b.stderr).toContain("it is not the 2000 val seeds");
    const wrong = buildWorld();
    edit(
      wrong.path("experiments", "batches", batchId("d0star", "silent"), "manifest.json"),
      (m) => {
        (m.config as Json).character = "Ironclad";
      },
    );
    const c = run(wrong.root);
    expect(c.status).not.toBe(0);
    expect(c.stderr).toContain('it was played as "Ironclad", not as Silent');
  });

  it("accepts the one reference batch that predates the class check (Ironclad's rules_v3 with measured values) and nothing else", () => {
    const ironclad = buildWorld();
    edit(
      ironclad.path("experiments", "batches", batchId("rules_v3", "ironclad"), "manifest.json"),
      (m) => {
        delete m.class_start_verified;
      },
    );
    const a = run(ironclad.root);
    expect(a.status, a.stderr).toBe(0);
    const silent = buildWorld();
    edit(
      silent.path("experiments", "batches", batchId("rules_v3", "silent"), "manifest.json"),
      (m) => {
        delete m.class_start_verified;
      },
    );
    const b = run(silent.root);
    expect(b.status).not.toBe(0);
    expect(b.stderr).toContain("its games were not checked against the class they were played as");
  });

  it("refuses games that were not checked against the class they were played as", () => {
    const w = buildWorld();
    edit(w.path("experiments", "batches", batchId("astar", "ironclad"), "manifest.json"), (m) => {
      m.class_start_verified = false;
    });
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("its games were not checked against the class they were played as");
  });

  it("refuses an arm that was played from a working tree with uncommitted changes", () => {
    const w = buildWorld();
    edit(w.path("experiments", "batches", batchId("astar", "regent"), "manifest.json"), (m) => {
      ((m.environment as Json).slay2 as Json).dirty = true;
    });
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("uncommitted changes");
  });

  it("refuses arms that were not all played from one commit", () => {
    const w = buildWorld();
    edit(w.path("experiments", "batches", batchId("d0star", "defect"), "manifest.json"), (m) => {
      ((m.environment as Json).slay2 as Json).head = "b".repeat(40);
    });
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("not all played from one commit");
  });

  it("refuses a pooled file whose batch changed after it was written", () => {
    const w = buildWorld();
    edit(w.path("experiments", "synergy", "val", "pooled-astar-vs-d0star.json"), (t) => {
      const member = (t.members as { a: { contentSha256: string } }[])[2];
      if (member) member.a.contentSha256 = "0".repeat(64);
    });
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("changed after the comparison was written");
  });

  it("refuses a sample audit that was written for other content than the batch", () => {
    const w = buildWorld();
    edit(w.path("experiments", "batches", batchId("astar", "regent"), "manifest.json"), (m) => {
      m.content_sha256 = "0".repeat(64);
    });
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("sample-audit.json was written for other content");
  });

  it("refuses a pooled file that is not held out, or does not pool all five classes", () => {
    const notHeldOut = buildWorld();
    edit(notHeldOut.path("experiments", "synergy", "val", "pooled-astar-vs-d0star.json"), (t) => {
      t.role = "development (dev partition): not a held-out result";
    });
    const a = run(notHeldOut.root);
    expect(a.status).not.toBe(0);
    expect(a.stderr).toContain("not a held-out comparison");
    const fewer = buildWorld();
    edit(fewer.path("experiments", "synergy", "val", "pooled-astar-vs-d0star.json"), (t) => {
      t.members = (t.members as unknown[]).slice(1);
    });
    const b = run(fewer.root);
    expect(b.status).not.toBe(0);
    expect(b.stderr).toContain("must pool all five classes");
  });

  it("refuses pooled numbers that are not the sum of the classes'", () => {
    const w = buildWorld();
    edit(w.path("experiments", "synergy", "val", "pooled-astar-vs-d0star.json"), (t) => {
      ((t.reachedAct2 as Json).pairedTable as Json).a_only = 1;
    });
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("is not the sum of the classes'");
  });

  it("refuses a primary arm without a passing sample audit of at least 40 games", () => {
    const missing = buildWorld();
    rmSync(
      missing.path("experiments", "batches", batchId("d0star", "silent"), "sample-audit.json"),
    );
    const a = run(missing.root);
    expect(a.status).not.toBe(0);
    expect(a.stderr).toContain("no passing sample audit of at least 40 games");
    const failed = buildWorld();
    edit(
      failed.path("experiments", "batches", batchId("astar", "silent"), "sample-audit.json"),
      (s) => {
        s.verified = 39;
      },
    );
    const b = run(failed.root);
    expect(b.status).not.toBe(0);
    expect(b.stderr).toContain("no passing sample audit of at least 40 games");
  });

  it("refuses an arm profile that is about other batches than the test used", () => {
    const w = buildWorld();
    edit(w.path("experiments", "synergy", "val", "arm-profile.json"), (p) => {
      const arms = p.arms as { astar: { batches: { silent: { episodes_gz_sha256: string } } } };
      arms.astar.batches.silent.episodes_gz_sha256 = "0".repeat(64);
    });
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(
      "arm-profile.json: its astar silent batch is not the one the test used",
    );
  });

  it("refuses a p-value that is not the exact McNemar p-value of its counts", () => {
    const w = buildWorld({ discordant: [500, 500] });
    edit(w.path("experiments", "synergy", "val", "pooled-astar-vs-d0star.json"), (t) => {
      ((t.reachedAct2 as Json).pairedTable as Json).mcnemar_p = 0.001;
    });
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("is not the exact McNemar p-value of its counts");
  });

  it("refuses a table that does not add up to the pairs both arms completed, and rates that are not its counts", () => {
    const table = buildWorld();
    edit(table.path("experiments", "synergy", "val", "pooled-astar-vs-d0star.json"), (t) => {
      const tab = (t.reachedAct3 as Json).pairedTable as Json;
      tab.neither = (tab.neither as number) + 1;
    });
    const a = run(table.root);
    expect(a.status).not.toBe(0);
    expect(a.stderr).toContain("the Act-2 table adds up to");
    const rate = buildWorld();
    edit(rate.path("experiments", "synergy", "val", "pooled-astar-vs-d0star.json"), (t) => {
      (((t.reachedAct2 as Json).a as Json).rate as number) = 0.99;
    });
    const b = run(rate.root);
    expect(b.status).not.toBe(0);
    expect(b.stderr).toContain("rates are not the counts of its table");
  });

  it("refuses any arm of any comparison without a passing sample audit, the reference arms included", () => {
    const w = buildWorld({ margin: 1.5 });
    rmSync(w.path("experiments", "batches", batchId("rules_v3", "silent"), "sample-audit.json"));
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("no passing sample audit of at least 40 games");
    const noTerm = buildWorld({ margin: 1.5 });
    rmSync(noTerm.path("experiments", "batches", batchId("d0", "defect"), "sample-audit.json"));
    const r2 = run(noTerm.root);
    expect(r2.status).not.toBe(0);
    expect(r2.stderr).toContain("no passing sample audit of at least 40 games");
  });

  it("refuses a result whose selection files are not the ones the decision log records (Addendum D)", () => {
    const noAddendum = buildWorld();
    writeFileSync(noAddendum.path("docs", "DECISIONS.md"), "no addendum here\n");
    const a = run(noAddendum.root);
    expect(a.status).not.toBe(0);
    expect(a.stderr).toContain("has no Addendum D");
    const otherHash = buildWorld();
    edit(otherHash.path("experiments", "synergy", "dev", "selection-phase2.json"), (p2) => {
      p2.tie_points = 0.4; // still the same choice by the rule, but not the file the log quotes
    });
    const b = run(otherHash.root);
    expect(b.status).not.toBe(0);
    expect(b.stderr).toContain("does not quote the hash");
  });

  it("says how many games of each arm did not finish, from the manifests", () => {
    const w = buildWorld();
    expect(run(w.root).status).toBe(0);
    const primary = (exported(w.root).b2 as { primary: { notFinished: { a: number; b: number } } })
      .primary;
    expect(primary.notFinished).toEqual({ a: 50, b: 50 });
  });

  it("holds the new reference batches to the clean-checkout rule, and the old Ironclad one to none", () => {
    const old = buildWorld();
    edit(
      old.path("experiments", "batches", batchId("rules_v3", "ironclad"), "manifest.json"),
      (m) => {
        ((m.environment as Json).slay2 as Json).dirty = true;
      },
    );
    const a = run(old.root);
    expect(a.status, a.stderr).toBe(0);
    const fresh = buildWorld();
    edit(
      fresh.path("experiments", "batches", batchId("rules_v3", "silent"), "manifest.json"),
      (m) => {
        ((m.environment as Json).slay2 as Json).dirty = true;
      },
    );
    const b = run(fresh.root);
    expect(b.status).not.toBe(0);
    expect(b.stderr).toContain("uncommitted changes");
  });
});
