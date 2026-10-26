import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { provenanceFor, type CalculatorId } from "../src/index";

const register = readFileSync(
  join(__dirname, "..", "..", "..", "docs", "game", "MECHANICS-COVERAGE.md"),
  "utf8",
);
const IDS: CalculatorId[] = ["rarity", "potion", "unknown_room", "draw", "shop"];

describe("provenance catalog", () => {
  it.each(IDS)("%s cites only rules that exist in the verified register", (id) => {
    const p = provenanceFor(id);
    expect(p.build).toBe("sts2-main-0.107.1");
    expect(p.ruleIds.length).toBeGreaterThan(0);
    for (const rule of p.ruleIds) {
      expect(register, `${rule} must be a row of docs/game/MECHANICS-COVERAGE.md`).toMatch(
        new RegExp(`\\|\\s*${rule}\\s*\\|`),
      );
    }
    expect(p.assumptions.length).toBeGreaterThan(1);
    expect(p.notModelled.length).toBeGreaterThan(1);
  });

  it("states the ascension assumption honestly", () => {
    expect(
      provenanceFor("rarity", { ascension: 7, ascensionConfirmed: true }).assumptions.join(" "),
    ).toMatch(/Scarcity/);
    expect(provenanceFor("rarity", { ascensionConfirmed: false }).assumptions.join(" ")).toMatch(
      /not confirmed/,
    );
  });
});
