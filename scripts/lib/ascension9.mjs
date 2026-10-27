import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { commonBatchProblem, readPooledHeldOut } from "./pooled.mjs";

// ---- The Ascension 9 transfer study (ADR-058): three held-out tests of results measured at Ascension 0, nothing refitted ---------------------
// Each is a pooled paired test of five classes at Ascension 9 with the relics kept, the first arm against the second, read at 0.05 / 3 (the
// study-wise level split over the three) and run once. Until the three pooled files exist the output says that the study is registered and
// carries its precondition; with them it carries each test as it came out, the reading rule (passed / not shown / reversed) applied to the
// numbers, and for the opening-relic rule which classes' own Ascension 9 games licence a named relic (p below 0.01, the rule ahead).
const A9 = { ascension: 9, level: 0.05 / 3, classLevel: 0.01, seeds: 2000, adr: "ADR-058" };
const A9_NEOW_VALUES = "experiments/neow/neow-values-keep-v1.json";
const A9_NEOW_SHA = "cb9f166754f410558eb33bbb79a35152ff1e69f595dfb3729ad2435c7ef496d8";
// the pooled difference is read with the whole-seed bootstrap interval at the level the test is read at (`slay2_sim pool --confidence`)
const A9_CI_LEVEL = 1 - A9.level;
// the Ascension 0 test of the same arms in the same game (the relics kept), read for the size words (ADR-058 item 4); T2's is the twin
const A0_REFERENCES = {
  synergy: { file: "experiments/synergy/keep-val/pooled-astar-vs-d0star.json", adr: "ADR-054" },
  neow: {
    file: "experiments/neow/pooled-neow-values-keep-v1-vs-rules_v2-keeprelics-val.json",
    adr: "ADR-055",
  },
};
const A9_TWIN = {
  file: "pooled-a0keep-t2-values-shown-vs-rules_v1.json",
  names: ["shown", "rules_v1"],
  arms: ["rules_v2-shownvals", "rules_v1"],
};
const A9_TESTS = [
  {
    key: "synergy",
    file: "pooled-a9-t1-synergy-astar-vs-d0star.json",
    names: ["astar", "d0star"],
    arms: ["advisor_v1-astar", "advisor_v1-d0star"],
  },
  {
    key: "values",
    file: "pooled-a9-t2-values-shown-vs-rules_v1.json",
    names: ["shown", "rules_v1"],
    arms: ["rules_v2-shownvals", "rules_v1"],
  },
  {
    key: "neow",
    file: "pooled-a9-t3-neow-keep-v1-vs-rules_v2.json",
    names: ["neow", "base"],
    arms: ["rules_v2_neow_values-keepvals", "rules_v2"],
  },
];

export function parseAscensionNine({ root, reports, synergyChoice }) {
  const dir = join(root, "experiments", "ascension9");
  const decisionLog = join(root, "docs", "DECISIONS.md");
  const decisions = existsSync(decisionLog) ? readFileSync(decisionLog, "utf8") : "";
  const at = decisions.indexOf(`${A9.adr}: do the three results`);
  if (at < 0) {
    if (existsSync(dir))
      throw new Error(`experiments/ascension9 exists but docs/DECISIONS.md has no ${A9.adr}`);
    return { registered: false };
  }
  // what the registration quotes: the hash of every file an arm reads (the text of the record, not the results that follow it)
  const record = decisions.slice(at);
  const read = (name) => JSON.parse(readFileSync(join(dir, name), "utf8"));
  const shaOf = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
  const pre = read("precondition.json");
  if (pre.kind !== "ascension9-precondition" || pre.schema !== 1 || pre.passed !== true)
    throw new Error("experiments/ascension9/precondition.json: not a passed precondition");
  const chk = read("ascension-check.json");
  if (chk.kind !== "ascension-check" || chk.schema !== 1 || chk.allClaimsHold !== true)
    throw new Error("experiments/ascension9/ascension-check.json: not a passing ascension check");
  const preGames = Object.values(pre.arms).reduce(
    (n, a) => n + Object.values(a.classes).reduce((m, c) => m + c.games, 0),
    0,
  );
  const out = {
    adr: A9.adr,
    registered: true,
    ascension: A9.ascension,
    level: A9.level,
    classLevel: A9.classLevel,
    seeds: A9.seeds,
    precondition: {
      file: "experiments/ascension9/precondition.json",
      sha256: shaOf(join(dir, "precondition.json")),
      games: preGames,
      pooledShownValues: pre.pooledShownValues,
    },
    ascensionCheck: {
      file: "experiments/ascension9/ascension-check.json",
      sha256: shaOf(join(dir, "ascension-check.json")),
      claims: Object.keys(chk.claims),
    },
    tests: null,
  };
  const files = [...A9_TESTS, A9_TWIN];
  const present = files.filter((x) => existsSync(join(dir, x.file)));
  if (present.length === 0) return out;
  if (present.length !== files.length)
    throw new Error(
      `experiments/ascension9 has ${present.map((x) => x.file).join(", ")} but not the others: ${A9.adr} runs the three tests and the twin of the second together, once`,
    );

  // every file an arm reads is one the registration quotes, and every arm's manifest shows it was that file
  const quoted = (file) => {
    const sha = shaOf(join(root, file));
    if (!record.includes(sha))
      throw new Error(`${file}: its SHA-256 (${sha}) is not quoted in ${A9.adr}`);
    return sha;
  };
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
  const choice = synergyChoice();
  const heads = new Set();
  const clean = (r) => {
    const env = manifestOf(r.id).environment?.slay2 ?? {};
    heads.add(env.head);
    return env.dirty === false
      ? null
      : `it was played from a working tree with uncommitted changes (${A9.adr} asks for a clean checkout)`;
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
                ["needs", "scalers", "engines"].every((k) => e[k] === choice.config[k])
              ) || choice.margin !== 0
            ? "its parameters are not those of A* (ADR-050 addendum D)"
            : clean(current);
      case "d0star":
        return current.policy !== "advisor_v1"
          ? `its policy is ${current.policy}`
          : !(e.synergy === 0 && e.margin === 0 && e.relics === false)
            ? "it is not the index without the synergy term at margin 0"
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
          : e.neow_values !== A9_NEOW_VALUES || e.neow_values_sha256 !== A9_NEOW_SHA
            ? `it does not follow ${A9_NEOW_VALUES} (${A9_NEOW_SHA.slice(0, 8)}…)`
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
  quoted(A9_NEOW_VALUES);
  // the games of each pooled file are the ones the study's script names: <arm>-<class>-a<Ascension>-veteran-keeprelics-val-n2000
  const readTest = (spec, ascension, arms = spec.arms) => {
    const test = readPooledHeldOut({
      where: `experiments/ascension9/${spec.file}`,
      path: join(dir, spec.file),
      names: spec.names,
      seeds: A9.seeds,
      byId,
      ascension,
      check: (current, name, cls) =>
        commonBatchProblem(current, cls, {
          seeds: A9.seeds,
          keepRelics: true,
          adr: A9.adr,
          ascension,
        }) ?? armProblem(current, name, cls),
    });
    spec.names.forEach((name, i) => {
      for (const m of test.members) {
        const side = i === 0 ? m.a.batchId : m.b.batchId;
        const want = `${arms[i]}-${m.character}-a${String(ascension)}-veteran-keeprelics-val-n2000`;
        if (side !== want)
          throw new Error(`experiments/ascension9/${spec.file}: ${m.character} ${name} is ${side}, not ${want}`);
      }
    });
    return { file: `experiments/ascension9/${spec.file}`, sha256: shaOf(join(dir, spec.file)), ...test };
  };
  // each class on its own at the class level (uncorrected): the rule ahead or the other arm ahead (ADR-058 item 5 iii and v)
  const classesOf = (test) =>
    Object.fromEntries(
      test.members.map((m) => {
        const own = m.reachedAct2.pairedTable;
        const significant = own.mcnemar_p < A9.classLevel;
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
    const at = test.clusteredDifference?.ciAtLevel;
    if (
      !at ||
      typeof at.level !== "number" ||
      Math.abs(at.level - A9_CI_LEVEL) > 1e-9 ||
      !Array.isArray(at.ci) ||
      at.ci.length !== 2 ||
      !(at.ci[0] <= test.clusteredDifference.meanAMinusB && test.clusteredDifference.meanAMinusB <= at.ci[1])
    )
      throw new Error(
        `${test.file}: no whole-seed interval at level ${A9_CI_LEVEL.toFixed(6)} (run slay2_sim pool with --confidence)`,
      );
    return at.ci;
  };

  const tests = {};
  for (const spec of A9_TESTS) {
    const test = readTest(spec, A9.ascension);
    const tab = test.reachedAct2.pairedTable;
    const [lo, hi] = levelInterval(test);
    const significant = tab.mcnemar_p < A9.level;
    // the reading rule of ADR-058 item 4, a partition of the outcomes
    const verdict =
      significant && tab.a_only > tab.b_only && lo > 0
        ? "passed"
        : significant && tab.b_only > tab.a_only && hi < 0
          ? "reversed"
          : "not-shown";
    tests[spec.key] = { verdict, ...test, classes: classesOf(test) };
  }
  // the twin of T2 at Ascension 0 with the relics kept (descriptive)
  const twin = readTest(A9_TWIN, 0);
  if (heads.size !== 1 || ![...heads].every((h) => /^[0-9a-f]{40}$/.test(String(h))))
    throw new Error(
      `the arms of the tests and the twin were not all played from one commit (heads: ${[...heads].join(", ")})`,
    );
  tests.values.twin = twin;

  // the Ascension 0 difference of the same arms, set beside each Ascension 9 result (ADR-058 item 4, size)
  const reference = (key) => {
    if (key === "values") {
      return {
        file: twin.file,
        adr: A9.adr,
        mean: twin.clusteredDifference.meanAMinusB,
        ci95: twin.clusteredDifference.ci95,
        a: twin.reachedAct2.a.rate,
        b: twin.reachedAct2.b.rate,
        bothCompleted: twin.bothCompleted,
      };
    }
    const spec = A0_REFERENCES[key];
    const path = join(root, spec.file);
    if (!existsSync(path)) return null;
    const r = JSON.parse(readFileSync(path, "utf8"));
    if (
      r.kind !== "pooled-paired-comparison" ||
      r.cohort?.ascension !== 0 ||
      r.cohort?.partition !== "val" ||
      r.role !== "held-out" ||
      typeof r.clusteredDifference?.meanAMinusB !== "number"
    )
      throw new Error(`${spec.file}: not the held-out Ascension 0 test ${spec.adr} read at Ascension 0`);
    const same = key === "synergy" ? ["advisor_v1", "advisor_v1"] : ["rules_v2_neow_values", "rules_v2"];
    if (r.policies?.a !== same[0] || r.policies?.b !== same[1])
      throw new Error(`${spec.file}: its arms are ${r.policies?.a} and ${r.policies?.b}, not the arms of ${key}`);
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
    const a0 = reference(key);
    const t9 = tests[key];
    const [lo, hi] = t9.clusteredDifference.ciAtLevel.ci;
    t9.a0 = a0;
    // "smaller", "larger" or "about the same" than at Ascension 0, only for a test that passed and only when there is an Ascension 0 difference to set it beside
    t9.size =
      t9.verdict === "passed" && a0
        ? hi < a0.mean
          ? "smaller"
          : lo > a0.mean
            ? "larger"
            : "about-the-same"
        : null;
  }
  return { ...out, tests, heads: [...heads] };
}
