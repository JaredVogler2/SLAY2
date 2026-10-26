// @vitest-environment node
import { describe, expect, it } from "vitest";

import { starterDeck } from "@slay2/game-data";

import {
  applyOpening,
  deckAdd,
  deckCopies,
  deckRemove,
  deckSetUpgraded,
  deckUpgraded,
  openingProblems,
} from "@/lib/opening";
import { newRun, parseRunState, withCharacter, type RunState } from "@/lib/run-state";
import { getOpeningOption } from "@slay2/game-data";

const NOW = new Date("2026-10-26T12:00:00Z");

function ironclad(): RunState {
  return newRun("ironclad", NOW);
}

describe("deck helpers", () => {
  it("add, remove and upgrade copies, keeping upgraded within the copies held", () => {
    let deck = starterDeck("ironclad");
    const strikes = deckCopies(deck, "STRIKE_IRONCLAD");
    expect(strikes).toBe(5);
    deck = deckSetUpgraded(deck, "STRIKE_IRONCLAD", 2);
    expect(deckUpgraded(deck, "STRIKE_IRONCLAD")).toBe(2);
    deck = deckRemove(deck, "STRIKE_IRONCLAD", 4); // base copies go first, so the upgraded count follows the copies left
    expect(deckCopies(deck, "STRIKE_IRONCLAD")).toBe(1);
    expect(deckUpgraded(deck, "STRIKE_IRONCLAD")).toBe(1);
    deck = deckRemove(deck, "STRIKE_IRONCLAD", 1);
    expect(deck.some((d) => d.id === "STRIKE_IRONCLAD")).toBe(false);
    expect(
      deckSetUpgraded(deck, "DEFEND_IRONCLAD", 99).find((d) => d.id === "DEFEND_IRONCLAD")
        ?.upgraded,
    ).toBe(4);
    expect(deckAdd(deck, "INFLAME").find((d) => d.id === "INFLAME")?.count).toBe(1);
    expect(deckAdd(deck, "INFLAME", 0)).toBe(deck);
  });

  it("never stores a zero upgraded count", () => {
    const deck = deckSetUpgraded(starterDeck("ironclad"), "BASH", 0);
    expect(deck.find((d) => d.id === "BASH")).toEqual({ id: "BASH", count: 1 });
  });
});

describe("applying the opening Ancient's option", () => {
  it("Neow's Torment adds Neow's Fury, and the entry is logged", () => {
    const { run, lines } = applyOpening(ironclad(), "NEOWS_TORMENT", {});
    expect(deckCopies(run.deck, "NEOWS_FURY")).toBe(1);
    expect(run.opening.entries).toEqual([
      { id: "NEOWS_TORMENT", lines: ["Added Neow's Fury to the deck."] },
    ]);
    expect(lines).toHaveLength(1);
  });

  it("Precarious Shears removes the two cards the player names and costs 16 HP (80 to 64)", () => {
    const base = ironclad();
    expect(base.hp).toEqual({ current: 80, max: 80 });
    const { run } = applyOpening(base, "PRECARIOUS_SHEARS", {
      0: ["STRIKE_IRONCLAD", "STRIKE_IRONCLAD"],
    });
    expect(deckCopies(run.deck, "STRIKE_IRONCLAD")).toBe(3);
    expect(run.hp).toEqual({ current: 64, max: 80 });
  });

  it("Leafy Poultice transforms a Strike and a Defend and costs 12 max HP, without raising current HP", () => {
    const { run, lines } = applyOpening(ironclad(), "LEAFY_POULTICE", {
      0: ["ANGER"],
      1: ["SHRUG_IT_OFF"],
    });
    expect(deckCopies(run.deck, "STRIKE_IRONCLAD")).toBe(4);
    expect(deckCopies(run.deck, "DEFEND_IRONCLAD")).toBe(3);
    expect(deckCopies(run.deck, "ANGER")).toBe(1);
    expect(deckCopies(run.deck, "SHRUG_IT_OFF")).toBe(1);
    expect(run.hp).toEqual({ current: 68, max: 68 });
    expect(lines.join(" ")).toContain("Transformed Strike into Anger");
  });

  it("Nutritious Oyster raises max HP and heals that much; Neow's Talisman upgrades one Strike and one Defend", () => {
    expect(applyOpening(ironclad(), "NUTRITIOUS_OYSTER", {}).run.hp).toEqual({
      current: 91,
      max: 91,
    });
    const { run } = applyOpening(ironclad(), "NEOWS_TALISMAN", {});
    expect(deckUpgraded(run.deck, "STRIKE_IRONCLAD")).toBe(1);
    expect(deckUpgraded(run.deck, "DEFEND_IRONCLAD")).toBe(1);
    expect(deckCopies(run.deck, "STRIKE_IRONCLAD")).toBe(5);
  });

  it("Large Capsule adds one more Strike and one more Defend of the class", () => {
    const { run } = applyOpening(withCharacter(ironclad(), "silent", NOW), "LARGE_CAPSULE", {});
    expect(deckCopies(run.deck, "STRIKE_SILENT")).toBe(6);
    expect(deckCopies(run.deck, "DEFEND_SILENT")).toBe(6);
  });

  it("Hefty Tablet adds Injury and the Rare card the player chose; Pomander upgrades the card named", () => {
    const hefty = applyOpening(ironclad(), "HEFTY_TABLET", { 1: ["DEMON_FORM"] });
    expect(deckCopies(hefty.run.deck, "INJURY")).toBe(1);
    expect(deckCopies(hefty.run.deck, "DEMON_FORM")).toBe(1);
    const pomander = applyOpening(ironclad(), "POMANDER", { 0: ["BASH"] });
    expect(deckUpgraded(pomander.run.deck, "BASH")).toBe(1);
  });

  it("an option that changes nothing the advisor tracks is still logged, with what is not tracked", () => {
    const { run, lines } = applyOpening(ironclad(), "GOLDEN_PEARL", {});
    expect(run.deck).toEqual(ironclad().deck);
    expect(lines[0]).toMatch(/^Not tracked: \+150 gold/);
    expect(run.opening.entries).toHaveLength(1);
  });

  it("says what is missing or impossible before applying, and refuses to apply it", () => {
    const base = ironclad();
    const shears = getOpeningOption("PRECARIOUS_SHEARS");
    expect(shears).toBeDefined();
    if (!shears) return;
    expect(openingProblems(base, shears, {})).toHaveLength(1);
    expect(openingProblems(base, shears, { 0: ["BASH"] })[0]).toContain("choose 2 from your deck");
    expect(openingProblems(base, shears, { 0: ["BASH", "BASH"] })[0]).toContain("not in your deck");
    expect(openingProblems(base, shears, { 0: ["BASH", "STRIKE_IRONCLAD"] })).toEqual([]);
    expect(() => applyOpening(base, "PRECARIOUS_SHEARS", { 0: ["BASH"] })).toThrow(/choose 2/);
    const pomander = getOpeningOption("POMANDER");
    if (pomander) {
      const upgraded = applyOpening(base, "POMANDER", { 0: ["BASH"] }).run;
      expect(openingProblems(upgraded, pomander, { 0: ["BASH"] })[0]).toContain(
        "no base Bash left",
      );
    }
    expect(() => applyOpening(newRun(null, NOW), "NEOWS_TORMENT", {})).toThrow();
    expect(() => applyOpening(base, "NOT_AN_OPTION", {})).toThrow();
  });

  it("allows an optional pick to stay empty (a reward the player skipped)", () => {
    const { run } = applyOpening(ironclad(), "LOST_COFFER", {});
    expect(run.deck).toEqual(ironclad().deck);
    expect(run.opening.entries[0]?.id).toBe("LOST_COFFER");
  });

  it("stacks entries (Neow's Bones hands out more relics) and keeps the last six", () => {
    let run = ironclad();
    for (let i = 0; i < 8; i++) {
      run = applyOpening(run, "BOOMING_CONCH", {}).run;
    }
    expect(run.opening.entries).toHaveLength(6);
  });
});

describe("the run file", () => {
  it("reads a run saved before these fields existed and gives it the defaults", () => {
    const old: Record<string, unknown> = { ...ironclad() };
    delete old.act1;
    delete old.act1Boss;
    delete old.opening;
    const parsed = parseRunState(JSON.stringify(old));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.state.act1).toBeNull();
      expect(parsed.state.act1Boss).toBeNull();
      expect(parsed.state.opening).toEqual({ entries: [] });
    }
  });

  it("round-trips the Act 1 version, its boss, the opening log and upgraded copies", () => {
    const base = ironclad();
    const withStart: RunState = {
      ...applyOpening(base, "NEOWS_TALISMAN", {}).run,
      act1: "underdocks",
      act1Boss: "soul-fysh",
    };
    const parsed = parseRunState(JSON.stringify(withStart));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.state).toEqual(withStart);
    }
  });

  it("refuses a boss of the other version, a boss without a version, an unknown option and too many upgrades", () => {
    const base = ironclad();
    const bad = (patch: Record<string, unknown>) =>
      parseRunState(JSON.stringify({ ...base, ...patch }));
    expect(bad({ act1: "overgrowth", act1Boss: "soul-fysh" }).ok).toBe(false);
    expect(bad({ act1: null, act1Boss: "vantom" }).ok).toBe(false);
    expect(bad({ act1: "overgrowth", act1Boss: "vantom" }).ok).toBe(true);
    expect(bad({ opening: { entries: [{ id: "NOT_AN_OPTION", lines: [] }] } }).ok).toBe(false);
    expect(bad({ deck: [{ id: "BASH", count: 1, upgraded: 2 }] }).ok).toBe(false);
    expect(bad({ act1: "mars" }).ok).toBe(false);
  });

  it("keeps the Act 1 version when the character changes and drops the opening log with the deck", () => {
    const run: RunState = {
      ...applyOpening(ironclad(), "NEOWS_TORMENT", {}).run,
      act1: "overgrowth",
      act1Boss: "the-kin",
    };
    const other = withCharacter(run, "silent", NOW);
    expect(other.act1).toBe("overgrowth");
    expect(other.act1Boss).toBe("the-kin");
    expect(other.opening.entries).toEqual([]);
    expect(deckCopies(other.deck, "NEOWS_FURY")).toBe(0);
  });
});
