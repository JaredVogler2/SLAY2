import { describe, expect, it } from "vitest";

import {
  CATALOG,
  PLAYABLE_CLASSES,
  characterFacts,
  getCard,
  isRemovable,
  isUpgradable,
  startingHpAt,
  starterDeck,
} from "../src";

describe("the state a run starts in (ANC-1, ASC-3)", () => {
  it("starts at full hit points up to Ascension 1 and at 80 % of them, truncated, from Ascension 2", () => {
    for (const id of PLAYABLE_CLASSES) {
      const max = characterFacts(id).startingHp;
      expect(startingHpAt(id, 0)).toEqual({ current: max, max });
      expect(startingHpAt(id, 1)).toEqual({ current: max, max });
      for (const a of [2, 5, 10]) {
        expect(startingHpAt(id, a)).toEqual({ current: Math.floor(max * 0.8), max });
      }
    }
    expect(startingHpAt("ironclad", 2)).toEqual({ current: 64, max: 80 });
  });

  it("adds Ascender's Bane to the starting deck from Ascension 5, once, and changes nothing else", () => {
    for (const id of PLAYABLE_CLASSES) {
      const base = starterDeck(id);
      expect(starterDeck(id, 0)).toEqual(base);
      expect(starterDeck(id, 4)).toEqual(base);
      for (const a of [5, 7, 10]) {
        expect(starterDeck(id, a)).toEqual([...base, { id: "ASCENDERS_BANE", count: 1 }]);
      }
    }
  });
});

describe("what can be done to a card in the deck (DECK-1)", () => {
  it("cannot remove or transform a card with the Eternal keyword", () => {
    const eternal = CATALOG.cards.filter((c) => !isRemovable(c.id)).map((c) => c.id);
    expect(eternal.sort()).toEqual([
      "ASCENDERS_BANE",
      "BAD_LUCK",
      "CURSE_OF_THE_BELL",
      "ENTHRALLED",
      "FOLLY",
      "FORBIDDEN_GRIMOIRE",
      "GREED",
    ]);
    expect(isRemovable("STRIKE_IRONCLAD")).toBe(true);
    expect(isRemovable("INJURY")).toBe(true); // a curse without the keyword can be removed
    expect(isRemovable("NO_SUCH_CARD")).toBe(false);
  });

  it("cannot upgrade a curse, a status or a quest card, and can upgrade the rest", () => {
    const fixed = CATALOG.cards.filter((c) => !isUpgradable(c.id));
    // 18 curses, 16 statuses and 3 quest cards: the 37 cards whose maximum upgrade level is 0 in the game
    expect(fixed).toHaveLength(37);
    expect(fixed.every((c) => ["curse", "status", "quest"].includes(c.type))).toBe(true);
    for (const id of ["INJURY", "BURN", "BYRDONIS_EGG", "ASCENDERS_BANE"]) {
      expect(isUpgradable(id)).toBe(false);
    }
    for (const id of ["STRIKE_IRONCLAD", "BASH", "NEOWS_FURY"]) {
      expect(getCard(id)).toBeDefined();
      expect(isUpgradable(id)).toBe(true);
    }
    expect(isUpgradable("NO_SUCH_CARD")).toBe(false);
  });
});
