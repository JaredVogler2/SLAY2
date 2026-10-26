import { z } from "zod";

import raw from "../data/characters.sts2-main-0.107.1.json";
import { getCard } from "./catalog";
import { PLAYABLE_CLASSES, type PlayableClass } from "./types";

const CharacterSchema = z.strictObject({
  id: z.enum(PLAYABLE_CLASSES),
  startingHp: z.number().int().positive(),
  startingGold: z.number().int().nonnegative(),
  maxEnergy: z.number().int().positive(),
  startingDeck: z.array(z.strictObject({ id: z.string(), count: z.number().int().positive() })),
  startingRelics: z.array(z.strictObject({ id: z.string(), name: z.string() })),
  baseOrbSlots: z.number().int().positive().optional(),
});
export type CharacterFacts = z.infer<typeof CharacterSchema>;

const CharactersFileSchema = z.looseObject({
  schema: z.literal(1),
  build: z.literal("sts2-main-0.107.1"),
  characters: z.array(CharacterSchema).length(5),
  sha256: z.string(),
});

export const CHARACTER_FACTS: readonly CharacterFacts[] =
  CharactersFileSchema.parse(raw).characters;

export function characterFacts(id: PlayableClass): CharacterFacts {
  const found = CHARACTER_FACTS.find((c) => c.id === id);
  if (!found) {
    throw new RangeError(`unknown character ${id}`);
  }
  return found;
}

/** The Ascension at which the starting deck gains Ascender's Bane (ASC-3, DECK-1). */
export const ASCENDERS_BANE_FROM = 5;
/** The Ascension from which the opening Ancient heals only 80 % of the missing hit points (ASC-6, ANC-1). */
export const WEARY_TRAVELER_FROM = 2;

/**
 * Hit points when the run's first choice appears. Every act opens at an Ancient event, and in act one Neow sets the
 * player's hit points to 0 and then heals the missing amount: all of it up to Ascension 1, 80 % of it (truncated) from
 * Ascension 2 (ANC-1). A run therefore starts at full hit points at A0 and A1 and at floor(0.8 x max) from A2.
 */
export function startingHpAt(
  id: PlayableClass,
  ascension: number,
): { current: number; max: number } {
  const max = characterFacts(id).startingHp;
  return { current: ascension >= WEARY_TRAVELER_FROM ? Math.floor(max * 0.8) : max, max };
}

/**
 * Starting deck as card ids with counts; every id exists in the catalog. From Ascension 5 it holds Ascender's Bane too:
 * the game adds it to the starting deck when the run begins (ASC-3).
 */
export function starterDeck(id: PlayableClass, ascension = 0): { id: string; count: number }[] {
  const deck = characterFacts(id).startingDeck.map((e) => {
    if (!getCard(e.id)) {
      throw new RangeError(`starting-deck card ${e.id} missing from the catalog`);
    }
    return { id: e.id, count: e.count };
  });
  if (ascension >= ASCENDERS_BANE_FROM) {
    if (!getCard("ASCENDERS_BANE")) {
      throw new RangeError("ASCENDERS_BANE missing from the catalog");
    }
    deck.push({ id: "ASCENDERS_BANE", count: 1 });
  }
  return deck;
}
