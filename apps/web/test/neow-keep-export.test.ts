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
 * `scripts/export-site-data.mjs` reads the opening-relic study repeated with the relics kept (ADR-055) only when everything it rests
 * on belongs together, and the site shows the repeated study once its one test has been run, whichever way it came out. These tests
 * build a small repository out of the repository's own first-study values and exploration manifests (renamed, and marked as played
 * with the relics kept) and synthetic held-out batches (no simulated game is involved; the counts are only consistent with each
 * other), and break one thing at a time.
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

type Json = Record<string, unknown>;
type Arm = "keepvals" | "oldvals" | "baseline";

interface Options {
  /** the repeated study's values file exists (the fit has been made) */
  fit?: boolean;
  /** its held-out result: the primary test's discordant pairs per class (only the new values, only the baseline), or none yet */
  primary?: readonly (readonly [number, number])[] | null;
  /** the secondary arm's discordant pairs, or none */
  secondary?: readonly (readonly [number, number])[] | null;
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

const exploreId = (cls: string, keep: boolean): string =>
  `neow-explore-${cls}-a0-${keep ? "keeprelics-" : ""}train-n3000`;
const exploreDir = (cls: string, keep: boolean): string =>
  `explore-${cls}-a0-${keep ? "keeprelics-" : ""}train-n3000`;

function batchId(arm: Arm, cls: string): string {
  if (arm === "baseline") return `rules_v2-${cls}-a0-veteran-keeprelics-val-n2000`;
  return `rules_v2_neow_values-${arm}-${cls}-a0-veteran-keeprelics-val-n2000`;
}

function manifest(arm: Arm, cls: string, valuesSha: string): Json {
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
    environment: { slay2: { head: "d".repeat(40), dirty: false } },
    episodes_gz: { sha256: hex(`${id}-gz`) },
    finished: "2026-10-27T15:00:00+00:00",
    known_simulator_gaps: [],
    policy:
      arm === "baseline"
        ? { name: "rules_v2", params: { threshold: 0 }, effective: { params: { threshold: 0 } } }
        : {
            name: "rules_v2_neow_values",
            params: { threshold: 0 },
            effective: { params: { threshold: 0, neow_values_sha256: valuesSha } },
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

function pooledFile(
  arm: "keepvals" | "oldvals",
  discordant: readonly (readonly [number, number])[],
): Json {
  const both = 800;
  const neither = 600;
  const per = discordant.map(([a, b]) => a + b + both + neither);
  const aOnly = discordant.reduce((n, [a]) => n + a, 0);
  const bOnly = discordant.reduce((n, [, b]) => n + b, 0);
  const total = per.reduce((n, x) => n + x, 0);
  const members = CLASSES.map((cls, i) => {
    const [a, b] = discordant[i] ?? [0, 0];
    return {
      a: { batchId: batchId(arm, cls), contentSha256: hex(batchId(arm, cls)), wins: 0 },
      b: {
        batchId: batchId("baseline", cls),
        contentSha256: hex(batchId("baseline", cls)),
        wins: 0,
      },
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
    contentSha256: hex(`pooled-${arm}`),
    difference: "a minus b",
    excludedNotCompleted: 10000 - total,
    floorDifference: { ci95: [0.1, 0.7], meanAMinusB: 0.4 },
    kind: "pooled-paired-comparison",
    members,
    pairedSeeds: 10000,
    policies: { a: "rules_v2_neow_values", b: "rules_v2" },
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

const everyClass = (a: number, b: number): readonly (readonly [number, number])[] =>
  CLASSES.map(() => [a, b] as const);

function buildWorld(options: Options = {}): { root: string; path: (...parts: string[]) => string } {
  const o = { fit: true, primary: null, secondary: null, ...options };
  const root = mkdtempSync(join(tmpdir(), "slay2-neowkeep-"));
  dirs.push(root);
  for (const name of ["packages", "sim"]) {
    symlinkSync(join(repo, name), join(root, name), "dir");
  }
  mkdirSync(join(root, "apps", "web", "src", "content"), { recursive: true });
  mkdirSync(join(root, "experiments", "batches"), { recursive: true });
  mkdirSync(join(root, "docs"), { recursive: true });
  symlinkSync(join(repo, "docs", "game"), join(root, "docs", "game"), "dir");
  const path = (...parts: string[]) => join(root, ...parts);
  const write = (file: string, body: unknown) => {
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, JSON.stringify(body));
  };
  const real = (...parts: string[]) => join(repo, "experiments", "neow", ...parts);
  // the first study's values and exploration manifests are the repository's own (the secondary arm plays those values)
  cpSync(real("neow-values-v2.json"), path("experiments", "neow", "neow-values-v2.json"));
  for (const cls of CLASSES) {
    cpSync(
      real(exploreDir(cls, false), "manifest.json"),
      path("experiments", "neow", exploreDir(cls, false), "manifest.json"),
    );
  }
  const oldSha = createHash("sha256")
    .update(readFileSync(path("experiments", "neow", "neow-values-v2.json")))
    .digest("hex");
  if (o.fit) {
    // the repeated study's values: the first study's, with its exploration batches renamed and marked as played with the relics kept
    const values = JSON.parse(readFileSync(real("neow-values-v2.json"), "utf8")) as {
      batches: { batch_id: string; content_sha256: string }[];
    };
    values.batches = CLASSES.map((cls) => ({
      ...(values.batches.find((b) => b.batch_id === exploreId(cls, false)) as Json as {
        batch_id: string;
        content_sha256: string;
      }),
      batch_id: exploreId(cls, true),
      content_sha256: hex(exploreId(cls, true)),
    }));
    write(path("experiments", "neow", "neow-values-keep-v1.json"), values);
    const newSha = createHash("sha256")
      .update(readFileSync(path("experiments", "neow", "neow-values-keep-v1.json")))
      .digest("hex");
    for (const cls of CLASSES) {
      const m = JSON.parse(readFileSync(real(exploreDir(cls, false), "manifest.json"), "utf8")) as {
        batch_id: string;
        content_sha256: string;
        config: Json;
      };
      m.batch_id = exploreId(cls, true);
      m.content_sha256 = hex(exploreId(cls, true));
      m.config.keep_relics = true;
      write(path("experiments", "neow", exploreDir(cls, true), "manifest.json"), m);
    }
    const names = (arm: Arm, sha: string) => {
      for (const cls of CLASSES) {
        const m = manifest(arm, cls, sha);
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
    };
    if (o.primary) {
      names("keepvals", newSha);
      names("baseline", "");
      write(
        path("experiments", "neow", "pooled-neow-values-keep-v1-vs-rules_v2-keeprelics-val.json"),
        pooledFile("keepvals", o.primary),
      );
      if (o.secondary) {
        names("oldvals", oldSha);
        write(
          path("experiments", "neow", "pooled-neow-values-v2-vs-rules_v2-keeprelics-val.json"),
          pooledFile("oldvals", o.secondary),
        );
      }
    }
  }
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
  study: string;
  values: { relicsKept: boolean; sha256: string } | null;
  test: { relicsKept: boolean; passed: boolean } | null;
  first: { values: { relicsKept: boolean } | null } | null;
  repeated: {
    values: { relicsKept: boolean };
    test: { passed: boolean; relicsKept: boolean } | null;
    secondary: { passed: boolean; relicsKept: boolean } | null;
  } | null;
}

const exported = (root: string): Exported =>
  JSON.parse(
    readFileSync(join(root, "apps", "web", "src", "content", "neow.generated.json"), "utf8"),
  ) as Exported;

describe("the exporter reads the opening-relic study repeated with the relics kept only when it belongs together", () => {
  it("shows the first study while the repeated one has no fit, and the repetition once it has", () => {
    const none = buildWorld({ fit: false });
    expect(run(none.root).status).toBe(0);
    const a = exported(none.root);
    expect(a.study).toBe("first");
    expect(a.repeated).toBeNull();
    expect(a.values?.relicsKept).toBe(false);
    const fitted = buildWorld({ fit: true });
    const r = run(fitted.root);
    expect(r.status, r.stderr).toBe(0);
    const b = exported(fitted.root);
    // the fit exists, its test does not: the site still shows the first study, and the repetition is exported beside it
    expect(b.study).toBe("first");
    expect(b.repeated?.values.relicsKept).toBe(true);
    expect(b.repeated?.test).toBeNull();
  });

  it("shows the repeated study once its test has been run, whichever way it came out", () => {
    for (const [pairs, passed] of [
      [everyClass(300, 200), true],
      [everyClass(250, 250), false],
      [everyClass(200, 300), false],
    ] as const) {
      const w = buildWorld({ primary: pairs });
      const r = run(w.root);
      expect(r.status, r.stderr).toBe(0);
      const out = exported(w.root);
      expect(out.study).toBe("repeated");
      expect(out.values?.relicsKept).toBe(true);
      expect(out.test?.relicsKept).toBe(true);
      expect(out.test?.passed).toBe(passed);
      expect(out.repeated?.secondary).toBeNull();
    }
  });

  it("reads the secondary arm beside the primary test, against the same baseline batches", () => {
    const w = buildWorld({ primary: everyClass(300, 200), secondary: everyClass(290, 210) });
    const r = run(w.root);
    expect(r.status, r.stderr).toBe(0);
    const out = exported(w.root);
    expect(out.repeated?.secondary?.relicsKept).toBe(true);
    expect(out.repeated?.secondary?.passed).toBe(true);
    // another baseline than the primary test's is refused
    edit(
      w.path("experiments", "neow", "pooled-neow-values-v2-vs-rules_v2-keeprelics-val.json"),
      (p) => {
        const members = p.members as { b: { batchId: string; contentSha256: string } }[];
        const first = members[0];
        if (first)
          first.b = {
            batchId: "rules_v2-silent-a0-veteran-keeprelics-val-n2000",
            contentSha256: hex("x"),
          };
      },
    );
    const bad = run(w.root);
    expect(bad.status).not.toBe(0);
  });

  it("refuses an exploration batch that was not played with the relics kept", () => {
    const w = buildWorld();
    edit(w.path("experiments", "neow", exploreDir("regent", true), "manifest.json"), (m) => {
      delete (m.config as Json).keep_relics;
    });
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("it was not played with the relics kept (ADR-055)");
  });

  it("refuses held-out batches that were not played with the relics kept, or without a sample audit", () => {
    const w = buildWorld({ primary: everyClass(300, 200) });
    edit(w.path("experiments", "batches", batchId("baseline", "silent"), "manifest.json"), (m) => {
      delete (m.config as Json).keep_relics;
    });
    const a = run(w.root);
    expect(a.status).not.toBe(0);
    expect(a.stderr).toContain("it was not played with the relics kept (ADR-055)");
    const x = buildWorld({ primary: everyClass(300, 200) });
    rmSync(x.path("experiments", "batches", batchId("keepvals", "defect"), "sample-audit.json"));
    const b = run(x.root);
    expect(b.status).not.toBe(0);
    expect(b.stderr).toContain("no sample audit");
  });

  it("refuses an arm that followed another version of the values file", () => {
    const w = buildWorld({ primary: everyClass(300, 200) });
    edit(
      w.path("experiments", "batches", batchId("keepvals", "necrobinder"), "manifest.json"),
      (m) => {
        (((m.policy as Json).effective as Json).params as Json).neow_values_sha256 = hex("another");
      },
    );
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("was played with another version of neow-values-keep-v1.json");
  });

  it("refuses arms that differ in anything but the opening-relic rule", () => {
    const w = buildWorld({ primary: everyClass(300, 200) });
    // the baseline of Regent followed other card values (or other thresholds): the page's "one change" would be false
    edit(w.path("experiments", "batches", batchId("baseline", "regent"), "manifest.json"), (m) => {
      (((m.policy as Json).effective as Json).params as Json).values_sha256 = hex("other values");
    });
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(
      "the two arms of regent do not differ only in the opening-relic rule",
    );
  });

  it("refuses a descriptive comparison of other value files than the two the site reads", () => {
    const w = buildWorld();
    writeFileSync(
      w.path("experiments", "neow", "compare-v2-keep-v1.json"),
      JSON.stringify({
        kind: "neow-value-comparison",
        a: { sha256: hex("not the first") },
        b: { sha256: hex("not the second") },
        comparison: {},
        noise_reference: {},
      }),
    );
    const r = run(w.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("does not describe the two value files the site reads");
  });
});
