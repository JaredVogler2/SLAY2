import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  CLASSES,
  EXACT,
  closeP,
  commonBatchProblem,
  mcnemarExact,
  readPooledHeldOut,
} from "./pooled.mjs";

// ---- The Act-2 study (ADR-060): does anything about the card picks change how often a run gets past the second boss? ------------------------
// Three held-out tests at the endpoint "got past the Act-2 boss", each a pooled paired test of five classes (the relics kept, Ascension 0),
// an arm against S (the shown-values pilot), read at 0.05 / 3 and run once: L (the card-pick threshold 0.2 in every act), P (the Act-2
// threshold the development screen chose) and V (the shown values with the Act-2 refit, in Act 2 only). Until the files exist the output
// carries the stage the study is at: registered; the fit as it came out; the development screen as it came out; the tests.
const A2 = {
  adr: "ADR-060",
  level: 0.05 / 3,
  classLevel: 0.01,
  screenLevel: 0.1,
  gate: 0.002,
  maxExcludedFraction: 0.1,
  robustLevel: 0.05,
  seeds: 2000,
  devSlice: { partition: "dev", offset: 1000, n: 600 },
  seedsFile: "experiments/seeds/ironclad-a0-v2.json",
  leadThreshold: 0.2,
  marker: "Frozen choices of ADR-060 (part 2)",
};
const P_TAGS = { pall: -100, p010: 0.1, p020: 0.2, p035: 0.35, p050: 0.5, pnone: 100 };
const CI_LEVEL = 1 - A2.level;
const DEV_ARMS = ["lead", ...Object.keys(P_TAGS), "v"];
const TESTS = [
  { key: "L", arm: "lead", file: "pooled-act2-L.json" },
  { key: "P", arm: null, file: "pooled-act2-P.json" },
  { key: "V", arm: "v", file: "pooled-act2-V.json" },
];

/** The reading rule of ADR-060 item 4 applied to the numbers of the registered primary test alone (the order of the arguments is the arm's, then S's). */
export function verdictOf({ armOnly, baselineOnly, p, ci, level = A2.level }) {
  const [lo, hi] = ci;
  if (p < level && armOnly > baselineOnly && lo > 0) return "passed";
  if (p < level && baselineOnly > armOnly && hi < 0) return "reversed";
  return "not-shown";
}

/**
 * The whole reading (item 4 and addendum B): a result is "passed" or "reversed" only if the primary test says so AND the observed-endpoint analysis (every
 * pair whose two endpoints are known, a game that ended in an error after the Act-2 boss counted as a pass) has the same arm ahead at an exact p below 0.05
 * AND the primary dropped at most a tenth of the pairs. Anything else is "not-shown", with the reason that stopped it.
 */
export function readingOf({
  armOnly,
  baselineOnly,
  p,
  ci,
  level = A2.level,
  robust,
  excludedFraction,
}) {
  const primary = verdictOf({ armOnly, baselineOnly, p, ci, level });
  if (primary === "not-shown") return { verdict: "not-shown", primary, downgrade: null };
  if (excludedFraction > A2.maxExcludedFraction)
    return { verdict: "not-shown", primary, downgrade: "excluded" };
  const ahead =
    primary === "passed"
      ? robust.armOnly > robust.baselineOnly
      : robust.baselineOnly > robust.armOnly;
  if (!(robust.p < A2.robustLevel && ahead))
    return { verdict: "not-shown", primary, downgrade: "robustness" };
  return { verdict: primary, primary, downgrade: null };
}

/** The development screen's rule (item 5): higher than S's and an exact two-sided McNemar p below 0.10. */
export const eligible = (row) => row.difference > 0 && row.p < A2.screenLevel;

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

export function parseAct2({ root, reports }) {
  const decisionLog = join(root, "docs", "DECISIONS.md");
  const decisions = existsSync(decisionLog) ? readFileSync(decisionLog, "utf8") : "";
  const at = decisions.indexOf(`${A2.adr}: does anything about the card picks`);
  const valueFile = (cls) => join(root, "experiments", "cardvalue", `${cls}-a0-act2-v1.json`);
  const act2Dir = join(root, "experiments", "act2");
  const fitsPresent = CLASSES.filter((c) => existsSync(valueFile(c)));
  if (at < 0) {
    if (fitsPresent.length > 0 || existsSync(join(act2Dir, "dev-selection.json")))
      throw new Error(`Act-2 study files exist but docs/DECISIONS.md has no ${A2.adr}`);
    return { registered: false };
  }
  const next = decisions.indexOf("\n## ", at);
  const record = decisions.slice(at, next < 0 ? undefined : next);
  const out = {
    adr: A2.adr,
    registered: true,
    level: A2.level,
    classLevel: A2.classLevel,
    screenLevel: A2.screenLevel,
    gate: A2.gate,
    seeds: A2.seeds,
    frozen: record.includes(A2.marker),
    fit: null,
    dev: null,
    tests: null,
  };
  if (fitsPresent.length === 0) return out;
  if (fitsPresent.length !== CLASSES.length)
    throw new Error(
      `the Act-2 fit has files for ${fitsPresent.join(", ")} but not the other classes: it is run once, for all five`,
    );

  // ---- the fit, as it came out ---------------------------------------------------------------------------------------------------------
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
  const fitClasses = CLASSES.map((cls) => {
    const where = `experiments/cardvalue/${cls}-a0-act2-v1.json`;
    const f = JSON.parse(readFileSync(valueFile(cls), "utf8"));
    if (
      f.kind !== "card-values" ||
      f.schema !== 1 ||
      f.act !== 2 ||
      f.outcome !== "the run gets past the Act-2 boss"
    )
      throw new Error(`${where}: not an Act-2 card-values file of schema 1`);
    if (
      f.character !== EXACT[cls] ||
      f.ascension !== 0 ||
      f.profile !== "veteran" ||
      f.keepRelics !== true
    )
      throw new Error(
        `${where}: not ${EXACT[cls]} at Ascension 0 with the veteran profile and the relics kept`,
      );
    if (f.prior?.file !== shownFile(cls) || f.prior?.sha256 !== shaOf(join(root, shownFile(cls))))
      throw new Error(`${where}: its prior is not the file the site shows for ${cls}`);
    if (typeof f.fitted !== "boolean" || !Array.isArray(f.cards) || f.cards.length === 0)
      throw new Error(`${where}: no verdict or no cards`);
    if (f.gate?.required !== A2.gate)
      throw new Error(`${where}: its gate is not ${String(A2.gate)} nats`);
    const g = f.gate;
    const asked =
      f.boss_fights >= g.minFights && Math.min(f.passed, f.boss_fights - f.passed) >= g.minOutcomes;
    if (f.fitted !== (asked && g.gain !== null && g.gain >= g.required))
      throw new Error(
        `${where}: "fitted" is not what its gain (${String(g.gain)}) and the gate (${String(g.required)}) say`,
      );
    if (g.passed !== f.fitted)
      throw new Error(`${where}: its gate verdict and its "fitted" disagree`);
    for (const c of f.cards) {
      if (!Number.isFinite(c.beta) || !Number.isFinite(c.shown_beta))
        throw new Error(`${where}: ${String(c.id)} has no finite value`);
      if (!f.fitted && c.beta !== c.shown_beta)
        throw new Error(
          `${where}: a class that keeps its shown values has ${String(c.id)} at ${String(c.beta)}, not ${String(c.shown_beta)}`,
        );
    }
    const cvr = f.crossValidation ?? null;
    const moved = f.cards.filter(
      (c) => c.delta_ci95 && (c.delta_ci95[0] > 0 || c.delta_ci95[1] < 0),
    );
    const row = (c) => ({
      id: c.id,
      shown: c.shown_beta,
      value: c.beta,
      delta: c.delta,
      ci95: c.delta_ci95,
      decks: c.games_with_card,
    });
    return {
      character: cls,
      file: where,
      sha256: shaOf(valueFile(cls)),
      fitted: f.fitted,
      reason: f.reason ?? null,
      bossFights: f.boss_fights,
      passed: f.passed,
      gain: g.gain,
      bestL2: g.bestL2,
      indicatorPenalty: cvr?.indicatorPenalty?.chosen ?? null,
      logLoss: cvr
        ? {
            baseRate: cvr.baselineLogLossOfTheBaseRate,
            scaleOnly: cvr.baselineLogLoss,
            full: cvr.baselineLogLoss - cvr.gain,
          }
        : null,
      scaleOnly: f.scaleOnly ? { estimate: f.scaleOnly.estimate, ci95: f.scaleOnly.ci95 } : null,
      // the cards whose Act-2 deviation has a bootstrap interval that excludes zero, largest first (descriptive)
      moved: f.fitted
        ? moved
            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
            .slice(0, 12)
            .map(row)
        : [],
      movedCount: f.fitted ? moved.length : 0,
      signFlips: f.fitted ? f.cards.filter((c) => c.beta > 0 !== c.shown_beta > 0).length : 0,
      cards: f.cards.length,
    };
  });
  out.fit = { classes: fitClasses, anyFitted: fitClasses.some((c) => c.fitted) };

  // ---- the development screen, as it came out --------------------------------------------------------------------------------------------
  const selPath = join(act2Dir, "dev-selection.json");
  if (!existsSync(selPath)) return out;
  const sel = JSON.parse(readFileSync(selPath, "utf8"));
  if (sel.kind !== "act2-dev-selection" || sel.schema !== 1)
    throw new Error("experiments/act2/dev-selection.json: not a selection of schema 1");
  if (canonical(sel.slice) !== canonical(A2.devSlice))
    throw new Error(
      "experiments/act2/dev-selection.json: not the development slice the record names",
    );
  for (const c of fitClasses)
    if (sel.fittedClasses?.[EXACT[c.character]] !== c.fitted)
      throw new Error(
        `experiments/act2/dev-selection.json: ${c.character} was ${sel.fittedClasses?.[EXACT[c.character]]} when the screen ran, the committed fit says ${String(c.fitted)}`,
      );
  const arms = DEV_ARMS.filter((a) => sel.arms?.[a]);
  if (!out.fit.anyFitted && sel.arms?.v)
    throw new Error(
      "experiments/act2/dev-selection.json: V was screened although no class kept its fit",
    );
  if (out.fit.anyFitted && !sel.arms?.v)
    throw new Error(
      "experiments/act2/dev-selection.json: V was not screened although a class kept its fit",
    );
  for (const tag of [...Object.keys(P_TAGS), "lead"])
    if (!sel.arms?.[tag]) throw new Error(`experiments/act2/dev-selection.json: no row for ${tag}`);
  const devRows = arms.map((arm) => {
    const r = sel.arms[arm];
    if (arm in P_TAGS && r.lateThreshold !== P_TAGS[arm])
      throw new Error(
        `experiments/act2/dev-selection.json: ${arm} has threshold ${String(r.lateThreshold)}`,
      );
    if (!closeP(mcnemarExact(r.armOnly, r.baselineOnly), r.p))
      throw new Error(
        `experiments/act2/dev-selection.json: ${arm}'s p (${String(r.p)}) is not the exact McNemar p of its counts`,
      );
    if (!near(r.difference, r.pastAct2Boss.arm - r.pastAct2Boss.baseline, 1e-9))
      throw new Error(
        `experiments/act2/dev-selection.json: ${arm}'s difference is not its two shares'`,
      );
    if (r.eligible !== eligible(r))
      throw new Error(
        `experiments/act2/dev-selection.json: ${arm}'s eligibility is not what the rule says`,
      );
    if (
      arm !== "lead" &&
      (r.identity?.actZeroDifferent !== 0 ||
        r.identity?.wholeDifferent !== 0 ||
        !(r.identity?.actZeroPairs > 0))
    )
      throw new Error(
        `experiments/act2/dev-selection.json: ${arm} is not record for record S's in the games S ended in Act 1 (ADR-060 addendum B stops the study)`,
      );
    return {
      arm,
      lateThreshold: r.lateThreshold ?? null,
      pairs: r.pairs,
      excluded: r.excluded,
      shares: { arm: r.pastAct2Boss.arm, baseline: r.pastAct2Boss.baseline },
      difference: r.difference,
      armOnly: r.armOnly,
      baselineOnly: r.baselineOnly,
      p: r.p,
      eligible: r.eligible,
      actOne: {
        arm: r.pastAct1Boss.arm,
        baseline: r.pastAct1Boss.baseline,
        differs: r.actOneDiffers,
      },
      wins: r.wins,
    };
  });
  // the rule, re-applied: the eligible threshold with the largest gain (ties: the smaller absolute threshold, then the smaller one)
  const eligibleP = Object.keys(P_TAGS)
    .filter((t) => eligible(sel.arms[t]))
    .sort(
      (x, y) =>
        sel.arms[y].difference - sel.arms[x].difference ||
        Math.abs(P_TAGS[x]) - Math.abs(P_TAGS[y]) ||
        P_TAGS[x] - P_TAGS[y],
    );
  const wantP = eligibleP[0] ?? null;
  if ((sel.P?.arm ?? null) !== wantP || sel.P?.advance !== (wantP !== null))
    throw new Error(
      `experiments/act2/dev-selection.json: P is ${String(sel.P?.arm)}, the rule gives ${String(wantP)}`,
    );
  const wantV = Boolean(sel.arms?.v && eligible(sel.arms.v) && out.fit.anyFitted);
  if (sel.V?.advance !== wantV)
    throw new Error(
      `experiments/act2/dev-selection.json: V ${sel.V?.advance ? "advances" : "does not"}, the rule says otherwise`,
    );
  const identical = ["v", ...Object.keys(P_TAGS)]
    .filter((a) => sel.arms[a])
    .every((a) => sel.arms[a].actOneDiffers === 0);
  if (sel.actOneIdentical !== identical)
    throw new Error(
      "experiments/act2/dev-selection.json: its Act-1 check is not what its rows say",
    );
  if (!identical)
    throw new Error(
      "experiments/act2/dev-selection.json: an arm that differs from S in Act 2 only differs in Act 1 (ADR-060 item 6 stops the study)",
    );
  const quoted = (file) => {
    const sha = shaOf(join(root, file));
    if (!record.includes(sha))
      throw new Error(`${file}: its SHA-256 (${sha}) is not quoted in ${A2.adr}`);
    return sha;
  };
  if (out.frozen) {
    for (const cls of CLASSES) {
      quoted(`experiments/cardvalue/${cls}-a0-act2-v1.json`);
      quoted(shownFile(cls));
    }
    quoted("experiments/act2/dev-selection.json");
  }
  out.dev = {
    file: "experiments/act2/dev-selection.json",
    sha256: shaOf(selPath),
    slice: sel.slice,
    arms: devRows,
    P: { advance: sel.P.advance, arm: sel.P.arm, lateThreshold: sel.P.lateThreshold },
    V: { advance: sel.V.advance, anyClassFitted: out.fit.anyFitted },
  };

  // ---- the tests -------------------------------------------------------------------------------------------------------------------------
  const wanted = TESTS.filter(
    (t) => t.key === "L" || (t.key === "P" && sel.P.advance) || (t.key === "V" && sel.V.advance),
  );
  const present = TESTS.filter((t) => existsSync(join(act2Dir, t.file)));
  if (present.length === 0) return out;
  if (!out.frozen)
    throw new Error(
      `experiments/act2 has pooled results but ${A2.adr} has no part 2 (${A2.marker})`,
    );
  if (canonical(present.map((t) => t.key)) !== canonical(wanted.map((t) => t.key)))
    throw new Error(
      `experiments/act2 has the pooled results ${present.map((t) => t.key).join(", ")}; the screen sent ${wanted.map((t) => t.key).join(", ")} forward and ${A2.adr} runs them together, once`,
    );

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
  const armTag = (key) => (key === "L" ? "lead" : key === "V" ? "v" : sel.P.arm);
  const batchId = (arm, cls) => `act2-${arm}-${cls}-a0-veteran-keeprelics-val-n${String(A2.seeds)}`;
  const seedsSha = shaOf(join(root, A2.seedsFile));
  const heads = new Set();
  const validity = (r) => {
    if (!r.counts || typeof r.counts !== "object")
      return "its report has no counts of how its games ended";
    const bad = ["aborted", "harness_error", "policy_error", "invalid_action"].reduce(
      (n, k) => n + (r.counts[k] ?? 0),
      0,
    );
    if (bad > 0)
      return `${String(bad)} of its games ended in an abort, a harness error, a policy error or an invalid action (${A2.adr} item 9)`;
    if (!(r.completed >= 0.9 * A2.seeds))
      return `only ${String(r.completed)} of its ${String(A2.seeds)} games completed (${A2.adr} item 9 asks for 90 %)`;
    const m = manifestOf(r.id);
    const env = m.environment?.slay2 ?? {};
    if (env.dirty !== false)
      return `it was played from a working tree with uncommitted changes (${A2.adr} asks for a clean checkout)`;
    heads.add(env.head);
    const sim = m.simulator ?? {};
    if (sim.pin_ok !== true || sim.dirty !== false)
      return "it was not played with the pinned, clean simulator";
    const seeds = m.seeds ?? {};
    if (
      seeds.file !== A2.seedsFile ||
      seeds.file_sha256 !== seedsSha ||
      seeds.sealed_partition_used !== false
    )
      return `its seeds are not those of ${A2.seedsFile} (the val partition, the sealed one untouched)`;
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
  const armProblem = (current, name, cls, key) => {
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
    if (key === "L")
      return current.policy !== "rules_v2"
        ? `its policy is ${current.policy}`
        : !follows(current, cls, A2.leadThreshold) || noLate
          ? `it is not rules_v2 with ${shownFile(cls)} at threshold ${String(A2.leadThreshold)}`
          : null;
    if (current.policy !== "rules_v2_late") return `its policy is ${current.policy}`;
    if (!follows(current, cls, 0) || canonical(e.late_acts) !== "[1]")
      return `it is not rules_v2_late on ${shownFile(cls)} with the late rule on Act 2 only`;
    if (key === "P")
      return e.late_threshold === sel.P.lateThreshold && !("late_values" in e)
        ? null
        : `its Act-2 threshold is not ${String(sel.P.lateThreshold)}, the one the screen chose`;
    const f = `experiments/cardvalue/${cls}-a0-act2-v1.json`;
    return e.late_values === f && e.late_values_sha256 === quoted(f) && e.late_threshold === 0
      ? null
      : `it does not follow ${f} in Act 2 at threshold 0`;
  };
  const readOne = (spec) => {
    const arm = armTag(spec.key);
    const file = join(act2Dir, spec.file);
    const where = `experiments/act2/${spec.file}`;
    const test = readPooledHeldOut({
      where,
      path: file,
      names: [spec.key, "s"],
      seeds: A2.seeds,
      byId,
      ascension: 0,
      check: (current, name, cls) =>
        commonBatchProblem(current, cls, {
          seeds: A2.seeds,
          keepRelics: true,
          adr: A2.adr,
          ascension: 0,
        }) ??
        validity(current) ??
        armProblem(current, name, cls, spec.key),
    });
    for (const m of test.members) {
      if (m.a.batchId !== batchId(arm, m.character))
        throw new Error(
          `${where}: ${m.character} arm is ${m.a.batchId}, not ${batchId(arm, m.character)}`,
        );
      if (m.b.batchId !== batchId("s", m.character))
        throw new Error(
          `${where}: ${m.character} baseline is ${m.b.batchId}, not ${batchId("s", m.character)}`,
        );
      const [x, y] = [manifestOf(m.a.batchId), manifestOf(m.b.batchId)];
      for (const part of ["config", "seeds", "simulator"])
        if (canonical(x[part]) !== canonical(y[part]))
          throw new Error(
            `${where}: ${m.character}: the two arms differ in their ${part}, and ${A2.adr} has them differ in the card rule`,
          );
    }
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const cl = raw.clusteredDifference;
    if (cl?.endpoint !== "act2")
      throw new Error(
        `${where}: its interval is not of the Act-2 endpoint (slay2_sim pool --endpoint act2)`,
      );
    if (
      !cl.ciAtLevel ||
      !near(cl.ciAtLevel.level, CI_LEVEL, 1e-6) ||
      !(cl.ciAtLevel.ci[0] <= cl.ciAtLevel.ci[1])
    )
      throw new Error(`${where}: no whole-seed interval at level ${String(CI_LEVEL)}`);
    const t2 = test.reachedAct3;
    if (!near(cl.meanAMinusB, t2.a.rate - t2.b.rate, 1e-9))
      throw new Error(
        `${where}: the pooled difference is not the difference of its two Act-2 shares`,
      );
    // P and V play S's game up to the first Act-2 card reward: they cannot differ about the Act-1 boss in any pair (item 6)
    if (
      spec.key !== "L" &&
      (test.reachedAct2.pairedTable.a_only !== 0 || test.reachedAct2.pairedTable.b_only !== 0)
    )
      throw new Error(
        `${where}: arms that differ from S in Act 2 only differ about the Act-1 boss in ${String(test.reachedAct2.pairedTable.a_only + test.reachedAct2.pairedTable.b_only)} pairs (${A2.adr} item 6)`,
      );
    // each class on its own: the per-class comparison files, which have to add up to the pooled table
    const sum = { a_only: 0, b_only: 0, both: 0, neither: 0 };
    const perClass = test.members.map((m) => {
      const pc = JSON.parse(
        readFileSync(join(act2Dir, "per-class", `${spec.key}-${m.character}.json`), "utf8"),
      );
      if (
        pc.kind !== "paired-comparison" ||
        pc.a?.batchId !== m.a.batchId ||
        pc.b?.batchId !== m.b.batchId ||
        pc.a.contentSha256 !== m.a.contentSha256 ||
        pc.b.contentSha256 !== m.b.contentSha256
      )
        throw new Error(
          `experiments/act2/per-class/${spec.key}-${m.character}.json: not the comparison of the batches the pooled file names`,
        );
      const tab = pc.reachedAct3.pairedTable;
      if (!closeP(mcnemarExact(tab.a_only, tab.b_only), tab.mcnemar_p))
        throw new Error(
          `experiments/act2/per-class/${spec.key}-${m.character}.json: its p is not the exact McNemar p of its counts`,
        );
      for (const k of Object.keys(sum)) sum[k] += tab[k];
      const own = verdictClass(tab);
      return {
        character: m.character,
        pairs: pc.bothCompleted,
        shares: { arm: pc.reachedAct3.a.rate, baseline: pc.reachedAct3.b.rate },
        difference: pc.reachedAct3.a.rate - pc.reachedAct3.b.rate,
        armOnly: tab.a_only,
        baselineOnly: tab.b_only,
        p: tab.mcnemar_p,
        verdict: own,
        actOne: {
          arm: m.reachedAct2.a,
          baseline: m.reachedAct2.b,
          armOnly: m.reachedAct2.pairedTable.a_only,
          baselineOnly: m.reachedAct2.pairedTable.b_only,
        },
        wins: { arm: m.a.wins, baseline: m.b.wins },
        meanFloorDifference: m.meanFloorDifference,
      };
    });
    for (const k of Object.keys(sum))
      if (sum[k] !== t2.pairedTable[k])
        throw new Error(
          `${where}: the classes' ${k} (${String(sum[k])}) do not add up to the pooled one (${String(t2.pairedTable[k])})`,
        );
    const tab = t2.pairedTable;
    // the observed-endpoint analysis of this test (addendum B), written by pool.sh with the pooled files, and the identity check of P and V
    const entry = robustness.tests[spec.key];
    if (!entry || entry.arm !== arm)
      throw new Error(
        `experiments/act2/robustness-errors.json: no analysis of test ${spec.key} for the arm ${arm}`,
      );
    const rb = entry.pooled;
    const sumOf = (k) => CLASSES.reduce((n, c) => n + entry.perClass[EXACT[c]][k], 0);
    for (const k of [
      "shared",
      "primaryPairs",
      "pairs",
      "droppedUnknown",
      "armOnly",
      "baselineOnly",
      "arm",
      "baseline",
    ])
      if (sumOf(k) !== rb[k])
        throw new Error(
          `experiments/act2/robustness-errors.json: test ${spec.key}: the classes' ${k} do not add up to the pooled one`,
        );
    if (!closeP(mcnemarExact(rb.armOnly, rb.baselineOnly), rb.p))
      throw new Error(
        `experiments/act2/robustness-errors.json: test ${spec.key}: its p is not the exact McNemar p of its counts`,
      );
    if (rb.shared !== test.pairedSeeds || rb.primaryPairs !== test.bothCompleted)
      throw new Error(
        `experiments/act2/robustness-errors.json: test ${spec.key}: it does not count the pairs of ${where}`,
      );
    if (
      rb.pairs + rb.droppedUnknown !== rb.shared ||
      !near(rb.difference, (rb.arm - rb.baseline) / rb.pairs, 1e-9)
    )
      throw new Error(
        `experiments/act2/robustness-errors.json: test ${spec.key}: its counts do not add up`,
      );
    const excludedFraction = 1 - test.bothCompleted / test.pairedSeeds;
    if (!near(rb.primaryExcludedFraction, excludedFraction, 1e-9))
      throw new Error(
        `experiments/act2/robustness-errors.json: test ${spec.key}: its excluded share is not the pooled file's`,
      );
    if (spec.key !== "L") {
      const idPath = join(act2Dir, "identity", `${spec.key}.json`);
      const idn = existsSync(idPath) ? JSON.parse(readFileSync(idPath, "utf8")) : null;
      if (
        idn?.kind !== "act2-identity" ||
        idn.arm !== arm ||
        idn.actZeroDifferent !== 0 ||
        idn.wholeDifferent !== 0 ||
        !(idn.actZeroPairs > 0)
      )
        throw new Error(
          `experiments/act2/identity/${spec.key}.json: not a passing identity check of ${arm} against S (ADR-060 addendum B stops the study)`,
        );
    }
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
      arm,
      file: `experiments/act2/${spec.file}`,
      sha256: shaOf(file),
      pairs: test.bothCompleted,
      pairedSeeds: test.pairedSeeds,
      excluded: test.excludedNotCompleted,
      notFinished: test.notFinished,
      shares: { arm: t2.a.rate, baseline: t2.b.rate },
      games: { arm: t2.a.games, baseline: t2.b.games },
      difference: cl.meanAMinusB,
      ci: cl.ciAtLevel.ci,
      ci95: cl.ci95,
      armOnly: tab.a_only,
      baselineOnly: tab.b_only,
      p: tab.mcnemar_p,
      verdict: reading.verdict,
      primaryVerdict: reading.primary,
      downgrade: reading.downgrade,
      excludedFraction,
      robust: {
        pairs: rb.pairs,
        droppedUnknown: rb.droppedUnknown,
        erroredAfterTheBoss: rb.erroredAfterTheBoss,
        shares: { arm: rb.arm / rb.pairs, baseline: rb.baseline / rb.pairs },
        difference: rb.difference,
        armOnly: rb.armOnly,
        baselineOnly: rb.baselineOnly,
        p: rb.p,
      },
      actOne: {
        shares: { arm: test.reachedAct2.a.rate, baseline: test.reachedAct2.b.rate },
        armOnly: test.reachedAct2.pairedTable.a_only,
        baselineOnly: test.reachedAct2.pairedTable.b_only,
        p: test.reachedAct2.pairedTable.mcnemar_p,
      },
      wins: { arm: test.wins.a, baseline: test.wins.b, p: test.wins.pairedTable.mcnemar_p },
      floorDifference: test.floorDifference,
      perClass,
    };
  };
  const robPath = join(act2Dir, "robustness-errors.json");
  if (!existsSync(robPath))
    throw new Error(
      `experiments/act2/robustness-errors.json is missing: the observed-endpoint analysis is a condition of the reading rule (${A2.adr} addendum B)`,
    );
  const robustness = JSON.parse(readFileSync(robPath, "utf8"));
  if (
    robustness.kind !== "act2-robustness" ||
    robustness.schema !== 2 ||
    canonical(Object.keys(robustness.tests).sort()) !== canonical(present.map((t) => t.key).sort())
  )
    throw new Error(
      "experiments/act2/robustness-errors.json: not the observed-endpoint analysis of the tests that were played",
    );
  const results = Object.fromEntries(present.map((t) => [t.key, readOne(t)]));
  if (heads.size !== 1)
    throw new Error(
      `the held-out batches were played from ${String(heads.size)} different commits (${A2.adr} item 9 has one)`,
    );

  // the baseline replayed under the study's commit against the batches ADR-058 played: how many games are the same games (item 3; gates nothing)
  const detDir = join(act2Dir, "determinism");
  const det = CLASSES.map((cls) => JSON.parse(readFileSync(join(detDir, `${cls}.json`), "utf8")));
  const determinism = det.reduce(
    (n, d) => ({
      shared: n.shared + d.shared,
      identical: n.identical + d.identical,
      different: n.different + d.different,
    }),
    { shared: 0, identical: 0, different: 0 },
  );
  if (readdirSync(detDir).filter((f) => f.endsWith(".json")).length !== CLASSES.length)
    throw new Error("experiments/act2/determinism: not one record for each of the five classes");
  out.tests = {
    results,
    determinism,
  };
  return out;
}

/** One class on its own at the class level (uncorrected): which arm is ahead and whether the exact p is below it. */
function verdictClass(tab) {
  if (tab.mcnemar_p >= A2.classLevel || tab.a_only === tab.b_only) return "level";
  return tab.a_only > tab.b_only ? "arm" : "baseline";
}
