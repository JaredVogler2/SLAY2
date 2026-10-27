import { z } from "zod";

import raw from "../data/relics.sts2-main-0.107.1.json";
import { matchScore } from "./search";

/** The tiers the game's relic list gives. `none` is the one placeholder (the fallback pool's Circlet). */
export const RELIC_RARITIES = [
  "starter",
  "common",
  "uncommon",
  "rare",
  "shop",
  "ancient",
  "event",
  "none",
] as const;
export type RelicRarity = (typeof RELIC_RARITIES)[number];

/** The relic pools of the build: one per playable class, the shared pool, the event pool and the fallback. */
export const RELIC_POOLS = [
  "ironclad",
  "silent",
  "regent",
  "necrobinder",
  "defect",
  "shared",
  "event",
  "fallback",
] as const;
export type RelicPool = (typeof RELIC_POOLS)[number];

/** Facts only: what a player reads off a relic's name and where the game can offer it. No text, art or numbers (ADR-011). */
export const RelicEntrySchema = z.strictObject({
  id: z.string().regex(/^[A-Z0-9_]{1,64}$/),
  name: z.string().min(1).max(80),
  rarity: z.enum(RELIC_RARITIES),
  pools: z.array(z.enum(RELIC_POOLS)).min(1),
});
export type RelicEntry = z.infer<typeof RelicEntrySchema>;

export const RelicCatalogSchema = z.strictObject({
  schema: z.literal(1),
  build: z.literal("sts2-main-0.107.1"),
  provenance: z.looseObject({
    kind: z.string(),
    sources: z.array(z.looseObject({ id: z.string(), sha: z.string() })),
    derivedBy: z.string(),
    retrieved: z.string(),
    notes: z.array(z.string()),
  }),
  relics: z.array(RelicEntrySchema),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type RelicCatalog = z.infer<typeof RelicCatalogSchema>;

/** Parsed (and validated) once per module instance. The schema is strict: any extra field fails the build. */
export const RELIC_CATALOG = RelicCatalogSchema.parse(raw);

const BY_ID = new Map<string, RelicEntry>(RELIC_CATALOG.relics.map((r) => [r.id, r]));

export function getRelic(id: string): RelicEntry | undefined {
  return BY_ID.get(id);
}

export interface RelicSearchOptions {
  readonly pools?: readonly RelicPool[];
  readonly rarities?: readonly RelicRarity[];
  readonly limit?: number;
}

/** Fuzzy search by name or id, best match first (the same scoring as the card search). An empty query lists in name order. */
export function searchRelics(query: string, options: RelicSearchOptions = {}): RelicEntry[] {
  const { pools, rarities, limit = 12 } = options;
  const scored: { relic: RelicEntry; score: number }[] = [];
  for (const relic of RELIC_CATALOG.relics) {
    if (pools && !relic.pools.some((p) => pools.includes(p))) {
      continue;
    }
    if (rarities && !rarities.includes(relic.rarity)) {
      continue;
    }
    const score = matchScore(query, relic);
    if (score > 0) {
      scored.push({ relic, score });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.relic.name.localeCompare(b.relic.name));
  return scored.slice(0, limit).map((s) => s.relic);
}
