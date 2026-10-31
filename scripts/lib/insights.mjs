import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { CLASSES, EXACT, closeP, mcnemarExact } from "./pooled.mjs";

// The data of the insights page (ADR-059). Everything the page states as a number is read here from the committed experiment files, each
// one checked against the counts it rests on and against the arms it is said to compare, and nothing is typed into the page. The page
// says what each number is (a registered held-out test, a development result, an exploratory reading, a description) and this file
// says which: every row carries the evidence class of the file it came from.

const read = (path) => JSON.parse(readFileSync(path, "utf8"));

// One paired comparison of two arms past the Act-1 boss, from a pooled file written by `slay2_sim pool` (five classes, whole-seed interval)
// or from a paired file of one class (the interval is the Wald interval of the paired table, and says so).
export function readComparison({ where, path, arms: [first, second], expect }) {
  const t = read(path);
  const pooled = t.kind === "pooled-paired-comparison";
  if ((!pooled && t.kind !== "paired-comparison") || t.schema !== 1)
    throw new Error(`${where}: not a paired comparison of schema 1`);
  const ids = pooled
    ? t.members.flatMap((m) => [m.a.batchId, m.b.batchId])
    : [t.a.batchId, t.b.batchId];
  const firstIds = pooled ? t.members.map((m) => m.a.batchId) : [t.a.batchId];
  const secondIds = pooled ? t.members.map((m) => m.b.batchId) : [t.b.batchId];
  if (!firstIds.every((id) => first.test(id)))
    throw new Error(`${where}: the first arm is not ${first} in every batch (${firstIds[0]})`);
  if (!secondIds.every((id) => second.test(id)))
    throw new Error(`${where}: the second arm is not ${second} in every batch (${secondIds[0]})`);
  if (expect?.partition && t.cohort?.partition !== expect.partition)
    throw new Error(`${where}: not on the ${expect.partition} seeds (${t.cohort?.partition})`);
  if (expect?.ascension !== undefined && t.cohort?.ascension !== expect.ascension)
    throw new Error(`${where}: not at Ascension ${expect.ascension}`);
  if (expect?.role && !String(t.role).startsWith(expect.role))
    throw new Error(`${where}: its role is "${t.role}", not ${expect.role}`);
  const r = t.reachedAct2;
  const table = r.pairedTable;
  const n = t.bothCompleted;
  // seeds per class of a pooled file: the same for every class (a pooled comparison pairs the same list of seeds in each)
  let seedsPerClass = null;
  if (pooled) {
    const seeds = new Set(t.members.map((m) => m.pairedSeeds));
    if (seeds.size !== 1 || !Number.isInteger([...seeds][0]))
      throw new Error(`${where}: the classes do not pair the same number of seeds`);
    seedsPerClass = [...seeds][0];
  }
  if (table.a_only + table.b_only + table.both + table.neither !== n)
    throw new Error(`${where}: the paired table does not add up to the pairs both arms completed`);
  if (!closeP(table.mcnemar_p, mcnemarExact(table.a_only, table.b_only)))
    throw new Error(`${where}: the p-value is not the exact McNemar p-value of its counts`);
  const rateA = (table.a_only + table.both) / n;
  const rateB = (table.b_only + table.both) / n;
  if (Math.abs(rateA - r.a.rate) > 1e-9 || Math.abs(rateB - r.b.rate) > 1e-9)
    throw new Error(`${where}: a share is not what the paired table gives`);
  const difference = rateA - rateB;
  let ci95;
  let method;
  if (pooled) {
    const c = t.clusteredDifference;
    if (Math.abs(c.meanAMinusB - difference) > 1e-9)
      throw new Error(`${where}: the pooled difference is not the one the table gives`);
    ci95 = c.ci95;
    method = "resampling whole seeds";
  } else {
    // the paired Wald interval: the variance of the mean of (A passed - B passed) over the pairs
    const d = table.a_only + table.b_only;
    const se = Math.sqrt(Math.max(0, d - (table.a_only - table.b_only) ** 2 / n)) / n;
    ci95 = [difference - 1.96 * se, difference + 1.96 * se];
    method = "paired Wald interval";
  }
  if (!(ci95[0] <= difference && difference <= ci95[1]))
    throw new Error(`${where}: the interval does not hold the difference`);
  return {
    first: rateA,
    second: rateB,
    difference,
    ci95,
    method,
    pairs: n,
    aOnly: table.a_only,
    bOnly: table.b_only,
    p: table.mcnemar_p,
    classes: pooled ? t.members.length : 1,
    file: path,
    sha256: t.contentSha256,
    ids,
    seedsPerClass,
    // mean wall seconds of one game in each arm, where the paired file records them (the search comparison does)
    wall:
      !pooled && t.a?.meanWallSecondsPerEpisode > 0 && t.b?.meanWallSecondsPerEpisode > 0
        ? { first: t.a.meanWallSecondsPerEpisode, second: t.b.meanWallSecondsPerEpisode }
        : null,
    members: pooled
      ? Object.fromEntries(
          t.members.map((m) => [
            String(m.character).toLowerCase(),
            {
              first: m.reachedAct2.a,
              second: m.reachedAct2.b,
              pairs: m.bothCompleted,
              aOnly: m.reachedAct2.pairedTable.a_only,
              bOnly: m.reachedAct2.pairedTable.b_only,
              p: m.reachedAct2.pairedTable.mcnemar_p,
            },
          ]),
        )
      : null,
  };
}

// What each lever is, the arms that were compared, and where each measurement lives. A row is refused when its file is not the comparison
// named here (arms by batch name, partition, Ascension, role), so a renamed or mislabelled file cannot stand in for another.
const LEVERS = [
  {
    id: "card-values",
    label: "Pick cards by measured value",
    versus: "the hand-written ratings",
    first: "a pilot that follows the card values shown on the site",
    second: "the same pilot with the hand-written ratings",
    inAdvisor: "second-opinion",
    adr: ["ADR-031", "ADR-034", "ADR-053", "ADR-058"],
    rows: [
      {
        when: "a0",
        file: "experiments/ascension9/pooled-a0keep-t2-values-shown-vs-rules_v1.json",
        arms: [/^rules_v2-shownvals-/, /^rules_v1-/],
        expect: { partition: "val", ascension: 0, role: "held-out" },
        evidence: "descriptive",
        note: "Played as the descriptive twin of the Ascension 9 test (ADR-058): the same pair at Ascension 0, the relics kept; no decision rests on it.",
      },
      {
        when: "a9",
        file: "experiments/ascension9/pooled-a9-t2-values-shown-vs-rules_v1.json",
        arms: [/^rules_v2-shownvals-/, /^rules_v1-/],
        expect: { partition: "val", ascension: 9, role: "held-out" },
        evidence: "registered",
      },
    ],
  },
  {
    id: "synergy",
    label: "Count how cards work together",
    versus: "the same index without the synergy term",
    first: "a pilot that picks cards by the index with the synergy term",
    second: "the same pilot without it",
    inAdvisor: "yes",
    adr: ["ADR-050", "ADR-054", "ADR-058"],
    rows: [
      {
        when: "a0",
        file: "experiments/synergy/keep-val/pooled-astar-vs-d0star.json",
        arms: [/-astar-/, /-d0star-/],
        expect: { partition: "val", ascension: 0, role: "held-out" },
        evidence: "registered",
      },
      {
        when: "a9",
        file: "experiments/ascension9/pooled-a9-t1-synergy-astar-vs-d0star.json",
        arms: [/-astar-/, /-d0star-/],
        expect: { partition: "val", ascension: 9, role: "held-out" },
        evidence: "registered",
      },
    ],
  },
  {
    id: "opening-relic",
    label: "Take the best-measured opening relic",
    versus: "the first helpful relic",
    first: "a pilot that takes the opening relic with the largest measured value",
    second: "a pilot that takes the first helpful relic",
    inAdvisor: "yes",
    adr: ["ADR-049", "ADR-055", "ADR-058"],
    rows: [
      {
        when: "a0",
        file: "experiments/neow/pooled-neow-values-keep-v1-vs-rules_v2-keeprelics-val.json",
        arms: [/^rules_v2_neow_values-keepvals-/, /^rules_v2-/],
        expect: { partition: "val", ascension: 0, role: "held-out" },
        evidence: "registered",
      },
      {
        when: "a9",
        file: "experiments/ascension9/pooled-a9-t3-neow-keep-v1-vs-rules_v2.json",
        arms: [/^rules_v2_neow_values-keepvals-/, /^rules_v2-/],
        expect: { partition: "val", ascension: 9, role: "held-out" },
        evidence: "registered",
      },
    ],
  },
  {
    id: "values-remeasured",
    label: "Measure the card values again when relics are kept",
    versus: "the values measured without them",
    first: "a pilot that follows the values measured with the relics kept",
    second: "a pilot that follows the values the site showed before",
    inAdvisor: "four-classes",
    adr: ["ADR-053"],
    note: "Ironclad's own games favoured its earlier set, so the advisor shows the new values for four classes. Four of the five earlier sets were measured by an older pilot as well, so the gain is not due to the relics alone.",
    rows: [
      {
        when: "a0",
        file: "experiments/cardvalue/pooled-keepvals-vs-curvals-val.json",
        arms: [/^rules_v3-keepvals-/, /^rules_v3-curvals-/],
        expect: { partition: "val", ascension: 0, role: "held-out" },
        evidence: "registered",
      },
    ],
  },
  {
    id: "thresholds",
    label: "Avoid more elite fights",
    versus: "the untuned thresholds",
    first: "a pilot with three tuned elite-fight thresholds (Ironclad)",
    second: "the same pilot untuned",
    inAdvisor: "no",
    adr: ["ADR-036", "ADR-045"],
    note: "Three thresholds that decide when to fight an elite, tuned in a simulator that dropped the relics a run gains, so they may not carry over. The heal, rest and shop thresholds were screened too and none was adopted.",
    rows: [
      {
        when: "a0-dropped",
        file: "experiments/comparisons/rules_v3-vs-rules_v2-ironclad-a0-veteran-val.json",
        arms: [/^rules_v3-/, /^rules_v2-/],
        expect: { partition: "val", ascension: 0, role: "held-out" },
        evidence: "registered",
      },
    ],
  },
  {
    id: "search",
    label: "Plan every fight with a search",
    versus: "the rules pilot",
    first: "a pilot that plans each fight by searching on clones (Ironclad)",
    second: "the rules pilot",
    speed: true,
    inAdvisor: "no",
    adr: ["ADR-033", "ADR-040"],
    note: "Nothing on the site runs a simulator.",
    rows: [
      {
        when: "a0-dropped",
        file: "experiments/comparisons/search_v3-all-vs-rules_v2-ironclad-a0-veteran-val.json",
        arms: [/^search_v3-all-/, /^rules_v2-/],
        expect: { partition: "val", ascension: 0, role: "held-out" },
        evidence: "registered",
      },
    ],
  },
  {
    id: "relics-along-the-way",
    label: "Simulator fix: keep the relics a run gains (G14)",
    versus: "losing them at the next fight (the simulator's old behaviour)",
    first: "the same pilot with the relics it gains kept",
    second: "the same pilot as the pinned simulator plays it (every relic gained after the first fight is dropped)",
    inAdvisor: "no",
    adr: ["ADR-052"],
    note: "A measurement of a simulator defect (G14), and the size of what relics from chests, elites, shops and bosses are worth together; no registered test.",
    rows: [
      {
        when: "a0",
        label: "Ascension 0, relics kept against relics dropped",
        file: "experiments/g14/pooled-keeprelics-vs-base-dev.json",
        arms: [/keeprelics/, /^(?!.*keeprelics)/],
        expect: { partition: "dev", ascension: 0, role: "development" },
        evidence: "development",
      },
    ],
  },
];

export function parseLevers(root) {
  return LEVERS.map((lever) => ({
    id: lever.id,
    label: lever.label,
    versus: lever.versus,
    first: lever.first,
    second: lever.second,
    inAdvisor: lever.inAdvisor,
    adr: lever.adr,
    note: lever.note ?? null,
    rows: lever.rows.map((row) => {
      const c = readComparison({
        where: `${lever.id}/${row.when}`,
        path: join(root, row.file),
        arms: row.arms,
        expect: row.expect,
      });
      // a class whose own games had the first arm behind (a lever that helps on the whole may not help everywhere)
      const behind = c.members
        ? Object.entries(c.members)
            .filter(([, m]) => m.first < m.second)
            .map(([character, m]) => ({ character, ...m }))
        : [];
      return {
        when: row.when,
        label: row.label ?? null,
        evidence: row.evidence,
        note: row.note ?? null,
        behind,
        // how many times longer one game takes, for the lever whose cost is part of what it is (the search)
        slowdown: lever.speed && c.wall ? c.wall.first / c.wall.second : null,
        file: row.file,
        sha256: c.sha256,
        first: c.first,
        second: c.second,
        difference: c.difference,
        ci95: c.ci95,
        method: c.method,
        pairs: c.pairs,
        aOnly: c.aOnly,
        bOnly: c.bOnly,
        p: c.p,
        classes: c.classes,
      };
    }),
  }));
}

// ---- where runs end

function readEpisodes(dir) {
  const gz = join(dir, "episodes.jsonl.gz");
  const text = existsSync(gz)
    ? gunzipSync(readFileSync(gz)).toString("utf8")
    : readFileSync(join(dir, "episodes.jsonl"), "utf8");
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// The pilot that follows the card values shown on the site, in the game with the relics kept, at Ascension 0 and at Ascension 9: the best
// pilot the project has and the two levels the held-out studies were played at. Each class's batch is checked against its own manifest.
const ENDS = [
  { id: "a0", ascension: 0, label: "Ascension 0" },
  { id: "a9", ascension: 9, label: "Ascension 9" },
];

// `killed_by` lists the enemies still alive when the run ended, so one fight fills several rows ("KIN_PRIEST", "KIN_FOLLOWER,KIN_PRIEST", ...).
// On the floor of an act's boss every death is a death in a boss fight, and the enemies that were ever alive together belong to one fight:
// the ids of those deaths are joined into fights (a union of the ids that appear in one row), and a fight is named by its sorted ids.
// Away from the boss floors the rows are left as the games wrote them; the page says so.
export function fightKeyOf(rows) {
  const parent = new Map();
  const find = (x) => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r);
    for (let c = x; parent.get(c) !== r; ) {
      const next = parent.get(c);
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  for (const ids of rows) for (const id of ids) if (!parent.has(id)) parent.set(id, id);
  for (const ids of rows)
    for (let i = 1; i < ids.length; i++) {
      const a = find(ids[0]);
      const b = find(ids[i]);
      if (a !== b) parent.set(a, b);
    }
  const members = new Map();
  for (const id of parent.keys()) {
    const r = find(id);
    members.set(r, [...(members.get(r) ?? []), id]);
  }
  const key = new Map();
  for (const ids of members.values()) {
    const k = [...new Set(ids)].sort().join(",");
    for (const id of ids) key.set(id, k);
  }
  return (ids) => key.get(ids[0]);
}

function endsFor(root, variant, bossFloors) {
  const perClass = [];
  const killers = [{}, {}, {}];
  const killersAtBoss = [{}, {}, {}];
  const bossRows = [[], [], []];
  const unrecorded = [0, 0, 0];
  const allGold = [];
  let seedsPerClass = null;
  for (const cls of CLASSES) {
    const id = `rules_v2-shownvals-${cls}-a${variant.ascension}-veteran-keeprelics-val-n2000`;
    const dir = join(root, "experiments", "batches", id);
    const m = read(join(dir, "manifest.json"));
    if (
      m.config.character !== EXACT[cls] ||
      m.config.ascension !== variant.ascension ||
      m.config.keep_relics !== true ||
      m.policy.name !== "rules_v2" ||
      m.seeds.partition !== "val"
    )
      throw new Error(`${id}: the manifest is not the batch the insights page says it is`);
    if (!Number.isInteger(m.seeds.n) || (seedsPerClass !== null && m.seeds.n !== seedsPerClass))
      throw new Error(`${id}: the classes do not play the same number of seeds`);
    seedsPerClass = m.seeds.n;
    const eps = readEpisodes(dir).filter((e) => e.outcome === "win" || e.outcome === "death");
    const counts = m.summary.counts;
    if (eps.length !== m.summary.completed || eps.filter((e) => e.outcome === "win").length !== counts.win)
      throw new Error(`${id}: the episodes are not what the manifest counts`);
    const dead = eps.filter((e) => e.outcome === "death");
    const died = [0, 1, 2].map((a) => dead.filter((e) => e.act === a).length);
    if (died.reduce((a, b) => a + b, 0) !== dead.length)
      throw new Error(`${id}: a death outside the three acts`);
    // a death on the floor of an act's boss is a death in that boss fight (the only room on that floor)
    const atBoss = [0, 1, 2].map((a) => dead.filter((e) => e.act === a && e.floor === bossFloors[a]).length);
    if (atBoss.some((n, a) => n > died[a])) throw new Error(`${id}: more boss deaths than deaths in an act`);
    for (const e of dead) {
      if (e.killed_by === null || e.killed_by === undefined) {
        unrecorded[e.act] += 1;
        continue;
      }
      const key = String(e.killed_by);
      if (e.floor === bossFloors[e.act]) bossRows[e.act].push(key.split(","));
      else killers[e.act][key] = (killers[e.act][key] ?? 0) + 1;
    }
    const gold = dead.map((e) => e.gold);
    allGold.push(...gold);
    perClass.push({
      character: cls,
      batchId: id,
      sha256: m.content_sha256 ?? m.contentSha256 ?? null,
      completed: eps.length,
      diedAct1: died[0],
      diedAct2: died[1],
      diedAct3: died[2],
      bossAct1: atBoss[0],
      bossAct2: atBoss[1],
      bossAct3: atBoss[2],
      won: counts.win,
      goldMedian: median(gold),
      goldShare150: gold.filter((g) => g >= 150).length / gold.length,
      goldShare300: gold.filter((g) => g >= 300).length / gold.length,
      deckMean: mean(dead.map((e) => e.deck_size)),
      relicsMean: mean(dead.map((e) => e.relics)),
    });
  }
  // the deaths on a boss floor, joined into fights across the five classes
  for (let act = 0; act < 3; act++) {
    const fight = fightKeyOf(bossRows[act]);
    for (const ids of bossRows[act]) {
      const key = fight(ids);
      killers[act][key] = (killers[act][key] ?? 0) + 1;
      killersAtBoss[act][key] = (killersAtBoss[act][key] ?? 0) + 1;
    }
  }
  const sum = (key) => perClass.reduce((a, c) => a + c[key], 0);
  const completed = sum("completed");
  return {
    id: variant.id,
    label: variant.label,
    ascension: variant.ascension,
    pilot: "rules_v2 following the card values shown on the site",
    relicsKept: true,
    seedsPerClass,
    completed,
    goldMedian: median(allGold),
    goldShare150: allGold.filter((g) => g >= 150).length / allGold.length,
    goldShare300: allGold.filter((g) => g >= 300).length / allGold.length,
    diedAct1: sum("diedAct1"),
    diedAct2: sum("diedAct2"),
    diedAct3: sum("diedAct3"),
    bossAct1: sum("bossAct1"),
    bossAct2: sum("bossAct2"),
    bossAct3: sum("bossAct3"),
    won: sum("won"),
    perClass,
    killersByAct: killers.map((byId, act) => {
      const named = Object.values(byId).reduce((a, b) => a + b, 0);
      const total = named + unrecorded[act];
      return {
        deaths: total,
        unrecorded: unrecorded[act],
        top: Object.entries(byId)
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 6)
          .map(([enemy, n]) => ({
            enemy,
            deaths: n,
            share: n / total,
            // how many of this fight's deaths were on the floor of the act's boss: all of them for a boss, none for any other fight
            atBoss: killersAtBoss[act][enemy] ?? 0,
          })),
      };
    }),
  };
}

export function parseRunsEnd(root, bossFloors) {
  if (
    !Array.isArray(bossFloors) ||
    bossFloors.length !== 3 ||
    !bossFloors.every((f, i) => Number.isInteger(f) && f > 0 && (i === 0 || f > bossFloors[i - 1]))
  )
    throw new Error("the floors of the three bosses are three increasing whole numbers");
  return ENDS.map((v) => endsFor(root, v, bossFloors));
}

// ---- what matters at the second boss (exploratory; the analysis is slay2_sim.latedrivers)

export function parseLateDrivers(root) {
  const path = join(root, "experiments", "insights", "late-drivers.json");
  const t = read(path);
  if (t.kind !== "late-drivers" || t.schema !== 1 || t.role !== "exploratory")
    throw new Error("late-drivers.json: not the exploratory reading of schema 1");
  // the share of card picks the pilot of these games chose at random, read from the batches' own manifests (the same in every one)
  let exploreShare = null;
  for (const b of t.batches) {
    const m = read(join(root, "experiments", "cardvalue", b.batchId, "manifest.json"));
    if ((m.content_sha256 ?? null) !== b.contentSha256)
      throw new Error(`late-drivers.json: ${b.batchId} is not the batch it was fitted from`);
    if (!b.keepRelics || b.ascension !== 0)
      throw new Error(`late-drivers.json: ${b.batchId} is not a relics-kept Ascension 0 batch`);
    const explore = m.policy?.effective?.params?.explore ?? m.policy?.params?.explore;
    if (typeof explore !== "number" || !(explore > 0 && explore < 1))
      throw new Error(`late-drivers.json: ${b.batchId} does not record the share of random card picks`);
    if (exploreShare !== null && explore !== exploreShare)
      throw new Error(`late-drivers.json: the batches do not share one share of random card picks`);
    exploreShare = explore;
  }
  const bossFloors = t.bossFloors;
  if (
    !Array.isArray(bossFloors) ||
    bossFloors.length !== 3 ||
    !bossFloors.every((f, i) => Number.isInteger(f) && f > 0 && (i === 0 || f > bossFloors[i - 1]))
  )
    throw new Error("late-drivers.json: bossFloors are not the floors of three bosses, increasing");
  const ep = t.endpoints;
  for (const k of ["act1", "act2"])
    if (ep[k].passed > ep[k].runs || Math.abs(ep[k].rate - ep[k].passed / ep[k].runs) > 1e-12)
      throw new Error(`late-drivers.json: the ${k} counts are not consistent`);
  const features = t.features.map((f) => {
    for (const side of ["act1", "act2"]) {
      const [lo, hi] = f[side].ci95;
      if (!(lo <= f[side].beta && f[side].beta <= hi))
        throw new Error(`late-drivers.json: ${f.id} ${side}: the interval does not hold the estimate`);
      if (Math.abs(f[side].oddsRatio - Math.exp(f[side].beta)) > 1e-9)
        throw new Error(`late-drivers.json: ${f.id} ${side}: the odds ratio is not exp(beta)`);
    }
    if (Math.abs(f.difference.beta - (f.act2.beta - f.act1.beta)) > 1e-9)
      throw new Error(`late-drivers.json: ${f.id}: the difference is not the two estimates' difference`);
    // the sign of the difference in the classes that have enough second-boss fights to be fitted alone
    const alone = Object.values(t.perClass ?? {}).filter(Boolean);
    const agreeing = alone.filter(
      (c) => Math.sign(c.act2[f.id] - c.act1[f.id]) === Math.sign(f.difference.beta),
    ).length;
    // whether the feature's pull is stronger or weaker at the second boss: for a feature that hurts at the first boss (a starting card), a difference
    // above zero is a weaker pull, so the direction of the difference is read against the direction of the first-boss effect
    const dir = Math.sign(f.act1.beta) || 1;
    const lo = dir > 0 ? f.difference.ci95[0] : -f.difference.ci95[1];
    const hi = dir > 0 ? f.difference.ci95[1] : -f.difference.ci95[0];
    const separate = lo > 0 ? "later" : hi < 0 ? "earlier" : "same";
    return {
      id: f.id,
      label: f.label,
      unit: f.unit,
      act1: { oddsRatio: f.act1.oddsRatio, ci95: f.act1.oddsRatioCi95 },
      act2: { oddsRatio: f.act2.oddsRatio, ci95: f.act2.oddsRatioCi95 },
      difference: f.difference,
      matters: separate,
      classesAgreeing: agreeing,
      classesAlone: alone.length,
    };
  });
  return {
    file: "experiments/insights/late-drivers.json",
    role: t.role,
    batches: t.batches.map((b) => ({ id: b.batchId, character: b.character, completed: b.completed })),
    draws: t.bootstrap.draws,
    exploreShare,
    bossFloors,
    endpoints: ep,
    classes: t.classes,
    features,
  };
}

// ---- the Ascension ladder: the same pilot's share past the Act-1 boss at Ascension 0 and 9, class by class

export function parseAscensionLadder(root) {
  const a0 = readComparison({
    where: "ascension/a0",
    path: join(root, "experiments/ascension9/pooled-a0keep-t2-values-shown-vs-rules_v1.json"),
    arms: [/^rules_v2-shownvals-/, /^rules_v1-/],
    expect: { partition: "val", ascension: 0, role: "held-out" },
  });
  const a9 = readComparison({
    where: "ascension/a9",
    path: join(root, "experiments/ascension9/pooled-a9-t2-values-shown-vs-rules_v1.json"),
    arms: [/^rules_v2-shownvals-/, /^rules_v1-/],
    expect: { partition: "val", ascension: 9, role: "held-out" },
  });
  if (a0.seedsPerClass !== a9.seedsPerClass)
    throw new Error("ascension: the two levels do not pair the same number of seeds");
  return {
    pilots: { first: "follows the card values shown on the site", second: "the hand-written rules" },
    seedsPerClass: a0.seedsPerClass,
    pooled: {
      a0: { first: a0.first, second: a0.second, pairs: a0.pairs },
      a9: { first: a9.first, second: a9.second, pairs: a9.pairs },
    },
    perClass: CLASSES.map((cls) => ({
      character: cls,
      a0: a0.members[cls],
      a9: a9.members[cls],
    })),
  };
}

// ---- how much has been played

export function parseGames(root, reports) {
  const valid = reports.filter((r) => r.role !== "void");
  const sum = (f) => valid.reduce((a, r) => a + f(r), 0);
  // the batches that fitted a value table or checked a precondition are not in the ledger (they are not comparisons); they are games too
  const others = [];
  const scan = (dir, depth) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      if (!name.isDirectory()) continue;
      const sub = join(dir, name.name);
      if (existsSync(join(sub, "manifest.json"))) others.push(read(join(sub, "manifest.json")));
      else if (depth > 0) scan(sub, depth - 1);
    }
  };
  scan(join(root, "experiments", "cardvalue"), 0);
  scan(join(root, "experiments", "neow"), 1);
  scan(join(root, "experiments", "ascension9", "precondition"), 0);
  const exploration = {
    batches: others.length,
    started: others.reduce((a, m) => a + m.seeds.n, 0),
    completed: others.reduce((a, m) => a + m.summary.completed, 0),
  };
  return {
    batches: valid.length,
    started: sum((r) => r.seeds),
    completed: sum((r) => r.completed),
    wins: sum((r) => r.counts.win),
    exploration,
  };
}

export function parseInventory(root) {
  const t = read(join(root, "experiments", "insights", "game-inventory.json"));
  if (t.kind !== "game-inventory" || t.schema !== 1)
    throw new Error("game-inventory.json: not an inventory of schema 1");
  return t;
}
