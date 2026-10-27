// @vitest-environment node
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import evidence from "@/content/evidence.generated.json";
import {
  comparisonSentence,
  actTwoSentence,
  comparisonVerdict,
  formatP,
  largestReport,
  newValuesSentence,
  policyLabel,
  sideLabel,
  signed,
  ratingsValidation,
  valuesValidation,
  winRows,
  winSentence,
  type Comparison,
} from "@/lib/methods-data";
import { contactLink, siteUrl } from "@/lib/site-config";

// These tests start the site-data exporter in a child process; on a busy machine that takes longer than the 5 s default.
vi.setConfig({ testTimeout: 30_000 });

const repo = join(__dirname, "..", "..", "..");

function comparison(over: Partial<Comparison["floorDifference"]> = {}): Comparison {
  const base = evidence.comparisons[0];
  if (!base) {
    throw new Error("expected at least one committed comparison");
  }
  return { ...base, floorDifference: { ...base.floorDifference, ...over } };
}

describe("comparison wording is derived from the data", () => {
  it("signed() uses a real minus sign and fixed digits", () => {
    expect(signed(2.375)).toBe("+2.38");
    expect(signed(-0.5, 1)).toBe("−0.5");
    expect(signed(0)).toBe("+0.00");
  });

  it("calls a side higher only when the whole interval excludes zero", () => {
    expect(comparisonVerdict(comparison({ ci95: [0.4, 2] }))).toBe("a-higher");
    expect(comparisonVerdict(comparison({ ci95: [-2, -0.1] }))).toBe("b-higher");
    expect(comparisonVerdict(comparison({ ci95: [-0.3, 1.2] }))).toBe("undetermined");
    expect(comparisonVerdict(comparison({ ci95: [0, 1] }))).toBe("undetermined");
  });

  it("states the interval, the sample size and the cost, and never overstates", () => {
    const text = comparisonSentence(comparison({ meanAMinusB: 0.1, ci95: [-0.4, 0.6] }));
    expect(text).toContain("could be established");
    expect(text).toContain("95% bootstrap interval −0.40 to +0.60");
    expect(text).toContain(`${String(evidence.comparisons[0]?.bothCompleted)} paired games`);
    const real = comparisonSentence(comparison());
    expect(real).toMatch(/× as long per game/);
  });

  it("says how the wins split whenever either side has any, and nothing when neither does", () => {
    const tuned = evidence.comparisons.find(
      (x) => x.a.policy === "rules_v3" && x.b.policy === "rules_v2" && x.role === "held-out",
    );
    expect(tuned).toBeDefined();
    if (tuned) {
      // the tuned pilot gets further and does not win more: the sentence must not leave the second half out
      expect(comparisonSentence(tuned)).toContain(
        `Wins: ${String(tuned.a.wins)} for rules_v3 and ${String(tuned.b.wins)} for rules_v2 (exact McNemar p = `,
      );
      expect(tuned.pairedWinTable.mcnemar_p).toBeGreaterThan(0.05);
    }
    const none = evidence.comparisons.find((x) => x.a.wins + x.b.wins === 0);
    expect(none).toBeDefined();
    if (none) {
      expect(comparisonSentence(none)).not.toContain("Wins:");
    }
  });

  it("matches the committed rules-vs-search comparison (numbers are read, not typed)", () => {
    const c = evidence.comparisons.find(
      (x) => x.a.policy === "rules_v1" && x.b.policy === "search_v1",
    );
    expect(c).toBeDefined();
    expect(c?.bothCompleted).toBe(200);
    expect(c?.floorDifference.meanAMinusB).toBeCloseTo(2.375, 3);
    expect(c?.pairedWinTable).toMatchObject({ both: 0, a_only: 0, b_only: 0, neither: 200 });
  });

  it("the past-the-Act-1-boss endpoint is internally consistent with its paired table and sample size", () => {
    expect(evidence.comparisons.length).toBeGreaterThan(0);
    for (const c of evidence.comparisons) {
      const t = c.reachedAct2.pairedTable;
      expect(t.both + t.a_only + t.b_only + t.neither, c.id).toBe(c.bothCompleted);
      expect(c.reachedAct2.a.games, c.id).toBe(t.both + t.a_only);
      expect(c.reachedAct2.b.games, c.id).toBe(t.both + t.b_only);
      expect(c.reachedAct2.a.rate, c.id).toBeCloseTo(c.reachedAct2.a.games / c.bothCompleted, 12);
      const [lo = 1, hi = 0] = c.reachedAct2.a.wilson95;
      expect(lo <= c.reachedAct2.a.rate && c.reachedAct2.a.rate <= hi, c.id).toBe(true);
      // a wins-only table must still agree: a game won is also past the Act-1 boss
      expect(c.reachedAct2.a.games, c.id).toBeGreaterThanOrEqual(c.a.wins);
      expect(actTwoSentence(c)).toContain(`${sideLabel(c.a)} and`);
    }
  });

  it("publishes a win only with its re-derivation, and says so in the sentence", () => {
    const rows = winRows();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.audited, r.batch).toBe(r.wins);
      expect(r.verified, r.batch).toBe(r.wins);
    }
    const text = winSentence();
    for (const r of rows) {
      expect(text).toContain(r.policy);
    }
    expect(text).toContain("re-run and replayed hash for hash");
    // the held-out/development label comes from the partition, never from the policy that won
    const held = evidence.reports.filter((r) => r.counts.win > 0 && r.role === "held-out").length;
    expect(rows.filter((r) => r.held).length).toBe(held);
  });

  it("finds the pre-registered test of the card values the site shows, and it is a held-out, paired comparison", () => {
    // Ironclad's shown set is round two, tested against the pilot that follows round one (ADR-046): the same policy twice
    const test = valuesValidation("ironclad");
    expect(test).toBeDefined();
    expect(test?.role).toBe("held-out");
    expect(test?.a.policy).toBe("rules_v3");
    expect(test?.b.policy).toBe("rules_v3");
    expect(test?.a.batchId).toMatch(/-val-/);
    expect(test?.b.batchId).toMatch(/-val-/);
    expect(test?.a.batchId).not.toBe(test?.b.batchId);
    expect(test?.reachedAct2.pairedTable.mcnemar_p ?? 1).toBeLessThan(0.05);
    // and the first measurement's own test, against the hand-written ratings
    const first = ratingsValidation("ironclad");
    expect(first?.role).toBe("held-out");
    expect(first?.a.policy).toBe("rules_v2");
    expect(first?.b.policy).toBe("rules_v1");
    expect(first?.reachedAct2.pairedTable.mcnemar_p ?? 1).toBeLessThan(0.05);
    // the other classes are first measurements: their test is the one against the ratings
    expect(valuesValidation("silent")?.a.policy).toBe("rules_v2");
    expect(valuesValidation("silent")?.b.policy).toBe("rules_v1");
  });

  it("names the arms of a test between two sets of values by their values, not by the policy they share", () => {
    const test = valuesValidation("ironclad");
    expect(test).toBeDefined();
    if (!test) return;
    const text = newValuesSentence(test);
    expect(text).toContain("with the new values");
    expect(text).toContain("with the earlier ones");
    expect(text).not.toContain("rules_v3");
    expect(text).toContain(formatP(test.reachedAct2.pairedTable.mcnemar_p));
  });

  it("tells a policy's variants apart in the label and ignores a threshold of zero", () => {
    expect(policyLabel({ policy: "rules_v2", params: { threshold: 0 } })).toBe("rules_v2");
    expect(policyLabel({ policy: "rules_v1", params: {} })).toBe("rules_v1");
    // a values file is named by its file, not by its path
    expect(
      policyLabel({
        policy: "rules_v3",
        params: { threshold: 0, values: "experiments/cardvalue/ironclad-a0-v2.json" },
      }),
    ).toBe("rules_v3 (values=ironclad-a0-v2)");
    expect(policyLabel({ policy: "search_v3", params: { scope: "boss" } })).toBe(
      "search_v3 (scope=boss)",
    );
    expect(
      policyLabel({ policy: "rules_v2", params: { threshold: 0.1, tune: { heal_below: 0.6 } } }),
    ).toBe('rules_v2 (threshold=0.1, tune={"heal_below":0.6})');
  });

  it("says which side is slower in whichever direction the comparison runs", () => {
    const searches = evidence.comparisons.filter(
      (c) => c.b.policy === "rules_v2" && c.a.policy === "search_v3",
    );
    expect(searches.length).toBeGreaterThan(0);
    for (const c of searches) {
      // the sentence names the search side the way its label does (the scope differs between the comparisons)
      const label = policyLabel(c.a).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(comparisonSentence(c), c.id).toMatch(
        new RegExp(`${label} took [\\d.]+× as long per game`),
      );
    }
  });

  it("never mixes classes: a headline report belongs to the class that was asked for", () => {
    for (const policy of ["random_legal", "rules_v1", "rules_v2"]) {
      for (const character of ["Ironclad", "Silent", "Regent", "Necrobinder", "Defect"]) {
        const r = largestReport(policy, character);
        if (r) {
          expect(r.character, `${policy} ${character}`).toBe(character);
        }
      }
    }
    // Silent's largest held-out rules_v1 batch has more completed games than Ironclad's; it must not win the default
    expect(largestReport("rules_v1", "Silent")?.completed).toBeGreaterThan(
      largestReport("rules_v1")?.completed ?? Number.POSITIVE_INFINITY,
    );
    expect(largestReport("rules_v1")?.character).toBe("Ironclad");
    // nothing was played by this policy as this class
    expect(largestReport("random_legal", "Silent")).toBeUndefined();
  });

  it("a variant of the game (gap G11) is shown with its label and is never a headline report", () => {
    const variants = evidence.reports.filter((r) => r.ancientHeal);
    expect(variants.length).toBeGreaterThan(0);
    for (const v of variants) {
      expect(v.id).toContain("ancientheal");
      expect(v.role).toContain("development");
      // the same policy, class and size as a headline candidate: the variant must still lose the choice
      expect(largestReport(v.policy, v.character)?.ancientHeal).toBe(false);
    }
    // and no ordinary batch carries the flag by accident
    expect(evidence.reports.filter((r) => !r.ancientHeal && r.id.includes("ancientheal"))).toEqual(
      [],
    );
  });

  it("the start-HP variant (gap G13) is shown with its label and is never a headline report either", () => {
    const variants = evidence.reports.filter((r) => r.gameHp);
    expect(variants.length).toBeGreaterThan(0);
    for (const v of variants) {
      expect(v.id).toContain("gamehp");
      expect(v.role).toContain("development");
      expect(largestReport(v.policy, v.character)?.gameHp).toBe(false);
    }
    expect(evidence.reports.filter((r) => !r.gameHp && r.id.includes("gamehp"))).toEqual([]);
  });

  it("formats exact p-values without printing a misleading zero", () => {
    expect(formatP(0.0173)).toBe("p = 0.017");
    expect(formatP(8.13e-261)).toBe("p = 8.1e-261");
    expect(formatP(0)).toBe("p < 1e-300");
  });

  it("headline reports are the held-out batches, even when a development batch is as large", () => {
    const rules = largestReport("rules_v1");
    const random = largestReport("random_legal");
    expect(rules).toMatchObject({
      character: "Ironclad",
      partition: "val",
      role: "held-out",
      completed: 1997,
    });
    expect(random).toMatchObject({
      character: "Ironclad",
      partition: "val",
      role: "held-out",
      completed: 2000,
    });
    // the 300-game development batch of rules_v1 and the 2,000-game development ladder still exist in the ledger
    expect(evidence.reports.some((r) => r.policy === "rules_v1" && r.partition === "train")).toBe(
      true,
    );
    expect(
      evidence.reports.some(
        (r) => r.policy === "random_legal" && r.partition === "train" && r.completed === 1999,
      ),
    ).toBe(true);
  });
});

describe("contact link", () => {
  it("is absent unless configured", () => {
    expect(contactLink(undefined)).toBeNull();
    expect(contactLink("   ")).toBeNull();
  });
  it("accepts https and mailto only", () => {
    expect(contactLink("https://example.org/feedback")).toEqual({
      href: "https://example.org/feedback",
      label: "example.org",
    });
    expect(contactLink("mailto:hello@example.org")?.label).toBe("hello@example.org");
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>1</script>",
    "http://example.org",
    "ftp://example.org",
    "not a url",
    "mailto:",
  ])("rejects %s", (bad) => {
    expect(contactLink(bad)).toBeNull();
  });
});

describe("site url", () => {
  it("is absent unless configured, and only ever an origin", () => {
    expect(siteUrl(undefined)).toBeNull();
    expect(siteUrl("")).toBeNull();
    expect(siteUrl("https://slay2.example/some/path?q=1#x")).toBe("https://slay2.example");
    expect(siteUrl("http://localhost:3000/x")).toBe("http://localhost:3000");
  });
  it.each(["http://example.org", "javascript:alert(1)", "slay2.example", "ftp://x.org"])(
    "rejects %s",
    (bad) => {
      expect(siteUrl(bad)).toBeNull();
    },
  );
});

describe("site-data exporter refuses wins that were not re-derived", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) {
      rmSync(d, { recursive: true, force: true });
    }
  });
  const script = join(repo, "scripts", "export-site-data.mjs");
  const winner = evidence.reports.find((r) => r.counts.win > 0);

  function rootWith(mutate: (audit: string | null) => void): string {
    if (!winner) {
      throw new Error("expected a committed batch with wins");
    }
    const root = mkdtempSync(join(tmpdir(), "slay2-wins-"));
    dirs.push(root);
    for (const name of ["docs", "packages", "sim"]) {
      symlinkSync(join(repo, name), join(root, name), "dir");
    }
    const batch = join(root, "experiments", "batches", winner.id);
    mkdirSync(batch, { recursive: true });
    for (const f of ["manifest.json", "episodes.jsonl.gz", "wins-audit.json"]) {
      cpSync(join(repo, "experiments", "batches", winner.id, f), join(batch, f));
    }
    mutate(join(batch, "wins-audit.json"));
    return root;
  }

  const run = (root: string) =>
    spawnSync(process.execPath, [script, "--check"], {
      encoding: "utf8",
      env: { ...process.env, SLAY2_ROOT: root },
    });

  it("fails when the batch has wins and no audit at all", () => {
    const result = run(
      rootWith((audit) => {
        if (audit) {
          rmSync(audit);
        }
      }),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("without a passing wins-audit.json");
  });

  it("fails when the audit says a win did not verify", () => {
    const result = run(
      rootWith((audit) => {
        if (audit) {
          const body = JSON.parse(readFileSync(audit, "utf8")) as { all_verified: boolean };
          body.all_verified = false;
          writeFileSync(audit, JSON.stringify(body));
        }
      }),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("without a passing wins-audit.json");
  });
});

describe.each(["sample-audit.json", "rederivation-audit.json"])(
  "site-data exporter refuses %s written for other content",
  (auditFile) => {
    const dirs: string[] = [];
    afterEach(() => {
      for (const d of dirs.splice(0)) {
        rmSync(d, { recursive: true, force: true });
      }
    });
    const script = join(repo, "scripts", "export-site-data.mjs");
    const target = evidence.reports.find((r) => r.counts.win === 0);

    function rootWith(audit: Record<string, unknown>): string {
      if (!target) {
        throw new Error("expected a committed batch without wins");
      }
      const root = mkdtempSync(join(tmpdir(), "slay2-sample-"));
      dirs.push(root);
      for (const name of ["docs", "packages", "sim"]) {
        symlinkSync(join(repo, name), join(root, name), "dir");
      }
      const batch = join(root, "experiments", "batches", target.id);
      mkdirSync(batch, { recursive: true });
      for (const f of ["manifest.json", "episodes.jsonl.gz"]) {
        cpSync(join(repo, "experiments", "batches", target.id, f), join(batch, f));
      }
      writeFileSync(join(batch, auditFile), JSON.stringify(audit));
      return root;
    }

    const run = (root: string) =>
      spawnSync(process.execPath, [script, "--check"], {
        encoding: "utf8",
        env: { ...process.env, SLAY2_ROOT: root },
      });

    const audit = (over: Record<string, unknown>) => ({
      batch_id: target?.id,
      batch_content_sha256: target?.contentSha256,
      sample: { drawn: 1, completed_in_batch: 1, rng_seed: 0 },
      verified: 1,
      ledger: { ok: true },
      criteria: "x",
      ...over,
    });

    it("fails when the audit names another batch", () => {
      const result = run(rootWith(audit({ batch_id: "some-other-batch" })));
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`${auditFile} was written for other content`);
    });

    it("fails when the batch content changed after the audit", () => {
      const result = run(rootWith(audit({ batch_content_sha256: "0".repeat(64) })));
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`${auditFile} was written for other content`);
    });
  },
);

describe("site-data exporter refuses a comparison whose batches changed", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  function tamperedRoot(mutate: (c: { a: { contentSha256: string } }) => void): string {
    const root = mkdtempSync(join(tmpdir(), "slay2-export-"));
    dirs.push(root);
    for (const name of ["docs", "packages", "sim"]) {
      symlinkSync(join(repo, name), join(root, name), "dir");
    }
    mkdirSync(join(root, "experiments"));
    symlinkSync(join(repo, "experiments", "batches"), join(root, "experiments", "batches"), "dir");
    cpSync(join(repo, "experiments", "comparisons"), join(root, "experiments", "comparisons"), {
      recursive: true,
    });
    const file = join(
      root,
      "experiments",
      "comparisons",
      "rules_v1-vs-search_v1-ironclad-a0-veteran-train.json",
    );
    const body = JSON.parse(readFileSync(file, "utf8")) as { a: { contentSha256: string } };
    mutate(body);
    writeFileSync(file, JSON.stringify(body));
    return root;
  }

  const script = join(repo, "scripts", "export-site-data.mjs");
  const run = (root: string) =>
    spawnSync(process.execPath, [script, "--check"], {
      encoding: "utf8",
      env: { ...process.env, SLAY2_ROOT: root },
    });

  it("fails loudly when a batch hash no longer matches", () => {
    const result = run(
      tamperedRoot((c) => {
        c.a.contentSha256 = "0".repeat(64);
      }),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("changed after the comparison was written");
  });

  it("reads an untouched copy without complaint about the comparison", () => {
    const result = run(tamperedRoot(() => undefined));
    expect(result.stderr).not.toContain("changed after the comparison was written");
  });
});

describe.runIf(existsSync(join(repo, "experiments", "neow", "neow-values-v2.json")))(
  "site-data exporter refuses opening-relic data that does not belong together",
  () => {
    const dirs: string[] = [];
    afterEach(() => {
      for (const d of dirs.splice(0)) {
        rmSync(d, { recursive: true, force: true });
      }
    });

    const script = join(repo, "scripts", "export-site-data.mjs");
    const hasTest = existsSync(
      join(repo, "experiments", "neow", "pooled-neow-values-v2-vs-rules_v2-val.json"),
    );

    function rootWith(mutate: (neowDir: string) => void): string {
      const root = mkdtempSync(join(tmpdir(), "slay2-neow-"));
      dirs.push(root);
      for (const name of ["docs", "packages", "sim"]) {
        symlinkSync(join(repo, name), join(root, name), "dir");
      }
      mkdirSync(join(root, "experiments"));
      symlinkSync(
        join(repo, "experiments", "batches"),
        join(root, "experiments", "batches"),
        "dir",
      );
      const neowDir = join(root, "experiments", "neow");
      cpSync(join(repo, "experiments", "neow"), neowDir, { recursive: true });
      mutate(neowDir);
      return root;
    }

    function edit(neowDir: string, file: string, change: (body: Record<string, unknown>) => void) {
      const path = join(neowDir, file);
      const body = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      change(body);
      writeFileSync(path, JSON.stringify(body));
    }

    const run = (root: string) =>
      spawnSync(process.execPath, [script, "--check"], {
        encoding: "utf8",
        env: { ...process.env, SLAY2_ROOT: root },
      });

    it("reads an untouched copy without complaint about the opening-relic files", () => {
      const result = run(rootWith(() => undefined));
      expect(result.stderr).not.toContain("neow-values-v2.json:");
      expect(result.stderr).not.toContain("pooled-neow-values-v2-vs-rules_v2-val.json:");
    });

    it("fails when an exploration batch changed after the values were fitted", () => {
      const result = run(
        rootWith((dir) => {
          edit(dir, "neow-values-v2.json", (v) => {
            const batches = v.batches as { content_sha256: string }[];
            if (batches[0]) {
              batches[0].content_sha256 = "0".repeat(64);
            }
          });
        }),
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("changed after the values were fitted");
    });

    it("fails when two relics carry the same label", () => {
      const result = run(
        rootWith((dir) => {
          edit(dir, "neow-values-v2.json", (v) => {
            const relics = v.relics as { label: string }[];
            if (relics[1] && relics[0]) {
              relics[1].label = relics[0].label;
            }
          });
        }),
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("is measured twice");
    });

    it.runIf(hasTest)("fails when the test was run with another version of the values", () => {
      const result = run(
        rootWith((dir) => {
          // any change to the file changes its hash, which the batches of the test recorded
          edit(dir, "neow-values-v2.json", (v) => {
            v.pass_rate = 0.5;
          });
        }),
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("was played with another version of neow-values-v2.json");
    });

    it.runIf(hasTest)("fails when a batch of the test changed after it was written", () => {
      const result = run(
        rootWith((dir) => {
          edit(dir, "pooled-neow-values-v2-vs-rules_v2-val.json", (t) => {
            const members = t.members as { a: { contentSha256: string } }[];
            if (members[0]) {
              members[0].a.contentSha256 = "0".repeat(64);
            }
          });
        }),
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("changed after the comparison was written");
    });

    it.runIf(hasTest)(
      "fails when the test is not a held-out comparison of all five classes",
      () => {
        const notHeldOut = run(
          rootWith((dir) => {
            edit(dir, "pooled-neow-values-v2-vs-rules_v2-val.json", (t) => {
              t.role = "development (dev partition): not a held-out result";
            });
          }),
        );
        expect(notHeldOut.status).not.toBe(0);
        expect(notHeldOut.stderr).toContain("not a held-out comparison");
        const fewer = run(
          rootWith((dir) => {
            edit(dir, "pooled-neow-values-v2-vs-rules_v2-val.json", (t) => {
              const cohort = t.cohort as { characters: string[] };
              cohort.characters = cohort.characters.slice(1);
            });
          }),
        );
        expect(fewer.status).not.toBe(0);
        expect(fewer.stderr).toContain("must pool all five classes");
        // and the numbers, not only the label: a member missing from the comparison is refused the same way
        const fewerMembers = run(
          rootWith((dir) => {
            edit(dir, "pooled-neow-values-v2-vs-rules_v2-val.json", (t) => {
              t.members = (t.members as unknown[]).slice(1);
            });
          }),
        );
        expect(fewerMembers.status).not.toBe(0);
        expect(fewerMembers.stderr).toContain("must pool all five classes");
      },
    );
  },
);

describe("site-data exporter refuses the first opening-relic study (played with the wrong class, ADR-049)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) {
      rmSync(d, { recursive: true, force: true });
    }
  });
  const void_ = join(repo, "experiments", "void", "2026-10-26-wrong-class-ids", "neow");
  const script = join(repo, "scripts", "export-site-data.mjs");

  /** The void study's files laid out as the exporter expects a real study's, with the one thing that was wrong left as it was. */
  function rootWithVoidStudy(mutate: (values: Record<string, unknown>) => void): string {
    const root = mkdtempSync(join(tmpdir(), "slay2-void-"));
    dirs.push(root);
    for (const name of ["docs", "packages", "sim"]) {
      symlinkSync(join(repo, name), join(root, name), "dir");
    }
    mkdirSync(join(root, "experiments"));
    symlinkSync(join(repo, "experiments", "batches"), join(root, "experiments", "batches"), "dir");
    const dir = join(root, "experiments", "neow");
    mkdirSync(dir);
    const values = JSON.parse(readFileSync(join(void_, "neow-values-v1.json"), "utf8")) as {
      batches: { batch_id: string }[];
      model: Record<string, unknown>;
    };
    // what a correct fit would say about itself; the exploration batches below are the void ones, renamed to the new pattern
    values.model.resampling_unit = "seed";
    values.model.seeds = 3000;
    for (const b of values.batches) {
      const old = b.batch_id;
      b.batch_id = old.replace(/^explore-neow-/, "neow-explore-");
      const target = join(dir, b.batch_id.replace(/^neow-explore-/, "explore-"));
      mkdirSync(target);
      const manifest = JSON.parse(
        readFileSync(
          join(void_, old.replace(/^explore-neow-/, "explore-"), "manifest.json"),
          "utf8",
        ),
      ) as {
        batch_id: string;
      };
      manifest.batch_id = b.batch_id;
      writeFileSync(join(target, "manifest.json"), JSON.stringify(manifest));
    }
    mutate(values);
    writeFileSync(join(dir, "neow-values-v2.json"), JSON.stringify(values));
    return root;
  }

  const run = (root: string) =>
    spawnSync(process.execPath, [script, "--check"], {
      encoding: "utf8",
      env: { ...process.env, SLAY2_ROOT: root },
    });

  it("refuses a fit that resamples by game", () => {
    const result = run(
      rootWithVoidStudy((v) => {
        delete (v.model as Record<string, unknown>).resampling_unit;
      }),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("must resample and cross-validate by seed");
  });

  it("refuses exploration batches whose games were played as a class the simulator does not know", () => {
    // the void batches were run with --character silent; the manifests say "silent", not "Silent"
    const result = run(rootWithVoidStudy(() => undefined));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(
      /was played as "(ironclad|silent|regent|necrobinder|defect)", which is not one of the simulator's exact class ids/,
    );
  });
});
