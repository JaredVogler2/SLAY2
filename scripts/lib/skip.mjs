import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CLASSES, EXACT, commonBatchProblem, readPooledHeldOut } from "./pooled.mjs";

// ---- The price-of-a-slot check (ADR-065): does charging one index point for every card from the 21st on do gross harm where a simulation can see? -----------
// Two legs (Act 1 in Overgrowth, Act 1 in Underdocks), each a pooled paired comparison of five classes at Ascension 0 with the relics kept: the pilot that
// charges for a slot (S1, side a) against the baseline that charges version 1's price (S0, side b), the 2,000 `val` seeds of each class, paired by seed, run once.
// The rule (item 4) is applied here to the numbers alone: in a leg S1 is *not behind* if the lower end of the 95 % whole-seed interval of the pooled difference in
// the share that got past the Act-1 boss (S1 minus S0) is above -1.0 point AND the lower end of the 95 % paired interval of the mean floors is above -0.25 floors;
// the price is harmless as far as the simulation can see only if both legs are not behind. Until the pooled files exist the output says that the check is registered
// and carries its precondition. The baselines are earlier batches: ADR-054's `A*` for Overgrowth (`experiments/batches`) and ADR-064's T1 arm for Underdocks
// (`experiments/underdocks/batches`); the slot arm's batches are in `experiments/skip/batches`.
const SK = {
  adr: "ADR-065",
  seeds: 2000,
  bossMargin: -0.01,
  floorsMargin: -0.25,
  classLevel: 0.01,
  size: 1.0,
  sizeFrom: 20,
  legacySize: 0.6,
  legacySizeFrom: 30,
};
const LEGS = [
  { key: "og", file: "pooled-slot-og.json", act1: "overgrowth", tail: "" },
  { key: "ud", file: "pooled-slot-ud.json", act1: "underdocks", tail: "-underdocks" },
];
const SEEDS_FILE = "experiments/seeds/ironclad-a0-v2.json";
// the two arms differ in the price and in nothing else: the named parameters of the baseline (`A*`, ADR-050 addendum D) and of the slot arm
const A_STAR = { engines: 0, margin: 0, needs: 1, scalers: 0.7 };
const S1_NAMED = { ...A_STAR, size: SK.size, size_from: SK.sizeFrom };

const sameParams = (a, b) => {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  return [...keys].every((k) => a?.[k] === b?.[k]);
};

const ids = (cls, leg) => ({
  s1: `advisor_v1-slot-${cls}-a0-veteran-keeprelics${leg.tail}-val-n${SK.seeds}`,
  s0: `advisor_v1-astar-${cls}-a0-veteran-keeprelics${leg.tail}-val-n${SK.seeds}`,
});

/**
 * @param {{root: string, reports: object[], udReports: object[], skipReports: object[]}} args
 *   `reports` are the batches of `experiments/batches` (ADR-054's `A*`, the baselines of the Overgrowth leg), `udReports` those of `experiments/underdocks/batches`
 *   (ADR-064's T1 arm, the baselines of the Underdocks leg) and `skipReports` those of `experiments/skip/batches` (the arm that charges for a slot).
 */
export function parseSkip({ root, reports, udReports, skipReports }) {
  const dir = join(root, "experiments", "skip");
  const decisionLog = join(root, "docs", "DECISIONS.md");
  const decisions = existsSync(decisionLog) ? readFileSync(decisionLog, "utf8") : "";
  if (decisions.indexOf(`${SK.adr}: the advisor charges for a slot`) < 0) {
    if (existsSync(join(dir, "pooled-slot-og.json")) || existsSync(join(dir, "pooled-slot-ud.json")))
      throw new Error(`experiments/skip holds a pooled result but docs/DECISIONS.md has no ${SK.adr}`);
    return { registered: false };
  }
  const shaOf = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
  const read = (name) => JSON.parse(readFileSync(join(dir, name), "utf8"));
  const out = {
    adr: SK.adr,
    registered: true,
    price: { from: SK.sizeFrom, perCard: SK.size, legacyFrom: SK.legacySizeFrom, legacyPerCard: SK.legacySize },
    margins: { firstBossShare: SK.bossMargin, meanFloors: SK.floorsMargin, interval: 0.95 },
    classLevel: SK.classLevel,
    seeds: SK.seeds,
    precondition: null,
    result: null,
  };
  if (existsSync(join(dir, "precondition.json"))) {
    const pre = read("precondition.json");
    if (pre.kind !== "skip-precondition" || pre.schema !== 1 || pre.passed !== true)
      throw new Error("experiments/skip/precondition.json: not a passed precondition");
    out.precondition = {
      file: "experiments/skip/precondition.json",
      sha256: shaOf(join(dir, "precondition.json")),
      games: Object.values(pre.legs).reduce(
        (n, leg) => n + Object.values(leg).reduce((m, arm) => m + Object.values(arm.classes ?? {}).reduce((k, c) => k + (c.games ?? 0), 0), 0),
        0,
      ),
      minimumGapInSkipShare: pre.minimumGapInSkipShare,
    };
  }
  const present = LEGS.filter((leg) => existsSync(join(dir, leg.file)));
  if (present.length === 0) {
    if (existsSync(join(dir, "reading.json")))
      throw new Error("experiments/skip/reading.json exists but no pooled leg does: the reading is made from them");
    return out;
  }

  // ---- the batches each leg rests on, read from disk beside the reports
  const byId = new Map([...reports, ...udReports, ...skipReports].map((r) => [r.id, r]));
  const manifestDirs = {
    og: { s1: join(dir, "batches"), s0: join(root, "experiments", "batches") },
    ud: { s1: join(dir, "batches"), s0: join(root, "experiments", "underdocks", "batches") },
  };
  const manifestCache = new Map();
  const manifestOf = (leg, arm, id) => {
    const file = join(manifestDirs[leg][arm], id, "manifest.json");
    if (!manifestCache.has(file)) manifestCache.set(file, JSON.parse(readFileSync(file, "utf8")));
    return manifestCache.get(file);
  };
  const legs = {};
  for (const leg of present) {
    const heads = new Set();
    const check = (current, name, cls) => {
      const arm = name; // "s1" | "s0"
      const wanted = ids(cls, leg)[arm];
      if (current.id !== wanted) return `it is ${current.id}, not ${wanted}`;
      if (current.policy !== "advisor_v1") return `its policy is ${current.policy}`;
      const named = current.policyParams ?? {};
      if (!sameParams(named, arm === "s1" ? S1_NAMED : A_STAR))
        return arm === "s1"
          ? "its parameters are not those of A* with the price of a slot (1.0 from the 21st card)"
          : "its parameters are not those of A* (ADR-050 addendum D) at version 1's price of a slot";
      const m = manifestOf(leg.key, arm, current.id);
      const eff = m.policy?.effective?.params ?? {};
      const priced = arm === "s1";
      if (priced ? eff.size !== SK.size || eff.size_from !== SK.sizeFrom : eff.size !== undefined || eff.size_from !== undefined)
        return priced ? "its effective price of a slot is not 1.0 from the 21st card" : "it names a price of a slot (the baseline charges version 1's)";
      if (eff.relics !== false || eff.margin !== 0 || eff.synergy !== 1)
        return "its effective parameters are not those of A* (relics left false, margin 0, synergy 1)";
      const act1 = m.config?.act1 ?? "overgrowth";
      if (act1 !== leg.act1) return `it was played with Act 1 in ${act1}, not in ${leg.act1}`;
      const bad = commonBatchProblem(current, cls, { seeds: SK.seeds, keepRelics: true, adr: SK.adr });
      if (bad) return bad;
      if (priced) {
        const env = m.environment?.slay2 ?? {};
        heads.add(env.head);
        if (env.dirty !== false)
          return `it was played from a working tree with uncommitted changes (${SK.adr} asks for a clean checkout)`;
      }
      return null;
    };
    const where = `experiments/skip/${leg.file}`;
    const pooled = readPooledHeldOut({
      where,
      path: join(dir, leg.file),
      names: ["s1", "s0"],
      seeds: SK.seeds,
      byId,
      check,
    });
    if (heads.size !== 1) throw new Error(`${where}: the five batches of the slot arm were not all played from one commit`);
    // the pairing of the rule (side a the slot arm, side b the baseline, class for class) is held by `check`: each side has to be the batch of its class and leg
    // that the name asks for, and the file's policies are advisor_v1 on both sides
    legs[leg.key] = readLeg(pooled, leg, shaOf(join(dir, leg.file)), where);
  }

  // ---- the reading the study's own script wrote (reading.py): it has to say what the numbers say
  const both = present.length === LEGS.length;
  let reading = null;
  if (existsSync(join(dir, "reading.json"))) {
    reading = read("reading.json");
    if (reading.kind !== "skip-reading" || reading.schema !== 1) throw new Error("experiments/skip/reading.json: not a reading of schema 1");
    for (const leg of present) {
      const theirs = reading.legs?.[leg.key]?.verdict;
      const mine = legs[leg.key].verdict === "not-behind" ? "not behind" : "not shown to be harmless";
      if (theirs !== mine) throw new Error(`experiments/skip/reading.json says ${theirs} for the ${leg.key} leg; the numbers say ${mine}`);
    }
    if (both && reading.harmless !== (legs.og.verdict === "not-behind" && legs.ud.verdict === "not-behind"))
      throw new Error("experiments/skip/reading.json: its overall verdict is not the one of the two legs");
    for (const leg of present) {
      const s = reading.skipShares?.[leg.key];
      if (s?.s1?.cardRewards > 0 && s?.s0?.cardRewards > 0)
        legs[leg.key].skipShares = {
          s1: { share: s.s1.share, cardRewards: s.s1.cardRewards, skipped: s.s1.skipped, ...(s.s1.byAct ? { byAct: s.s1.byAct } : {}) },
          s0: { share: s.s0.share, cardRewards: s.s0.cardRewards, skipped: s.s0.skipped },
        };
    }
  } else if (both) {
    throw new Error("experiments/skip has both pooled legs but not reading.json: run scripts/studies/skip/reading.py (ADR-065 step 5)");
  }
  out.result = {
    legs,
    harmless: both ? legs.og.verdict === "not-behind" && legs.ud.verdict === "not-behind" : null,
    readingFile: reading ? { file: "experiments/skip/reading.json", sha256: shaOf(join(dir, "reading.json")) } : null,
  };
  return out;
}

/** One leg as the numbers say it (item 4): the two lower ends against the two margins, and each class on its own at the class level. */
function readLeg(p, leg, sha256, where) {
  const boss = p.clusteredDifference;
  const floors = p.floorDifference;
  if (!boss?.ci95 || !floors?.ci95) throw new Error(`${where}: it carries no 95 % interval of the share past the boss or of the mean floors`);
  const [bossLo, bossHi] = boss.ci95;
  const [floorsLo, floorsHi] = floors.ci95;
  const firstBoss = bossLo > SK.bossMargin;
  const meanFloors = floorsLo > SK.floorsMargin;
  const t = p.reachedAct2.pairedTable;
  const classes = {};
  for (const m of p.members) {
    const c = m.reachedAct2.pairedTable;
    classes[m.character] = {
      pairs: m.bothCompleted,
      s1: m.reachedAct2.a,
      s0: m.reachedAct2.b,
      onlyS1: c.a_only,
      onlyS0: c.b_only,
      p: c.mcnemar_p,
      // each class on its own, uncorrected, at the class level (item 5): behind = the baseline ahead at p below 0.01
      behind: c.mcnemar_p < SK.classLevel && c.b_only > c.a_only,
      ahead: c.mcnemar_p < SK.classLevel && c.a_only > c.b_only,
      meanFloors: m.meanFloorDifference,
    };
  }
  for (const k of CLASSES) if (!classes[k]) throw new Error(`${where}: ${EXACT[k]} is missing`);
  return {
    act1: leg.act1,
    file: `experiments/skip/${leg.file}`,
    sha256,
    contentSha256: p.contentSha256,
    pairs: p.pairedSeeds,
    bothCompleted: p.bothCompleted,
    excludedNotCompleted: p.excludedNotCompleted,
    notFinished: p.notFinished,
    pastActOneBoss: {
      s1: p.reachedAct2.a.rate,
      s0: p.reachedAct2.b.rate,
      onlyS1: t.a_only,
      onlyS0: t.b_only,
      exactP: t.mcnemar_p,
      difference: boss.meanAMinusB,
      interval95: [bossLo, bossHi],
    },
    meanFloors: { difference: floors.meanAMinusB, interval95: [floorsLo, floorsHi] },
    pastActTwoBoss: { s1: p.reachedAct3.a.rate, s0: p.reachedAct3.b.rate, onlyS1: p.reachedAct3.pairedTable.a_only, onlyS0: p.reachedAct3.pairedTable.b_only },
    wins: { s1: p.wins.a, s0: p.wins.b, onlyS1: p.wins.pairedTable.a_only, onlyS0: p.wins.pairedTable.b_only },
    notBehind: { firstBoss, meanFloors },
    verdict: firstBoss && meanFloors ? "not-behind" : "not-shown-harmless",
    classes,
    skipShares: null,
  };
}
