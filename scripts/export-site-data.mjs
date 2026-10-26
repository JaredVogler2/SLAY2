#!/usr/bin/env node
// Exports the data the website shows from the repository's own audited artifacts:
//   apps/web/src/content/rules.generated.json     <- docs/game/MECHANICS-COVERAGE.md (the verified rule register)
//   apps/web/src/content/evidence.generated.json  <- experiments/batches/*/manifest.json (+ episodes for summaries)
//                                                    + experiments/comparisons/*.json (paired comparisons)
// Nothing is typed in by hand: `pnpm --filter @slay2/web test` fails if these files are stale (see test/content.test.ts).
// Usage: node scripts/export-site-data.mjs [--check]
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

// SLAY2_ROOT lets the tests point the exporter at a tampered copy of the inputs; production always uses the repository.
const root = process.env.SLAY2_ROOT ? resolve(process.env.SLAY2_ROOT) : resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "apps", "web", "src", "content");
const check = process.argv.includes("--check");

const plain = (s) => s.replace(/\*\*/g, "").replace(/`/g, "").replace(/\s+/g, " ").trim();

function parseRules() {
  const md = readFileSync(join(root, "docs", "game", "MECHANICS-COVERAGE.md"), "utf8");
  const rules = [];
  let section = "";
  for (const line of md.split("\n")) {
    const h = /^##\s+(.*)$/.exec(line);
    if (h) {
      section = plain(h[1]);
      continue;
    }
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 3 || !/^[A-Z]+-\d+$/.test(cells[0])) continue;
    const status = cells[3] && /(VERIFIED|CORROBORATED|SECONDARY|UNVERIFIED)/.test(cells[3]) ? plain(cells[3]) : null;
    rules.push({ id: cells[0], section: section.replace(/^\d+\.\s*/, ""), text: plain(cells[1]), evidence: plain(cells[2]), status });
  }
  return rules;
}

function readEpisodes(dir) {
  const gz = join(dir, "episodes.jsonl.gz");
  const plainFile = join(dir, "episodes.jsonl");
  const text = existsSync(gz) ? gunzipSync(readFileSync(gz)).toString("utf8") : readFileSync(plainFile, "utf8");
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

// The 10- and 100-game batches are prefixes of the 2,000-game seed set, not additional games: do not list them twice.
const SKIP = new Set(["smoke-random_legal-ironclad-a0-veteran-n10", "ladder-random_legal-ironclad-a0-veteran-train-n100"]);

function parseEvidence() {
  const dir = join(root, "experiments", "batches");
  const reports = [];
  for (const name of readdirSync(dir).sort()) {
    if (SKIP.has(name) || !existsSync(join(dir, name, "manifest.json"))) continue;
    const m = JSON.parse(readFileSync(join(dir, name, "manifest.json"), "utf8"));
    const eps = readEpisodes(join(dir, name));
    const completed = eps.filter((e) => e.outcome === "win" || e.outcome === "death");
    const floors = completed.map((e) => e.floor).sort((a, b) => a - b);
    const mean = floors.reduce((a, b) => a + b, 0) / Math.max(1, floors.length);
    const killers = {};
    for (const e of completed) if (e.killed_by) killers[e.killed_by] = (killers[e.killed_by] ?? 0) + 1;
    const wall = eps.reduce((a, e) => a + (e.wall_seconds ?? 0), 0) / Math.max(1, eps.length);
    reports.push({
      id: m.batch_id,
      policy: m.policy.name,
      character: m.config.character,
      ascension: m.config.ascension,
      profile: m.config.profile,
      partition: m.seeds.partition,
      sealedPartitionUsed: m.seeds.sealed_partition_used,
      seeds: m.seeds.n,
      counts: m.summary.counts,
      completed: m.summary.completed,
      winRate: m.summary.win_rate_of_completed,
      winRateWilson95: m.summary.win_rate_95ci_wilson,
      meanFloor: Math.round(mean * 100) / 100,
      medianFloor: floors[Math.floor(floors.length / 2)] ?? 0,
      deathsByAct: completed.reduce((acc, e) => ({ ...acc, [e.act]: (acc[e.act] ?? 0) + 1 }), {}),
      topKillers: Object.entries(killers).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5).map(([id, n]) => ({ id, n })),
      meanWallSecondsPerEpisode: Math.round(wall * 100) / 100,
      simulator: { id: m.simulator.id, sha: m.simulator.pinned, parityWithLiveGame: m.simulator.parity_with_live_game },
      gapsRecordedInManifest: Array.isArray(m.known_simulator_gaps),
      knownGaps: (m.known_simulator_gaps ?? []).filter((g) => g.affects === "results").map((g) => g.id),
      contentSha256: m.content_sha256,
      episodesGzSha256: m.episodes_gz.sha256,
      finished: m.finished,
      role: m.seeds.partition === "train" ? "development (train partition): not a held-out result" : "held-out",
    });
  }
  return reports;
}

// A paired comparison is only shown while both of its batches are exactly the ones it was computed from.
function parseComparisons(reports) {
  const dir = join(root, "experiments", "comparisons");
  if (!existsSync(dir)) return [];
  const byId = new Map(reports.map((r) => [r.id, r]));
  const out = [];
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const c = JSON.parse(readFileSync(join(dir, name), "utf8"));
    for (const side of [c.a, c.b]) {
      const current = byId.get(side.batchId);
      if (!current) throw new Error(`${name}: batch ${side.batchId} is not an evidence batch`);
      if (current.contentSha256 !== side.contentSha256) {
        throw new Error(`${name}: batch ${side.batchId} changed after the comparison was written; rerun slay2_sim compare --out`);
      }
    }
    out.push({
      id: name.replace(/\.json$/, ""),
      a: c.a,
      b: c.b,
      cohort: c.cohort,
      pairedSeeds: c.pairedSeeds,
      bothCompleted: c.bothCompleted,
      excludedNotCompleted: c.excludedNotCompleted,
      pairedWinTable: c.pairedWinTable,
      floorDifference: c.floorDifference,
      wallTimeRatioBOverA: c.wallTimeRatioBOverA,
      role: c.role,
      contentSha256: c.contentSha256,
    });
  }
  return out;
}

function parseVerification() {
  const golden = JSON.parse(readFileSync(join(root, "packages", "odds", "test", "fixtures", "golden-python.json"), "utf8"));
  const published = JSON.parse(readFileSync(join(root, "packages", "odds", "test", "fixtures", "published.json"), "utf8"));
  const catalog = JSON.parse(readFileSync(join(root, "packages", "game-data", "data", "cards.sts2-main-0.107.1.json"), "utf8"));
  return {
    goldenCases: golden.cases.length,
    goldenKinds: [...new Set(golden.cases.map((c) => c.kind))].sort(),
    publishedSources: published._provenance.sources.map((x) => x.name),
    catalogCards: catalog.cards.length,
    catalogSha256: catalog.sha256,
  };
}

const reports = parseEvidence();
const outputs = {
  "rules.generated.json": {
    schema: 1,
    generatedFrom: "docs/game/MECHANICS-COVERAGE.md + packages/odds/test/fixtures/*.json",
    verification: parseVerification(),
    rules: parseRules(),
  },
  "evidence.generated.json": {
    schema: 1,
    generatedFrom: "experiments/batches/*/manifest.json + experiments/comparisons/*.json + sim/slay2_sim/gaps.json",
    simulatorGaps: JSON.parse(readFileSync(join(root, "sim", "slay2_sim", "gaps.json"), "utf8")).gaps,
    reports,
    comparisons: parseComparisons(reports),
  },
};

let stale = false;
for (const [file, body] of Object.entries(outputs)) {
  const text = JSON.stringify(body, null, 2) + "\n";
  const path = join(outDir, file);
  const sha = createHash("sha256").update(text).digest("hex").slice(0, 12);
  if (check) {
    const current = existsSync(path) ? readFileSync(path, "utf8") : "";
    if (current !== text) {
      console.error(`stale: ${file} (run: node scripts/export-site-data.mjs)`);
      stale = true;
    }
  } else {
    writeFileSync(path, text);
    console.log(`wrote ${file} sha256=${sha}...`);
  }
}
process.exit(stale ? 1 : 0);
