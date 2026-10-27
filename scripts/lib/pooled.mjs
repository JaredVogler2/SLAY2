import { readFileSync } from "node:fs";

// Shared by the site-data exporter and the readers of the registered studies: the five classes, the exact reading of a pooled paired test
// written by `slay2_sim pool` (nothing is taken from a file without checking it against the batches and the counts it rests on).
export const CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"];
export const EXACT = {
  ironclad: "Ironclad",
  silent: "Silent",
  regent: "Regent",
  necrobinder: "Necrobinder",
  defect: "Defect",
};

// The exact two-sided McNemar p-value of the discordant counts, as slay2_sim.stats.mcnemar_exact computes it (2 x the lower binomial tail at
// 1/2, capped at 1), in exact integers: the exporter does not take a p-value from a file without checking it against the counts.
export function mcnemarExact(aOnly, bOnly) {
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
export const closeP = (x, y) => Math.abs(x - y) <= 1e-9 * Math.max(x, y) + 1e-35;

// What every batch of a registered held-out test on the val seeds has to be, whatever policy it ran: the class it was played as, the
// seeds, Ascension 0 with the veteran profile, the relics kept or not (as the registration says), the class checked at the start of each
// game, the harness's canonical process state. Returns what is wrong with it, or null.
export function commonBatchProblem(
  current,
  cls,
  { seeds, keepRelics, adr, classStartExempt = false, ascension = 0 },
) {
  if (current.character !== EXACT[cls])
    return `it was played as "${current.character}", not as ${EXACT[cls]}`;
  if (current.partition !== "val" || current.seeds !== seeds)
    return `it is not the ${seeds} val seeds`;
  if (current.ascension !== ascension || current.profile !== "veteran")
    return `it is not Ascension ${ascension} with the veteran profile`;
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
export function readPooledHeldOut({ where, path, names: [a, b], seeds, byId, check, ascension = 0 }) {
  const t = JSON.parse(readFileSync(path, "utf8"));
  if (t.kind !== "pooled-paired-comparison" || t.schema !== 1)
    throw new Error(`${where}: not a pooled paired comparison of schema 1`);
  if (t.cohort?.partition !== "val" || t.role !== "held-out")
    throw new Error(`${where}: not a held-out comparison`);
  if (t.cohort.ascension !== ascension || t.cohort.profile !== "veteran")
    throw new Error(`${where}: not played at Ascension ${ascension} with the veteran profile`);
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
      throw new Error(
        `${where}: the ${label} table adds up to ${n}, not the ${total} pairs both arms completed`,
      );
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
  for (const m of t.members)
    table(`${m.character} Act-1`, m.reachedAct2.pairedTable, m.bothCompleted);
  return {
    id: where
      .split("/")
      .pop()
      .replace(/\.json$/, ""),
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
