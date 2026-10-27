// @vitest-environment node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { SYNERGY } from "@slay2/game-data";

import cardvalues from "@/content/cardvalues.generated.json";
import evidence from "@/content/evidence.generated.json";
import rules from "@/content/rules.generated.json";
import synergy from "@/content/synergy.generated.json";

// These tests start the site-data exporter in a child process; on a busy machine that takes longer than the 5 s default.
vi.setConfig({ testTimeout: 30_000 });

describe("generated site content", () => {
  it("is up to date with the audited sources (run: node scripts/export-site-data.mjs)", () => {
    const script = join(__dirname, "..", "..", "..", "scripts", "export-site-data.mjs");
    const run = spawnSync(process.execPath, [script, "--check"], { encoding: "utf8" });
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
  });

  it("shows only adopted card-value sets: one per class, the ones experiments/cardvalue/site-sets.json lists (ADR-046)", () => {
    // Adopting a set is a decision recorded in experiments/cardvalue/site-sets.json, not a side effect of a file appearing in
    // experiments/cardvalue. Round two for Ironclad (ironclad-a0-v2.json) was adopted after its pre-registered test; the first
    // measurement (ironclad-a0-v1.json) stays in the repository and off the site.
    const listing = JSON.parse(
      readFileSync(
        join(__dirname, "..", "..", "..", "experiments", "cardvalue", "site-sets.json"),
        "utf8",
      ),
    ) as { sets: { file: string }[] };
    const shown = cardvalues.sets.map((set) => set.file).sort();
    expect(shown).toEqual(listing.sets.map((s) => `experiments/cardvalue/${s.file}`).sort());
    expect(shown).toEqual(
      [
        "ironclad-a0-v2.json",
        "silent-a0-v1.json",
        "regent-a0-v1.json",
        "necrobinder-a0-v1.json",
        "defect-a0-v1.json",
      ]
        .map((f) => `experiments/cardvalue/${f}`)
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

  it("exports only rules: one row per id, each with a sentence, none from the implementation map", () => {
    // The register also has an implementation map whose rows start with a rule id too (`| UPG-1 | upgrade.ts | G P |`). Read as rules
    // they gave /methods two repeated ids with "upgrade.ts" as the rule and a count two too high (59 rules for 57).
    const ids = rules.rules.map((r) => r.id);
    expect(new Set(ids).size, "repeated rule ids").toBe(ids.length);
    for (const r of rules.rules) {
      expect(r.text.length, `${r.id} reads like a rule`).toBeGreaterThanOrEqual(30);
      expect(r.text, r.id).toContain(" ");
      expect(r.section, r.id).not.toMatch(/^Implementation status/);
    }
  });

  it("never reports a win rate without its sample size and interval", () => {
    for (const r of evidence.reports) {
      expect(r.completed).toBeGreaterThan(0);
      expect(r.winRateWilson95).toHaveLength(2);
      expect(r.counts.win + r.counts.death).toBe(r.completed);
    }
  });

  it("quotes the synergy study as its report says, for the table the page computes with (ADR-050)", () => {
    const report = JSON.parse(
      readFileSync(
        join(__dirname, "..", "..", "..", "experiments", "synergy", "b1-calibration.json"),
        "utf8",
      ),
    ) as {
      advisor: { synergy_table_sha256: string };
      pooled: {
        all_cohorts: {
          rows: number;
          ratios: Record<string, { to_quality: number }>;
          loss_gaps: Record<string, { mean: number }>;
        };
      };
    };
    expect(synergy.table.sha256).toBe(SYNERGY.sha256);
    expect(report.advisor.synergy_table_sha256).toBe(SYNERGY.sha256);
    expect(synergy.table.cards).toBe(Object.keys(SYNERGY.cards).length);
    const pooled = report.pooled.all_cohorts;
    expect(synergy.b1.bossFights).toBe(pooled.rows);
    expect(synergy.b1.cohorts.reduce((acc, c) => acc + c.bossFights, 0)).toBe(pooled.rows);
    expect(synergy.b1.ratios.needs.toQuality).toBe(pooled.ratios.unmet?.to_quality);
    expect(synergy.b1.ratios.scalers.toQuality).toBe(pooled.ratios.scaler?.to_quality);
    expect(synergy.b1.ratios.engines.toQuality).toBe(pooled.ratios.engines?.to_quality);
    expect(synergy.b1.synergyAdded.mean).toBe(pooled.loss_gaps.synergy_added_to_index?.mean);
    // adding the term lowers the held-out error, and the interval says so (the claim the panel makes)
    expect(synergy.b1.synergyAdded.ci95[1]).toBeLessThan(0);
  });
});
