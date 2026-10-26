import { z } from "zod";

import raw from "../data/synergy.sts2-main-0.107.1.json";
import { PLAYABLE_CLASSES, type CardEntry, type PlayableClass } from "./types";

/**
 * How cards work together, as SLAY2's own judgement (not a measurement): for every card, what it provides to the deck
 * ("gives") and what its value depends on ("wants"), per mechanic. Written from reading each card's effect in a local
 * reference (ADR-011); the file stores ids, mechanic names and small whole-number weights, never card text or numbers.
 *
 * A mechanic is a resource or trigger several cards share: Strength, Exhaust, Block, Poison, Shivs, Orbs, Stars, Osty,
 * Doom and so on. Feel No Pain *wants* Exhaust; Burning Pact *gives* it. A few mechanics are counted by the code from the
 * catalog instead of being listed (Attacks, Skills, Powers, cheap and free cards, Strike-named cards, Block, the Exhaust
 * and Ethereal keywords).
 */
export const MECHANIC_IDS = [
  "strength",
  "dexterity",
  "block",
  "exhaust",
  "draw",
  "energy",
  "vulnerable",
  "weak",
  "poison",
  "shiv",
  "discard",
  "orb",
  "focus",
  "star",
  "forge",
  "create",
  "osty",
  "soul",
  "doom",
  "ethereal",
  "hp_loss",
  "attack",
  "skill",
  "power",
  "cheap",
  "zero_cost",
  "status",
  "strike",
] as const;
export type MechanicId = (typeof MECHANIC_IDS)[number];

const MechanicSchema = z.strictObject({
  label: z.string().min(1),
  /** How many units of supply make a payoff 63 % supported (supply saturates: the fifth source adds less than the first). */
  k: z.number().positive(),
  /** What a complete engine of this mechanic (sources and payoffs together) is worth to a deck, in advisor index points. */
  engine: z.number().min(0),
  about: z.string().min(1),
});

const GivesSchema = z.partialRecord(
  z.enum(MECHANIC_IDS),
  z
    .number()
    .int()
    .min(-3)
    .max(3)
    .refine((n) => n !== 0, "a zero weight is not written"),
);
const WantsSchema = z.partialRecord(z.enum(MECHANIC_IDS), z.number().int().min(1).max(3));

/** What a class's starting relic provides in every combat whatever cards the deck holds (same scale as a card's gives). */
const InnateSchema = z.partialRecord(
  z.enum(PLAYABLE_CLASSES),
  z.strictObject({ relic: z.string().min(1), gives: GivesSchema }),
);

const SynergyFileSchema = z.strictObject({
  schema: z.literal(1),
  build: z.literal("sts2-main-0.107.1"),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  provenance: z.looseObject({ kind: z.string(), reading: z.string(), retrieved: z.string() }),
  mechanics: z.strictObject(
    Object.fromEntries(MECHANIC_IDS.map((id) => [id, MechanicSchema])) as Record<
      MechanicId,
      typeof MechanicSchema
    >,
  ),
  innate: InnateSchema,
  cards: z.record(
    z.string().regex(/^[A-Z0-9_]+$/),
    z.strictObject({
      g: GivesSchema.optional(),
      w: WantsSchema.optional(),
      /** For a need that is bigger than the mechanic's usual: the card needs this many times the usual supply. */
      s: z.partialRecord(z.enum(MECHANIC_IDS), z.number().positive()).optional(),
    }),
  ),
});

/** Parsed (and validated) once per module instance. The schema is strict: a mechanic that is not in the vocabulary fails the build. */
export const SYNERGY = SynergyFileSchema.parse(raw);
export const MECHANICS: Readonly<Record<MechanicId, z.infer<typeof MechanicSchema>>> =
  SYNERGY.mechanics;

export type MechanicWeights = Readonly<Partial<Record<MechanicId, number>>>;

export interface InnateSupply {
  /** The starting relic that provides it (a name the player sees). */
  readonly relic: string;
  readonly gives: MechanicWeights;
}

/**
 * What the class has in every combat before a single card is played: the Necrobinder's Osty, the Regent's Stars, the Defect's
 * first Lightning, the Silent's extra opening cards. A need that this meets is never unmet; without it the first table held
 * every Osty card of the Necrobinder back for want of an Osty that is always there. Null for a class whose starting relic
 * supplies none of the mechanics (the Ironclad's heals after combat).
 */
export function innateSupply(character: PlayableClass | null | undefined): InnateSupply | null {
  return (character ? SYNERGY.innate[character] : undefined) ?? null;
}

export interface SynergyTags {
  /** What the card provides to the deck, per mechanic (negative: it takes the mechanic away). */
  readonly gives: MechanicWeights;
  /** How much of the card's value depends on each mechanic being supplied, 1 (a bonus) to 3 (the card's point). */
  readonly wants: MechanicWeights;
  /** For a need bigger than the mechanic's usual (a card that costs 7 Stars): how many times the usual supply it takes. */
  readonly scale: MechanicWeights;
}

function merge(
  derived: Record<string, number>,
  explicit: MechanicWeights | undefined,
): MechanicWeights {
  const out: Record<string, number> = { ...derived };
  for (const [m, v] of Object.entries(explicit ?? {})) {
    // the larger of what the code counts and what was written: a card is never counted twice for one mechanic
    out[m] = Math.abs(v) > Math.abs(out[m] ?? 0) ? v : (out[m] ?? v);
  }
  return out;
}

/** The mechanics counted from the catalog itself, so the tag file only lists what the catalog cannot say. */
function derivedGives(card: CardEntry): Record<string, number> {
  const out: Record<string, number> = {};
  if (card.type === "attack") out.attack = 1;
  if (card.type === "skill") out.skill = 1;
  if (card.type === "power") out.power = 1;
  const cost = card.roles.includes("unplayable") ? null : card.cost;
  if (cost !== null && cost !== "X" && cost <= 1) out.cheap = 1;
  if (cost === 0) out.zero_cost = 1;
  if (card.id.includes("STRIKE")) out.strike = 1;
  if (card.roles.includes("block")) out.block = 1;
  if (card.keywords.includes("Exhaust")) out.exhaust = 1;
  if (card.keywords.includes("Ethereal")) out.ethereal = 1;
  return out;
}

function derivedWants(card: CardEntry): Record<string, number> {
  // a Sly card plays for free when it is discarded from the hand, so it wants a way to discard
  return card.keywords.includes("Sly") ? { discard: 2 } : {};
}

const CACHE = new Map<string, SynergyTags>();

/** What the card gives the deck and what it depends on: the written tags merged with what the catalog says by itself. */
export function synergyTags(card: CardEntry): SynergyTags {
  const hit = CACHE.get(card.id);
  if (hit) return hit;
  const written = SYNERGY.cards[card.id];
  const tags: SynergyTags = {
    gives: merge(derivedGives(card), written?.g),
    wants: merge(derivedWants(card), written?.w),
    scale: written?.s ?? {},
  };
  CACHE.set(card.id, tags);
  return tags;
}

/** Whether the card has a written entry (the rest are read from the catalog alone). */
export function hasWrittenTags(cardId: string): boolean {
  return Object.hasOwn(SYNERGY.cards, cardId);
}

/**
 * Mechanics that make a whole kind of card a little better instead of being a need of a few cards: Strength helps every
 * attack, Dexterity every card that gives Block, Focus every orb. They are not written per card; a card has a benefit
 * from a mechanic unless it is a written need of the card (a multi-hit attack's need of Strength is already counted).
 * The size of the benefit is the advisor's to set; this only says who benefits.
 */
export const SCALERS = ["strength", "dexterity", "focus"] as const satisfies readonly MechanicId[];
export type Scaler = (typeof SCALERS)[number];

export function benefitsFrom(card: CardEntry): readonly Scaler[] {
  const tags = synergyTags(card);
  const out: Scaler[] = [];
  if (card.type === "attack" && !tags.wants.strength) out.push("strength");
  if (card.roles.includes("block") && !tags.wants.dexterity) out.push("dexterity");
  if ((tags.gives.orb ?? 0) > 0 && !tags.wants.focus) out.push("focus");
  return out;
}
