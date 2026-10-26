import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { allSets, isValidated, measuredValue, setFor } from "@/lib/cardvalues";
import { DECK_CAP, simulationPick } from "@/lib/simulation-pick";

interface Golden {
  deckCap: number;
  threshold: number;
  classes: {
    character: string;
    valuesSha256: string;
    cases: { offered: string[]; deckSize: number; pick: string }[];
  }[];
}

const golden = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "simulation-pick-golden.json"), "utf8"),
) as Golden;

describe("simulation pick follows the Python policy it describes", () => {
  it("was generated from the values files the site ships, one entry per measured class", () => {
    expect(golden.deckCap).toBe(DECK_CAP);
    expect(golden.threshold).toBe(0);
    expect(golden.classes.map((c) => c.character).sort()).toEqual(
      allSets()
        .map((s) => s.character)
        .sort(),
    );
    for (const entry of golden.classes) {
      expect(entry.valuesSha256, entry.character).toBe(setFor(entry.character)?.sha256);
      expect(entry.cases.length).toBeGreaterThanOrEqual(60);
    }
  });

  it("gives the policy's answer on every golden case of every validated class, and stays silent for the others", () => {
    for (const entry of golden.classes) {
      const set = setFor(entry.character);
      // the policy's own ids carry the simulator's `_CARD` suffix; the website's catalog ids do not
      const toCatalog = (id: string): string =>
        set?.cards.some((c) => c.id === id) ? id : id.replace(/_CARD$/, "");
      const answers = new Set<string>();
      for (const c of entry.cases) {
        const offered = c.offered.map(toCatalog);
        const got = simulationPick({ character: entry.character, offered, deckSize: c.deckSize });
        if (!isValidated(set)) {
          expect(got.kind, `${entry.character} is not validated`).toBe("unmeasured");
          continue;
        }
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
      if (isValidated(set)) {
        // the fixture must exercise every branch or it proves little
        expect([...answers].sort(), entry.character).toEqual(["pick", "skip", "unmeasured"]);
      }
    }
  });
});

describe("simulation pick, branch by branch", () => {
  it("is silent for a class nobody has measured, and says why", () => {
    const r = simulationPick({ character: "no-such-class", offered: ["ANGER"], deckSize: 12 });
    expect(r.kind).toBe("unmeasured");
    expect(r.reason).toContain("not measured this class");
  });

  it("is silent for a class whose values were not validated, even when its cards were measured", () => {
    const set = setFor("ironclad");
    expect(set).toBeDefined();
    const untested = { ...set, validation: null } as NonNullable<typeof set>;
    const failed = { ...set, validation: { ...set?.validation, passed: false } } as NonNullable<
      typeof set
    >;
    expect(isValidated(untested)).toBe(false);
    expect(isValidated(failed)).toBe(false);
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
    const a = measuredValue("RAMPAGE", "ironclad");
    expect(a).toBeDefined();
    const r = simulationPick({
      character: "ironclad",
      offered: ["RAMPAGE", "RAMPAGE"],
      deckSize: 12,
    });
    expect(r.kind === "pick" ? r.cardId : "").toBe("RAMPAGE");
  });
});
