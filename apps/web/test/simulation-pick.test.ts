import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { currentSet, measuredValue } from "@/lib/cardvalues";
import { DECK_CAP, simulationPick } from "@/lib/simulation-pick";

interface Golden {
  valuesSha256: string;
  deckCap: number;
  threshold: number;
  cases: { offered: string[]; deckSize: number; pick: string }[];
}

const golden = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "simulation-pick-golden.json"), "utf8"),
) as Golden;

// the policy's own ids carry the simulator's `_CARD` suffix; the website's catalog ids do not
const toCatalog = (id: string): string => (measuredValue(id) ? id : id.replace(/_CARD$/, ""));

describe("simulation pick follows the Python policy it describes", () => {
  it("was generated from the values file the site ships", () => {
    expect(golden.valuesSha256).toBe(currentSet()?.sha256);
    expect(golden.deckCap).toBe(DECK_CAP);
    expect(golden.threshold).toBe(0);
    expect(golden.cases.length).toBeGreaterThanOrEqual(60);
  });

  it("gives the policy's answer on every golden case", () => {
    const answers = new Set<string>();
    for (const c of golden.cases) {
      const offered = c.offered.map(toCatalog);
      const got = simulationPick({ character: "ironclad", offered, deckSize: c.deckSize });
      const expected = c.pick === "skip" ? "skip" : toCatalog(c.pick);
      if (got.kind === "unmeasured") {
        // the website says "no measurement" where the policy has nothing but zeros to compare: the policy skips there
        expect(expected, JSON.stringify(c)).toBe("skip");
        answers.add("unmeasured");
        continue;
      }
      expect(got.kind === "pick" ? got.cardId : "skip", JSON.stringify(c)).toBe(expected);
      answers.add(got.kind);
    }
    // the fixture must exercise every branch or it proves little
    expect([...answers].sort()).toEqual(["pick", "skip", "unmeasured"]);
  });
});

describe("simulation pick, branch by branch", () => {
  it("is only defined for Ironclad", () => {
    expect(simulationPick({ character: "silent", offered: ["ANGER"], deckSize: 12 }).kind).toBe(
      "unmeasured",
    );
  });

  it("says nothing when no offered card was measured", () => {
    expect(
      simulationPick({ character: "ironclad", offered: ["SOME_UNLISTED_CARD"], deckSize: 12 }).kind,
    ).toBe("unmeasured");
  });

  it("takes the best measured card above zero and explains why", () => {
    const r = simulationPick({
      character: "ironclad",
      offered: ["WHIRLWIND", "RAMPAGE", "ANGER"],
      deckSize: 12,
    });
    expect(r.kind).toBe("pick");
    expect(r.kind === "pick" ? r.cardId : "").toBe("RAMPAGE");
    expect(r.reason).toContain("largest measured value");
  });

  it("skips when every measured card is below zero, an unmeasured card counts as zero", () => {
    const r = simulationPick({
      character: "ironclad",
      offered: ["WHIRLWIND", "SOME_UNLISTED_CARD"],
      deckSize: 12,
    });
    expect(r.kind).toBe("skip");
    expect(r.reason).toContain("counts as zero");
  });

  it("stops taking cards at the deck cap", () => {
    const r = simulationPick({ character: "ironclad", offered: ["RAMPAGE"], deckSize: DECK_CAP });
    expect(r.kind).toBe("skip");
    expect(r.reason).toContain(String(DECK_CAP));
    expect(
      simulationPick({ character: "ironclad", offered: ["RAMPAGE"], deckSize: DECK_CAP - 1 }).kind,
    ).toBe("pick");
  });

  it("sends ties to the earlier card", () => {
    const a = measuredValue("RAMPAGE");
    expect(a).toBeDefined();
    const r = simulationPick({
      character: "ironclad",
      offered: ["RAMPAGE", "RAMPAGE"],
      deckSize: 12,
    });
    expect(r.kind === "pick" ? r.cardId : "").toBe("RAMPAGE");
  });
});
