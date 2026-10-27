import { z } from "zod";

import raw from "../data/relic-synergy.sts2-main-0.107.1.json";
import { getRelic } from "./relics";
import { GivesSchema, MECHANIC_IDS, type MechanicId, type MechanicWeights } from "./synergy";

/**
 * What a relic provides to a deck, as SLAY2's own judgement (not a measurement), in the vocabulary of the card table (`./synergy`):
 * per mechanic 1 minor or conditional, 2 standard, 3 major or repeated every turn, negative when the relic takes the mechanic away.
 * It is a separate file so the table of the cards, the one the registered held-out test of the synergy term covers (ADR-050), keeps
 * its hash. A relic stays for the rest of the run, so what it provides counts toward what the deck's cards can lean on. The file is
 * made from two blind readings and a written reconciliation (`experiments/synergy/relics/`, `sim/slay2_sim/relicreading.py`,
 * ADR-051). It stores relic ids, mechanic names and small whole numbers, never relic text or numbers (ADR-011); most relics (gold,
 * potions, healing, the map ...) have no entry because they say nothing about the deck's mechanics, and the starting relics have none
 * because the card table's innate supply already counts them.
 */
const RelicSynergyFileSchema = z.strictObject({
  schema: z.literal(1),
  build: z.literal("sts2-main-0.107.1"),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  provenance: z.looseObject({ kind: z.string(), reading: z.string(), retrieved: z.string() }),
  relics: z.record(z.string().regex(/^[A-Z0-9_]+$/), z.strictObject({ g: GivesSchema })),
});

/** Parsed (and validated) once per module instance. The schema is strict: a mechanic that is not in the vocabulary fails the build. */
export const RELIC_SYNERGY = RelicSynergyFileSchema.parse(raw);

export interface RelicTags {
  /** What the relic provides to the deck, per mechanic (negative: it takes the mechanic away). */
  readonly gives: MechanicWeights;
}

const NONE: RelicTags = { gives: {} };

/** The written tags of a relic (none for a relic the table has nothing to say about, or one that is not in the catalog). */
export function relicTags(id: string): RelicTags {
  const written = RELIC_SYNERGY.relics[id];
  return written ? { gives: written.g } : NONE;
}

/** Whether the relic has a written entry. */
export function hasRelicTags(id: string): boolean {
  return Object.hasOwn(RELIC_SYNERGY.relics, id);
}

/** The relic ids of a list that the catalog knows, each once, and the ones it does not know. */
export function resolveRelics(ids: readonly string[]): { known: string[]; unknown: string[] } {
  const seen = new Set<string>();
  const known: string[] = [];
  const unknown: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    (getRelic(id) ? known : unknown).push(id);
  }
  return { known, unknown };
}

/** What the relics provide of each mechanic, together (each relic counted once). */
export function relicSupply(ids: readonly string[]): Record<MechanicId, number> {
  const supply = Object.fromEntries(MECHANIC_IDS.map((m) => [m, 0])) as Record<MechanicId, number>;
  for (const id of resolveRelics(ids).known) {
    const { gives } = relicTags(id);
    for (const m of MECHANIC_IDS) supply[m] += gives[m] ?? 0;
  }
  return supply;
}
