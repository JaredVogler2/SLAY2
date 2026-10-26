#!/usr/bin/env node
// Exports the data the website shows from the repository's own audited artifacts:
//   apps/web/src/content/rules.generated.json     <- docs/game/MECHANICS-COVERAGE.md (the verified rule register)
//   apps/web/src/content/evidence.generated.json  <- experiments/batches/*/manifest.json (+ episodes for summaries)
//                                                    + experiments/comparisons/*.json (paired comparisons)
//   apps/web/src/content/cardvalues.generated.json <- experiments/cardvalue/*.json (measured card values, ADR-031)
//   apps/web/src/content/neow.generated.json      <- experiments/neow/*.json (the opening Ancient's relic values and the one held-out test, ADR-041, ADR-049)
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
  // Only tables whose header row starts with "ID" hold rules. The register also has tables of evidence classes and an
  // implementation map ("| Rules | Module | Layers | Notes |"), whose rows start with a rule id too (`| UPG-1 | upgrade.ts | G P |`):
  // read as rules they put a section of file names on /methods and made the count of rules two too high.
  let inTable = false;
  let ruleTable = false;
  for (const line of md.split("\n")) {
    const h = /^#{2,3}\s+(.*)$/.exec(line); // "###" too: three rules sit under a sub-heading and took the previous section's name
    if (h) {
      section = plain(h[1]);
      inTable = false;
      continue;
    }
    if (!line.startsWith("|")) {
      inTable = false;
      continue;
    }
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (!inTable) {
      inTable = true;
      ruleTable = cells[0] === "ID";
      continue;
    }
    if (!ruleTable) continue;
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
      // a harness variant (gap G13: a class started with the maximum HP of the game's source instead of the simulator's); never a headline
      gameHp: m.config.game_hp === true,
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
      // every game's starting HP and deck were checked against the class asked for (classes.py, ADR-049)
      classStartVerified: m.class_start_verified === true,
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

// The opening Ancient's relic values and the one held-out test of acting on them (ADR-041, registered again in ADR-049 after the
// first study turned out to have been played with the wrong class). Nothing here is taken on trust: the values name the
// exploration batches they were fitted on by content hash and the manifests must show what the registration says (the policy,
// full randomisation, the `train` partition, 3,000 seeds, the exact class id, the per-game class check); the test names its batches
// by content hash, each A arm records the SHA-256 of the values file its pilot read, and every batch must be the class, partition,
// policy and seed count the pooled file claims for it. Anything that does not belong together stops the export.
const NEOW_ALPHA = 0.05;
const NEOW_POLICIES = { a: "rules_v2_neow_values", b: "rules_v2" };
const EXACT = { ironclad: "Ironclad", silent: "Silent", regent: "Regent", necrobinder: "Necrobinder", defect: "Defect" };
const NEOW_EXPLORE_SEEDS = 3000;
const NEOW_VAL_SEEDS = 2000;
const NEOW_VALUES_FILE = "neow-values-v2.json";
const NEOW_TEST_FILE = "pooled-neow-values-v2-vs-rules_v2-val.json";

function parseNeow(reports) {
  const dir = join(root, "experiments", "neow");
  const valuesFile = join(dir, NEOW_VALUES_FILE);
  if (!existsSync(valuesFile)) return { values: null, test: null };
  const here = `experiments/neow/${NEOW_VALUES_FILE}`;
  const raw = readFileSync(valuesFile);
  const v = JSON.parse(raw.toString("utf8"));
  if (v.kind !== "neow-values" || v.schema !== 1) throw new Error(`${here}: not a neow-values file of schema 1`);
  if (!String(v.model?.resampling_unit ?? "").startsWith("seed")) throw new Error(`${here}: the fit must resample and cross-validate by seed (ADR-049)`);
  if (v.model.seeds !== NEOW_EXPLORE_SEEDS) throw new Error(`${here}: fitted on ${v.model.seeds} seeds, the registration says ${NEOW_EXPLORE_SEEDS}`);
  const sha256 = createHash("sha256").update(raw).digest("hex");
  const cv = v.model.cross_validation;
  const best = Object.entries(cv.l2).find(([k]) => Number(k) === cv.best_l2)?.[1];
  if (!best) throw new Error(`${here}: no cross-validation entry for the chosen penalty`);
  const classes = CLASSES.map((character) => {
    const c = v.classes[character];
    if (!c) throw new Error(`${here}: class ${character} is missing`);
    // defect is the reference class of the fit; the others carry an offset from it
    const offset = character === "defect" ? 0 : v.covariates[`class:${character}`];
    if (typeof offset !== "number") throw new Error(`${here}: no offset for class ${character}`);
    return { character, games: c.games, passRate: c.pass_rate, baselineLogOdds: Math.round((v.covariates.intercept + offset) * 1e4) / 1e4 };
  });
  // the batches the values were fitted on are in the repository, are the ones the file names, and are what the registration says
  if (v.batches.length !== CLASSES.length) throw new Error(`${here}: it must name one exploration batch per class`);
  const fitted = new Set();
  for (const b of v.batches) {
    const manifestFile = join(dir, b.batch_id.replace(/^neow-explore-/, "explore-"), "manifest.json");
    if (!existsSync(manifestFile)) throw new Error(`${here}: its exploration batch ${b.batch_id} is not in experiments/neow`);
    const m = JSON.parse(readFileSync(manifestFile, "utf8"));
    if (m.batch_id !== b.batch_id || m.content_sha256 !== b.content_sha256) {
      throw new Error(`${here}: exploration batch ${b.batch_id} changed after the values were fitted`);
    }
    const cls = CLASSES.find((c) => EXACT[c] === m.config?.character);
    if (!cls) throw new Error(`${here}: exploration batch ${b.batch_id} was played as "${m.config?.character}", which is not one of the simulator's exact class ids`);
    fitted.add(cls);
    const bad =
      m.policy?.name !== "rules_v2_neow" || m.policy?.params?.neow_explore !== 1
        ? "it is not a fully randomised rules_v2_neow batch"
        : m.seeds?.partition !== "train" || m.seeds?.n !== NEOW_EXPLORE_SEEDS
          ? `it is not the first ${NEOW_EXPLORE_SEEDS} train seeds`
          : m.class_start_verified !== true
            ? "its games were not checked against the class they were played as"
            : m.config.ascension !== v.ascension || m.config.profile !== v.profile
              ? "its ascension or profile differ from the values'"
              : null;
    if (bad) throw new Error(`${here}: exploration batch ${b.batch_id}: ${bad}`);
  }
  if (fitted.size !== CLASSES.length) throw new Error(`${here}: its exploration batches must be one per class`);
  const seen = new Set();
  const relics = v.relics.map((r) => {
    if (seen.has(r.label)) throw new Error(`${here}: ${r.label} is measured twice`);
    seen.add(r.label);
    return {
      label: r.label,
      kind: r.kind,
      beta: r.beta,
      ci95: r.ci95,
      taken: r.taken,
      offered: r.offered,
      passRateTaken: r.pass_rate_taken,
      passRateOfferedNotTaken: r.pass_rate_offered_not_taken,
      excluded: r.excluded,
      exclusionFlag: r.exclusion_flag === true,
    };
  });
  const values = {
    file: here,
    sha256,
    outcome: v.outcome,
    ascension: v.ascension,
    profile: v.profile,
    games: v.games,
    excludedGames: v.excluded_games,
    passRate: v.pass_rate,
    classes,
    model: {
      l2: v.model.l2,
      folds: v.model.folds,
      bootstrapDraws: v.model.bootstrap_draws,
      minTaken: v.model.min_taken,
      seeds: v.model.seeds,
      cvLogLoss: best.log_loss,
      cvAuc: best.auc,
      baselineLogLoss: cv.baseline_log_loss,
    },
    batches: v.batches.map((b) => ({ id: b.batch_id, contentSha256: b.content_sha256 })),
    relics,
  };

  const testFile = join(dir, NEOW_TEST_FILE);
  if (!existsSync(testFile)) return { values, test: null };
  const t = JSON.parse(readFileSync(testFile, "utf8"));
  const where = `experiments/neow/${NEOW_TEST_FILE}`;
  if (t.kind !== "pooled-paired-comparison" || t.policies?.a !== NEOW_POLICIES.a || t.policies?.b !== NEOW_POLICIES.b) {
    throw new Error(`${where}: not the pooled comparison of ${NEOW_POLICIES.a} against ${NEOW_POLICIES.b}`);
  }
  if (t.cohort?.partition !== "val" || t.role !== "held-out") throw new Error(`${where}: not a held-out comparison`);
  if (t.cohort.ascension !== v.ascension || t.cohort.profile !== v.profile) throw new Error(`${where}: played at another ascension or profile than the values were measured at`);
  const classesIn = (t.members ?? []).map((m) => String(m.character).toLowerCase());
  const classesNamed = (t.cohort.characters ?? []).map((c) => String(c).toLowerCase());
  const everyClassOnce = (list) => list.length === CLASSES.length && [...list].sort().join() === [...CLASSES].sort().join();
  // the members carry the numbers and the cohort names the classes: both must be the five classes, once each
  if (!everyClassOnce(classesIn) || !everyClassOnce(classesNamed)) throw new Error(`${where}: it must pool all five classes, once each`);
  const byId = new Map(reports.map((r) => [r.id, r]));
  const sums = { a_only: 0, b_only: 0, both: 0, neither: 0, pairedSeeds: 0, bothCompleted: 0 };
  for (const m of t.members) {
    const cls = String(m.character).toLowerCase();
    for (const [side, policy] of [[m.a, NEOW_POLICIES.a], [m.b, NEOW_POLICIES.b]]) {
      const current = byId.get(side.batchId);
      if (!current) throw new Error(`${where}: batch ${side.batchId} is not an evidence batch`);
      if (current.contentSha256 !== side.contentSha256) {
        throw new Error(`${where}: batch ${side.batchId} changed after the comparison was written; rerun slay2_sim pool --out`);
      }
      // what the batch is, from its own manifest, not from what the pooled file says about it
      const bad =
        current.policy !== policy
          ? `its policy is ${current.policy}, not ${policy}`
          : current.character !== EXACT[cls]
            ? `it was played as "${current.character}", not as ${EXACT[cls]}`
            : current.partition !== "val" || current.seeds !== NEOW_VAL_SEEDS
              ? `it is not the ${NEOW_VAL_SEEDS} val seeds`
              : current.ascension !== v.ascension || current.profile !== v.profile
                ? "its ascension or profile differ from the values'"
                : null;
      if (bad) throw new Error(`${where}: batch ${side.batchId} (${cls}): ${bad}`);
    }
    if (m.pairedSeeds !== NEOW_VAL_SEEDS) throw new Error(`${where}: ${cls} paired ${m.pairedSeeds} seeds, the registration says ${NEOW_VAL_SEEDS}`);
    if (!byId.get(m.a.batchId).classStartVerified) throw new Error(`${where}: ${m.a.batchId} was not played with the per-game class check`);
    const manifest = JSON.parse(readFileSync(join(root, "experiments", "batches", m.a.batchId, "manifest.json"), "utf8"));
    if (manifest.policy?.effective?.params?.neow_values_sha256 !== sha256) {
      throw new Error(`${where}: ${m.a.batchId} was played with another version of ${NEOW_VALUES_FILE}`);
    }
    const tab = m.reachedAct2.pairedTable;
    for (const k of ["a_only", "b_only", "both", "neither"]) sums[k] += tab[k];
    sums.pairedSeeds += m.pairedSeeds;
    sums.bothCompleted += m.bothCompleted;
  }
  const r1 = t.reachedAct2;
  // the pooled numbers are the sum of the classes' own, and the file says what it adds up to
  for (const k of ["a_only", "b_only", "both", "neither"]) {
    if (r1.pairedTable[k] !== sums[k]) throw new Error(`${where}: the pooled ${k} (${r1.pairedTable[k]}) is not the sum of the classes' (${sums[k]})`);
  }
  if (t.pairedSeeds !== sums.pairedSeeds || t.bothCompleted !== sums.bothCompleted) throw new Error(`${where}: its totals are not the sum of the classes'`);
  const test = {
    id: NEOW_TEST_FILE.replace(/\.json$/, ""),
    contentSha256: t.contentSha256,
    valuesSha256: sha256,
    a: t.policies.a,
    b: t.policies.b,
    cohort: t.cohort,
    alpha: NEOW_ALPHA,
    pairedSeeds: t.pairedSeeds,
    bothCompleted: t.bothCompleted,
    excludedNotCompleted: t.excludedNotCompleted,
    reachedAct2: r1,
    reachedAct3: t.reachedAct3,
    wins: t.wins,
    floorDifference: t.floorDifference,
    members: t.members.map((m) => ({
      character: String(m.character).toLowerCase(),
      a: m.a,
      b: m.b,
      pairedSeeds: m.pairedSeeds,
      bothCompleted: m.bothCompleted,
      reachedAct2: m.reachedAct2,
      meanFloorDifference: m.meanFloorDifference,
    })),
    role: t.role,
    // improved the primary endpoint at the pre-registered level (ADR-041 item 4, ADR-049)
    passed: r1.a.rate > r1.b.rate && r1.pairedTable.mcnemar_p < NEOW_ALPHA,
  };
  return { values, test };
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

// Gap G13: what the game's own starting HP costs a class the simulator starts with more, from the committed development comparison of
// the `game_hp` variant (side a) with the simulator's start (side b). A few numbers per class, written beside the opening-relic data so
// that the client bundles that show them do not carry the whole evidence file.
function parseStartHpGaps() {
  const byId = new Map(reports.map((r) => [r.id, r]));
  const out = {};
  for (const c of comparisons) {
    if (byId.get(c.a.batchId)?.gameHp === true && byId.get(c.b.batchId)?.gameHp === false) {
      out[String(c.cohort.character).toLowerCase()] = { simulator: c.reachedAct2.b.rate, game: c.reachedAct2.a.rate, pairs: c.bothCompleted, comparison: c.id };
    }
  }
  return out;
}
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
  "neow.generated.json": {
    schema: 1,
    generatedFrom: "experiments/neow/neow-values-v2.json + experiments/neow/pooled-neow-values-v2-vs-rules_v2-val.json + experiments/batches/*/manifest.json",
    ...parseNeow(reports),
    startHpGaps: parseStartHpGaps(),
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
