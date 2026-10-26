#!/usr/bin/env node
// Exports the data the website shows from the repository's own audited artifacts:
//   apps/web/src/content/rules.generated.json     <- docs/game/MECHANICS-COVERAGE.md (the verified rule register)
//   apps/web/src/content/evidence.generated.json  <- experiments/batches/*/manifest.json (+ episodes for summaries)
//                                                    + experiments/comparisons/*.json (paired comparisons)
//   apps/web/src/content/cardvalues.generated.json <- experiments/cardvalue/*.json (measured card values, ADR-031)
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
    // A win is a claim the harness re-derives (slay2_sim audit wins: re-run, hash-for-hash replay, terminal state); a batch
    // with wins and no passing audit is not published.
    const wins = m.summary.counts.win;
    const auditFile = join(dir, name, "wins-audit.json");
    const audit = existsSync(auditFile) ? JSON.parse(readFileSync(auditFile, "utf8")) : null;
    if (wins > 0 && !(audit && audit.all_verified === true && audit.wins_audited === wins && audit.batch_id === m.batch_id)) {
      throw new Error(`${name}: ${wins} win(s) without a passing wins-audit.json (run: slay2_sim audit wins --batch experiments/batches/${name})`);
    }
    // The sample audit (slay2_sim audit sample: ledger check + replay-verified random sample of completed games) belongs to one
    // exact batch; an audit of other content is refused rather than shown against this batch.
    const sampleFile = join(dir, name, "sample-audit.json");
    const sample = existsSync(sampleFile) ? JSON.parse(readFileSync(sampleFile, "utf8")) : null;
    if (sample && !(sample.batch_id === m.batch_id && sample.batch_content_sha256 === m.content_sha256)) {
      throw new Error(`${name}: sample-audit.json was written for other content; rerun slay2_sim audit sample --batch experiments/batches/${name}`);
    }
    // The complete re-derivation (slay2_sim audit rederive: every game re-run and compared) is held to the same rule.
    const rederiveFile = join(dir, name, "rederivation-audit.json");
    const rederive = existsSync(rederiveFile) ? JSON.parse(readFileSync(rederiveFile, "utf8")) : null;
    if (rederive && !(rederive.batch_id === m.batch_id && rederive.batch_content_sha256 === m.content_sha256)) {
      throw new Error(`${name}: rederivation-audit.json was written for other content; rerun slay2_sim audit rederive --batch experiments/batches/${name}`);
    }
    const completed = eps.filter((e) => e.outcome === "win" || e.outcome === "death");
    const floors = completed.map((e) => e.floor).sort((a, b) => a - b);
    const mean = floors.reduce((a, b) => a + b, 0) / Math.max(1, floors.length);
    const killers = {};
    for (const e of completed) if (e.killed_by) killers[e.killed_by] = (killers[e.killed_by] ?? 0) + 1;
    const wall = eps.reduce((a, e) => a + (e.wall_seconds ?? 0), 0) / Math.max(1, eps.length);
    reports.push({
      id: m.batch_id,
      policy: m.policy.name,
      policyParams: m.policy.params ?? {},
      // search on clones used to advance the live game's card-id counter (ADR-035): such batches are valid simulations but
      // their action traces do not replay; batches written after the fix say so in their manifest
      preIsolation: m.policy.name.startsWith("search") && m.deliberation_isolated !== true,
      character: m.config.character,
      ascension: m.config.ascension,
      profile: m.config.profile,
      // a harness variant (gap G11: the game's start-of-act Ancient heal restored in acts two and three); never a headline
      ancientHeal: m.config.ancient_heal === true,
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
      winsAudit: audit
        ? { audited: audit.wins_audited, verified: audit.wins_verified, seeds: audit.wins.map((w) => w.seed), criteria: audit.criteria }
        : null,
      rederivationAudit: rederive
        ? { games: rederive.games, exact: rederive.rederived_exactly, differing: rederive.differing.map((d) => d.seed), criteria: rederive.criteria }
        : null,
      canonicalProcessState: m.canonical_process_state === true,
      sampleAudit: sample
        ? {
            drawn: sample.sample.drawn,
            verified: sample.verified,
            completedInBatch: sample.sample.completed_in_batch,
            rngSeed: sample.sample.rng_seed,
            ledgerOk: sample.ledger.ok,
            criteria: sample.criteria,
          }
        : null,
      simulator: { id: m.simulator.id, sha: m.simulator.pinned, parityWithLiveGame: m.simulator.parity_with_live_game },
      gapsRecordedInManifest: Array.isArray(m.known_simulator_gaps),
      knownGaps: (m.known_simulator_gaps ?? []).filter((g) => g.affects === "results").map((g) => g.id),
      contentSha256: m.content_sha256,
      episodesGzSha256: m.episodes_gz.sha256,
      finished: m.finished,
      role: ["train", "dev"].includes(m.seeds.partition) ? `development (${m.seeds.partition} partition): not a held-out result` : "held-out",
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
      reachedAct2: c.reachedAct2,
      floorDifference: c.floorDifference,
      wallTimeRatioBOverA: c.wallTimeRatioBOverA,
      role: c.role,
      preIsolation: Boolean(byId.get(c.a.batchId)?.preIsolation || byId.get(c.b.batchId)?.preIsolation),
      contentSha256: c.contentSha256,
    });
  }
  return out;
}

// Measured card values (ADR-031). The simulator names a card `<ID>_CARD` when its enum name collides with a power; the
// catalog uses the plain id, so the value is attached to the catalog card. A measured id that maps to nothing is an error.
const CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"];
// Significance level of the pre-registered intervention test per class (ADR-031: Ironclad alone, 0.05; ADR-034: the other four share 0.05, Bonferroni).
const ALPHA = { ironclad: 0.05, silent: 0.0125, regent: 0.0125, necrobinder: 0.0125, defect: 0.0125 };

// Which value files the site shows is a decision, not a side effect of a file existing (ADR-046): experiments/cardvalue/
// site-sets.json lists them, and the golden cases of the simulation panel (sim/slay2_sim/pickgolden.py) read the same list.
// A set measured for a study stays out of the site until it is listed there.
function parseCardValues(comparisons) {
  const dir = join(root, "experiments", "cardvalue");
  if (!existsSync(dir)) return [];
  if (!existsSync(join(dir, "site-sets.json"))) throw new Error("experiments/cardvalue/site-sets.json is missing: it lists the value files the site shows");
  const SITE_SETS = JSON.parse(readFileSync(join(dir, "site-sets.json"), "utf8"));
  if (SITE_SETS.schema !== 1) throw new Error("experiments/cardvalue/site-sets.json: unknown schema");
  const catalog = JSON.parse(readFileSync(join(root, "packages", "game-data", "data", "cards.sts2-main-0.107.1.json"), "utf8"));
  const known = new Set(catalog.cards.map((c) => c.id));
  const canonical = (id) => {
    const plain = id.replace(/_CARD$/, "");
    return known.has(id) ? id : known.has(plain) ? plain : null;
  };
  const out = [];
  const listed = new Map(SITE_SETS.sets.map((entry) => [entry.file, entry]));
  for (const file of listed.keys()) {
    if (!existsSync(join(dir, file))) throw new Error(`site-sets.json lists ${file}, which does not exist`);
  }
  for (const name of readdirSync(dir).filter((f) => listed.has(f)).sort()) {
    const entry = listed.get(name);
    const raw = readFileSync(join(dir, name));
    const v = JSON.parse(raw.toString("utf8"));
    if (v.kind !== "card-values") continue;
    const character = String(v.character ?? name.split("-")[0]).toLowerCase();
    if (!CLASSES.includes(character)) throw new Error(`${name}: unknown class ${character}`);
    // the held-out test of acting on these values, if it has been run: by default rules_v2 against rules_v1 on the same seeds
    // (the values against the hand-written ratings); a set that replaces an earlier one names its own test
    const test = entry.test
      ? comparisons.find((c) => c.id === entry.test.comparison && c.role === "held-out")
      : comparisons.find(
          (c) => c.a.policy === "rules_v2" && c.b.policy === "rules_v1" && c.role === "held-out" && String(c.cohort.character).toLowerCase() === character,
        );
    if (entry.test && !test) throw new Error(`${name}: its test ${entry.test.comparison} is not a held-out comparison in experiments/comparisons`);
    const validation = test
      ? {
          comparison: test.id,
          alpha: ALPHA[character],
          pairedGames: test.bothCompleted,
          passRate: test.reachedAct2.a.rate,
          passRateBase: test.reachedAct2.b.rate,
          p: test.reachedAct2.pairedTable.mcnemar_p,
          // what the pilot that followed these values was compared with
          against: entry.test?.against ?? "ratings",
          // improved the primary endpoint at the pre-registered level
          passed: test.reachedAct2.a.rate > test.reachedAct2.b.rate && test.reachedAct2.pairedTable.mcnemar_p < ALPHA[character],
        }
      : null;
    // how far a set that replaces an earlier one moved from it (a descriptive comparison, not a test)
    let drift = null;
    if (entry.drift) {
      const d = JSON.parse(readFileSync(join(dir, entry.drift), "utf8"));
      const sha = createHash("sha256").update(raw).digest("hex");
      if (d.kind !== "card-value-comparison" || d.b.sha256 !== sha) throw new Error(`${name}: ${entry.drift} does not describe this version of the file`);
      const previous = readFileSync(join(dir, entry.supersedes));
      if (d.a.sha256 !== createHash("sha256").update(previous).digest("hex")) throw new Error(`${name}: ${entry.drift} compares another version of ${entry.supersedes}`);
      drift = {
        previous: entry.supersedes.replace(/\.json$/, ""),
        previousSha256: d.a.sha256,
        previousBossFights: d.a.boss_fights,
        previousPassRate: d.a.pass_rate,
        cardsInBoth: d.comparison.cards_in_both,
        spearman: d.comparison.spearman,
        k: d.comparison.k,
        bestShared: d.comparison.best_k_in_both,
        worstShared: d.comparison.worst_k_in_both,
        disjointIntervals: d.comparison.disjoint_ci95,
        noiseCards: d.noise_reference.cards_in_both,
        noiseSpearman: d.noise_reference.spearman,
        noiseSpearmanBrown: d.noise_reference.spearman_brown,
      };
    }
    const cv = v.model.cross_validation;
    const best = Object.entries(cv.l2).find(([k]) => Number(k) === cv.best_l2)?.[1];
    if (!best) throw new Error(`${name}: no cross-validation entry for the chosen penalty ${cv.best_l2}`);
    const seen = new Set();
    const cards = v.cards.map((c) => {
      const id = canonical(c.id);
      if (!id) throw new Error(`${name}: measured card ${c.id} is not in the catalog`);
      if (seen.has(id)) throw new Error(`${name}: ${id} is measured twice`);
      seen.add(id);
      return { id, simId: c.id, beta: c.beta, ci95: c.ci95, gamesWithCard: c.games_with_card, staticRating: c.static_rating };
    });
    cards.sort((a, b) => b.beta - a.beta || (a.id < b.id ? -1 : 1));
    out.push({
      id: name.replace(/\.json$/, ""),
      character,
      validation,
      supersedes: entry.supersedes ? entry.supersedes.replace(/\.json$/, "") : null,
      drift,
      file: `experiments/cardvalue/${name}`,
      sha256: createHash("sha256").update(raw).digest("hex"),
      outcome: v.outcome,
      games: v.games,
      bossFights: v.boss_fights,
      passRate: v.pass_rate,
      model: {
        l2: cv.best_l2,
        folds: v.model.folds,
        features: v.model.features,
        bootstrapDraws: v.model.bootstrap_draws,
        cvLogLoss: best.log_loss,
        cvAuc: best.auc,
        baselineLogLoss: cv.baseline_log_loss,
      },
      spearmanWithStaticRating: v.spearman_with_static_rating ?? null,
      batches: v.batches.map((b) => ({ id: b.batch_id, contentSha256: b.content_sha256, policy: b.policy, simulator: b.simulator.id })),
      cards,
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
const comparisons = parseComparisons(reports);
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
    comparisons,
  },
  "cardvalues.generated.json": {
    schema: 1,
    generatedFrom: "experiments/cardvalue/*.json (kind card-values) + experiments/comparisons/*.json + packages/game-data/data/cards.sts2-main-0.107.1.json",
    sets: parseCardValues(comparisons),
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
      console.error(
        `stale: ${file} (run: node scripts/export-site-data.mjs, or scripts/export-site-data-clean.sh when the working tree holds unfinished experiments)`,
      );
      stale = true;
    }
  } else {
    writeFileSync(path, text);
    console.log(`wrote ${file} sha256=${sha}...`);
  }
}
process.exit(stale ? 1 : 0);
