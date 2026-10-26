// @vitest-environment node
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import cardvalues from "@/content/cardvalues.generated.json";
import evidence from "@/content/evidence.generated.json";
import rules from "@/content/rules.generated.json";

describe("generated site content", () => {
  it("is up to date with the audited sources (run: node scripts/export-site-data.mjs)", () => {
    const script = join(__dirname, "..", "..", "..", "scripts", "export-site-data.mjs");
    const run = spawnSync(process.execPath, [script, "--check"], { encoding: "utf8" });
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
  });

  it("shows only adopted card-value sets: one per class, never a study's file (ADR-046)", () => {
    // Adopting a set is a decision recorded in scripts/export-site-data.mjs (SITE_VALUE_SETS) and here, not a side effect of a
    // file appearing in experiments/cardvalue: round two for Ironclad (ironclad-a0-v2.json) stays off the site until its
    // pre-registered test says otherwise.
    const shown = cardvalues.sets.map((set) => set.file).sort();
    expect(shown).toEqual(
      ["ironclad", "silent", "regent", "necrobinder", "defect"]
        .map((c) => `experiments/cardvalue/${c}-a0-v1.json`)
        .sort(),
    );
  });

  it("lists the verified rules with their evidence classes", () => {
    expect(rules.rules.length).toBeGreaterThan(40);
    const ids = new Set(rules.rules.map((r) => r.id));
    for (const id of [
      "CARD-1",
      "CARD-5",
      "POT-1",
      "UNK-2",
      "SHOP-4",
      "RUN-1",
      "ASC-1",
      "UPG-1",
      "GOLD-1",
      "DRAW-1",
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("never reports a win rate without its sample size and interval", () => {
    for (const r of evidence.reports) {
      expect(r.completed).toBeGreaterThan(0);
      expect(r.winRateWilson95).toHaveLength(2);
      expect(r.counts.win + r.counts.death).toBe(r.completed);
    }
  });
});
