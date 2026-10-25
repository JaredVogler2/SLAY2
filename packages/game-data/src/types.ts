import { z } from "zod";

export const CARD_CLASSES = [
  "ironclad",
  "silent",
  "regent",
  "necrobinder",
  "defect",
  "colorless",
  "curse",
  "status",
  "token",
  "event",
  "quest",
] as const;
export type CardClass = (typeof CARD_CLASSES)[number];

export const PLAYABLE_CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"] as const;
export type PlayableClass = (typeof PLAYABLE_CLASSES)[number];

export const CARD_RARITIES = [
  "basic",
  "common",
  "uncommon",
  "rare",
  "ancient",
  "event",
  "curse",
  "status",
  "token",
  "quest",
] as const;
export type CardRarity = (typeof CARD_RARITIES)[number];

export const REWARD_RARITIES = ["common", "uncommon", "rare"] as const;
export type RewardRarity = (typeof REWARD_RARITIES)[number];

export const CARD_TYPES = ["attack", "skill", "power", "curse", "status", "quest"] as const;

/** SLAY2's own vocabulary for what a card does (derived from structured fields, never from card text). */
export const ROLES = [
  "damage",
  "aoe",
  "multi-hit",
  "random-target",
  "block",
  "draw",
  "energy",
  "strength",
  "dexterity",
  "focus",
  "vulnerable",
  "weak",
  "poison",
  "doom",
  "thorns",
  "intangible",
  "vigor",
  "artifact",
  "summon",
  "forge",
  "stars",
  "orbs",
  "heal",
  "max-hp",
  "gold",
  "self-damage",
  "shiv",
  "strength-loss",
  "engine",
  "exhaust",
  "ethereal",
  "retain",
  "innate",
  "sly",
  "unplayable",
  "eternal",
] as const;
export type Role = (typeof ROLES)[number];

export const CardEntrySchema = z.strictObject({
  id: z.string().regex(/^[A-Z0-9_]+$/),
  name: z.string().min(1),
  class: z.enum(CARD_CLASSES),
  rarity: z.enum(CARD_RARITIES),
  type: z.enum(CARD_TYPES),
  cost: z.union([z.number().int().min(0).max(9), z.literal("X"), z.null()]),
  starCost: z.number().int().min(1).optional(),
  keywords: z.array(z.string()),
  roles: z.array(z.enum(ROLES)),
  prior: z.number().int().min(0).max(100),
  rewardEligible: z.boolean(),
  multiplayer: z.enum(["multiplayer-only", "singleplayer-only"]).nullable(),
  epochGate: z.string().nullable(),
});
export type CardEntry = z.infer<typeof CardEntrySchema>;

export const CatalogSchema = z.strictObject({
  schema: z.literal(1),
  build: z.literal("sts2-main-0.107.1"),
  provenance: z.looseObject({
    kind: z.string(),
    sources: z.array(z.looseObject({ id: z.string(), sha: z.string() })),
    derivedBy: z.string(),
    retrieved: z.string(),
    notes: z.array(z.string()),
  }),
  cards: z.array(CardEntrySchema),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type Catalog = z.infer<typeof CatalogSchema>;
