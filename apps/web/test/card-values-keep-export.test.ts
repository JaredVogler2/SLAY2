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

import { afterEach, describe, expect, it, vi } from "vitest";

import { mcnemarP } from "./fixtures/synergy-test";

// These tests start the site-data exporter in a child process; on a busy machine that takes longer than the 5 s default.
vi.setConfig({ testTimeout: 30_000 });

/**
 * `scripts/export-site-data.mjs` reads the one registered held-out test of the card values measured again with the relics kept
 * (ADR-053) only when everything it rests on belongs together, and applies the reading rule of item 5 to its numbers: the value files
 * the site shows are the rule's, and a `site-sets.json` that disagrees is refused. These tests build a small repository out of
 * synthetic batches and the repository's own value files (no simulated game is involved; the counts are only consistent with each
 * other) and break one thing at a time.
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
const current = (cls: string): string =>
  cls === "ironclad" ? "ironclad-a0-v2.json" : `${cls}-a0-v1.json`;
const fresh = (cls: string): string => `${cls}-a0-keep-v1.json`;

type Json = Record<string, unknown>;
type Arm = "keepvals" | "curvals";

/** The pairs only the new values got past the boss, and only the current values did, in each class (in the order of CLASSES). */
type Discordant = readonly (readonly [number, number])[];

interface Options {
  discordant?: Discordant;
  /** the classes whose new set the site lists (a result that adopts changes `site-sets.json`; the rest list the current set) */
  adopt?: readonly (typeof CLASSES)[number][];
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

const batchId = (arm: Arm, cls: string): string =>
  `rules_v3-${arm}-${cls}-a0-veteran-keeprelics-val-n2000`;

function manifest(arm: Arm, cls: string): Json {
  const id = batchId(arm, cls);
  return {
    batch_id: id,
    canonical_process_state: true,
    class_start_verified: true,
    config: {
      ascension: 0,
      character: EXACT[cls],
      profile: "veteran",
      start_with_neow: true,
      keep_relics: true,
    },
    content_sha256: hex(id),
    environment: { slay2: { head: "b".repeat(40), dirty: false } },
    episodes_gz: { sha256: hex(`${id}-gz`) },
    finished: "2026-10-27T11:00:00+00:00",
    known_simulator_gaps: [],
    policy: {
      name: "rules_v3",
      params: {
        threshold: 0,
        values: `experiments/cardvalue/${arm === "keepvals" ? fresh(cls) : current(cls)}`,
      },
      effective: { params: {} },
    },
    seeds: { partition: "val", n: 2000, sealed_partition_used: false },
    simulator: {
      id: "sts2-rl-agent",
      pinned: "5d874e855ae1d0550d5c30416fadd7dbb0d133b7",
      parity_with_live_game: "UNVERIFIED",
    },
    summary: {
      completed: 1960,
      counts: {
        aborted: 0,
        death: 1960,
        harness_error: 0,
        invalid_action: 0,
        policy_error: 0,
        simulator_error: 40,
        timeout: 0,
        win: 0,
      },
      win_rate_of_completed: 0,
      win_rate_95ci_wilson: [0, 0.002],
    },
  };
}

const table = (aOnly: number, bOnly: number, both: number, neither: number): Json => ({
  a_only: aOnly,
  b_only: bOnly,
  both,
  neither,
  mcnemar_p: mcnemarP(aOnly, bOnly),
});

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
    pairedTable: table(aOnly, bOnly, both, neither),
  };
}

function pooledFile(discordant: Discordant): Json {
  const both = 800;
  const neither = 600;
  const per = discordant.map(([a, b]) => a + b + both + neither);
  const aOnly = discordant.reduce((n, [a]) => n + a, 0);
  const bOnly = discordant.reduce((n, [, b]) => n + b, 0);
  const total = per.reduce((n, x) => n + x, 0);
  const members = CLASSES.map((cls, i) => {
    const [a, b] = discordant[i] ?? [0, 0];
    return {
      a: {
        batchId: batchId("keepvals", cls),
        contentSha256: hex(batchId("keepvals", cls)),
        wins: 0,
      },
      b: { batchId: batchId("curvals", cls), contentSha256: hex(batchId("curvals", cls)), wins: 0 },
      bothCompleted: per[i] ?? 0,
      character: EXACT[cls],
      meanFloorDifference: 0.4,
      pairedSeeds: 2000,
      reachedAct2: {
        a: (a + both) / (per[i] ?? 1),
        b: (b + both) / (per[i] ?? 1),
        pairedTable: table(a, b, both, neither),
      },
    };
  });
  return {
    bothCompleted: total,
    clusteredDifference: { ci95: [0.001, 0.02], meanAMinusB: (aOnly - bOnly) / total },
    cohort: {
      ascension: 0,
      characters: Object.values(EXACT),
      partition: "val",
      profile: "veteran",
    },
    contentSha256: hex("pooled-keepvals-vs-curvals-val"),
    difference: "a minus b",
    excludedNotCompleted: 10000 - total,
    floorDifference: { ci95: [0.1, 0.7], meanAMinusB: 0.4 },
    kind: "pooled-paired-comparison",
    members,
    pairedSeeds: 10000,
    policies: { a: "rules_v3", b: "rules_v3" },
    reachedAct2: endpoint(
      aOnly,
      bOnly,
      both * 5,
      neither * 5,
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
    wins: { a: 0, b: 0, pairedTable: table(0, 0, 0, total) },
  };
}

/** One class's own comparison, as `slay2_sim compare` writes it: the new values (a) against the current values (b), the same seeds. */
function comparisonFile(cls: (typeof CLASSES)[number], a: number, b: number): Json {
  const both = 800;
  const neither = 600;
  const total = a + b + both + neither;
  return {
    a: {
      batchId: batchId("keepvals", cls),
      contentSha256: hex(batchId("keepvals", cls)),
      policy: "rules_v3",
      wins: 0,
      meanFloor: 20,
    },
    b: {
      batchId: batchId("curvals", cls),
      contentSha256: hex(batchId("curvals", cls)),
      policy: "rules_v3",
      wins: 0,
      meanFloor: 19.8,
    },
    cohort: { ascension: 0, character: EXACT[cls], partition: "val", profile: "veteran" },
    pairedSeeds: 2000,
    bothCompleted: total,
    excludedNotCompleted: 2000 - total,
    pairedWinTable: table(0, 0, 0, total),
    reachedAct2: endpoint(a, b, both, neither, "the run got past the Act-1 boss"),
    floorDifference: { meanAMinusB: 0.2, ci95: [0, 0.4] },
    wallTimeRatioBOverA: 1,
    role: "held-out",
    contentSha256: hex(`comparison-${cls}`),
  };
}

const comparisonId = (cls: string): string =>
  `rules_v3-keepvals-vs-curvals-${cls}-a0-veteran-keeprelics-val`;

function buildWorld(options: Options = {}): { root: string; path: (...parts: string[]) => string } {
  const discordant: Discordant = options.discordant ?? CLASSES.map(() => [100, 100] as const);
  const root = mkdtempSync(join(tmpdir(), "slay2-keepvalues-"));
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
  // the value files are the repository's own; the site lists the current ones (a result that adopts changes that list)
  mkdirSync(path("experiments", "cardvalue"), { recursive: true });
  for (const cls of CLASSES) {
    for (const f of [current(cls), fresh(cls)]) {
      cpSync(join(repo, "experiments", "cardvalue", f), path("experiments", "cardvalue", f));
    }
  }
  const adopt = new Set<string>(options.adopt ?? []);
  write(path("experiments", "cardvalue", "site-sets.json"), {
    schema: 1,
    sets: CLASSES.map((cls) =>
      adopt.has(cls)
        ? {
            file: fresh(cls),
            supersedes: current(cls),
            test: { comparison: comparisonId(cls), against: "current-values" },
            drift: `compare-${cls}-a0-current-vs-keep-v1.json`,
          }
        : { file: current(cls) },
    ),
  });
  for (const cls of CLASSES.filter((c) => adopt.has(c))) {
    // the descriptive comparison and the exploration batches of the new set are the repository's own; the class's own comparison is
    // written from its discordant pairs
    const drift = `compare-${cls}-a0-current-vs-keep-v1.json`;
    cpSync(join(repo, "experiments", "cardvalue", drift), path("experiments", "cardvalue", drift));
    const explore = `explore4-${cls}-a0-keeprelics-dev-o5000-n5000`;
    mkdirSync(path("experiments", "cardvalue", explore), { recursive: true });
    cpSync(
      join(repo, "experiments", "cardvalue", explore, "manifest.json"),
      path("experiments", "cardvalue", explore, "manifest.json"),
    );
    const [a, b] = discordant[CLASSES.indexOf(cls)] ?? [0, 0];
    write(
      path("experiments", "comparisons", `${comparisonId(cls)}.json`),
      comparisonFile(cls, a, b),
    );
  }
  // the decision log records the hashes of the five new files before any held-out game
  mkdirSync(path("docs"), { recursive: true });
  symlinkSync(join(repo, "docs", "game"), path("docs", "game"), "dir");
  writeFileSync(
    path("docs", "DECISIONS.md"),
    CLASSES.map(
      (cls) =>
        `${cls} ${createHash("sha256")
          .update(readFileSync(path("experiments", "cardvalue", fresh(cls))))
          .digest("hex")}`,
    ).join("\n") + "\n",
  );
  for (const arm of ["keepvals", "curvals"] as const) {
    for (const cls of CLASSES) {
      const m = manifest(arm, cls);
      const dir = path("experiments", "batches", batchId(arm, cls));
      write(join(dir, "manifest.json"), m);
      writeFileSync(
        join(dir, "episodes.jsonl"),
        '{"seed":1,"outcome":"death","floor":12,"act":1,"killed_by":"X","wall_seconds":1}\n',
      );
      write(join(dir, "sample-audit.json"), {
        batch_id: m.batch_id,
        batch_content_sha256: m.content_sha256,
        sample: { drawn: 40, completed_in_batch: 1960, rng_seed: 0 },
        verified: 40,
        ledger: { ok: true },
        criteria: "synthetic",
      });
    }
  }
  write(
    path("experiments", "cardvalue", "pooled-keepvals-vs-curvals-val.json"),
    pooledFile(discordant),
  );
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

interface Exported {
  sets: {
    id: string;
    character: string;
    relicsKept: boolean;
    supersedes: string | null;
    validation: { basis: string; passed: boolean; against: string; p: number } | null;
  }[];
  keepTest: {
    verdict: string;
    adopted: string[];
    classes: Record<string, { adopted: boolean; currentSignificantlyAhead: boolean }>;
    primary: { members: unknown[] };
  } | null;
}

const exported = (root: string): Exported =>
  JSON.parse(
    readFileSync(join(root, "apps", "web", "src", "content", "cardvalues.generated.json"), "utf8"),
  ) as Exported;

/** Five classes, each with the same discordant pairs. */
const everyClass = (a: number, b: number): Discordant => CLASSES.map(() => [a, b] as const);

describe("the exporter reads the card-value test of ADR-053 only when it belongs together", () => {
  it("exports nothing while the pooled result does not exist", () => {
    const w = buildWorld();
    rmSync(w.path("experiments", "cardvalue", "pooled-keepvals-vs-curvals-val.json"));
    const r = run(w.root);
    expect(r.status, r.stderr).toBe(0);
    expect(exported(w.root).keepTest).toBeNull();
  });

  it("reads no significant difference as 'none': no class adopts, and the site keeps the current sets", () => {
    const w = buildWorld({ discordant: everyClass(100, 98) });
    const r = run(w.root);
    expect(r.status, r.stderr).toBe(0);
    const k = exported(w.root).keepTest;
    expect(k?.verdict).toBe("none");
    expect(k?.adopted).toEqual([]);
    expect(k?.primary.members).toHaveLength(5);
  });

  it("reads a significant loss as 'loss': no class adopts", () => {
    const w = buildWorld({ discordant: everyClass(80, 120) });
    const r = run(w.root);
    expect(r.status, r.stderr).toBe(0);
    const k = exported(w.root).keepTest;
    expect(k?.verdict).toBe("loss");
    expect(k?.adopted).toEqual([]);
  });

  it("applies the rule of item 5 to a significant gain: the site has to list the new sets, and the refusal names the first class", () => {
    // the pooled gain is significant; Ironclad's own comparison shows the current values significantly ahead, so Ironclad keeps its set
    const w = buildWorld({
      discordant: [
        [60, 140],
        [160, 100],
        [160, 100],
        [160, 100],
        [160, 100],
      ],
    });
    // the site-sets.json of the world still lists the current sets, which the rule does not allow after a gain
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("silent-a0-keep-v1.json");
    expect(r.stderr).toContain("the rule of ADR-053 item 5 applied to its numbers gives");
    expect(r.stderr).not.toContain("gives ironclad-a0-keep-v1.json");
  });

  it("refuses a new value file that is not the one the decision log recorded", () => {
    const w = buildWorld();
    edit(w.path("experiments", "cardvalue", fresh("regent")), (v) => {
      v.about = "edited after the hash was written";
    });
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("regent-a0-keep-v1.json is not the file ADR-053 recorded");
  });

  it("refuses an arm that does not follow the values it is named for", () => {
    const w = buildWorld();
    edit(w.path("experiments", "batches", batchId("keepvals", "silent"), "manifest.json"), (m) => {
      ((m.policy as Json).params as Json).values = "experiments/cardvalue/silent-a0-v1.json";
    });
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("it does not follow experiments/cardvalue/silent-a0-keep-v1.json");
  });

  it("refuses batches that were not played with the relics kept", () => {
    const w = buildWorld();
    edit(w.path("experiments", "batches", batchId("curvals", "defect"), "manifest.json"), (m) => {
      delete (m.config as Json).keep_relics;
    });
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("it was not played with the relics kept (ADR-053)");
  });

  it("refuses a batch played from a working tree with uncommitted changes", () => {
    const w = buildWorld();
    edit(
      w.path("experiments", "batches", batchId("keepvals", "ironclad"), "manifest.json"),
      (m) => {
        ((m.environment as Json).slay2 as Json).dirty = true;
      },
    );
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("uncommitted changes (ADR-053 asks for a clean checkout)");
  });

  it("refuses arms played from different commits", () => {
    const w = buildWorld();
    edit(w.path("experiments", "batches", batchId("curvals", "regent"), "manifest.json"), (m) => {
      ((m.environment as Json).slay2 as Json).head = "c".repeat(40);
    });
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("were not all played from one commit");
  });

  it("refuses a pooled file whose class totals are not the sum of the classes", () => {
    const w = buildWorld();
    edit(w.path("experiments", "cardvalue", "pooled-keepvals-vs-curvals-val.json"), (p) => {
      (p.wins as { a: number }).a = 7;
    });
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("its wins are not the sum of the classes'");
  });

  it("adopts a class whose own comparison is not significant when the pooled test is, and licenses it by the rule", () => {
    // the pooled gain is significant; Ironclad's own games show the current values significantly ahead (it keeps its set), Silent's own
    // games favour the new values without being significant (it adopts them all the same: item 5 asks only that the current values are
    // not significantly ahead), the other three are significant
    const w = buildWorld({
      discordant: [
        [60, 140],
        [110, 100],
        [160, 100],
        [160, 100],
        [160, 100],
      ],
      adopt: ["silent", "regent", "necrobinder", "defect"],
    });
    const r = run(w.root);
    expect(r.status, r.stderr).toBe(0);
    const out = exported(w.root);
    expect(out.keepTest?.verdict).toBe("gain");
    expect(out.keepTest?.adopted).toEqual(["silent", "regent", "necrobinder", "defect"]);
    const byClass = new Map(out.sets.map((set) => [set.character, set]));
    const silent = byClass.get("silent");
    expect(silent?.id).toBe("silent-a0-keep-v1");
    expect(silent?.supersedes).toBe("silent-a0-v1");
    expect(silent?.relicsKept).toBe(true);
    expect(silent?.validation?.against).toBe("current-values");
    // licensed by the pooled test and the rule, not by this class's own p-value, which is not significant
    expect(silent?.validation?.basis).toBe("pooled");
    expect(silent?.validation?.passed).toBe(true);
    expect(silent?.validation?.p ?? 0).toBeGreaterThan(0.05);
    expect(byClass.get("defect")?.validation?.passed).toBe(true);
    // Ironclad keeps the current set, which is not a set of the pooled test
    expect(byClass.get("ironclad")?.id).toBe("ironclad-a0-v2");
    expect(byClass.get("ironclad")?.relicsKept).toBe(false);
  });

  it("refuses a listing that adopts a class the rule keeps", () => {
    const w = buildWorld({
      discordant: [
        [60, 140],
        [110, 100],
        [160, 100],
        [160, 100],
        [160, 100],
      ],
      adopt: ["ironclad", "silent", "regent", "necrobinder", "defect"],
    });
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("ironclad-a0-v2.json");
    expect(r.stderr).toContain("the rule of ADR-053 item 5 applied to its numbers gives");
  });

  it("refuses a listing of relic-kept sets tested by a pooled result that does not exist", () => {
    const w = buildWorld({ adopt: ["silent"] });
    rmSync(w.path("experiments", "cardvalue", "pooled-keepvals-vs-curvals-val.json"));
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("pooled test of ADR-053, whose result");
    expect(r.stderr).toContain("does not exist");
  });
});
