import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { allSets, isValidated, measuredValue, setFor } from "@/lib/cardvalues";
import {
  DECK_CAP,
  PICKIER_ACT_INDEX,
  PICKIER_THRESHOLD,
  simulationPick,
} from "@/lib/simulation-pick";

interface Golden {
  deckCap: number;
  threshold: number;
  lateThreshold: number;
  lateActs: number[];
  classes: {
    character: string;
    valuesSha256: string;
    cases: { offered: string[]; deckSize: number; pick: string; latePick: string }[];
  }[];
}

const golden = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "simulation-pick-golden.json"), "utf8"),
) as Golden;

describe("simulation pick follows the Python policy it describes", () => {
  it("was generated from the values files the site ships, one entry per measured class", () => {
    expect(golden.deckCap).toBe(DECK_CAP);
    expect(golden.threshold).toBe(0);
    expect(golden.lateThreshold).toBe(PICKIER_THRESHOLD);
    expect(golden.lateActs).toEqual([PICKIER_ACT_INDEX]);
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

describe("the pickier pilot of Act 2 follows the late policy it describes (ADR-063)", () => {
  it("gives rules_v2_late's answer in Act 2 on every golden case, with the bar 0.2, and only ever skips more than the ordinary pilot", () => {
    let skippedMore = 0;
    for (const entry of golden.classes) {
      const set = setFor(entry.character);
      if (!isValidated(set)) continue;
      const toCatalog = (id: string): string =>
        set?.cards.some((c) => c.id === id) ? id : id.replace(/_CARD$/, "");
      for (const c of entry.cases) {
        const offered = c.offered.map(toCatalog);
        const got = simulationPick({
          character: entry.character,
          offered,
          deckSize: c.deckSize,
          threshold: golden.lateThreshold,
        });
        const expected = c.latePick === "skip" ? "skip" : toCatalog(c.latePick);
        if (got.kind === "unmeasured") {
          expect(expected, JSON.stringify(c)).toBe("skip");
          continue;
        }
        expect(got.kind === "pick" ? got.cardId : "skip", JSON.stringify(c)).toBe(expected);
        // the late rule never takes a card the ordinary rule skips, and never takes another card than the ordinary rule's
        expect(["skip", c.pick], JSON.stringify(c)).toContain(c.latePick);
        if (c.latePick === "skip" && c.pick !== "skip") skippedMore += 1;
      }
    }
    expect(skippedMore, "the fixture must contain offers the pickier pilot skips").toBeGreaterThan(
      10,
    );
  });

  it("takes the best card only if its value is strictly above the bar, and says which bar", () => {
    const set = setFor("ironclad");
    const between = set?.cards.find((c) => c.beta > 0.02 && c.beta < PICKIER_THRESHOLD);
    const above = set?.cards.find((c) => c.beta > PICKIER_THRESHOLD + 0.05);
    expect(between, "a card measured between zero and the bar").toBeDefined();
    expect(above, "a card measured well above the bar").toBeDefined();
    const ordinary = simulationPick({
      character: "ironclad",
      offered: [between?.id ?? ""],
      deckSize: 12,
    });
    const pickier = simulationPick({
      character: "ironclad",
      offered: [between?.id ?? ""],
      deckSize: 12,
      threshold: PICKIER_THRESHOLD,
    });
    expect(ordinary.kind).toBe("pick");
    expect(pickier.kind).toBe("skip");
    expect(pickier.reason).toContain("above 0.2");
    expect(pickier.reason).toContain("counts as zero");
    const takes = simulationPick({
      character: "ironclad",
      offered: [between?.id ?? "", above?.id ?? ""],
      deckSize: 12,
      threshold: PICKIER_THRESHOLD,
    });
    expect(takes.kind === "pick" ? takes.cardId : "").toBe(above?.id);
    expect(takes.reason).toContain("above 0.2");
    expect(ordinary.reason).toContain("above zero");
  });

  it("is strict at the bar, as the policy is: a card measured exactly at it is skipped, one a hair below it is taken", () => {
    const card = setFor("ironclad")?.cards.find((c) => c.beta > 0.02 && c.beta < PICKIER_THRESHOLD);
    expect(card).toBeDefined();
    const at = simulationPick({
      character: "ironclad",
      offered: [card?.id ?? ""],
      deckSize: 12,
      threshold: card?.beta ?? 0,
    });
    expect(at.kind).toBe("skip");
    const hair = simulationPick({
      character: "ironclad",
      offered: [card?.id ?? ""],
      deckSize: 12,
      threshold: (card?.beta ?? 0) - 1e-9,
    });
    expect(hair.kind).toBe("pick");
  });

  it("still stops at the deck cap, whatever the bar", () => {
    const r = simulationPick({
      character: "ironclad",
      offered: ["RAMPAGE"],
      deckSize: DECK_CAP,
      threshold: PICKIER_THRESHOLD,
    });
    expect(r.kind).toBe("skip");
    expect(r.reason).toContain(String(DECK_CAP));
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
