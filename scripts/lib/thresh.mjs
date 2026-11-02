import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { EXACT, closeP, commonBatchProblem, mcnemarExact, readPooledHeldOut } from "./pooled.mjs";

// ---- The threshold study (ADR-062): does the Act-2 pickiness result hold on seeds nobody has played, and is another threshold better? ------------------
// Two stages. A development screen: S (the shown-values pilot) and six thresholds of the card reward of Act 2 only, each in Ironclad and Defect, on the 3,000
// dev2 seeds of each class; a registered rule picks the threshold with the largest net wins against S and advances it (or not) to the held-out stage. The
// held-out stage: T1 (the threshold 0.2 against S, the replication of ADR-061's Act-2 test) and, if the screen advanced a threshold, T2 (the choice against S)
// and T3 (the choice against 0.2), each a pooled paired test of two classes on the 15,000 val3 seeds of each class, read at 0.05 divided by the number of
// tests played, run once. Until the files exist the output carries the stage the study is at: registered; screened (development numbers only); tested.
//
// This file and pooled.mjs are the reading code that part 2 of the record freezes before the first held-out game. The reading rule below is item 5 of the
// record, written again here on purpose (it is not imported from the reader of the earlier study).
export const TH = {
  adr: "ADR-062",
  headline: "does the Act-2 pickiness result hold on seeds nobody has played",
  classes: ["ironclad", "defect"],
  studyLevel: 0.05,
  classLevel: 0.01,
  maxExcludedFraction: 0.1,
  robustLevel: 0.05,
  headLevel: 0.2,
  devSeeds: 3000,
  devPartition: "dev2",
  seeds: 15000,
  partition: "val3",
  seedsFile: "experiments/seeds/ironclad-a0-v4.json",
  replication: "t020",
  lateAct: 1,
  markerOne: "Registration of ADR-062 (part 1, frozen choices)",
  markerTwo: "Frozen choices of ADR-062 (part 2)",
};
// the thresholds of the card reward of Act 2, in the order of the grid (the order is the tie-break: a tie goes to the smaller threshold)
export const GRID = { t010: 0.1, t020: 0.2, t030: 0.3, t045: 0.45, t060: 0.6, tnone: 100 };
const TAGS = Object.keys(GRID);

/** The choice of the screen: the largest net wins; a tie goes to the smaller threshold. `nets` maps tag -> net wins. */
export function bestOf(nets) {
  let best = null;
  for (const tag of TAGS) if (best === null || nets[tag] > nets[best]) best = tag;
  return best;
}

/** The advance rule of item 3, written again: the net is above zero, the choice is not 0.2, and in the head-to-head it is ahead with an exact p below 0.20. */
export function advanceOf(best, net, head) {
  if (!(net > 0)) return false;
  if (best === TH.replication) return false;
  if (!head) throw new Error("the head-to-head against 0.2 is needed to apply the rule");
  return head.armOnly > head.baselineOnly && head.p < TH.headLevel;
}

/** The held-out tests the selection leaves: T1 always, T2 and T3 when the choice advanced. */
export function testsOf(choice) {
  const out = [{ key: "T1", arm: TH.replication, baseline: "s" }];
  if (choice.advance) {
    out.push({ key: "T2", arm: choice.arm, baseline: "s" });
    out.push({ key: "T3", arm: choice.arm, baseline: TH.replication });
  }
  return out;
}

/** The reading rule of item 5 applied to the numbers of the registered primary test alone (the order of the arguments is the arm's, then the baseline's). */
export function verdictOf({ armOnly, baselineOnly, p, ci, level }) {
  const [lo, hi] = ci;
  if (p < level && armOnly > baselineOnly && lo > 0) return "passed";
  if (p < level && baselineOnly > armOnly && hi < 0) return "reversed";
  return "not-shown";
}

/**
 * The whole reading (item 5): a result is "passed" or "reversed" only if the primary test says so AND the all-pairs analysis (every pair of seeds both arms hold,
 * a game that did not end in a win scored as not a win) has the same arm ahead at an exact p below 0.05 AND the primary dropped at most a tenth of the pairs.
 * Anything else is "not-shown"; `downgrades` lists every condition that withheld it ("excluded", "robustness"), `downgrade` the first.
 */
export function readingOf({ armOnly, baselineOnly, p, ci, level, robust, excludedFraction }) {
  const primary = verdictOf({ armOnly, baselineOnly, p, ci, level });
  if (primary === "not-shown")
    return { verdict: "not-shown", primary, downgrade: null, downgrades: [] };
  const downgrades = [];
  if (excludedFraction > TH.maxExcludedFraction) downgrades.push("excluded");
  const ahead =
    primary === "passed"
      ? robust.armOnly > robust.baselineOnly
      : robust.baselineOnly > robust.armOnly;
  if (!(robust.p < TH.robustLevel && ahead)) downgrades.push("robustness");
  if (downgrades.length > 0)
    return { verdict: "not-shown", primary, downgrade: downgrades[0], downgrades };
  return { verdict: primary, primary, downgrade: null, downgrades: [] };
}

/** A pass whose interval's lower end is under a quarter of the difference is a narrow pass (item 5). */
export function isNarrow({ verdict, difference, ci }) {
  return verdict === "passed" && ci[0] < difference / 4;
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
const sameSet = (a, b) => canonical([...a].sort()) === canonical([...b].sort());
const levelLabel = (n) => `0.05 / ${String(n)}`;

/**
 * Reads the study from the repository at `root` and the exporter's batch `reports`. `sizes` ({dev, val}: the games in a batch of each stage) is for the tests,
 * which play no game and build batches of a few hundred records; the exporter never passes it and the registered sizes are those of `TH`. The names of the
 * batches carry the registered sizes whatever `sizes` says.
 */
export function parseThresh({ root, reports, sizes }) {
  const nDev = sizes?.dev ?? TH.devSeeds;
  const nVal = sizes?.val ?? TH.seeds;
  const decisionLog = join(root, "docs", "DECISIONS.md");
  const decisions = existsSync(decisionLog) ? readFileSync(decisionLog, "utf8") : "";
  const at = decisions.indexOf(`${TH.adr}: ${TH.headline}`);
  const thDir = join(root, "experiments", "thresh");
  const files = ["T1", "T2", "T3"].map((k) => [k, join(thDir, `pooled-thresh-${k}.json`)]);
  const present = files.filter(([, f]) => existsSync(f));
  const selPath = join(thDir, "dev-selection.json");
  const others = [
    "robustness-all-pairs.json",
    "verification.json",
    "identity",
    "per-class",
  ].filter((f) => existsSync(join(thDir, f)));
  if (at < 0) {
    if (present.length > 0 || existsSync(selPath) || others.length > 0)
      throw new Error(`threshold study files exist but docs/DECISIONS.md has no ${TH.adr}`);
    return { registered: false };
  }
  const next = decisions.indexOf("\n## ", at);
  const record = decisions.slice(at, next < 0 ? undefined : next);
  const count = (text) => record.split(text).length - 1;
  const one = count(TH.markerOne);
  const two = count(TH.markerTwo);
  if (one > 1)
    throw new Error(
      `${TH.adr} carries the text "${TH.markerOne}" ${String(one)} times; the registration heading occurs once`,
    );
  if (two > 1)
    throw new Error(
      `${TH.adr} carries the text "${TH.markerTwo}" ${String(two)} times; the heading of part 2 occurs once`,
    );
  const out = {
    adr: TH.adr,
    registered: true,
    frozen: one === 1,
    partTwo: two === 1,
    studyLevel: TH.studyLevel,
    classLevel: TH.classLevel,
    seeds: TH.seeds,
    devSeeds: TH.devSeeds,
    stage: "registered",
    screen: null,
    tests: null,
  };
  if (!existsSync(selPath)) {
    if (present.length > 0 || others.length > 0)
      throw new Error(
        `experiments/thresh has held-out output but no dev-selection.json: the screen comes first (${TH.adr} item 3)`,
      );
    return out;
  }
  if (!out.frozen)
    throw new Error(
      `experiments/thresh/dev-selection.json exists but ${TH.adr} has no registration (${TH.markerOne})`,
    );
  if (!out.partTwo)
    throw new Error(
      `experiments/thresh/dev-selection.json exists but ${TH.adr} has no part 2 (${TH.markerTwo}): the frozen choices are written before any held-out game`,
    );

  // ---- the files an arm reads, and the batches --------------------------------------------------------------------------------------------
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
      throw new Error(`${file}: its SHA-256 (${sha}) is not quoted in ${TH.adr}`);
    return sha;
  };
  for (const cls of TH.classes) quoted(shownFile(cls));
  const seedsSha = quoted(TH.seedsFile);
  const selectionSha = quoted("experiments/thresh/dev-selection.json");

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
  const batchId = (stage, arm, cls) =>
    stage === "dev"
      ? `thresh-dev-${arm}-${cls}-a0-veteran-keeprelics-${TH.devPartition}-n${String(TH.devSeeds)}`
      : `thresh-val-${arm}-${cls}-a0-veteran-keeprelics-${TH.partition}-n${String(TH.seeds)}`;
  const heads = { dev: new Set(), val: new Set() };
  const validity = (stage, r) => {
    const n = stage === "dev" ? nDev : nVal;
    if (!r.counts || typeof r.counts !== "object")
      return "its report has no counts of how its games ended";
    const bad = ["aborted", "harness_error", "policy_error", "invalid_action"].reduce(
      (k, key) => k + (r.counts[key] ?? 0),
      0,
    );
    if (bad > 0)
      return `${String(bad)} of its games ended in an abort, a harness error, a policy error or an invalid action (${TH.adr} item 10)`;
    if (!(r.completed >= 0.9 * n))
      return `only ${String(r.completed)} of its ${String(n)} games completed (${TH.adr} item 10 asks for 90 %)`;
    const m = manifestOf(r.id);
    const env = m.environment?.slay2 ?? {};
    if (env.dirty !== false)
      return `it was played from a working tree with uncommitted changes (${TH.adr} asks for a clean checkout)`;
    heads[stage].add(env.head);
    const sim = m.simulator ?? {};
    if (sim.pin_ok !== true || sim.dirty !== false)
      return "it was not played with the pinned, clean simulator";
    const seeds = m.seeds ?? {};
    if (
      seeds.file !== TH.seedsFile ||
      seeds.file_sha256 !== seedsSha ||
      seeds.sealed_partition_used !== false
    )
      return `its seeds are not those of ${TH.seedsFile} (the ${stage === "dev" ? TH.devPartition : TH.partition} partition, the sealed one untouched)`;
    return null;
  };
  const follows = (current, cls) => {
    const e = effective(current.id);
    const file = shownFile(cls);
    return (
      e.threshold === 0 &&
      current.policyParams?.threshold === 0 &&
      current.policyParams?.values === file &&
      e.values === file &&
      e.values_sha256 === quoted(file)
    );
  };
  const armProblem = (current, arm, cls) => {
    const e = effective(current.id);
    const late = ["late_values", "late_values_sha256", "late_threshold", "late_acts"].some(
      (k) => k in e,
    );
    if (arm === "s")
      return current.policy !== "rules_v2"
        ? `its policy is ${current.policy}`
        : !follows(current, cls) || late
          ? `it is not rules_v2 with ${shownFile(cls)} at threshold 0`
          : null;
    if (!(arm in GRID)) return `${arm} is not a threshold of the grid`;
    if (current.policy !== "rules_v2_late") return `its policy is ${current.policy}`;
    if (!follows(current, cls) || canonical(e.late_acts) !== canonical([TH.lateAct]))
      return `it is not rules_v2_late on ${shownFile(cls)} with the late rule on Act 2 only`;
    return e.late_threshold === GRID[arm] && !("late_values" in e)
      ? null
      : `its threshold in Act 2 is not ${String(GRID[arm])}`;
  };
  const batchProblem = (stage, current, arm, cls) =>
    commonBatchProblem(current, cls, {
      seeds: stage === "dev" ? nDev : nVal,
      keepRelics: true,
      adr: TH.adr,
      ascension: 0,
      partition: stage === "dev" ? TH.devPartition : TH.partition,
    }) ??
    validity(stage, current) ??
    armProblem(current, arm, cls);
  const need = (stage, arm, cls) => {
    const id = batchId(stage, arm, cls);
    const current = byId.get(id);
    if (!current) throw new Error(`${TH.adr}: the batch ${id} is not an evidence batch`);
    const bad = batchProblem(stage, current, arm, cls);
    if (bad) throw new Error(`${TH.adr}: the batch ${id}: ${bad}`);
    return current;
  };

  // ---- the development screen: every number is checked against its own counts, and the rule is applied again -------------------------------------
  const sel = JSON.parse(readFileSync(selPath, "utf8"));
  if (sel.kind !== "thresh-dev-selection" || sel.schema !== 1)
    throw new Error("experiments/thresh/dev-selection.json: not a development selection of schema 1");
  if (
    sel.slice?.partition !== TH.devPartition ||
    sel.slice.n !== TH.devSeeds ||
    sel.slice.seedsFile !== TH.seedsFile ||
    canonical(sel.slice.classes) !== canonical(TH.classes.map((c) => EXACT[c])) ||
    sel.baseline !== "s" ||
    sel.designChecksPassed !== true ||
    typeof sel.role !== "string" ||
    !sel.role.startsWith("development")
  )
    throw new Error(
      "experiments/thresh/dev-selection.json: not the development screen of the registration (dev2, 3,000 seeds, Ironclad and Defect, design checks passed)",
    );
  if (!sameSet(Object.keys(sel.arms ?? {}), TAGS))
    throw new Error(
      `experiments/thresh/dev-selection.json: the arms are not the six thresholds of ${TH.adr}`,
    );
  const nets = {};
  const screenRows = {};
  for (const tag of TAGS) {
    const r = sel.arms[tag];
    const ctx = `experiments/thresh/dev-selection.json: ${tag}`;
    if (r.threshold !== GRID[tag]) throw new Error(`${ctx}: its threshold is not ${String(GRID[tag])}`);
    if (r.net !== r.armOnly - r.baselineOnly)
      throw new Error(`${ctx}: its net wins are not the arm-only minus the S-only wins`);
    if (r.wins.arm - r.wins.baseline !== r.net)
      throw new Error(`${ctx}: the net wins are not the difference of the two arms' wins`);
    if (!closeP(mcnemarExact(r.armOnly, r.baselineOnly), r.p))
      throw new Error(`${ctx}: its p is not the exact McNemar p of its counts`);
    if (
      !(r.pairs > 0) ||
      r.pairs + r.excluded !== TH.classes.length * nDev ||
      !near(r.shares.arm, r.wins.arm / r.pairs) ||
      !near(r.shares.baseline, r.wins.baseline / r.pairs) ||
      !near(r.difference, (r.wins.arm - r.wins.baseline) / r.pairs)
    )
      throw new Error(`${ctx}: its pairs, wins and shares do not add up`);
    if (
      r.identity?.beforeDifferent !== 0 ||
      r.identity.bossDifferent !== 0 ||
      !(r.identity.beforePairs > 0)
    )
      throw new Error(`${ctx}: not a passing design check against S (${TH.adr} item 6 stops the study)`);
    nets[tag] = r.net;
    screenRows[tag] = {
      tag,
      threshold: r.threshold,
      pairs: r.pairs,
      excluded: r.excluded,
      wins: r.wins,
      shares: r.shares,
      difference: r.difference,
      armOnly: r.armOnly,
      baselineOnly: r.baselineOnly,
      net: r.net,
      p: r.p,
      pastAct1Boss: r.pastAct1Boss,
      pastAct2Boss: r.pastAct2Boss,
      meanFloorDifference: r.meanFloorDifference,
      meanDeckSize: r.meanDeckSize ?? null,
    };
  }
  const best = bestOf(nets);
  if (sel.best?.arm !== best || sel.best.net !== nets[best] || sel.best.threshold !== GRID[best])
    throw new Error(
      `experiments/thresh/dev-selection.json: the largest net wins are ${best}'s (${String(nets[best])}) by the rule of item 3, not ${String(sel.best?.arm)}'s`,
    );
  let head = null;
  if (nets[best] > 0 && best !== TH.replication) {
    head = sel.headToHead;
    if (
      !head ||
      head.net !== head.armOnly - head.baselineOnly ||
      !closeP(mcnemarExact(head.armOnly, head.baselineOnly), head.p)
    )
      throw new Error(
        `experiments/thresh/dev-selection.json: the head-to-head of ${best} against 0.2 is missing or does not add up`,
      );
    if (head.net !== nets[best] - nets[TH.replication])
      throw new Error(
        "experiments/thresh/dev-selection.json: the head-to-head is not the difference of the two thresholds' net wins",
      );
  } else if (sel.headToHead !== null) {
    throw new Error(
      "experiments/thresh/dev-selection.json: a head-to-head is written where the rule reads none",
    );
  }
  const advance = advanceOf(best, nets[best], head);
  const choice = sel.choice;
  if (
    choice?.advance !== advance ||
    choice.arm !== (advance ? best : null) ||
    choice.threshold !== (advance ? GRID[best] : null) ||
    typeof choice.reason !== "string"
  )
    throw new Error(
      `experiments/thresh/dev-selection.json: the choice is not what the rule of item 3 gives (${advance ? `${best} advances` : "nothing advances"})`,
    );
  // the arms part 2 names are the arms the screen sent forward (S and 0.2 are always played and need not be named)
  const named = [...new Set([...record.matchAll(/(?:^|[^A-Za-z0-9_])ARM_([a-z0-9]+)/gm)].map((m) => m[1]))];
  const want = advance && best !== TH.replication ? [best] : [];
  if (!sameSet(named, want))
    throw new Error(
      `${TH.adr} part 2 names the arms '${named.join(" ")}'; the screen sent forward '${want.join(" ")}'`,
    );
  const devHeads = [...record.matchAll(/DEV_HEAD=([0-9a-f]{40})/g)].map((m) => m[1]);
  if (devHeads.length !== 1)
    throw new Error(`${TH.adr} part 2 has to quote the development commit once (DEV_HEAD=<sha>)`);
  // the development batches the screen was read from are the batches on disk, played from that commit
  for (const arm of ["s", ...TAGS])
    for (const cls of TH.classes) {
      const current = need("dev", arm, cls);
      if (sel.contentSha256?.[current.id] !== current.contentSha256)
        throw new Error(
          `experiments/thresh/dev-selection.json: it was not made from the content of ${current.id}`,
        );
    }
  if (heads.dev.size !== 1 || ![...heads.dev].every((h) => h === devHeads[0]))
    throw new Error(
      `the development batches were not all played from the commit part 2 quotes (${devHeads[0]})`,
    );
  const tests = testsOf(choice);
  const level = TH.studyLevel / tests.length;
  out.stage = "screened";
  out.level = level;
  out.devHead = devHeads[0];
  out.selectionSha256 = selectionSha;
  out.screen = {
    rows: screenRows,
    best: { arm: best, threshold: GRID[best], net: nets[best] },
    headToHead: head,
    choice: { arm: choice.arm, threshold: choice.threshold, advance, reason: choice.reason },
    tests: tests.map((t) => ({ ...t })),
    level,
    role: sel.role,
  };
  if (present.length === 0) {
    if (others.length > 0)
      throw new Error(
        "experiments/thresh has held-out output (identity, per-class, robustness or verification) but no pooled test",
      );
    return out;
  }
  if (!sameSet(present.map(([k]) => k), tests.map((t) => t.key)))
    throw new Error(
      `experiments/thresh has the pooled results ${present.map(([k]) => k).join(", ")}; the screen's choice leaves ${tests.map((t) => t.key).join(", ")}, run together, once`,
    );

  // ---- the all-pairs analysis, the identity checks and the recomputation -------------------------------------------------------------------
  const robPath = join(thDir, "robustness-all-pairs.json");
  if (!existsSync(robPath))
    throw new Error(
      `experiments/thresh/robustness-all-pairs.json is missing: the all-pairs analysis is a condition of the reading rule (${TH.adr} item 5)`,
    );
  const robustness = JSON.parse(readFileSync(robPath, "utf8"));
  if (
    robustness.kind !== "thresh-robustness" ||
    robustness.schema !== 1 ||
    !sameSet(Object.keys(robustness.tests), tests.map((t) => t.key)) ||
    !near(robustness.level, level, 1e-12)
  )
    throw new Error(
      "experiments/thresh/robustness-all-pairs.json: not the all-pairs analysis of the tests the screen left",
    );
  const verPath = join(thDir, "verification.json");
  if (!existsSync(verPath))
    throw new Error(
      `experiments/thresh/verification.json is missing: the pooled files are recomputed from the episodes by pool.sh (${TH.adr} item 11)`,
    );
  const verification = JSON.parse(readFileSync(verPath, "utf8"));
  if (verification.kind !== "thresh-verification" || verification.schema !== 1)
    throw new Error("experiments/thresh/verification.json: not a verification record of schema 1");

  const classNames = TH.classes.map((c) => EXACT[c]);
  const identityOf = (arm) => {
    const idPath = join(thDir, "identity", `${arm}.json`);
    const idn = existsSync(idPath) ? JSON.parse(readFileSync(idPath, "utf8")) : null;
    if (
      idn?.kind !== "thresh-identity" ||
      idn.stage !== "val" ||
      idn.arm !== arm ||
      idn.firstAct !== TH.lateAct ||
      idn.beforeDifferent !== 0 ||
      idn.bossDifferent !== 0 ||
      !(idn.beforePairs > 0) ||
      !(idn.bossPairs > 0)
    )
      throw new Error(
        `experiments/thresh/identity/${arm}.json: not a passing design check of ${arm} against S (${TH.adr} item 6 stops the study)`,
      );
    const ids = classNames.flatMap((c) => [batchId("val", arm, c.toLowerCase()), batchId("val", "s", c.toLowerCase())]);
    if (!sameSet(idn.batches ?? [], ids))
      throw new Error(`experiments/thresh/identity/${arm}.json: not made from the batches of ${arm} and S`);
    for (const id of ids)
      if (idn.contentSha256?.[id] !== byId.get(id)?.contentSha256)
        throw new Error(
          `experiments/thresh/identity/${arm}.json: it was not made from the content of ${id}`,
        );
    return { beforePairs: idn.beforePairs, bossPairs: idn.bossPairs };
  };
  const arms = [...new Set(tests.flatMap((t) => [t.arm, t.baseline]))];
  const identity = {};
  for (const arm of arms) if (arm !== "s") identity[arm] = identityOf(arm);
  const identityFiles = existsSync(join(thDir, "identity"))
    ? sameSet(
        (readdirSyncSafe(join(thDir, "identity")) ?? []).map((f) => f.replace(/\.json$/, "")),
        Object.keys(identity),
      )
    : true;
  if (!identityFiles)
    throw new Error("experiments/thresh/identity: a design-check record of an arm that was not played");

  const readOne = (spec) => {
    const file = join(thDir, `pooled-thresh-${spec.key}.json`);
    const where = `experiments/thresh/pooled-thresh-${spec.key}.json`;
    const test = readPooledHeldOut({
      where,
      path: file,
      names: [spec.arm, spec.baseline],
      seeds: nVal,
      byId,
      ascension: 0,
      partition: TH.partition,
      classes: TH.classes,
      check: (current, name, cls) => batchProblem("val", current, name, cls),
    });
    for (const m of test.members) {
      if (m.a.batchId !== batchId("val", spec.arm, m.character))
        throw new Error(
          `${where}: ${m.character} arm is ${m.a.batchId}, not ${batchId("val", spec.arm, m.character)}`,
        );
      if (m.b.batchId !== batchId("val", spec.baseline, m.character))
        throw new Error(
          `${where}: ${m.character} baseline is ${m.b.batchId}, not ${batchId("val", spec.baseline, m.character)}`,
        );
      const [x, y] = [manifestOf(m.a.batchId), manifestOf(m.b.batchId)];
      for (const part of ["config", "seeds", "simulator"])
        if (canonical(x[part]) !== canonical(y[part]))
          throw new Error(
            `${where}: ${m.character}: the two arms differ in their ${part}, and ${TH.adr} has them differ in the card rule of Act 2`,
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
      !near(cl.ciAtLevel.level, 1 - level, 1e-6) ||
      !(cl.ciAtLevel.ci[0] <= cl.ciAtLevel.ci[1])
    )
      throw new Error(`${where}: no whole-seed interval at level ${String(1 - level)}`);
    const w = test.wins;
    const tab = w.pairedTable;
    if (w.a !== tab.a_only + tab.both || w.b !== tab.b_only + tab.both)
      throw new Error(`${where}: the wins are not the counts of the wins table`);
    const shares = { arm: w.a / test.bothCompleted, baseline: w.b / test.bothCompleted };
    if (!near(cl.meanAMinusB, shares.arm - shares.baseline, 1e-9))
      throw new Error(
        `${where}: the pooled difference is not the difference of its two win shares`,
      );
    const [lo, hi] = cl.ciAtLevel.ci;
    const [lo95, hi95] = cl.ci95;
    if (
      !(lo <= cl.meanAMinusB && cl.meanAMinusB <= hi) ||
      !(lo95 <= cl.meanAMinusB && cl.meanAMinusB <= hi95) ||
      !(lo <= lo95 && hi95 <= hi)
    )
      throw new Error(`${where}: its two intervals do not nest around the pooled difference`);
    // both arms are S until the first card reward of Act 2, which comes after the Act-1 boss: they cannot differ about it (item 6)
    if (test.reachedAct2.pairedTable.a_only !== 0 || test.reachedAct2.pairedTable.b_only !== 0)
      throw new Error(
        `${where}: the two arms differ about the Act-1 boss in ${String(test.reachedAct2.pairedTable.a_only + test.reachedAct2.pairedTable.b_only)} pairs, and both are S until Act 2 (${TH.adr} item 6)`,
      );
    // each class on its own: the per-class comparison files, which have to add up to the pooled table
    const sum = { a_only: 0, b_only: 0, both: 0, neither: 0 };
    const perClass = test.members.map((m) => {
      const pc = JSON.parse(
        readFileSync(join(thDir, "per-class", `${spec.key}-${m.character}.json`), "utf8"),
      );
      if (
        pc.kind !== "paired-comparison" ||
        pc.a?.batchId !== m.a.batchId ||
        pc.b?.batchId !== m.b.batchId ||
        pc.a.contentSha256 !== m.a.contentSha256 ||
        pc.b.contentSha256 !== m.b.contentSha256
      )
        throw new Error(
          `experiments/thresh/per-class/${spec.key}-${m.character}.json: not the comparison of the batches the pooled file names`,
        );
      const t = pc.pairedWinTable;
      if (!closeP(mcnemarExact(t.a_only, t.b_only), t.mcnemar_p))
        throw new Error(
          `experiments/thresh/per-class/${spec.key}-${m.character}.json: its p is not the exact McNemar p of its counts`,
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
        actOne: { arm: m.reachedAct2.a, baseline: m.reachedAct2.b },
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
    if (!entry || entry.arm !== spec.arm || entry.baseline !== spec.baseline)
      throw new Error(
        `experiments/thresh/robustness-all-pairs.json: no analysis of test ${spec.key} for ${spec.arm} against ${spec.baseline}`,
      );
    const rb = entry.pooled;
    const sumOf = (k) => classNames.reduce((n, c) => n + entry.perClass[c][k], 0);
    for (const k of ["shared", "primaryPairs", "pairs", "armOnly", "baselineOnly", "arm", "baseline"])
      if (sumOf(k) !== rb[k])
        throw new Error(
          `experiments/thresh/robustness-all-pairs.json: test ${spec.key}: the classes' ${k} do not add up to the pooled one`,
        );
    if (!closeP(mcnemarExact(rb.armOnly, rb.baselineOnly), rb.p))
      throw new Error(
        `experiments/thresh/robustness-all-pairs.json: test ${spec.key}: its p is not the exact McNemar p of its counts`,
      );
    if (rb.shared !== test.pairedSeeds || rb.primaryPairs !== test.bothCompleted)
      throw new Error(
        `experiments/thresh/robustness-all-pairs.json: test ${spec.key}: it does not count the pairs of ${where}`,
      );
    if (rb.pairs !== rb.shared || !near(rb.difference, (rb.arm - rb.baseline) / rb.pairs, 1e-9))
      throw new Error(
        `experiments/thresh/robustness-all-pairs.json: test ${spec.key}: its counts do not add up`,
      );
    if (rb.arm < w.a || rb.baseline < w.b)
      throw new Error(
        `experiments/thresh/robustness-all-pairs.json: test ${spec.key}: it has fewer wins than the pairs both arms completed`,
      );
    for (const [who, row] of [["pooled", rb], ...classNames.map((c) => [c, entry.perClass[c]])])
      if (row.armOnly - row.baselineOnly !== row.arm - row.baseline)
        throw new Error(
          `experiments/thresh/robustness-all-pairs.json: test ${spec.key}: ${who}: the discordant wins are not the difference of the two arms' wins`,
        );
    for (const m of test.members)
      for (const side of [m.a, m.b])
        if (robustness.contentSha256?.[side.batchId] !== side.contentSha256)
          throw new Error(
            `experiments/thresh/robustness-all-pairs.json: test ${spec.key}: it was not made from the content of ${side.batchId}`,
          );
    const excludedFraction = 1 - test.bothCompleted / test.pairedSeeds;
    if (!near(rb.primaryExcludedFraction, excludedFraction, 1e-9))
      throw new Error(
        `experiments/thresh/robustness-all-pairs.json: test ${spec.key}: its excluded share is not the pooled file's`,
      );
    const ver = verification.files?.[`pooled-thresh-${spec.key}.json`];
    if (
      !ver ||
      ver.sha256 !== shaOf(file) ||
      !Array.isArray(ver.exactProblems) ||
      ver.exactProblems.length !== 0 ||
      !(ver.exactChecks > 0)
    )
      throw new Error(
        `experiments/thresh/verification.json: no passing recomputation of pooled-thresh-${spec.key}.json (every exact check has to agree with the episodes; ${TH.adr} item 11)`,
      );
    const reading = readingOf({
      armOnly: tab.a_only,
      baselineOnly: tab.b_only,
      p: tab.mcnemar_p,
      ci: cl.ciAtLevel.ci,
      level,
      robust: rb,
      excludedFraction,
    });
    return {
      key: spec.key,
      arm: spec.arm,
      baseline: spec.baseline,
      file: where,
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
      narrow: isNarrow({ verdict: reading.verdict, difference: cl.meanAMinusB, ci: cl.ciAtLevel.ci }),
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
      // secondary, uncorrected: how far the arm's runs get (the Act-1 boss is the same by construction; the Act-2 boss is the reach)
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
  const results = Object.fromEntries(tests.map((t) => [t.key, readOne(t)]));
  if (heads.val.size !== 1)
    throw new Error(
      `the held-out batches were played from ${String(heads.val.size)} different commits (${TH.adr} item 10 has one)`,
    );
  out.stage = "tested";
  out.identity = identity;
  out.tests = { results, order: tests.map((t) => t.key), level, levelLabel: levelLabel(tests.length) };
  return out;
}

function readdirSyncSafe(dir) {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return null;
  }
}

/** One class on its own at the class level (uncorrected): which arm is ahead and whether the exact p is below it. */
function verdictClass(tab) {
  if (tab.mcnemar_p >= TH.classLevel || tab.a_only === tab.b_only) return "level";
  return tab.a_only > tab.b_only ? "arm" : "baseline";
}
