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
import {
  newRun,
  parseRunState,
  resetToStart,
  withAscension,
  withCharacter,
  type RunState,
} from "@/lib/run-state";
import { OPENING_OPTIONS, getOpeningOption } from "@slay2/game-data";

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
      const upgraded: RunState = { ...base, deck: deckSetUpgraded(base.deck, "BASH", 1) };
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
    // options that need no answer: a relic is taken once, so each is a different one
    const plain = OPENING_OPTIONS.filter((o) => openingProblems(run, o, {}).length === 0);
    expect(plain.length).toBeGreaterThanOrEqual(8);
    for (const o of plain.slice(0, 8)) {
      run = applyOpening(run, o.id, {}).run;
    }
    expect(run.opening.entries).toHaveLength(6);
    expect(run.opening.entries.at(-1)?.id).toBe(plain[7]?.id);
  });

  it("records an option once: the log is how the run stands, a correction is an Undo", () => {
    const once = applyOpening(ironclad(), "BOOMING_CONCH", {}).run;
    const again = getOpeningOption("BOOMING_CONCH");
    expect(again).toBeDefined();
    if (!again) return;
    expect(openingProblems(once, again, {})[0]).toContain("already recorded");
    expect(() => applyOpening(once, "BOOMING_CONCH", {})).toThrow(/already recorded/);
  });

  it("states HP and max HP changes as the change, and counts them even without HP on record", () => {
    const { run, lines } = applyOpening(ironclad(), "NUTRITIOUS_OYSTER", {});
    expect(lines).toEqual(["Max HP +11."]);
    const withoutHp: RunState = { ...ironclad(), hp: null };
    expect(applyOpening(withoutHp, "NUTRITIOUS_OYSTER", {}).run.hp).toEqual(run.hp);
    expect(
      applyOpening(withoutHp, "PRECARIOUS_SHEARS", { 0: ["STRIKE_IRONCLAD", "STRIKE_IRONCLAD"] })
        .run.hp,
    ).toEqual({ current: 64, max: 80 });
  });

  it("cannot name a card the game does not let a player remove, transform or upgrade", () => {
    const a5 = withAscension(ironclad(), 5);
    expect(deckCopies(a5.deck, "ASCENDERS_BANE")).toBe(1);
    const scissors = getOpeningOption("PRECISE_SCISSORS");
    const newLeaf = getOpeningOption("NEW_LEAF");
    const pomander = getOpeningOption("POMANDER");
    expect(scissors && newLeaf && pomander).toBeTruthy();
    if (!scissors || !newLeaf || !pomander) return;
    expect(openingProblems(a5, scissors, { 0: ["ASCENDERS_BANE"] })[0]).toContain(
      "cannot be removed",
    );
    expect(openingProblems(a5, scissors, { 0: ["STRIKE_IRONCLAD"] })).toEqual([]);
    expect(openingProblems(a5, newLeaf, { 0: ["ASCENDERS_BANE", "ANGER"] })[0]).toContain(
      "cannot be transformed",
    );
    // a curse picked up from Hefty Tablet cannot be upgraded by Pomander either
    const hefty = applyOpening(ironclad(), "HEFTY_TABLET", { 1: ["DEMON_FORM"] }).run;
    expect(deckCopies(hefty.deck, "INJURY")).toBe(1);
    expect(openingProblems(hefty, pomander, { 0: ["INJURY"] })[0]).toContain("cannot be upgraded");
    expect(openingProblems(hefty, pomander, { 0: ["BASH"] })).toEqual([]);
  });
});

describe("how a run starts (ANC-1, ASC-3)", () => {
  it("heals only 80 % of the HP at Neow from Ascension 2, and the opening starts from there", () => {
    const a2 = withAscension(ironclad(), 2);
    expect(a2.ascensionConfirmed).toBe(true);
    expect(a2.hp).toEqual({ current: 64, max: 80 });
    // Precarious Shears: 16 HP off the 64 the game left, not off 80
    const { run } = applyOpening(a2, "PRECARIOUS_SHEARS", {
      0: ["STRIKE_IRONCLAD", "STRIKE_IRONCLAD"],
    });
    expect(run.hp).toEqual({ current: 48, max: 80 });
    expect(withAscension(a2, 1).hp).toEqual({ current: 80, max: 80 });
  });

  it("moves the HP the opening left by the difference between the two ascensions' starts", () => {
    const oyster = applyOpening(ironclad(), "NUTRITIOUS_OYSTER", {}).run; // 91 of 91 at A0
    expect(withAscension(oyster, 2).hp).toEqual({ current: 75, max: 91 });
    expect(withAscension(withAscension(oyster, 2), 0).hp).toEqual({ current: 91, max: 91 });
  });

  it("puts Ascender's Bane in the deck from Ascension 5 and takes it out below, once", () => {
    const a5 = withAscension(ironclad(), 5);
    expect(deckCopies(a5.deck, "ASCENDERS_BANE")).toBe(1);
    expect(withAscension(a5, 10).deck).toEqual(a5.deck);
    expect(withAscension(a5, 4).deck).toEqual(ironclad().deck);
    expect(withAscension(ironclad(), 3).deck).toEqual(ironclad().deck);
    // a class chosen after the ascension starts the same way
    const silentA5 = withCharacter(a5, "silent", NOW);
    expect(deckCopies(silentA5.deck, "ASCENDERS_BANE")).toBe(1);
    expect(silentA5.hp).toEqual({ current: 56, max: 70 });
  });

  it("changes only the ascension when there is no character yet", () => {
    const none = newRun(null, NOW);
    expect(withAscension(none, 7)).toEqual({ ...none, ascension: 7, ascensionConfirmed: true });
  });

  it("resets the deck, the HP and the opening log together, and keeps the rewards recorded", () => {
    const played: RunState = {
      ...applyOpening(withAscension(ironclad(), 5), "NEOWS_TORMENT", {}).run,
      packs: [
        {
          at: NOW.toISOString(),
          source: "regular",
          actIndex: 0,
          offered: ["BASH", "INFLAME"],
          picked: "INFLAME",
        },
      ],
    };
    const reset = resetToStart(played);
    expect(reset.opening.entries).toEqual([]);
    // Ascension 5: the heal at Neow is 80 % of the HP, and Ascender's Bane is in the deck
    expect(reset.hp).toEqual({ current: 64, max: 80 });
    expect(reset.deck).toEqual(withAscension(ironclad(), 5).deck);
    expect(reset.packs).toEqual(played.packs);
    expect(resetToStart(newRun(null, NOW)).deck).toEqual([]);
  });
});

describe("the run file", () => {
  it("reads a version-1 run (saved before these fields existed) and gives it the defaults", () => {
    const old: Record<string, unknown> = { ...ironclad(), v: 1 };
    delete old.act1;
    delete old.act1Boss;
    delete old.opening;
    const parsed = parseRunState(JSON.stringify(old));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.state.v).toBe(2);
      expect(parsed.state.act1).toBeNull();
      expect(parsed.state.act1Boss).toBeNull();
      expect(parsed.state.opening).toEqual({ entries: [] });
    }
  });

  it("reads a file the first build with these fields wrote: version 1 with the fields in it", () => {
    const written = {
      ...applyOpening(ironclad(), "NEOWS_TALISMAN", {}).run,
      v: 1,
      act1: "underdocks",
    };
    const parsed = parseRunState(JSON.stringify(written));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.state).toEqual({ ...written, v: 2 });
    }
  });

  it("refuses a version it does not know", () => {
    expect(parseRunState(JSON.stringify({ ...ironclad(), v: 3 })).ok).toBe(false);
    expect(parseRunState(JSON.stringify({ ...ironclad(), v: 0 })).ok).toBe(false);
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

  it("merges rows that repeat a card, so the deck helpers can rely on one row per card", () => {
    const base = ironclad();
    const parsed = parseRunState(
      JSON.stringify({
        ...base,
        deck: [
          { id: "STRIKE_IRONCLAD", count: 3 },
          { id: "BASH", count: 1 },
          { id: "STRIKE_IRONCLAD", count: 4, upgraded: 2 },
          { id: "DEFEND_IRONCLAD", count: 25 },
          { id: "DEFEND_IRONCLAD", count: 25, upgraded: 3 },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.state.deck).toEqual([
        { id: "STRIKE_IRONCLAD", count: 7, upgraded: 2 },
        { id: "BASH", count: 1 },
        { id: "DEFEND_IRONCLAD", count: 30, upgraded: 3 },
      ]);
    }
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
