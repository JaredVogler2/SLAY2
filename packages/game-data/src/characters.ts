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

/** Starting deck as card ids with counts; every id exists in the catalog. */
export function starterDeck(id: PlayableClass): { id: string; count: number }[] {
  return characterFacts(id).startingDeck.map((e) => {
    if (!getCard(e.id)) {
      throw new RangeError(`starting-deck card ${e.id} missing from the catalog`);
    }
    return { id: e.id, count: e.count };
  });
}
