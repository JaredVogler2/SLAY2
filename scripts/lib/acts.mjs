import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CLASSES,
  EXACT,
  closeP,
  commonBatchProblem,
  mcnemarExact,
  readPooledHeldOut,
} from "./pooled.mjs";

// ---- The acts study (ADR-061): which act's card picks carry the effect of a pickier rule, and does it reach winning? -------------------------------
// Four held-out tests at the endpoint "the run was won", each a pooled paired test of five classes (the relics kept, Ascension 0, the 3,000 val2 seeds
// of each class), an arm against S (the shown-values pilot), read at 0.05 / 4 and run once: L (the card-pick threshold 0.2 in every act) and A1, A2
// and A3 (0.2 in the card rewards of one act only, Act 1, 2 or 3; S's threshold 0 in the others). Until the files exist the output carries the stage
// the study is at: registered; the tests.
export const AC = {
  adr: "ADR-061",
  headline: "does a pickier card rule win more games",
  tests: 4,
  level: 0.05 / 4,
  classLevel: 0.01,
  maxExcludedFraction: 0.1,
  robustLevel: 0.05,
  seeds: 3000,
  partition: "val2",
  seedsFile: "experiments/seeds/ironclad-a0-v3.json",
  leadThreshold: 0.2,
  marker: "Registration of ADR-061 (frozen choices)",
};
const CI_LEVEL = 1 - AC.level;
// the acts are counted from 0 in the policy's parameters; `first` is the first act whose card rewards differ from S's
export const TESTS = [
  { key: "L", arm: "lead", file: "pooled-acts-L.json", acts: [0, 1, 2], first: 0 },
  { key: "A1", arm: "a1", file: "pooled-acts-A1.json", acts: [0], first: 0 },
  { key: "A2", arm: "a2", file: "pooled-acts-A2.json", acts: [1], first: 1 },
  { key: "A3", arm: "a3", file: "pooled-acts-A3.json", acts: [2], first: 2 },
];

/** The reading rule of ADR-061 item 4 applied to the numbers of the registered primary test alone (the order of the arguments is the arm's, then S's). */
export function verdictOf({ armOnly, baselineOnly, p, ci, level = AC.level }) {
  const [lo, hi] = ci;
  if (p < level && armOnly > baselineOnly && lo > 0) return "passed";
  if (p < level && baselineOnly > armOnly && hi < 0) return "reversed";
  return "not-shown";
}

/**
 * The whole reading (item 4): a result is "passed" or "reversed" only if the primary test says so AND the all-pairs analysis (every pair of seeds both arms
 * hold, a game that did not end in a win scored as not a win) has the same arm ahead at an exact p below 0.05 AND the primary dropped at most a tenth of the
 * pairs. Anything else is "not-shown"; `downgrades` lists every condition that withheld it ("excluded", "robustness"), `downgrade` the first.
 */
export function readingOf({
  armOnly,
  baselineOnly,
  p,
  ci,
  level = AC.level,
  robust,
  excludedFraction,
}) {
  const primary = verdictOf({ armOnly, baselineOnly, p, ci, level });
  if (primary === "not-shown")
    return { verdict: "not-shown", primary, downgrade: null, downgrades: [] };
  const downgrades = [];
  if (excludedFraction > AC.maxExcludedFraction) downgrades.push("excluded");
  const ahead =
    primary === "passed"
      ? robust.armOnly > robust.baselineOnly
      : robust.baselineOnly > robust.armOnly;
  if (!(robust.p < AC.robustLevel && ahead)) downgrades.push("robustness");
  if (downgrades.length > 0)
    return { verdict: "not-shown", primary, downgrade: downgrades[0], downgrades };
  return { verdict: primary, primary, downgrade: null, downgrades: [] };
}

const shaOf = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const near = (x, y, tol = 1e-9) => Math.abs(x - y) <= tol * Math.max(1, Math.abs(y));
const canonical = (v) =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, x[k]]),
        )
      : x,
  );

export function parseActs({ root, reports }) {
  const decisionLog = join(root, "docs", "DECISIONS.md");
  const decisions = existsSync(decisionLog) ? readFileSync(decisionLog, "utf8") : "";
  const at = decisions.indexOf(`${AC.adr}: ${AC.headline}`);
  const actsDir = join(root, "experiments", "acts");
  const present = TESTS.filter((t) => existsSync(join(actsDir, t.file)));
  if (at < 0) {
    if (present.length > 0 || existsSync(join(actsDir, "robustness-all-pairs.json")))
      throw new Error(`acts study files exist but docs/DECISIONS.md has no ${AC.adr}`);
    return { registered: false };
  }
  const next = decisions.indexOf("\n## ", at);
  const record = decisions.slice(at, next < 0 ? undefined : next);
  const heading = record.split(AC.marker).length - 1;
  if (heading > 1)
    throw new Error(
      `${AC.adr} carries the text "${AC.marker}" ${String(heading)} times; the registration heading occurs once`,
    );
  const out = {
    adr: AC.adr,
    registered: true,
    level: AC.level,
    classLevel: AC.classLevel,
    seeds: AC.seeds,
    frozen: heading === 1,
    tests: null,
  };
  if (present.length === 0) return out;
  if (!out.frozen)
    throw new Error(
      `experiments/acts has pooled results but ${AC.adr} has no registration (${AC.marker})`,
    );
  if (present.length !== TESTS.length)
    throw new Error(
      `experiments/acts has the pooled results ${present.map((t) => t.key).join(", ")}; ${AC.adr} runs the four tests together, once`,
    );

  // ---- the files an arm reads, and the batches ---------------------------------------------------------------------------------------------
  const sets = JSON.parse(
    readFileSync(join(root, "experiments", "cardvalue", "site-sets.json"), "utf8"),
  ).sets;
  const shownFile = (cls) => {
    const entries = sets.filter((e) => e.file.startsWith(`${cls}-a0-`));
    if (entries.length !== 1)
      throw new Error(
        `experiments/cardvalue/site-sets.json lists ${String(entries.length)} sets for ${cls}`,
      );
    return `experiments/cardvalue/${entries[0].file}`;
  };
  const quoted = (file) => {
    const sha = shaOf(join(root, file));
    if (!record.includes(sha))
      throw new Error(`${file}: its SHA-256 (${sha}) is not quoted in ${AC.adr}`);
    return sha;
  };
  for (const cls of CLASSES) quoted(shownFile(cls));
  const seedsSha = quoted(AC.seedsFile);

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
  const batchId = (arm, cls) =>
    `acts-${arm}-${cls}-a0-veteran-keeprelics-${AC.partition}-n${String(AC.seeds)}`;
  const heads = new Set();
  const validity = (r) => {
    if (!r.counts || typeof r.counts !== "object")
      return "its report has no counts of how its games ended";
    const bad = ["aborted", "harness_error", "policy_error", "invalid_action"].reduce(
      (n, k) => n + (r.counts[k] ?? 0),
      0,
    );
    if (bad > 0)
      return `${String(bad)} of its games ended in an abort, a harness error, a policy error or an invalid action (${AC.adr} item 9)`;
    if (!(r.completed >= 0.9 * AC.seeds))
      return `only ${String(r.completed)} of its ${String(AC.seeds)} games completed (${AC.adr} item 9 asks for 90 %)`;
    const m = manifestOf(r.id);
    const env = m.environment?.slay2 ?? {};
    if (env.dirty !== false)
      return `it was played from a working tree with uncommitted changes (${AC.adr} asks for a clean checkout)`;
    heads.add(env.head);
    const sim = m.simulator ?? {};
    if (sim.pin_ok !== true || sim.dirty !== false)
      return "it was not played with the pinned, clean simulator";
    const seeds = m.seeds ?? {};
    if (
      seeds.file !== AC.seedsFile ||
      seeds.file_sha256 !== seedsSha ||
      seeds.sealed_partition_used !== false
    )
      return `its seeds are not those of ${AC.seedsFile} (the ${AC.partition} partition, the sealed one untouched)`;
    return null;
  };
  const follows = (current, cls, threshold) => {
    const e = effective(current.id);
    const file = shownFile(cls);
    return (
      e.threshold === threshold &&
      current.policyParams?.threshold === threshold &&
      current.policyParams?.values === file &&
      e.values === file &&
      e.values_sha256 === quoted(file)
    );
  };
  const armProblem = (current, name, cls, spec) => {
    const e = effective(current.id);
    const noLate = ["late_values", "late_values_sha256", "late_threshold", "late_acts"].some(
      (k) => k in e,
    );
    if (name === "s")
      return current.policy !== "rules_v2"
        ? `its policy is ${current.policy}`
        : !follows(current, cls, 0) || noLate
          ? `it is not rules_v2 with ${shownFile(cls)} at threshold 0`
          : null;
    if (spec.key === "L")
      return current.policy !== "rules_v2"
        ? `its policy is ${current.policy}`
        : !follows(current, cls, AC.leadThreshold) || noLate
          ? `it is not rules_v2 with ${shownFile(cls)} at threshold ${String(AC.leadThreshold)}`
          : null;
    if (current.policy !== "rules_v2_late") return `its policy is ${current.policy}`;
    if (!follows(current, cls, 0) || canonical(e.late_acts) !== canonical(spec.acts))
      return `it is not rules_v2_late on ${shownFile(cls)} with the late rule on ${canonical(spec.acts)} only`;
    return e.late_threshold === AC.leadThreshold && !("late_values" in e)
      ? null
      : `its threshold in the act is not ${String(AC.leadThreshold)}`;
  };

  // ---- the all-pairs analysis and the identity checks ------------------------------------------------------------------------------------
  const robPath = join(actsDir, "robustness-all-pairs.json");
  if (!existsSync(robPath))
    throw new Error(
      `experiments/acts/robustness-all-pairs.json is missing: the all-pairs analysis is a condition of the reading rule (${AC.adr} item 4)`,
    );
  const robustness = JSON.parse(readFileSync(robPath, "utf8"));
  if (
    robustness.kind !== "acts-robustness" ||
    robustness.schema !== 1 ||
    canonical(Object.keys(robustness.tests).sort()) !== canonical(TESTS.map((t) => t.key).sort())
  )
    throw new Error(
      "experiments/acts/robustness-all-pairs.json: not the all-pairs analysis of the four tests",
    );

  // the independent recomputation from the raw episodes (verify_all.py, run by pool.sh): every exact check agreed; the resample's disagreements, if any, are carried
  const verPath = join(actsDir, "verification.json");
  if (!existsSync(verPath))
    throw new Error(
      `experiments/acts/verification.json is missing: the pooled files are recomputed from the episodes by pool.sh (${AC.adr} item 10)`,
    );
  const verification = JSON.parse(readFileSync(verPath, "utf8"));
  if (verification.kind !== "acts-verification" || verification.schema !== 1)
    throw new Error("experiments/acts/verification.json: not a verification record of schema 1");

  const readOne = (spec) => {
    const file = join(actsDir, spec.file);
    const where = `experiments/acts/${spec.file}`;
    const test = readPooledHeldOut({
      where,
      path: file,
      names: [spec.key, "s"],
      seeds: AC.seeds,
      byId,
      ascension: 0,
      partition: AC.partition,
      check: (current, name, cls) =>
        commonBatchProblem(current, cls, {
          seeds: AC.seeds,
          keepRelics: true,
          adr: AC.adr,
          ascension: 0,
          partition: AC.partition,
        }) ??
        validity(current) ??
        armProblem(current, name, cls, spec),
    });
    for (const m of test.members) {
      if (m.a.batchId !== batchId(spec.arm, m.character))
        throw new Error(
          `${where}: ${m.character} arm is ${m.a.batchId}, not ${batchId(spec.arm, m.character)}`,
        );
      if (m.b.batchId !== batchId("s", m.character))
        throw new Error(
          `${where}: ${m.character} baseline is ${m.b.batchId}, not ${batchId("s", m.character)}`,
        );
      const [x, y] = [manifestOf(m.a.batchId), manifestOf(m.b.batchId)];
      for (const part of ["config", "seeds", "simulator"])
        if (canonical(x[part]) !== canonical(y[part]))
          throw new Error(
            `${where}: ${m.character}: the two arms differ in their ${part}, and ${AC.adr} has them differ in the card rule`,
          );
    }
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const cl = raw.clusteredDifference;
    if (cl?.endpoint !== "win")
      throw new Error(
        `${where}: its interval is not of the wins endpoint (slay2_sim pool --endpoint win)`,
      );
    if (
      !cl.ciAtLevel ||
      !near(cl.ciAtLevel.level, CI_LEVEL, 1e-6) ||
      !(cl.ciAtLevel.ci[0] <= cl.ciAtLevel.ci[1])
    )
      throw new Error(`${where}: no whole-seed interval at level ${String(CI_LEVEL)}`);
    const w = test.wins;
    const tab = w.pairedTable;
    if (w.a !== tab.a_only + tab.both || w.b !== tab.b_only + tab.both)
      throw new Error(`${where}: the wins are not the counts of the wins table`);
    const shares = { arm: w.a / test.bothCompleted, baseline: w.b / test.bothCompleted };
    if (!near(cl.meanAMinusB, shares.arm - shares.baseline, 1e-9))
      throw new Error(
        `${where}: the pooled difference is not the difference of its two win shares`,
      );
    // the estimate lies in both of its intervals, and the 95 % interval lies in the wider one (a hand-edited interval is caught here; one that is merely wrong is
    // caught by the recomputation in verification.json)
    const [lo, hi] = cl.ciAtLevel.ci;
    const [lo95, hi95] = cl.ci95;
    if (
      !(lo <= cl.meanAMinusB && cl.meanAMinusB <= hi) ||
      !(lo95 <= cl.meanAMinusB && cl.meanAMinusB <= hi95) ||
      !(lo <= lo95 && hi95 <= hi)
    )
      throw new Error(`${where}: its two intervals do not nest around the pooled difference`);
    // an arm that is S until act k plays S's game up to the first card reward of act k: it cannot differ from S about the bosses before it (item 5)
    const checkBoss = (act, label, t2) => {
      if (spec.first >= act && (t2.pairedTable.a_only !== 0 || t2.pairedTable.b_only !== 0))
        throw new Error(
          `${where}: an arm that is S until act ${String(spec.first + 1)} differs from S about the ${label} boss in ${String(t2.pairedTable.a_only + t2.pairedTable.b_only)} pairs (${AC.adr} item 5)`,
        );
    };
    checkBoss(1, "Act-1", test.reachedAct2);
    checkBoss(2, "Act-2", test.reachedAct3);
    // each class on its own: the per-class comparison files, which have to add up to the pooled table
    const sum = { a_only: 0, b_only: 0, both: 0, neither: 0 };
    const perClass = test.members.map((m) => {
      const pc = JSON.parse(
        readFileSync(join(actsDir, "per-class", `${spec.key}-${m.character}.json`), "utf8"),
      );
      if (
        pc.kind !== "paired-comparison" ||
        pc.a?.batchId !== m.a.batchId ||
        pc.b?.batchId !== m.b.batchId ||
        pc.a.contentSha256 !== m.a.contentSha256 ||
        pc.b.contentSha256 !== m.b.contentSha256
      )
        throw new Error(
          `experiments/acts/per-class/${spec.key}-${m.character}.json: not the comparison of the batches the pooled file names`,
        );
      const t = pc.pairedWinTable;
      if (!closeP(mcnemarExact(t.a_only, t.b_only), t.mcnemar_p))
        throw new Error(
          `experiments/acts/per-class/${spec.key}-${m.character}.json: its p is not the exact McNemar p of its counts`,
        );
      for (const k of Object.keys(sum)) sum[k] += t[k];
      return {
        character: m.character,
        pairs: pc.bothCompleted,
        wins: { arm: t.a_only + t.both, baseline: t.b_only + t.both },
        shares: {
          arm: (t.a_only + t.both) / pc.bothCompleted,
          baseline: (t.b_only + t.both) / pc.bothCompleted,
        },
        difference: (t.a_only - t.b_only) / pc.bothCompleted,
        armOnly: t.a_only,
        baselineOnly: t.b_only,
        p: t.mcnemar_p,
        verdict: verdictClass(t),
        actOne: {
          arm: m.reachedAct2.a,
          baseline: m.reachedAct2.b,
        },
        meanFloorDifference: m.meanFloorDifference,
      };
    });
    for (const k of Object.keys(sum))
      if (sum[k] !== tab[k])
        throw new Error(
          `${where}: the classes' ${k} (${String(sum[k])}) do not add up to the pooled one (${String(tab[k])})`,
        );
    // the all-pairs analysis of this test, written by pool.sh with the pooled files
    const entry = robustness.tests[spec.key];
    if (!entry || entry.arm !== spec.arm)
      throw new Error(
        `experiments/acts/robustness-all-pairs.json: no analysis of test ${spec.key} for the arm ${spec.arm}`,
      );
    const rb = entry.pooled;
    const sumOf = (k) => CLASSES.reduce((n, c) => n + entry.perClass[EXACT[c]][k], 0);
    for (const k of ["shared", "primaryPairs", "pairs", "armOnly", "baselineOnly", "arm", "baseline"])
      if (sumOf(k) !== rb[k])
        throw new Error(
          `experiments/acts/robustness-all-pairs.json: test ${spec.key}: the classes' ${k} do not add up to the pooled one`,
        );
    if (!closeP(mcnemarExact(rb.armOnly, rb.baselineOnly), rb.p))
      throw new Error(
        `experiments/acts/robustness-all-pairs.json: test ${spec.key}: its p is not the exact McNemar p of its counts`,
      );
    if (rb.shared !== test.pairedSeeds || rb.primaryPairs !== test.bothCompleted)
      throw new Error(
        `experiments/acts/robustness-all-pairs.json: test ${spec.key}: it does not count the pairs of ${where}`,
      );
    if (rb.pairs !== rb.shared || !near(rb.difference, (rb.arm - rb.baseline) / rb.pairs, 1e-9))
      throw new Error(
        `experiments/acts/robustness-all-pairs.json: test ${spec.key}: its counts do not add up`,
      );
    if (rb.arm < w.a || rb.baseline < w.b)
      throw new Error(
        `experiments/acts/robustness-all-pairs.json: test ${spec.key}: it has fewer wins than the pairs both arms completed`,
      );
    // the discordant wins are the difference of the two arms' wins, in the pool and in every class
    for (const [who, row] of [
      ["pooled", rb],
      ...CLASSES.map((c) => [EXACT[c], entry.perClass[EXACT[c]]]),
    ])
      if (row.armOnly - row.baselineOnly !== row.arm - row.baseline)
        throw new Error(
          `experiments/acts/robustness-all-pairs.json: test ${spec.key}: ${who}: the discordant wins are not the difference of the two arms' wins`,
        );
    // it was made from the batches the pooled file names
    for (const m of test.members)
      for (const side of [m.a, m.b])
        if (robustness.contentSha256?.[side.batchId] !== side.contentSha256)
          throw new Error(
            `experiments/acts/robustness-all-pairs.json: test ${spec.key}: it was not made from the content of ${side.batchId}`,
          );
    const excludedFraction = 1 - test.bothCompleted / test.pairedSeeds;
    if (!near(rb.primaryExcludedFraction, excludedFraction, 1e-9))
      throw new Error(
        `experiments/acts/robustness-all-pairs.json: test ${spec.key}: its excluded share is not the pooled file's`,
      );
    // the identity check of an arm that is S in the early acts
    if (spec.first > 0) {
      const idPath = join(actsDir, "identity", `${spec.key}.json`);
      const idn = existsSync(idPath) ? JSON.parse(readFileSync(idPath, "utf8")) : null;
      if (
        idn?.kind !== "acts-identity" ||
        idn.arm !== spec.arm ||
        idn.firstAct !== spec.first ||
        idn.beforeDifferent !== 0 ||
        idn.bossDifferent !== 0 ||
        !(idn.beforePairs > 0) ||
        !(idn.bossPairs > 0)
      )
        throw new Error(
          `experiments/acts/identity/${spec.key}.json: not a passing design check of ${spec.arm} against S (${AC.adr} item 5 stops the study)`,
        );
      for (const m of test.members)
        for (const side of [m.a, m.b])
          if (idn.contentSha256?.[side.batchId] !== side.contentSha256)
            throw new Error(
              `experiments/acts/identity/${spec.key}.json: it was not made from the content of ${side.batchId}`,
            );
    }
    const ver = verification.files?.[spec.file];
    if (
      !ver ||
      ver.sha256 !== shaOf(file) ||
      !Array.isArray(ver.exactProblems) ||
      ver.exactProblems.length !== 0 ||
      !(ver.exactChecks > 0)
    )
      throw new Error(
        `experiments/acts/verification.json: no passing recomputation of ${spec.file} (every exact check has to agree with the episodes; ${AC.adr} item 10)`,
      );
    const reading = readingOf({
      armOnly: tab.a_only,
      baselineOnly: tab.b_only,
      p: tab.mcnemar_p,
      ci: cl.ciAtLevel.ci,
      robust: rb,
      excludedFraction,
    });
    return {
      key: spec.key,
      arm: spec.arm,
      acts: spec.acts,
      file: `experiments/acts/${spec.file}`,
      sha256: shaOf(file),
      pairs: test.bothCompleted,
      pairedSeeds: test.pairedSeeds,
      excluded: test.excludedNotCompleted,
      notFinished: test.notFinished,
      shares,
      wins: { arm: w.a, baseline: w.b },
      difference: cl.meanAMinusB,
      ci: cl.ciAtLevel.ci,
      ci95: cl.ci95,
      armOnly: tab.a_only,
      baselineOnly: tab.b_only,
      p: tab.mcnemar_p,
      verdict: reading.verdict,
      primaryVerdict: reading.primary,
      downgrade: reading.downgrade,
      downgrades: reading.downgrades,
      excludedFraction,
      verification: {
        exactChecks: ver.exactChecks,
        bootstrapChecks: ver.bootstrapChecks,
        // the resample's disagreements about an interval end: the pooled file's interval governs, the disagreement is shown and decides nothing
        bootstrapDisagreements: ver.bootstrapDisagreements ?? [],
      },
      robust: {
        pairs: rb.pairs,
        notCompleted: rb.notCompleted,
        wins: { arm: rb.arm, baseline: rb.baseline },
        shares: { arm: rb.arm / rb.pairs, baseline: rb.baseline / rb.pairs },
        difference: rb.difference,
        armOnly: rb.armOnly,
        baselineOnly: rb.baselineOnly,
        p: rb.p,
      },
      // secondary, uncorrected: how far the arm's runs get (the price at the first boss, the reach at the second)
      actOne: {
        shares: { arm: test.reachedAct2.a.rate, baseline: test.reachedAct2.b.rate },
        armOnly: test.reachedAct2.pairedTable.a_only,
        baselineOnly: test.reachedAct2.pairedTable.b_only,
        p: test.reachedAct2.pairedTable.mcnemar_p,
      },
      actTwo: {
        shares: { arm: test.reachedAct3.a.rate, baseline: test.reachedAct3.b.rate },
        armOnly: test.reachedAct3.pairedTable.a_only,
        baselineOnly: test.reachedAct3.pairedTable.b_only,
        p: test.reachedAct3.pairedTable.mcnemar_p,
      },
      floorDifference: test.floorDifference,
      perClass,
    };
  };
  const results = Object.fromEntries(TESTS.map((t) => [t.key, readOne(t)]));
  if (heads.size !== 1)
    throw new Error(
      `the held-out batches were played from ${String(heads.size)} different commits (${AC.adr} item 9 has one)`,
    );
  out.tests = { results };
  return out;
}

/** One class on its own at the class level (uncorrected): which arm is ahead and whether the exact p is below it. */
function verdictClass(tab) {
  if (tab.mcnemar_p >= AC.classLevel || tab.a_only === tab.b_only) return "level";
  return tab.a_only > tab.b_only ? "arm" : "baseline";
}
