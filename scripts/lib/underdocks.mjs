import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CLASSES, EXACT, closeP, commonBatchProblem, mcnemarExact, readPooledHeldOut } from "./pooled.mjs";

// ---- The Underdocks transfer study (ADR-064): three held-out tests of results measured in Act 1's Overgrowth, nothing refitted ------------------
// Each is a pooled paired test of five classes in Underdocks at Ascension 0 with the relics kept, the first arm against the second, read at
// 0.05 / 3 (the study-wise level split over the three) and run once. Until the three pooled files exist the output says that the study is
// registered and carries its precondition; with them it carries each test as it came out, the reading rule (passed / not shown / reversed)
// applied to the numbers (a result is passed or reversed only if the all-pairs analysis agrees and the primary test dropped at most a tenth of
// the pairs: `robustness-all-pairs.json`, ADR-064 item 5), the size beside the Overgrowth difference of the twin pair (ADR-064 item 5), and for the opening-relic rule which
// classes' own Underdocks games licence a named relic (p below 0.01, the rule ahead; item 6 iii). The batches of the study live apart from
// `experiments/batches` (`experiments/underdocks/batches`), their twins in Overgrowth are earlier studies' batches on the same seeds.
const UD = { level: 0.05 / 3, classLevel: 0.01, seeds: 2000, adr: "ADR-064", robustLevel: 0.05, maxExcludedFraction: 0.1 };
const near = (x, y, tol = 1e-9) => Math.abs(x - y) <= tol * Math.max(1, Math.abs(y));
const UD_NEOW_VALUES = "experiments/neow/neow-values-keep-v1.json";
const UD_NEOW_SHA = "cb9f166754f410558eb33bbb79a35152ff1e69f595dfb3729ad2435c7ef496d8";
// the pooled difference is read with the whole-seed bootstrap interval at the level the test is read at (`slay2_sim pool --confidence`)
const UD_CI_LEVEL = 1 - UD.level;
const SEEDS_FILE = "experiments/seeds/ironclad-a0-v2.json";
const BOSSES = ["LagavulinMatriarchBoss", "SoulFyshBoss", "WaterfallGiantBoss"];
// the Overgrowth test of the same two arms, in the same game otherwise (Ascension 0, the relics kept, the same `val` seeds), read for the size words
const OVERGROWTH_TWINS = {
  synergy: { file: "experiments/synergy/keep-val/pooled-astar-vs-d0star.json", adr: "ADR-054", policies: ["advisor_v1", "advisor_v1"] },
  values: { file: "experiments/ascension9/pooled-a0keep-t2-values-shown-vs-rules_v1.json", adr: "ADR-058", policies: ["rules_v2", "rules_v1"] },
  neow: {
    file: "experiments/neow/pooled-neow-values-keep-v1-vs-rules_v2-keeprelics-val.json",
    adr: "ADR-055",
    policies: ["rules_v2_neow_values", "rules_v2"],
  },
};
const UD_TESTS = [
  {
    key: "synergy",
    file: "pooled-ud-t1-synergy-astar-vs-d0star.json",
    names: ["astar", "d0star"],
    arms: ["advisor_v1-astar", "advisor_v1-d0star"],
    // the parameters of the one policy the two arms may differ in (nothing else in their effective parameters may)
    differ: ["synergy"],
  },
  {
    key: "values",
    file: "pooled-ud-t2-values-shown-vs-rules_v1.json",
    names: ["shown", "rules_v1"],
    arms: ["rules_v2-shownvals", "rules_v1"],
    // two policies: what they are is checked arm by arm, and the game they were played in below
    differ: null,
  },
  {
    key: "neow",
    file: "pooled-ud-t3-neow-keep-v1-vs-rules_v2.json",
    names: ["neow", "base"],
    arms: ["rules_v2_neow_values-keepvals", "rules_v2"],
    differ: ["neow_values", "neow_values_sha256"],
  },
];

/**
 * @param {{root: string, reports: object[], udReports: object[], synergyChoice: () => object}} args
 *   `reports` are the batches of `experiments/batches` (the Overgrowth twins), `udReports` those of `experiments/underdocks/batches`.
 */
export function parseUnderdocks({ root, reports, udReports, synergyChoice }) {
  const dir = join(root, "experiments", "underdocks");
  const batchesDir = join(dir, "batches");
  const decisionLog = join(root, "docs", "DECISIONS.md");
  const decisions = existsSync(decisionLog) ? readFileSync(decisionLog, "utf8") : "";
  const at = decisions.indexOf(`${UD.adr}: do the three results`);
  if (at < 0) {
    if (existsSync(dir))
      throw new Error(`experiments/underdocks exists but docs/DECISIONS.md has no ${UD.adr}`);
    return { registered: false };
  }
  // what the registration quotes: the hash of every file an arm reads, in the text of this record (up to the next one: a hash quoted in a
  // later record is not the registration's; the preflight reads the same stretch)
  const next = decisions.indexOf("\n## ", at);
  const record = decisions.slice(at, next < 0 ? undefined : next);
  const read = (name) => JSON.parse(readFileSync(join(dir, name), "utf8"));
  const shaOf = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
  if (!existsSync(join(dir, "precondition.json")))
    return { adr: UD.adr, registered: true, precondition: null, tests: null };
  const pre = read("precondition.json");
  if (pre.kind !== "underdocks-precondition" || pre.schema !== 1 || pre.passed !== true)
    throw new Error("experiments/underdocks/precondition.json: not a passed precondition");
  const preGames = Object.values(pre.arms).reduce(
    (n, a) => n + Object.values(a.classes).reduce((m, c) => m + c.games, 0),
    0,
  );
  const out = {
    adr: UD.adr,
    registered: true,
    level: UD.level,
    classLevel: UD.classLevel,
    seeds: UD.seeds,
    precondition: {
      file: "experiments/underdocks/precondition.json",
      sha256: shaOf(join(dir, "precondition.json")),
      games: preGames,
      pooledShownValues: pre.pooledShownValues,
    },
    tests: null,
  };
  const present = UD_TESTS.filter((x) => existsSync(join(dir, x.file)));
  const robPath = join(dir, "robustness-all-pairs.json");
  if (present.length === 0) {
    if (existsSync(robPath))
      throw new Error(
        `experiments/underdocks/robustness-all-pairs.json exists but the pooled tests do not: ${UD.adr} runs them together, once`,
      );
    return out;
  }
  if (present.length !== UD_TESTS.length)
    throw new Error(
      `experiments/underdocks has ${present.map((x) => x.file).join(", ")} but not the others: ${UD.adr} runs the three tests together, once`,
    );

  // every file an arm reads is one the registration quotes, and every arm's manifest shows it was that file
  const quoted = (file) => {
    const sha = shaOf(join(root, file));
    if (!record.includes(sha))
      throw new Error(`${file}: its SHA-256 (${sha}) is not quoted in ${UD.adr}`);
    return sha;
  };
  const byId = new Map(udReports.map((r) => [r.id, r]));
  const manifests = new Map();
  const manifestOf = (id) => {
    if (!manifests.has(id))
      manifests.set(id, JSON.parse(readFileSync(join(batchesDir, id, "manifest.json"), "utf8")));
    return manifests.get(id);
  };
  const effective = (id) => manifestOf(id).policy?.effective?.params ?? {};
  // a value as one string with the keys of every object in order, so that two parameter sets are equal when they say the same
  const canonical = (v) =>
    JSON.stringify(v, (_k, x) =>
      x && typeof x === "object" && !Array.isArray(x)
        ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]))
        : x,
    );
  const choice = synergyChoice();
  const heads = new Set();
  const clean = (r) => {
    const env = manifestOf(r.id).environment?.slay2 ?? {};
    heads.add(env.head);
    return env.dirty === false
      ? null
      : `it was played from a working tree with uncommitted changes (${UD.adr} asks for a clean checkout)`;
  };
  const sets = JSON.parse(readFileSync(join(root, "experiments", "cardvalue", "site-sets.json"), "utf8")).sets;
  const shownFile = (cls) => {
    const entries = sets.filter((e) => e.file.startsWith(`${cls}-a0-`));
    if (entries.length !== 1)
      throw new Error(`experiments/cardvalue/site-sets.json lists ${entries.length} sets for ${cls}`);
    return `experiments/cardvalue/${entries[0].file}`;
  };
  // the pilot's card values in the baseline of the opening-relic test: Ironclad the policy's default file, the others the first sets (ADR-055 item 4)
  const baseFile = (cls) => `experiments/cardvalue/${cls}-a0-v1.json`;
  const follows = (current, file) => {
    const e = effective(current.id);
    if (current.policyParams?.threshold !== 0 || e.threshold !== 0) return false;
    if (e.values !== file || e.values_sha256 !== quoted(file)) return false;
    // the baseline of Ironclad names no file: it follows the policy's default one
    const asked = current.policyParams?.values;
    return asked === file || (asked === undefined && file === "experiments/cardvalue/ironclad-a0-v1.json");
  };
  const armProblem = (current, name, cls) => {
    const e = effective(current.id);
    switch (name) {
      case "astar":
        return current.policy !== "advisor_v1"
          ? `its policy is ${current.policy}`
          : !(
                e.synergy === 1 &&
                e.margin === 0 &&
                e.relics === false &&
                e.size === undefined &&
                e.size_from === undefined &&
                ["needs", "scalers", "engines"].every((k) => e[k] === choice.config[k])
              ) || choice.margin !== 0
            ? "its parameters are not those of A* (ADR-050 addendum D) at version 1's price of a slot"
            : clean(current);
      case "d0star":
        return current.policy !== "advisor_v1"
          ? `its policy is ${current.policy}`
          : !(e.synergy === 0 && e.margin === 0 && e.relics === false && e.size === undefined && e.size_from === undefined)
            ? "it is not the index without the synergy term at margin 0 and version 1's price of a slot"
            : clean(current);
      case "shown":
        return current.policy !== "rules_v2"
          ? `its policy is ${current.policy}`
          : !follows(current, shownFile(cls))
            ? `it does not follow ${shownFile(cls)} at threshold 0, the file the site shows`
            : clean(current);
      case "rules_v1":
        return current.policy !== "rules_v1"
          ? `its policy is ${current.policy}`
          : Object.keys(current.policyParams ?? {}).length !== 0
            ? "rules_v1 takes no parameters"
            : clean(current);
      case "neow":
        return current.policy !== "rules_v2_neow_values"
          ? `its policy is ${current.policy}`
          : e.neow_values !== UD_NEOW_VALUES || e.neow_values_sha256 !== UD_NEOW_SHA
            ? `it does not follow ${UD_NEOW_VALUES} (${UD_NEOW_SHA.slice(0, 8)}…)`
            : !follows(current, baseFile(cls))
              ? `its card values are not ${baseFile(cls)}`
              : clean(current);
      case "base":
        return current.policy !== "rules_v2"
          ? `its policy is ${current.policy}`
          : !follows(current, baseFile(cls))
            ? `its card values are not ${baseFile(cls)}`
            : clean(current);
      default:
        return `unknown arm ${name}`;
    }
  };
  quoted(UD_NEOW_VALUES);
  // what item 10 asks of every batch (the run checks it as it goes; it is read again from the batch's own manifest and the exporter's counts)
  let seedsSha;
  const validityProblem = (r) => {
    if (!r.counts || typeof r.counts !== "object") return "its report has no counts of how its games ended";
    const bad = ["aborted", "harness_error", "policy_error", "invalid_action"].reduce(
      (n, k) => n + (r.counts[k] ?? 0),
      0,
    );
    if (bad > 0)
      return `${String(bad)} of its games ended in an abort, a harness error, a policy error or an invalid action (${UD.adr} item 10)`;
    if (!(r.completed >= 0.9 * UD.seeds))
      return `only ${String(r.completed)} of its ${String(UD.seeds)} games completed (${UD.adr} item 10 asks for 90 %)`;
    const m = manifestOf(r.id);
    const sim = m.simulator ?? {};
    if (sim.pin_ok !== true || sim.dirty !== false)
      return "it was not played with the pinned, clean simulator";
    seedsSha ??= shaOf(join(root, SEEDS_FILE));
    const seeds = m.seeds ?? {};
    if (
      seeds.file !== SEEDS_FILE ||
      seeds.file_sha256 !== seedsSha ||
      seeds.sealed_partition_used !== false
    )
      return `its seeds are not those of ${SEEDS_FILE} (the val partition, the sealed one untouched)`;
    // Act 1 in Underdocks, and nothing else of the game changed from the Overgrowth twin
    if (m.config?.act1 !== "underdocks") return "it was not played with Act 1 in Underdocks";
    return null;
  };
  // the games of each pooled file are the ones the study's script names: <arm>-<class>-a0-veteran-keeprelics-underdocks-val-n2000
  const readTest = (spec) => {
    const test = readPooledHeldOut({
      where: `experiments/underdocks/${spec.file}`,
      path: join(dir, spec.file),
      names: spec.names,
      seeds: UD.seeds,
      byId,
      ascension: 0,
      check: (current, name, cls) =>
        commonBatchProblem(current, cls, { seeds: UD.seeds, keepRelics: true, adr: UD.adr, ascension: 0 }) ??
        validityProblem(current) ??
        armProblem(current, name, cls),
    });
    spec.names.forEach((name, i) => {
      for (const m of test.members) {
        const side = i === 0 ? m.a.batchId : m.b.batchId;
        const want = `${spec.arms[i]}-${m.character}-a0-veteran-keeprelics-underdocks-val-n2000`;
        if (side !== want)
          throw new Error(`experiments/underdocks/${spec.file}: ${m.character} ${name} is ${side}, not ${want}`);
      }
    });
    // the two arms of a class differ in the one thing under test (ADR-064 items 2 and 9): the game they were played in, the seeds and the
    // simulator are the same, and two arms of one policy have the same effective parameters but the ones the test is about
    for (const m of test.members) {
      const [a, b] = [manifestOf(m.a.batchId), manifestOf(m.b.batchId)];
      for (const part of ["config", "seeds", "simulator"]) {
        if (canonical(a[part]) !== canonical(b[part]))
          throw new Error(
            `experiments/underdocks/${spec.file}: ${m.character}: the two arms differ in their ${part}, and ${UD.adr} has them differ in one thing`,
          );
      }
      if (spec.differ) {
        const rest = (batchId) =>
          Object.fromEntries(
            Object.entries(effective(batchId)).filter(([k]) => !spec.differ.includes(k)),
          );
        const [pa, pb] = [rest(m.a.batchId), rest(m.b.batchId)];
        if (canonical(pa) !== canonical(pb)) {
          const keys = [...new Set([...Object.keys(pa), ...Object.keys(pb)])].filter(
            (k) => canonical(pa[k]) !== canonical(pb[k]),
          );
          throw new Error(
            `experiments/underdocks/${spec.file}: ${m.character}: the two arms differ in ${keys.join(", ")}, not only in ${spec.differ.join(" and ")} (${UD.adr} items 2 and 9)`,
          );
        }
      }
    }
    return { file: `experiments/underdocks/${spec.file}`, sha256: shaOf(join(dir, spec.file)), ...test };
  };
  // each class on its own at the class level (uncorrected): the rule ahead or the other arm ahead (ADR-064 item 6 iii and v)
  const classesOf = (test) =>
    Object.fromEntries(
      test.members.map((m) => {
        const own = m.reachedAct2.pairedTable;
        const significant = own.mcnemar_p < UD.classLevel;
        return [
          m.character,
          {
            aOnly: own.a_only,
            bOnly: own.b_only,
            p: own.mcnemar_p,
            ahead: significant && own.a_only > own.b_only,
            behind: significant && own.b_only > own.a_only,
          },
        ];
      }),
    );
  // the whole-seed interval at the registered level, which the pooled file must carry (the plain test treats the five classes' games of one seed as independent pairs)
  const levelInterval = (test) => {
    const level = test.clusteredDifference?.ciAtLevel;
    if (
      !level ||
      typeof level.level !== "number" ||
      Math.abs(level.level - UD_CI_LEVEL) > 1e-9 ||
      !Array.isArray(level.ci) ||
      level.ci.length !== 2 ||
      !(level.ci[0] <= test.clusteredDifference.meanAMinusB && test.clusteredDifference.meanAMinusB <= level.ci[1])
    )
      throw new Error(
        `${test.file}: no whole-seed interval at level ${UD_CI_LEVEL.toFixed(6)} (run slay2_sim pool with --confidence)`,
      );
    return level.ci;
  };

  // the numbers the pages print are numbers, the intervals are intervals, and the pooled difference is the one the table of pairs gives
  const finite = (x) => typeof x === "number" && Number.isFinite(x);
  const interval = (ci) =>
    Array.isArray(ci) && ci.length === 2 && ci.every(finite) && ci[0] <= ci[1];
  const soundNumbers = (test) => {
    const d = test.clusteredDifference;
    const tab = test.reachedAct2.pairedTable;
    if (
      !finite(d?.meanAMinusB) ||
      !interval(d.ci95) ||
      !finite(test.floorDifference?.meanAMinusB) ||
      !interval(test.floorDifference?.ci95)
    )
      throw new Error(`${test.file}: a pooled difference is not a number, or an interval is not one`);
    const fromTable = (tab.a_only - tab.b_only) / test.bothCompleted;
    if (Math.abs(d.meanAMinusB - fromTable) > 1e-9)
      throw new Error(
        `${test.file}: the pooled difference (${String(d.meanAMinusB)}) is not the one its table of pairs gives (${String(fromTable)})`,
      );
  };

  // the all-pairs analysis (robustness.py, run by pool.sh): a condition of the reading rule, checked against the pooled file it goes with
  if (!existsSync(robPath))
    throw new Error(
      `experiments/underdocks/robustness-all-pairs.json is missing: the all-pairs analysis is a condition of the reading rule (${UD.adr} item 5)`,
    );
  const robustness = JSON.parse(readFileSync(robPath, "utf8"));
  if (
    robustness.kind !== "underdocks-robustness" ||
    robustness.schema !== 1 ||
    canonical(Object.keys(robustness.tests ?? {}).sort()) !== canonical(UD_TESTS.map((t) => t.key).sort())
  )
    throw new Error(
      "experiments/underdocks/robustness-all-pairs.json: not the all-pairs analysis of the three tests",
    );
  const robustnessOf = (spec, test) => {
    const where = "experiments/underdocks/robustness-all-pairs.json";
    const entry = robustness.tests[spec.key];
    if (!entry || entry.arm !== spec.arms[0] || entry.baseline !== spec.arms[1])
      throw new Error(`${where}: no analysis of test ${spec.key} for ${spec.arms[0]} against ${spec.arms[1]}`);
    const rb = entry.pooled;
    const sumOf = (k) => CLASSES.reduce((n, c) => n + entry.perClass[EXACT[c]][k], 0);
    for (const k of ["shared", "primaryPairs", "pairs", "armOnly", "baselineOnly", "arm", "baseline"])
      if (sumOf(k) !== rb[k])
        throw new Error(`${where}: test ${spec.key}: the classes' ${k} do not add up to the pooled one`);
    if (!closeP(mcnemarExact(rb.armOnly, rb.baselineOnly), rb.p))
      throw new Error(`${where}: test ${spec.key}: its p is not the exact McNemar p of its counts`);
    if (rb.shared !== test.pairedSeeds || rb.primaryPairs !== test.bothCompleted)
      throw new Error(`${where}: test ${spec.key}: it does not count the pairs of ${test.file}`);
    if (rb.pairs !== rb.shared || !near(rb.difference, (rb.arm - rb.baseline) / rb.pairs))
      throw new Error(`${where}: test ${spec.key}: its counts do not add up`);
    // every game the primary test saw past the boss is one of these (the all-pairs count keeps the games that ended in an error after it)
    if (rb.arm < test.reachedAct2.a.games || rb.baseline < test.reachedAct2.b.games)
      throw new Error(`${where}: test ${spec.key}: it has fewer games past the boss than the pairs both arms completed`);
    for (const [who, row] of [["pooled", rb], ...CLASSES.map((c) => [EXACT[c], entry.perClass[EXACT[c]]])])
      if (row.armOnly - row.baselineOnly !== row.arm - row.baseline)
        throw new Error(
          `${where}: test ${spec.key}: ${who}: the discordant pairs are not the difference of the two arms' counts`,
        );
    for (const m of test.members)
      for (const side of [m.a, m.b])
        if (robustness.contentSha256?.[side.batchId] !== side.contentSha256)
          throw new Error(`${where}: test ${spec.key}: it was not made from the content of ${side.batchId}`);
    if (!near(rb.primaryExcludedFraction, 1 - test.bothCompleted / test.pairedSeeds))
      throw new Error(`${where}: test ${spec.key}: its excluded share is not the pooled file's`);
    return rb;
  };

  const tests = {};
  for (const spec of UD_TESTS) {
    const test = readTest(spec);
    const tab = test.reachedAct2.pairedTable;
    soundNumbers(test);
    const [lo, hi] = levelInterval(test);
    const significant = tab.mcnemar_p < UD.level;
    // the reading rule of ADR-064 item 5, a partition of the outcomes: the primary test says passed or reversed on the pairs both games completed
    // (the exact pooled p below the level, one arm ahead, the whole-seed interval at that level excluding zero) ...
    const primary =
      significant && tab.a_only > tab.b_only && lo > 0
        ? "passed"
        : significant && tab.b_only > tab.a_only && hi < 0
          ? "reversed"
          : "not-shown";
    // ... and it counts only if the all-pairs analysis has the same arm ahead at an exact p below 0.05 and the primary dropped at most a tenth of the pairs
    const rb = robustnessOf(spec, test);
    const excludedFraction = 1 - test.bothCompleted / test.pairedSeeds;
    const downgrades = [];
    if (primary !== "not-shown") {
      if (excludedFraction > UD.maxExcludedFraction) downgrades.push("excluded");
      const ahead = primary === "passed" ? rb.armOnly > rb.baselineOnly : rb.baselineOnly > rb.armOnly;
      if (!(rb.p < UD.robustLevel && ahead)) downgrades.push("robustness");
    }
    const verdict = primary !== "not-shown" && downgrades.length === 0 ? primary : "not-shown";
    tests[spec.key] = {
      verdict,
      primary,
      withheld: downgrades[0] ?? null,
      downgrades,
      allPairs: {
        pairs: rb.pairs,
        aOnly: rb.armOnly,
        bOnly: rb.baselineOnly,
        aRate: rb.arm / rb.pairs,
        bRate: rb.baseline / rb.pairs,
        p: rb.p,
        difference: rb.difference,
        excludedFraction: rb.primaryExcludedFraction,
      },
      ...test,
      classes: classesOf(test),
    };
  }
  if (heads.size !== 1 || ![...heads].every((h) => /^[0-9a-f]{40}$/.test(String(h))))
    throw new Error(
      `the arms of the tests were not all played from one commit (heads: ${[...heads].join(", ")})`,
    );

  // the Overgrowth difference of the same arms, set beside each Underdocks result (ADR-064 item 5, size): the earlier studies' pooled files, on
  // the same val seeds, with the relics kept, in Act 1's Overgrowth
  const reference = (key) => {
    const spec = OVERGROWTH_TWINS[key];
    const path = join(root, spec.file);
    // a passed result is told how big it is beside the Overgrowth one (item 5): without that file there is nothing to say it with
    if (!existsSync(path))
      throw new Error(`${spec.file}: the Overgrowth test ${spec.adr} that ${key} is set beside is missing`);
    const r = JSON.parse(readFileSync(path, "utf8"));
    if (
      r.kind !== "pooled-paired-comparison" ||
      r.cohort?.ascension !== 0 ||
      r.cohort?.partition !== "val" ||
      r.role !== "held-out" ||
      typeof r.clusteredDifference?.meanAMinusB !== "number"
    )
      throw new Error(`${spec.file}: not the held-out Ascension 0 test ${spec.adr} read in Overgrowth`);
    if (r.policies?.a !== spec.policies[0] || r.policies?.b !== spec.policies[1])
      throw new Error(`${spec.file}: its arms are ${r.policies?.a} and ${r.policies?.b}, not the arms of ${key}`);
    // it is an Overgrowth pooled file: none of its batches names an Act 1 other than the default (they are batches of experiments/batches)
    const twinIds = new Set(reports.map((x) => x.id));
    for (const m of r.members ?? []) {
      for (const side of [m.a?.batchId, m.b?.batchId])
        if (!twinIds.has(side)) throw new Error(`${spec.file}: batch ${side} is not a batch of experiments/batches`);
    }
    return {
      file: spec.file,
      adr: spec.adr,
      mean: r.clusteredDifference.meanAMinusB,
      ci95: r.clusteredDifference.ci95,
      a: r.reachedAct2.a.rate,
      b: r.reachedAct2.b.rate,
      bothCompleted: r.bothCompleted,
    };
  };
  for (const key of Object.keys(tests)) {
    const og = reference(key);
    const t = tests[key];
    const [lo, hi] = t.clusteredDifference.ciAtLevel.ci;
    t.overgrowth = og;
    // "smaller", "larger" or "about the same" than in Overgrowth (by the interval at the level of the test, item 5), only for a test that passed
    t.size =
      t.verdict === "passed"
        ? hi < og.mean
          ? "smaller"
          : lo > og.mean
            ? "larger"
            : "about-the-same"
        : null;
  }
  return { ...out, tests, heads: [...heads], bosses: BOSSES };
}
