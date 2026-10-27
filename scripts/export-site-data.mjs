#!/usr/bin/env node
// Exports the data the website shows from the repository's own audited artifacts:
//   apps/web/src/content/rules.generated.json     <- docs/game/MECHANICS-COVERAGE.md (the verified rule register)
//   apps/web/src/content/evidence.generated.json  <- experiments/batches/*/manifest.json (+ episodes for summaries)
//                                                    + experiments/comparisons/*.json (paired comparisons)
//   apps/web/src/content/cardvalues.generated.json <- experiments/cardvalue/*.json (measured card values, ADR-031)
//   apps/web/src/content/neow.generated.json      <- experiments/neow/*.json (the opening Ancient's relic values and the one held-out test, ADR-041, ADR-049)
//   apps/web/src/content/synergy.generated.json   <- experiments/synergy/*.json (what simulated runs say about the synergy term, ADR-050)
// Nothing is typed in by hand: `pnpm --filter @slay2/web test` fails if these files are stale (see test/content.test.ts).
// Usage: node scripts/export-site-data.mjs [--check]
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

// SLAY2_ROOT lets the tests point the exporter at a tampered copy of the inputs; production always uses the repository.
const root = process.env.SLAY2_ROOT
  ? resolve(process.env.SLAY2_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (!inTable) {
      inTable = true;
      ruleTable = cells[0] === "ID";
      continue;
    }
    if (!ruleTable) continue;
    if (cells.length < 3 || !/^[A-Z]+-\d+$/.test(cells[0])) continue;
    const status =
      cells[3] && /(VERIFIED|CORROBORATED|SECONDARY|UNVERIFIED)/.test(cells[3])
        ? plain(cells[3])
        : null;
    rules.push({
      id: cells[0],
      section: section.replace(/^\d+\.\s*/, ""),
      text: plain(cells[1]),
      evidence: plain(cells[2]),
      status,
    });
  }
  return rules;
}

function readEpisodes(dir) {
  const gz = join(dir, "episodes.jsonl.gz");
  const plainFile = join(dir, "episodes.jsonl");
  const text = existsSync(gz)
    ? gunzipSync(readFileSync(gz)).toString("utf8")
    : readFileSync(plainFile, "utf8");
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

// The 10- and 100-game batches are prefixes of the 2,000-game seed set, not additional games: do not list them twice.
const SKIP = new Set([
  "smoke-random_legal-ironclad-a0-veteran-n10",
  "ladder-random_legal-ironclad-a0-veteran-train-n100",
]);

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
    if (
      wins > 0 &&
      !(
        audit &&
        audit.all_verified === true &&
        audit.wins_audited === wins &&
        audit.batch_id === m.batch_id
      )
    ) {
      throw new Error(
        `${name}: ${wins} win(s) without a passing wins-audit.json (run: slay2_sim audit wins --batch experiments/batches/${name})`,
      );
    }
    // The sample audit (slay2_sim audit sample: ledger check + replay-verified random sample of completed games) belongs to one
    // exact batch; an audit of other content is refused rather than shown against this batch.
    const sampleFile = join(dir, name, "sample-audit.json");
    const sample = existsSync(sampleFile) ? JSON.parse(readFileSync(sampleFile, "utf8")) : null;
    if (
      sample &&
      !(sample.batch_id === m.batch_id && sample.batch_content_sha256 === m.content_sha256)
    ) {
      throw new Error(
        `${name}: sample-audit.json was written for other content; rerun slay2_sim audit sample --batch experiments/batches/${name}`,
      );
    }
    // The complete re-derivation (slay2_sim audit rederive: every game re-run and compared) is held to the same rule.
    const rederiveFile = join(dir, name, "rederivation-audit.json");
    const rederive = existsSync(rederiveFile)
      ? JSON.parse(readFileSync(rederiveFile, "utf8"))
      : null;
    if (
      rederive &&
      !(rederive.batch_id === m.batch_id && rederive.batch_content_sha256 === m.content_sha256)
    ) {
      throw new Error(
        `${name}: rederivation-audit.json was written for other content; rerun slay2_sim audit rederive --batch experiments/batches/${name}`,
      );
    }
    const completed = eps.filter((e) => e.outcome === "win" || e.outcome === "death");
    const floors = completed.map((e) => e.floor).sort((a, b) => a - b);
    const mean = floors.reduce((a, b) => a + b, 0) / Math.max(1, floors.length);
    const killers = {};
    for (const e of completed)
      if (e.killed_by) killers[e.killed_by] = (killers[e.killed_by] ?? 0) + 1;
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
      // a harness variant (gap G14: the relics a run gains after its first fight are kept instead of dropped at the next fight); never a headline
      keepRelics: m.config.keep_relics === true,
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
      topKillers: Object.entries(killers)
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .slice(0, 5)
        .map(([id, n]) => ({ id, n })),
      meanWallSecondsPerEpisode: Math.round(wall * 100) / 100,
      winsAudit: audit
        ? {
            audited: audit.wins_audited,
            verified: audit.wins_verified,
            seeds: audit.wins.map((w) => w.seed),
            criteria: audit.criteria,
          }
        : null,
      rederivationAudit: rederive
        ? {
            games: rederive.games,
            exact: rederive.rederived_exactly,
            differing: rederive.differing.map((d) => d.seed),
            criteria: rederive.criteria,
          }
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
      simulator: {
        id: m.simulator.id,
        sha: m.simulator.pinned,
        parityWithLiveGame: m.simulator.parity_with_live_game,
      },
      gapsRecordedInManifest: Array.isArray(m.known_simulator_gaps),
      knownGaps: (m.known_simulator_gaps ?? [])
        .filter((g) => g.affects === "results")
        .map((g) => g.id),
      contentSha256: m.content_sha256,
      episodesGzSha256: m.episodes_gz.sha256,
      finished: m.finished,
      role: ["train", "dev"].includes(m.seeds.partition)
        ? `development (${m.seeds.partition} partition): not a held-out result`
        : "held-out",
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
  for (const name of readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()) {
    const c = JSON.parse(readFileSync(join(dir, name), "utf8"));
    for (const side of [c.a, c.b]) {
      const current = byId.get(side.batchId);
      if (!current) throw new Error(`${name}: batch ${side.batchId} is not an evidence batch`);
      if (current.contentSha256 !== side.contentSha256) {
        throw new Error(
          `${name}: batch ${side.batchId} changed after the comparison was written; rerun slay2_sim compare --out`,
        );
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
      preIsolation: Boolean(
        byId.get(c.a.batchId)?.preIsolation || byId.get(c.b.batchId)?.preIsolation,
      ),
      contentSha256: c.contentSha256,
    });
  }
  return out;
}

// Measured card values (ADR-031). The simulator names a card `<ID>_CARD` when its enum name collides with a power; the
// catalog uses the plain id, so the value is attached to the catalog card. A measured id that maps to nothing is an error.
const CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"];
// Significance level of the pre-registered intervention test per class (ADR-031: Ironclad alone, 0.05; ADR-034: the other four share 0.05, Bonferroni).
const ALPHA = {
  ironclad: 0.05,
  silent: 0.0125,
  regent: 0.0125,
  necrobinder: 0.0125,
  defect: 0.0125,
};

// Whether a batch was played with the relics kept (gap G14), from its own manifest: exploration batches live beside the value files,
// the rest under experiments/batches. A batch that is not on disk is read as not kept.
function batchKeptRelics(batchId) {
  for (const where of [join(root, "experiments", "cardvalue"), join(root, "experiments", "batches")]) {
    const file = join(where, batchId, "manifest.json");
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")).config?.keep_relics === true;
  }
  return false;
}

// Which value files the site shows is a decision, not a side effect of a file existing (ADR-046): experiments/cardvalue/
// site-sets.json lists them, and the golden cases of the simulation panel (sim/slay2_sim/pickgolden.py) read the same list.
// A set measured for a study stays out of the site until it is listed there.
function parseCardValues(comparisons) {
  const dir = join(root, "experiments", "cardvalue");
  if (!existsSync(dir)) return [];
  if (!existsSync(join(dir, "site-sets.json")))
    throw new Error(
      "experiments/cardvalue/site-sets.json is missing: it lists the value files the site shows",
    );
  const SITE_SETS = JSON.parse(readFileSync(join(dir, "site-sets.json"), "utf8"));
  if (SITE_SETS.schema !== 1)
    throw new Error("experiments/cardvalue/site-sets.json: unknown schema");
  const catalog = JSON.parse(
    readFileSync(
      join(root, "packages", "game-data", "data", "cards.sts2-main-0.107.1.json"),
      "utf8",
    ),
  );
  const known = new Set(catalog.cards.map((c) => c.id));
  const canonical = (id) => {
    const plain = id.replace(/_CARD$/, "");
    return known.has(id) ? id : known.has(plain) ? plain : null;
  };
  const out = [];
  const listed = new Map(SITE_SETS.sets.map((entry) => [entry.file, entry]));
  for (const file of listed.keys()) {
    if (!existsSync(join(dir, file)))
      throw new Error(`site-sets.json lists ${file}, which does not exist`);
  }
  for (const name of readdirSync(dir)
    .filter((f) => listed.has(f))
    .sort()) {
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
          (c) =>
            c.a.policy === "rules_v2" &&
            c.b.policy === "rules_v1" &&
            c.role === "held-out" &&
            String(c.cohort.character).toLowerCase() === character,
        );
    if (entry.test && !test)
      throw new Error(
        `${name}: its test ${entry.test.comparison} is not a held-out comparison in experiments/comparisons`,
      );
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
          // what licenses the set: "own", this class's comparison at its own level; "pooled", the pooled test of the five classes and the
          // rule registered before it (ADR-053 item 5), which can adopt a class whose own comparison is not significant (see parseCardValueSets)
          basis: entry.test?.against === "current-values" ? "pooled" : "own",
          // improved the primary endpoint at the pre-registered level
          passed:
            test.reachedAct2.a.rate > test.reachedAct2.b.rate &&
            test.reachedAct2.pairedTable.mcnemar_p < ALPHA[character],
        }
      : null;
    // how far a set that replaces an earlier one moved from it (a descriptive comparison, not a test)
    let drift = null;
    if (entry.drift) {
      const d = JSON.parse(readFileSync(join(dir, entry.drift), "utf8"));
      const sha = createHash("sha256").update(raw).digest("hex");
      if (d.kind !== "card-value-comparison" || d.b.sha256 !== sha)
        throw new Error(`${name}: ${entry.drift} does not describe this version of the file`);
      const previous = readFileSync(join(dir, entry.supersedes));
      if (d.a.sha256 !== createHash("sha256").update(previous).digest("hex"))
        throw new Error(`${name}: ${entry.drift} compares another version of ${entry.supersedes}`);
      // the pilot that played each set's exploration games: a set that replaces another measured by a different pilot moved for that reason too
      const pilotOf = (file) =>
        [...new Set((file.batches ?? []).map((b) => b.policy?.name).filter(Boolean))].sort().join(" + ") ||
        "unknown";
      drift = {
        previous: entry.supersedes.replace(/\.json$/, ""),
        previousSha256: d.a.sha256,
        previousPilot: pilotOf(JSON.parse(previous.toString("utf8"))),
        pilot: pilotOf(v),
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
    if (!best)
      throw new Error(`${name}: no cross-validation entry for the chosen penalty ${cv.best_l2}`);
    const seen = new Set();
    const cards = v.cards.map((c) => {
      const id = canonical(c.id);
      if (!id) throw new Error(`${name}: measured card ${c.id} is not in the catalog`);
      if (seen.has(id)) throw new Error(`${name}: ${id} is measured twice`);
      seen.add(id);
      return {
        id,
        simId: c.id,
        beta: c.beta,
        ci95: c.ci95,
        gamesWithCard: c.games_with_card,
        staticRating: c.static_rating,
      };
    });
    cards.sort((a, b) => b.beta - a.beta || (a.id < b.id ? -1 : 1));
    out.push({
      id: name.replace(/\.json$/, ""),
      character,
      validation,
      supersedes: entry.supersedes ? entry.supersedes.replace(/\.json$/, "") : null,
      drift,
      // whether the games the values were fitted from kept the relics a run gains (gap G14: the pinned simulator drops them)
      relicsKept: v.batches.length > 0 && v.batches.every((b) => batchKeptRelics(b.batch_id)),
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
      batches: v.batches.map((b) => ({
        id: b.batch_id,
        contentSha256: b.content_sha256,
        policy: b.policy,
        simulator: b.simulator.id,
      })),
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
const EXACT = {
  ironclad: "Ironclad",
  silent: "Silent",
  regent: "Regent",
  necrobinder: "Necrobinder",
  defect: "Defect",
};
const NEOW_EXPLORE_SEEDS = 3000;
const NEOW_VAL_SEEDS = 2000;
// The study of ADR-049 (the simulator as it is: the relics a run gains after its first fight are dropped, gap G14), the same study repeated
// with the relics kept (ADR-055: its own fit, and the same test against a baseline played with the relics kept too), and the secondary arm
// of that repetition: the values of ADR-049 played with the relics kept. `exploreKeepRelics` says what the exploration batches behind a
// values file have to be, `testKeepRelics` what the held-out batches of a test have to be.
const NEOW_FIRST = {
  valuesFile: "neow-values-v2.json",
  testFile: "pooled-neow-values-v2-vs-rules_v2-val.json",
  exploreKeepRelics: false,
  testKeepRelics: false,
  adr: "ADR-049",
};
const NEOW_KEEP = {
  valuesFile: "neow-values-keep-v1.json",
  testFile: "pooled-neow-values-keep-v1-vs-rules_v2-keeprelics-val.json",
  exploreKeepRelics: true,
  testKeepRelics: true,
  adr: "ADR-055",
};
const NEOW_SECONDARY = {
  valuesFile: NEOW_FIRST.valuesFile,
  testFile: "pooled-neow-values-v2-vs-rules_v2-keeprelics-val.json",
  exploreKeepRelics: false,
  testKeepRelics: true,
  adr: "ADR-055",
};

function parseNeow(reports, spec = NEOW_FIRST) {
  const dir = join(root, "experiments", "neow");
  const valuesFile = join(dir, spec.valuesFile);
  if (!existsSync(valuesFile)) return { values: null, test: null };
  const here = `experiments/neow/${spec.valuesFile}`;
  const raw = readFileSync(valuesFile);
  const v = JSON.parse(raw.toString("utf8"));
  if (v.kind !== "neow-values" || v.schema !== 1)
    throw new Error(`${here}: not a neow-values file of schema 1`);
  if (!String(v.model?.resampling_unit ?? "").startsWith("seed"))
    throw new Error(`${here}: the fit must resample and cross-validate by seed (ADR-049)`);
  if (v.model.seeds !== NEOW_EXPLORE_SEEDS)
    throw new Error(
      `${here}: fitted on ${v.model.seeds} seeds, the registration says ${NEOW_EXPLORE_SEEDS}`,
    );
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
    return {
      character,
      games: c.games,
      passRate: c.pass_rate,
      baselineLogOdds: Math.round((v.covariates.intercept + offset) * 1e4) / 1e4,
    };
  });
  // the batches the values were fitted on are in the repository, are the ones the file names, and are what the registration says
  if (v.batches.length !== CLASSES.length)
    throw new Error(`${here}: it must name one exploration batch per class`);
  const fitted = new Set();
  for (const b of v.batches) {
    const manifestFile = join(
      dir,
      b.batch_id.replace(/^neow-explore-/, "explore-"),
      "manifest.json",
    );
    if (!existsSync(manifestFile))
      throw new Error(`${here}: its exploration batch ${b.batch_id} is not in experiments/neow`);
    const m = JSON.parse(readFileSync(manifestFile, "utf8"));
    if (m.batch_id !== b.batch_id || m.content_sha256 !== b.content_sha256) {
      throw new Error(
        `${here}: exploration batch ${b.batch_id} changed after the values were fitted`,
      );
    }
    const cls = CLASSES.find((c) => EXACT[c] === m.config?.character);
    if (!cls)
      throw new Error(
        `${here}: exploration batch ${b.batch_id} was played as "${m.config?.character}", which is not one of the simulator's exact class ids`,
      );
    fitted.add(cls);
    const bad =
      m.policy?.name !== "rules_v2_neow" || m.policy?.params?.neow_explore !== 1
        ? "it is not a fully randomised rules_v2_neow batch"
        : m.seeds?.partition !== "train" || m.seeds?.n !== NEOW_EXPLORE_SEEDS
          ? `it is not the first ${NEOW_EXPLORE_SEEDS} train seeds`
          : (m.config?.keep_relics === true) !== spec.exploreKeepRelics
            ? spec.exploreKeepRelics
              ? `it was not played with the relics kept (${spec.adr})`
              : `it was played with the relics kept (${spec.adr} was not)`
          : m.class_start_verified !== true
            ? "its games were not checked against the class they were played as"
            : m.config.ascension !== v.ascension || m.config.profile !== v.profile
              ? "its ascension or profile differ from the values'"
              : null;
    if (bad) throw new Error(`${here}: exploration batch ${b.batch_id}: ${bad}`);
  }
  if (fitted.size !== CLASSES.length)
    throw new Error(`${here}: its exploration batches must be one per class`);
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
    // whether the exploration games kept the relics a run gains (gap G14, ADR-052)
    relicsKept: spec.exploreKeepRelics,
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

  const testFile = join(dir, spec.testFile);
  if (!existsSync(testFile)) return { values, test: null };
  const t = JSON.parse(readFileSync(testFile, "utf8"));
  const where = `experiments/neow/${spec.testFile}`;
  if (
    t.kind !== "pooled-paired-comparison" ||
    t.policies?.a !== NEOW_POLICIES.a ||
    t.policies?.b !== NEOW_POLICIES.b
  ) {
    throw new Error(
      `${where}: not the pooled comparison of ${NEOW_POLICIES.a} against ${NEOW_POLICIES.b}`,
    );
  }
  if (t.cohort?.partition !== "val" || t.role !== "held-out")
    throw new Error(`${where}: not a held-out comparison`);
  if (t.cohort.ascension !== v.ascension || t.cohort.profile !== v.profile)
    throw new Error(
      `${where}: played at another ascension or profile than the values were measured at`,
    );
  const classesIn = (t.members ?? []).map((m) => String(m.character).toLowerCase());
  const classesNamed = (t.cohort.characters ?? []).map((c) => String(c).toLowerCase());
  const everyClassOnce = (list) =>
    list.length === CLASSES.length && [...list].sort().join() === [...CLASSES].sort().join();
  // the members carry the numbers and the cohort names the classes: both must be the five classes, once each
  if (!everyClassOnce(classesIn) || !everyClassOnce(classesNamed))
    throw new Error(`${where}: it must pool all five classes, once each`);
  const byId = new Map(reports.map((r) => [r.id, r]));
  const sums = { a_only: 0, b_only: 0, both: 0, neither: 0, pairedSeeds: 0, bothCompleted: 0 };
  for (const m of t.members) {
    const cls = String(m.character).toLowerCase();
    for (const [side, policy] of [
      [m.a, NEOW_POLICIES.a],
      [m.b, NEOW_POLICIES.b],
    ]) {
      const current = byId.get(side.batchId);
      if (!current) throw new Error(`${where}: batch ${side.batchId} is not an evidence batch`);
      if (current.contentSha256 !== side.contentSha256) {
        throw new Error(
          `${where}: batch ${side.batchId} changed after the comparison was written; rerun slay2_sim pool --out`,
        );
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
                : current.keepRelics !== spec.testKeepRelics
                  ? spec.testKeepRelics
                    ? `it was not played with the relics kept (${spec.adr})`
                    : `it was played with the relics kept (${spec.adr} was not)`
                  : spec.testKeepRelics && !current.classStartVerified
                    ? "its games were not checked against the class they were played as"
                    : spec.testKeepRelics && !current.sampleAudit
                      ? "it has no sample audit (slay2_sim audit sample --limit 40)"
                      : null;
      if (bad) throw new Error(`${where}: batch ${side.batchId} (${cls}): ${bad}`);
    }
    if (m.pairedSeeds !== NEOW_VAL_SEEDS)
      throw new Error(
        `${where}: ${cls} paired ${m.pairedSeeds} seeds, the registration says ${NEOW_VAL_SEEDS}`,
      );
    if (!byId.get(m.a.batchId).classStartVerified)
      throw new Error(`${where}: ${m.a.batchId} was not played with the per-game class check`);
    const manifest = JSON.parse(
      readFileSync(join(root, "experiments", "batches", m.a.batchId, "manifest.json"), "utf8"),
    );
    if (manifest.policy?.effective?.params?.neow_values_sha256 !== sha256) {
      throw new Error(
        `${where}: ${m.a.batchId} was played with another version of ${spec.valuesFile}`,
      );
    }
    if (spec.testKeepRelics) {
      // the page says the two arms differ in one thing, the rule for the opening relic: their recorded parameters (the card values and
      // their hash, the thresholds, the tuning) are equal once the opening-relic parameters are set aside. The stored baselines of ADR-049
      // predate that record, so the check is for the games played with the relics kept.
      const canon = (v) =>
        v !== null && typeof v === "object"
          ? Object.fromEntries(
              Object.keys(v)
                .sort()
                .map((k) => [k, canon(v[k])]),
            )
          : v;
      const withoutRule = (id) =>
        canon(
          Object.fromEntries(
            Object.entries(
              JSON.parse(
                readFileSync(join(root, "experiments", "batches", id, "manifest.json"), "utf8"),
              ).policy?.effective?.params ?? {},
            ).filter(([k]) => !k.startsWith("neow_")),
          ),
        );
      if (JSON.stringify(withoutRule(m.a.batchId)) !== JSON.stringify(withoutRule(m.b.batchId)))
        throw new Error(
          `${where}: the two arms of ${cls} do not differ only in the opening-relic rule (their other recorded parameters differ)`,
        );
    }
    const tab = m.reachedAct2.pairedTable;
    for (const k of ["a_only", "b_only", "both", "neither"]) sums[k] += tab[k];
    sums.pairedSeeds += m.pairedSeeds;
    sums.bothCompleted += m.bothCompleted;
  }
  const r1 = t.reachedAct2;
  // the pooled numbers are the sum of the classes' own, and the file says what it adds up to
  for (const k of ["a_only", "b_only", "both", "neither"]) {
    if (r1.pairedTable[k] !== sums[k])
      throw new Error(
        `${where}: the pooled ${k} (${r1.pairedTable[k]}) is not the sum of the classes' (${sums[k]})`,
      );
  }
  if (t.pairedSeeds !== sums.pairedSeeds || t.bothCompleted !== sums.bothCompleted)
    throw new Error(`${where}: its totals are not the sum of the classes'`);
  const test = {
    id: spec.testFile.replace(/\.json$/, ""),
    // whether the held-out games kept the relics a run gains (gap G14, ADR-052)
    relicsKept: spec.testKeepRelics,
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

// The opening-relic study and its repetition with the relics kept (ADR-055). The site shows the repeated study once its one test has been
// run, whichever way it came out (ADR-055 item 6: a pass gives the new values and the class rule, anything else gives the new measurements
// and no advice); until then it shows the first study. Both are exported, with the descriptive comparison of the two fits and the
// secondary arm (the earlier values played with the relics kept), so /methods can say what the repetition found.
/** The descriptive comparison of the two fits of the opening-relic values (slay2_sim.neowcompare), read field by field: the site shows it. */
function neowComparison(c) {
  const file = "experiments/neow/compare-v2-keep-v1.json";
  const count = (v, what) => {
    if (!Number.isInteger(v) || v < 0) throw new Error(`${file}: ${what} is not a count`);
    return v;
  };
  const rho = (v, what) => {
    if (v !== null && !(typeof v === "number" && v >= -1 && v <= 1)) throw new Error(`${file}: ${what} is not a correlation`);
    return v;
  };
  const labels = (v, what) => {
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw new Error(`${file}: ${what} is not a list of relics`);
    return v;
  };
  const x = c.comparison ?? {};
  const n = c.noise_reference ?? {};
  if (typeof x.best_in_a !== "string" || typeof x.best_in_b !== "string") throw new Error(`${file}: the best relic of each file is missing`);
  if (!Array.isArray(n.seeds) || n.seeds.length !== 2) throw new Error(`${file}: the noise reference has no two halves`);
  return {
    file,
    relicsInBoth: count(x.relics_in_both, "relics_in_both"),
    spearman: rho(x.spearman, "spearman"),
    k: count(x.k, "k"),
    bestShared: count(x.best_k_in_both, "best_k_in_both"),
    worstShared: count(x.worst_k_in_both, "worst_k_in_both"),
    disjointIntervals: count(x.disjoint_ci95, "disjoint_ci95"),
    onlyInFirst: labels(x.relics_only_in_a, "relics_only_in_a"),
    onlyInRepeated: labels(x.relics_only_in_b, "relics_only_in_b"),
    bestInFirst: x.best_in_a,
    bestInRepeated: x.best_in_b,
    noise: {
      relicsInBoth: count(n.relics_in_both, "noise relics_in_both"),
      seeds: n.seeds.map((v) => count(v, "noise seeds")),
      spearman: rho(n.spearman, "noise spearman"),
      spearmanBrown: rho(n.spearman_brown, "noise spearman_brown"),
    },
  };
}

function parseNeowStudies(reports) {
  const first = parseNeow(reports, NEOW_FIRST);
  const repeated = parseNeow(reports, NEOW_KEEP);
  let secondary = null;
  let comparison = null;
  if (repeated.test) {
    secondary = parseNeow(reports, NEOW_SECONDARY).test;
    if (secondary) {
      // the secondary arm is read against the same baseline batches as the primary test, or it would compare something else
      for (const [i, m] of repeated.test.members.entries()) {
        const other = secondary.members[i];
        if (!other || other.b.batchId !== m.b.batchId || other.b.contentSha256 !== m.b.contentSha256)
          throw new Error(
            `experiments/neow/${NEOW_SECONDARY.testFile}: the secondary arm has to be read against the baseline batches of the primary test (${m.b.batchId})`,
          );
      }
    }
  }
  const compareFile = join(root, "experiments", "neow", "compare-v2-keep-v1.json");
  if (repeated.values && first.values && existsSync(compareFile)) {
    const c = JSON.parse(readFileSync(compareFile, "utf8"));
    if (
      c.kind !== "neow-value-comparison" ||
      c.a?.sha256 !== first.values.sha256 ||
      c.b?.sha256 !== repeated.values.sha256
    )
      throw new Error(
        "experiments/neow/compare-v2-keep-v1.json does not describe the two value files the site reads: run python -m slay2_sim.neowcompare",
      );
    comparison = neowComparison(c);
  }
  const shown = repeated.test ? repeated : first;
  return {
    ...shown,
    study: repeated.test ? "repeated" : "first",
    first: first.values ? first : null,
    repeated: repeated.values ? { ...repeated, secondary, comparison } : null,
  };
}

// What the simulated runs say about the advisor's synergy term (ADR-050). The page's panel quotes these numbers, so they are read from
// the study's own reports and refused when the study was made on another table than the one the page computes with.
function parseSynergy(reports) {
  const table = JSON.parse(
    readFileSync(
      join(root, "packages", "game-data", "data", "synergy.sts2-main-0.107.1.json"),
      "utf8",
    ),
  );
  const out = {
    table: {
      sha256: table.sha256,
      cards: Object.keys(table.cards).length,
      mechanics: Object.keys(table.mechanics).length,
    },
    b1: null,
    keep: null,
    b2: null,
    b2keep: null,
  };
  const b1File = join(root, "experiments", "synergy", "b1-calibration.json");
  if (!existsSync(b1File)) return out;
  const rawB1 = readFileSync(b1File);
  const b1 = JSON.parse(rawB1.toString("utf8"));
  if (b1.advisor.synergy_table_sha256 !== table.sha256) {
    throw new Error(
      "experiments/synergy/b1-calibration.json was made on another synergy table than the page uses: run python -m slay2_sim.synergystudy",
    );
  }
  const pooled = b1.pooled.all_cohorts;
  const gap = (g) => ({ mean: g.mean, ci95: g.ci95 });
  const ratio = (r) => ({ toQuality: r.to_quality, ci95: r.ci95 });
  out.b1 = {
    stage: "B1",
    file: "experiments/synergy/b1-calibration.json",
    sha256: createHash("sha256").update(rawB1).digest("hex"),
    outcome: b1.outcome,
    bossFights: pooled.rows,
    passRate: pooled.pass_rate,
    cohorts: b1.cohorts.map((c) => ({
      name: c.name,
      character: c.character,
      partition: c.partition,
      bossFights: c.boss_fights,
    })),
    logLoss: {
      index: pooled.cross_validation.index.log_loss,
      indexAndSynergy: pooled.cross_validation["index+synergy"].log_loss,
    },
    auc: {
      index: pooled.cross_validation.index.auc,
      indexAndSynergy: pooled.cross_validation["index+synergy"].auc,
    },
    synergyAdded: gap(pooled.loss_gaps.synergy_added_to_index),
    enginesAdded: gap(pooled.loss_gaps.engines_added_to_needs_and_scalers),
    ratios: {
      needs: ratio(pooled.ratios.unmet),
      scalers: ratio(pooled.ratios.scaler),
      engines: ratio(pooled.ratios.engines),
      coverage: ratio(pooled.ratios.coverage),
    },
    beyondCards: {
      logLossCards: b1.beyond_additive_card_values.pooled.log_loss_cards,
      logLossCardsAndParts: b1.beyond_additive_card_values.pooled.log_loss_cards_and_parts,
      gap: gap(b1.beyond_additive_card_values.pooled.gap),
    },
    perCohortGain: Object.fromEntries(
      Object.entries(b1.per_cohort).map(([name, a]) => [
        name,
        gap(a.loss_gaps.synergy_added_to_index),
      ]),
    ),
    calibratedWeights: b1.calibration.weights,
    mechanics: null,
  };
  // The same runs read one mechanic's unmet need at a time (descriptive; it changes no tag). It is optional, but when it is there it has to
  // be about the table and the runs the page quotes, or it would say something about other ones.
  const mechanicsFile = join(root, "experiments", "synergy", "b1-mechanics.json");
  if (existsSync(mechanicsFile)) {
    const rawMechanics = readFileSync(mechanicsFile);
    const m = JSON.parse(rawMechanics.toString("utf8"));
    if (m.advisor.synergy_table_sha256 !== table.sha256) {
      throw new Error(
        "experiments/synergy/b1-mechanics.json was made on another synergy table than the page uses: run python -m slay2_sim.synergymechanics",
      );
    }
    if (m.rows !== pooled.rows) {
      throw new Error(
        "experiments/synergy/b1-mechanics.json reads other runs than b1-calibration.json: run both again",
      );
    }
    out.b1.mechanics = {
      file: "experiments/synergy/b1-mechanics.json",
      sha256: createHash("sha256").update(rawMechanics).digest("hex"),
      bootstrapDraws: m.bootstrap_draws,
      pooled: ratio(m.pooled_unmet_ratio),
      rows: m.mechanics.map((r) => ({
        mechanic: r.mechanic,
        label: r.label,
        decks: r.decks_with_the_need,
        meanPoints: r.mean_points,
        ratio: { toQuality: r.ratio_to_quality, ci95: r.ratio_ci95 },
      })),
    };
  }
  // Stage B1 read again on random drafts played with the relics kept (ADR-053 item 6; exploratory). Optional, but when it is there it has to
  // be about the two tables the page computes with and the exploration batches that are in the repository.
  out.keep = parseKeepReading(table.sha256);
  // The one registered test (stage B2-val). When its pooled result exists it is read, with everything it rests on, or the export stops:
  // the /methods panel must never say that the test has not been run when it has.
  out.b2 = parseSynergyTest(reports, table.sha256);
  out.b2keep = parseSynergyTest(reports, table.sha256, SYN_TEST_KEEP);
  return out;
}

function parseKeepReading(cardTableSha) {
  const file = join(root, "experiments", "synergy", "keep-b1.json");
  if (!existsSync(file)) return null;
  const raw = readFileSync(file);
  const r = JSON.parse(raw.toString("utf8"));
  if (r.kind !== "synergy-calibration-relics-kept" || r.schema !== 1)
    throw new Error("experiments/synergy/keep-b1.json: not a relics-kept reading of schema 1");
  const relicTable = JSON.parse(
    readFileSync(
      join(root, "packages", "game-data", "data", "relic-synergy.sts2-main-0.107.1.json"),
      "utf8",
    ),
  );
  if (r.synergy_table_sha256 !== cardTableSha || r.relic_synergy_table_sha256 !== relicTable.sha256)
    throw new Error(
      "experiments/synergy/keep-b1.json was made on other tag tables than the page uses: run python -m slay2_sim.synergykeep",
    );
  for (const c of r.cohorts) {
    const manifest = JSON.parse(
      readFileSync(join(root, "experiments", "cardvalue", c.batch_id, "manifest.json"), "utf8"),
    );
    if (
      manifest.episodes_gz.sha256 !== c.episodes_gz_sha256 ||
      manifest.config.keep_relics !== true
    )
      throw new Error(
        `experiments/synergy/keep-b1.json reads ${c.batch_id}, which is not the batch in the repository with the relics kept`,
      );
  }
  const gap = (g) => ({ mean: g.mean, ci95: g.ci95 });
  const ratio = (x) => ({ toQuality: x.to_quality, ci95: x.ci95 });
  const reading = (a) => ({
    logLoss: a.cross_validation["index+synergy"].log_loss,
    synergyAdded: gap(a.loss_gaps.synergy_added_to_index),
    ratios: {
      needs: ratio(a.ratios.unmet),
      scalers: ratio(a.ratios.scaler),
      engines: ratio(a.ratios.engines),
    },
  });
  return {
    file: "experiments/synergy/keep-b1.json",
    sha256: createHash("sha256").update(raw).digest("hex"),
    outcome: r.outcome,
    bossFights: r.runs.runs,
    withTaggedRelic: r.runs.with_a_tagged_relic,
    partsDiffer: r.runs.parts_differ,
    passRate: r.class_alone.pass_rate,
    bootstrapDraws: r.bootstrap_draws,
    classAlone: reading(r.class_alone),
    relicsCounted: reading(r.relics_counted),
    relicGain: gap(r.gap_relics_counted_minus_class_alone),
    perClass: Object.fromEntries(
      Object.entries(r.per_class).map(([name, v]) => [
        name,
        { rows: v.rows, ...gap(v.gap_relics_counted_minus_class_alone) },
      ]),
    ),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Stage B2 of the synergy study (ADR-050): the one registered held-out test of a pilot that picks card rewards by the deck index with the
// synergy term (A*) against the same pilot without it at the same skip margin (d0*), on the 2,000 val seeds of each class, the five
// classes pooled. Nothing here is taken on trust. The arms are read from the batches' own manifests (the parameters each pilot ran with,
// not the names the files give them); A* has to be the configuration the development stage chose, by the selection rule applied again to
// the numbers in its selection files; every batch must be the class, partition, policy and seed count the pooled file claims for it,
// with the per-game class check; and both primary arms carry a passing sample audit. Anything that does not belong together stops the
// export, so a result that was not the registered one cannot reach the page.
const SYN_ALPHA = 0.05;
const SYN_VAL_SEEDS = 2000;
const SYN_TIE = 0.005; // 0.5 percentage points, the tie of ADR-050 item 3
const SYN_CONFIGS = {
  d1: { needs: 1, scalers: 0.7, engines: 0 },
  d2: { needs: 1, scalers: 0.7, engines: 0.25 },
  d3: { needs: 1, scalers: 0.7, engines: 0.5 },
  d4: { needs: 1, scalers: 1, engines: 1 },
};
const SYN_MARGINS = { m1: 1.5, m2: 3 };
const SYN_POLICY = "advisor_v1";

// The exact two-sided McNemar p-value of the discordant counts, as slay2_sim.stats.mcnemar_exact computes it (2 x the lower binomial tail at
// 1/2, capped at 1), in exact integers: the exporter does not take a p-value from a file without checking it against the counts.
function mcnemarExact(aOnly, bOnly) {
  const n = aOnly + bOnly;
  if (n === 0) return 1;
  const k = Math.min(aOnly, bOnly);
  let term = 1n;
  let tail = 1n;
  for (let i = 1; i <= k; i++) {
    term = (term * BigInt(n - i + 1)) / BigInt(i);
    tail += term;
  }
  const scaled = (2n * tail * 10n ** 40n) / 2n ** BigInt(n);
  return Math.min(1, Number(scaled) / 1e40);
}
const closeP = (x, y) => Math.abs(x - y) <= 1e-9 * Math.max(x, y) + 1e-35;

// What the development stage chose, read from its two selection files and checked by applying the rule again.
function parseSynergySelection() {
  const dir = join(root, "experiments", "synergy", "dev");
  const files = ["selection-phase1.json", "selection-phase2.json"].map((f) => join(dir, f));
  for (const f of files) {
    if (!existsSync(f))
      throw new Error(
        `experiments/synergy/val holds a result, but the development stage's ${f.slice(root.length + 1)} is missing`,
      );
  }
  const raws = files.map((f) => readFileSync(f));
  const [p1, p2] = raws.map((r) => JSON.parse(r.toString("utf8")));
  const arms = Object.keys(SYN_CONFIGS);
  if (
    p1.phase !== 1 ||
    p1.baseline !== "d0" ||
    arms.some((a) => typeof p1.differences?.[a]?.difference !== "number")
  ) {
    throw new Error(
      "experiments/synergy/dev/selection-phase1.json: not the phase-1 comparison of d1 to d4 with d0",
    );
  }
  const best = Math.max(...arms.map((a) => p1.differences[a].difference));
  const chosen =
    best <= 0 ? "d1" : arms.find((a) => p1.differences[a].difference >= best - SYN_TIE);
  if (p1.chosen !== chosen)
    throw new Error(
      `experiments/synergy/dev/selection-phase1.json chooses ${p1.chosen}; the rule of ADR-050 chooses ${chosen} from its numbers`,
    );
  if (
    p2.phase !== 2 ||
    p2.baseline !== chosen ||
    Object.keys(SYN_MARGINS).some((a) => typeof p2.differences?.[a]?.difference !== "number")
  ) {
    throw new Error(
      "experiments/synergy/dev/selection-phase2.json: not the phase-2 comparison of the two skip margins with the chosen configuration",
    );
  }
  const options = [
    [0, 0],
    ...Object.entries(SYN_MARGINS).map(([a, m]) => [m, p2.differences[a].difference]),
  ];
  const bestMargin = Math.max(...options.map(([, d]) => d));
  const margin = options.find(([, d]) => d >= bestMargin - SYN_TIE)[0];
  if (p2.chosen_margin !== margin)
    throw new Error(
      `experiments/synergy/dev/selection-phase2.json chooses margin ${p2.chosen_margin}; the rule of ADR-050 chooses ${margin} from its numbers`,
    );
  // The record of A* is public before the test: the decision log has an Addendum D and quotes the hash of both selection files, so a
  // result cannot follow selection files other than the ones that were announced.
  const hashes = raws.map((r) => createHash("sha256").update(r).digest("hex"));
  const decisionsFile = join(root, "docs", "DECISIONS.md");
  const decisions = existsSync(decisionsFile) ? readFileSync(decisionsFile, "utf8") : "";
  if (!decisions.includes("Addendum D"))
    throw new Error(
      "docs/DECISIONS.md has no Addendum D, the record of A* that the registered test follows (ADR-050)",
    );
  ["selection-phase1.json", "selection-phase2.json"].forEach((name, i) => {
    if (!decisions.includes(hashes[i].slice(0, 12)))
      throw new Error(
        `docs/DECISIONS.md does not quote the hash (${hashes[i].slice(0, 12)}) of ${name}: the test must follow the selection files Addendum D records`,
      );
  });
  const read = (d) => ({
    difference: d.difference,
    ci95: d.ci95,
    pairs: d.pairs,
    mcnemarP: d.mcnemar_p,
  });
  return {
    arm: chosen,
    config: SYN_CONFIGS[chosen],
    margin,
    phase1: {
      sha256: hashes[0],
      differences: Object.fromEntries(arms.map((a) => [a, read(p1.differences[a])])),
    },
    phase2: {
      sha256: hashes[1],
      differences: Object.fromEntries(
        Object.keys(SYN_MARGINS).map((a) => [a, read(p2.differences[a])]),
      ),
    },
  };
}

// What every batch of a registered held-out test on the val seeds has to be, whatever policy it ran: the class it was played as, the
// seeds, Ascension 0 with the veteran profile, the relics kept or not (as the registration says), the class checked at the start of each
// game, the harness's canonical process state. Returns what is wrong with it, or null.
function commonBatchProblem(current, cls, { seeds, keepRelics, adr, classStartExempt = false }) {
  if (current.character !== EXACT[cls])
    return `it was played as "${current.character}", not as ${EXACT[cls]}`;
  if (current.partition !== "val" || current.seeds !== seeds) return `it is not the ${seeds} val seeds`;
  if (current.ascension !== 0 || current.profile !== "veteran")
    return "it is not Ascension 0 with the veteran profile";
  if (current.keepRelics !== keepRelics)
    return keepRelics
      ? `it was not played with the relics kept (${adr})`
      : `it was played with the relics kept (${adr} was not)`;
  if (!current.classStartVerified && !classStartExempt)
    return "its games were not checked against the class they were played as";
  if (!current.canonicalProcessState)
    return "it was not played in the harness's canonical process state";
  return null;
}

// Reads a pooled paired comparison written by `slay2_sim pool` and refuses it unless everything it rests on belongs together: it is a
// held-out comparison of the five classes once each, every batch it names is the batch on disk (same content hash) and passes `check`
// (the registration's own conditions) and carries a passing sample audit, the pooled counts are the sums of the classes', every table adds
// up to the pairs both arms completed, and every p-value is the exact McNemar p-value of its own counts.
function readPooledHeldOut({ where, path, names: [a, b], seeds, byId, check }) {
    const t = JSON.parse(readFileSync(path, "utf8"));
    if (t.kind !== "pooled-paired-comparison" || t.schema !== 1)
      throw new Error(`${where}: not a pooled paired comparison of schema 1`);
    if (t.cohort?.partition !== "val" || t.role !== "held-out")
      throw new Error(`${where}: not a held-out comparison`);
    if (t.cohort.ascension !== 0 || t.cohort.profile !== "veteran")
      throw new Error(`${where}: not played at Ascension 0 with the veteran profile`);
    const classesIn = (t.members ?? []).map((m) => String(m.character).toLowerCase());
    const classesNamed = (t.cohort.characters ?? []).map((c) => String(c).toLowerCase());
    const everyClassOnce = (list) =>
      list.length === CLASSES.length && [...list].sort().join() === [...CLASSES].sort().join();
    if (!everyClassOnce(classesIn) || !everyClassOnce(classesNamed))
      throw new Error(`${where}: it must pool all five classes, once each`);
    const sums = {
      a_only: 0,
      b_only: 0,
      both: 0,
      neither: 0,
      pairedSeeds: 0,
      bothCompleted: 0,
      winsA: 0,
      winsB: 0,
    };
    for (const m of t.members) {
      const cls = String(m.character).toLowerCase();
      for (const [side, name] of [
        [m.a, a],
        [m.b, b],
      ]) {
        const current = byId.get(side.batchId);
        if (!current) throw new Error(`${where}: batch ${side.batchId} is not an evidence batch`);
        if (current.contentSha256 !== side.contentSha256)
          throw new Error(
            `${where}: batch ${side.batchId} changed after the comparison was written; rerun slay2_sim pool --out`,
          );
        const bad = check(current, name, cls);
        if (bad) throw new Error(`${where}: batch ${side.batchId} (${cls}, ${name}): ${bad}`);
        const audit = current.sampleAudit;
        if (!audit || !audit.ledgerOk || audit.verified !== audit.drawn || audit.drawn < 40)
          throw new Error(
            `${where}: ${side.batchId}: no passing sample audit of at least 40 games (slay2_sim audit sample --limit 40)`,
          );
      }
      if (m.pairedSeeds !== seeds)
        throw new Error(
          `${where}: ${cls} paired ${m.pairedSeeds} seeds, the registration says ${seeds}`,
        );
      const tab = m.reachedAct2.pairedTable;
      for (const k of ["a_only", "b_only", "both", "neither"]) sums[k] += tab[k];
      sums.pairedSeeds += m.pairedSeeds;
      sums.bothCompleted += m.bothCompleted;
      sums.winsA += m.a.wins;
      sums.winsB += m.b.wins;
    }
    const r1 = t.reachedAct2;
    for (const k of ["a_only", "b_only", "both", "neither"]) {
      if (r1.pairedTable[k] !== sums[k])
        throw new Error(
          `${where}: the pooled ${k} (${r1.pairedTable[k]}) is not the sum of the classes' (${sums[k]})`,
        );
    }
    if (t.pairedSeeds !== sums.pairedSeeds || t.bothCompleted !== sums.bothCompleted)
      throw new Error(`${where}: its totals are not the sum of the classes'`);
    if (t.wins.a !== sums.winsA || t.wins.b !== sums.winsB)
      throw new Error(`${where}: its wins are not the sum of the classes'`);
    // every table adds up to the pairs both arms completed, and every p-value is the exact McNemar p-value of its own counts
    if (t.bothCompleted + t.excludedNotCompleted !== t.pairedSeeds)
      throw new Error(`${where}: completed and excluded pairs do not add up to the paired seeds`);
    const table = (label, tab, total) => {
      const n = tab.a_only + tab.b_only + tab.both + tab.neither;
      if (n !== total)
        throw new Error(`${where}: the ${label} table adds up to ${n}, not the ${total} pairs both arms completed`);
      const exact = mcnemarExact(tab.a_only, tab.b_only);
      if (!closeP(exact, tab.mcnemar_p))
        throw new Error(
          `${where}: the ${label} p-value (${tab.mcnemar_p}) is not the exact McNemar p-value of its counts (${exact})`,
        );
    };
    for (const [label, e] of [
      ["Act-1", r1],
      ["Act-2", t.reachedAct3],
    ]) {
      table(label, e.pairedTable, t.bothCompleted);
      if (
        e.a.games !== e.pairedTable.a_only + e.pairedTable.both ||
        e.b.games !== e.pairedTable.b_only + e.pairedTable.both ||
        Math.abs(e.a.rate - e.a.games / t.bothCompleted) > 1e-9 ||
        Math.abs(e.b.rate - e.b.games / t.bothCompleted) > 1e-9
      )
        throw new Error(`${where}: the ${label} rates are not the counts of its table`);
    }
    table("wins", t.wins.pairedTable, t.bothCompleted);
    for (const m of t.members) table(`${m.character} Act-1`, m.reachedAct2.pairedTable, m.bothCompleted);
    return {
      id: where.split("/").pop().replace(/\.json$/, ""),
      contentSha256: t.contentSha256,
      pairedSeeds: t.pairedSeeds,
      bothCompleted: t.bothCompleted,
      excludedNotCompleted: t.excludedNotCompleted,
      // games of each arm that ended in a simulator error or a timeout (never counted as losses); the pairs they were in are left out
      notFinished: {
        a: t.members.reduce((n, m) => n + seeds - byId.get(m.a.batchId).completed, 0),
        b: t.members.reduce((n, m) => n + seeds - byId.get(m.b.batchId).completed, 0),
      },
      reachedAct2: r1,
      reachedAct3: t.reachedAct3,
      wins: t.wins,
      floorDifference: t.floorDifference,
      clusteredDifference: t.clusteredDifference,
      members: t.members.map((m) => ({
        character: String(m.character).toLowerCase(),
        a: m.a,
        b: m.b,
        pairedSeeds: m.pairedSeeds,
        bothCompleted: m.bothCompleted,
        reachedAct2: m.reachedAct2,
        meanFloorDifference: m.meanFloorDifference,
      })),
    };
  }

// The sets the site shows with the test of ADR-053. A set adopted under that test is licensed by the rule registered before it (the pooled
// gain, and the class's own games not showing the current values significantly ahead), not by its own class's significance: its `passed`
// says whether the rule adopted it, read from the numbers, and the exporter refuses a listing that has no pooled result to rest on.
function parseCardValueSets(comparisons, reports) {
  const sets = parseCardValues(comparisons);
  const keepTest = parseKeepValuesTest(reports);
  for (const set of sets) {
    if (set.validation?.basis !== "pooled") continue;
    const verdict = keepTest?.classes[set.character];
    if (!verdict)
      throw new Error(
        `${set.id} is listed as tested by the pooled test of ADR-053, whose result (experiments/cardvalue/pooled-keepvals-vs-curvals-val.json) does not exist`,
      );
    set.validation.passed = verdict.adopted;
  }
  return { sets, keepTest };
}

// The one registered held-out test of ADR-053: `rules_v3` following the card values measured again with the relics kept, against
// `rules_v3` following the values the site showed, both played with the relics kept on the 2,000 val seeds of each class; the five classes
// pooled into one exact McNemar test at level 0.05. The reading rule (item 5) decides which value files the site shows, and the exporter
// applies it to the numbers and refuses a site-sets.json that disagrees: the decision is the rule's, not the author's.
const KEEP_VALUES_ALPHA = 0.05;
const KEEP_VALUES_SEEDS = 2000;
const currentValuesFile = (cls) => (cls === "ironclad" ? "ironclad-a0-v2.json" : `${cls}-a0-v1.json`);
const keepValuesFile = (cls) => `${cls}-a0-keep-v1.json`;
const keepValuesComparison = (cls) => `rules_v3-keepvals-vs-curvals-${cls}-a0-veteran-keeprelics-val`;

function parseKeepValuesTest(reports) {
  const dir = join(root, "experiments", "cardvalue");
  const primaryFile = join(dir, "pooled-keepvals-vs-curvals-val.json");
  if (!existsSync(primaryFile)) return null;
  const byId = new Map(reports.map((r) => [r.id, r]));
  const sha256 = (file) => createHash("sha256").update(readFileSync(join(dir, file))).digest("hex");
  // the new files are the ones ADR-053 recorded before any held-out game: their hashes are in the decision log
  const decisions = readFileSync(join(root, "docs", "DECISIONS.md"), "utf8");
  for (const cls of CLASSES) {
    if (!decisions.includes(sha256(keepValuesFile(cls))))
      throw new Error(
        `${keepValuesFile(cls)} is not the file ADR-053 recorded: its SHA-256 is not in docs/DECISIONS.md`,
      );
  }
  const newFit = (cls) => JSON.parse(readFileSync(join(dir, keepValuesFile(cls)), "utf8"));
  const heads = new Set();
  const armProblem = (current, name, cls) => {
    const want = `experiments/cardvalue/${name === "keepvals" ? keepValuesFile(cls) : currentValuesFile(cls)}`;
    if (current.policy !== "rules_v3") return `its policy is ${current.policy}`;
    if (current.policyParams?.values !== want || current.policyParams?.threshold !== 0)
      return `it does not follow ${want} at threshold 0`;
    const env =
      JSON.parse(readFileSync(join(root, "experiments", "batches", current.id, "manifest.json"), "utf8"))
        .environment?.slay2 ?? {};
    heads.add(env.head);
    return env.dirty === false
      ? null
      : "it was played from a working tree with uncommitted changes (ADR-053 asks for a clean checkout)";
  };
  const primary = readPooledHeldOut({
    where: "experiments/cardvalue/pooled-keepvals-vs-curvals-val.json",
    path: primaryFile,
    names: ["keepvals", "curvals"],
    seeds: KEEP_VALUES_SEEDS,
    byId,
    check: (current, name, cls) =>
      commonBatchProblem(current, cls, {
        seeds: KEEP_VALUES_SEEDS,
        keepRelics: true,
        adr: "ADR-053",
      }) ?? armProblem(current, name, cls),
  });
  if (heads.size !== 1 || ![...heads].every((h) => /^[0-9a-f]{40}$/.test(String(h))))
    throw new Error(
      `the arms of the test were not all played from one commit (heads: ${[...heads].join(", ")})`,
    );

  // the reading rule (ADR-053 item 5), from the numbers alone
  const t = primary.reachedAct2.pairedTable;
  const verdict = t.mcnemar_p < KEEP_VALUES_ALPHA ? (t.a_only > t.b_only ? "gain" : "loss") : "none";
  const classes = {};
  for (const m of primary.members) {
    const own = m.reachedAct2.pairedTable;
    // the class's own comparison shows the current values significantly ahead (two-sided exact McNemar, uncorrected)
    const currentAhead = own.mcnemar_p < KEEP_VALUES_ALPHA && own.b_only > own.a_only;
    classes[m.character] = {
      new: {
        file: `experiments/cardvalue/${keepValuesFile(m.character)}`,
        sha256: sha256(keepValuesFile(m.character)),
        // how much the new fit rests on: the games played, those that reached the Act-1 boss, the share that got past it
        games: newFit(m.character).games,
        bossFights: newFit(m.character).boss_fights,
        passRate: newFit(m.character).pass_rate,
      },
      current: { file: `experiments/cardvalue/${currentValuesFile(m.character)}`, sha256: sha256(currentValuesFile(m.character)) },
      own: { aOnly: own.a_only, bOnly: own.b_only, p: own.mcnemar_p },
      currentSignificantlyAhead: currentAhead,
      adopted: verdict === "gain" && !currentAhead,
    };
  }

  // the value files the site shows are the rule's: the new set for a class that adopts, the current one for the rest
  const listed = JSON.parse(readFileSync(join(dir, "site-sets.json"), "utf8")).sets;
  for (const cls of CLASSES) {
    const entries = listed.filter((e) => e.file.startsWith(`${cls}-a0-`));
    const want = classes[cls].adopted ? keepValuesFile(cls) : currentValuesFile(cls);
    if (entries.length !== 1 || entries[0].file !== want)
      throw new Error(
        `experiments/cardvalue/site-sets.json lists ${entries.map((e) => e.file).join(", ") || "nothing"} for ${cls}; the rule of ADR-053 item 5 applied to its numbers gives ${want}`,
      );
    if (classes[cls].adopted) {
      const entry = entries[0];
      if (
        entry.supersedes !== currentValuesFile(cls) ||
        entry.test?.comparison !== keepValuesComparison(cls) ||
        entry.test?.against !== "current-values" ||
        !entry.drift
      )
        throw new Error(
          `experiments/cardvalue/site-sets.json: the entry for ${keepValuesFile(cls)} has to name what it supersedes (${currentValuesFile(cls)}), its test (${keepValuesComparison(cls)}, against current-values) and the descriptive comparison`,
        );
    }
  }
  return {
    adr: "ADR-053",
    alpha: KEEP_VALUES_ALPHA,
    primary,
    verdict,
    adopted: CLASSES.filter((c) => classes[c].adopted),
    classes,
  };
}

// The two registered held-out tests of the synergy term: A* against the same pilot without it, five classes pooled. The first (ADR-050)
// was played in the simulator as it is, which drops the relics a run gains after its first fight (G14); the second (ADR-054) repeats it
// with the relics kept and has only the one comparison.
const SYN_TEST_FIRST = { dir: "val", keepRelics: false, adr: "ADR-050" };
const SYN_TEST_KEEP = { dir: "keep-val", keepRelics: true, adr: "ADR-054" };

function parseSynergyTest(reports, tableSha256, spec = SYN_TEST_FIRST) {
  const valDir = join(root, "experiments", "synergy", spec.dir);
  const primaryFile = join(valDir, "pooled-astar-vs-d0star.json");
  if (!existsSync(primaryFile)) return null;
  const choice = parseSynergySelection();
  const byId = new Map(reports.map((r) => [r.id, r]));
  const manifests = new Map();
  const manifestOf = (id) => {
    if (!manifests.has(id))
      manifests.set(
        id,
        JSON.parse(readFileSync(join(root, "experiments", "batches", id, "manifest.json"), "utf8")),
      );
    return manifests.get(id);
  };
  const effective = (id) => manifestOf(id).policy?.effective?.params ?? {};
  // The arms of the test were played from a clean checkout (the manifest records `dirty`), and all from one commit: the one that carries
  // the addendum that records A* (ADR-050 item 4). The second part is checked once every comparison has been read.
  const heads = new Set();
  const played = (r) => {
    const env = manifestOf(r.id).environment?.slay2 ?? {};
    heads.add(env.head);
    return env.dirty === false
      ? null
      : `it was played from a working tree with uncommitted changes (${spec.adr} asks for a clean checkout)`;
  };
  const isAstar = (p) =>
    p.synergy === 1 &&
    p.margin === choice.margin &&
    ["needs", "scalers", "engines"].every((k) => p[k] === choice.config[k]);
  const isNoTerm = (margin) => (p) => p.synergy === 0 && p.margin === margin;
  const measuredValues = (r) =>
    r.policy === "rules_v3" &&
    String(r.policyParams?.values ?? "").endsWith(
      `${r.character.toLowerCase()}-a0-${r.character === "Ironclad" ? "v2" : "v1"}.json`,
    );
  // The per-game class check (ADR-049) was added after the Ironclad batches of rules_v3 with measured values were played; Ironclad is the
  // class a run starts as when nothing is asked, so that one reference batch is the only exception to the check.
  // an arm: what the manifest of each of its five batches has to show; null when it does
  const arm = {
    astar: (r) =>
      r.policy !== SYN_POLICY
        ? `its policy is ${r.policy}`
        : !isAstar(effective(r.id))
          ? "its parameters are not the configuration the development stage chose"
          : played(r),
    d0star: (r) =>
      r.policy !== SYN_POLICY
        ? `its policy is ${r.policy}`
        : !isNoTerm(choice.margin)(effective(r.id))
          ? "it is not the index without the synergy term at A*'s margin"
          : played(r),
    d0: (r) =>
      r.policy !== SYN_POLICY
        ? `its policy is ${r.policy}`
        : !isNoTerm(0)(effective(r.id))
          ? "it is not the index without the synergy term at margin 0"
          : played(r),
    // the Ironclad reference batch is older than the rules above (it was played from a working tree with changes, before the class check)
    rules_v3: (r) =>
      !measuredValues(r)
        ? "it is not rules_v3 with the class's measured card values"
        : r.character === "Ironclad"
          ? null
          : played(r),
  };

  function pooled(file, a, b) {
    return readPooledHeldOut({
      where: `experiments/synergy/${spec.dir}/${file}`,
      path: join(valDir, file),
      names: [a, b],
      seeds: SYN_VAL_SEEDS,
      byId,
      check: (current, name, cls) =>
        commonBatchProblem(current, cls, {
          seeds: SYN_VAL_SEEDS,
          keepRelics: spec.keepRelics,
          adr: spec.adr,
          // the Ironclad reference batch of the measured-values pilot is older than the class check (ADR-049)
          classStartExempt: name === "rules_v3" && cls === "ironclad",
        }) ?? arm[name](current),
    });
  }

  const primary = pooled("pooled-astar-vs-d0star.json", "astar", "d0star");
  const optional = (file, a, b) => (existsSync(join(valDir, file)) ? pooled(file, a, b) : null);
  let noTermAtZero = null;
  let measured = null;
  if (spec.keepRelics) {
    // ADR-054 registers one comparison; another file here would be a comparison nobody registered
    for (const extra of ["pooled-astar-vs-d0.json", "pooled-astar-vs-rules_v3.json"]) {
      if (existsSync(join(valDir, extra)))
        throw new Error(
          `experiments/synergy/${spec.dir}/${extra}: ${spec.adr} registers one comparison, A* against the same pilot without the term`,
        );
    }
  } else {
    noTermAtZero = optional("pooled-astar-vs-d0.json", "astar", "d0");
    if (choice.margin !== 0 && !noTermAtZero)
      throw new Error(
        "the margin is not 0, so the comparison with the index without the term at margin 0 (pooled-astar-vs-d0.json) is part of the result",
      );
    if (choice.margin === 0 && noTermAtZero)
      throw new Error(
        "pooled-astar-vs-d0.json exists, but at margin 0 it is the primary comparison: remove it",
      );
    measured = optional("pooled-astar-vs-rules_v3.json", "astar", "rules_v3");
  }
  if (heads.size !== 1 || ![...heads].every((h) => /^[0-9a-f]{40}$/.test(String(h))))
    throw new Error(
      `the arms of the test were not all played from one commit (heads: ${[...heads].join(", ")})`,
    );
  if (!spec.keepRelics && !measured)
    throw new Error(
      "the comparison with the measured-values pilot (pooled-astar-vs-rules_v3.json) is part of the registered result",
    );

  // how often each arm skipped and what its decks at the boss held (slay2_sim.synergyreport), tied to the very batches of the test
  let profile = null;
  const profileFile = join(valDir, "arm-profile.json");
  if (existsSync(profileFile)) {
    const pr = JSON.parse(readFileSync(profileFile, "utf8"));
    if (pr.kind !== "arm-profile" || pr.schema !== 1)
      throw new Error("experiments/synergy/val/arm-profile.json: not an arm profile of schema 1");
    for (const [name, side] of [
      ["astar", "a"],
      ["d0star", "b"],
    ]) {
      for (const m of primary.members) {
        const mine = pr.arms?.[name]?.batches?.[m.character];
        const current = byId.get(m[side].batchId);
        if (
          !mine ||
          mine.batch_id !== current.id ||
          mine.episodes_gz_sha256 !== current.episodesGzSha256
        ) {
          throw new Error(
            `experiments/synergy/val/arm-profile.json: its ${name} ${m.character} batch is not the one the test used`,
          );
        }
      }
    }
    const summary = (a) => ({
      games: a.pooled.games,
      offers: a.pooled.offers,
      skipped: a.pooled.skipped,
      skipRate: a.pooled.skip_rate,
      bossDecks: a.pooled.boss_decks,
      atBoss: a.pooled.at_boss,
    });
    profile = {
      sha256: createHash("sha256").update(readFileSync(profileFile)).digest("hex"),
      astar: summary(pr.arms.astar),
      d0star: summary(pr.arms.d0star),
      difference: pr.differences["astar-vs-d0star"].pooled,
    };
  }

  const t = primary.reachedAct2.pairedTable;
  const significant = t.mcnemar_p < SYN_ALPHA;
  // the reading rule of ADR-050 item 7 (repeated in ADR-054 item 4), from the numbers alone
  const verdict = significant ? (t.a_only > t.b_only ? "ahead" : "behind") : "not-shown";
  const astar = { arm: choice.arm, ...choice.config, margin: choice.margin };
  if (spec.keepRelics) return { tableSha256, alpha: SYN_ALPHA, astar, primary, verdict, profile };
  return {
    tableSha256,
    alpha: SYN_ALPHA,
    astar,
    selection: { phase1: choice.phase1, phase2: choice.phase2 },
    primary,
    verdict,
    noTermAtZero,
    measured,
    profile,
  };
}

function parseVerification() {
  const golden = JSON.parse(
    readFileSync(join(root, "packages", "odds", "test", "fixtures", "golden-python.json"), "utf8"),
  );
  const published = JSON.parse(
    readFileSync(join(root, "packages", "odds", "test", "fixtures", "published.json"), "utf8"),
  );
  const catalog = JSON.parse(
    readFileSync(
      join(root, "packages", "game-data", "data", "cards.sts2-main-0.107.1.json"),
      "utf8",
    ),
  );
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
      out[String(c.cohort.character).toLowerCase()] = {
        simulator: c.reachedAct2.b.rate,
        game: c.reachedAct2.a.rate,
        pairs: c.bothCompleted,
        comparison: c.id,
      };
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
    generatedFrom:
      "experiments/batches/*/manifest.json + experiments/comparisons/*.json + sim/slay2_sim/gaps.json",
    simulatorGaps: JSON.parse(readFileSync(join(root, "sim", "slay2_sim", "gaps.json"), "utf8"))
      .gaps,
    reports,
    comparisons,
  },
  "cardvalues.generated.json": {
    schema: 1,
    generatedFrom:
      "experiments/cardvalue/*.json (kind card-values) + experiments/comparisons/*.json + packages/game-data/data/cards.sts2-main-0.107.1.json",
    ...parseCardValueSets(comparisons, reports),
  },
  "synergy.generated.json": {
    schema: 1,
    generatedFrom:
      "experiments/synergy/b1-calibration.json + experiments/synergy/b1-mechanics.json + packages/game-data/data/synergy.sts2-main-0.107.1.json",
    ...parseSynergy(reports),
  },
  "neow.generated.json": {
    schema: 1,
    generatedFrom:
      "experiments/neow/neow-values-v2.json + experiments/neow/pooled-neow-values-v2-vs-rules_v2-val.json (the first study) + experiments/neow/neow-values-keep-v1.json + experiments/neow/pooled-neow-values-keep-v1-vs-rules_v2-keeprelics-val.json + experiments/neow/pooled-neow-values-v2-vs-rules_v2-keeprelics-val.json + experiments/neow/compare-v2-keep-v1.json (the repetition with the relics kept, ADR-055) + experiments/batches/*/manifest.json",
    ...parseNeowStudies(reports),
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
