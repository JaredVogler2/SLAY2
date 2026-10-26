// @vitest-environment node
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import evidence from "@/content/evidence.generated.json";
import {
  comparisonSentence,
  comparisonVerdict,
  largestReport,
  signed,
  type Comparison,
} from "@/lib/methods-data";
import { contactLink, siteUrl } from "@/lib/site-config";

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

  it("matches the committed rules-vs-search comparison (numbers are read, not typed)", () => {
    const c = evidence.comparisons.find(
      (x) => x.a.policy === "rules_v1" && x.b.policy === "search_v1",
    );
    expect(c).toBeDefined();
    expect(c?.bothCompleted).toBe(200);
    expect(c?.floorDifference.meanAMinusB).toBeCloseTo(2.375, 3);
    expect(c?.pairedWinTable).toMatchObject({ both: 0, a_only: 0, b_only: 0, neither: 200 });
  });

  it("headline reports are the held-out batches, even when a development batch is as large", () => {
    const rules = largestReport("rules_v1");
    const random = largestReport("random_legal");
    expect(rules).toMatchObject({ partition: "val", role: "held-out", completed: 1997 });
    expect(random).toMatchObject({ partition: "val", role: "held-out", completed: 2000 });
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
