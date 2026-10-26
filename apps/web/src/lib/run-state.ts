import { z } from "zod";

import {
  characterFacts,
  getCard,
  starterDeck,
  PLAYABLE_CLASSES,
  type PlayableClass,
} from "@slay2/game-data";
import { AscensionSchema, BuildIdSchema, SUPPORTED_BUILD_ID } from "@slay2/game-schema";
import type {
  PackObservation,
  PotionObservation,
  RewardSource,
  UnknownObservation,
} from "@slay2/odds";

/**
 * The player's run as SLAY2 knows it. It lives only in this browser (localStorage) and in exported JSON files the
 * player chooses to save; nothing is sent to a server. Missing information is `null` / "unknown", never a silent default.
 */
export const RUN_STATE_VERSION = 1 as const;
export const MAX_IMPORT_BYTES = 256 * 1024;

const CardIdSchema = z.string().regex(/^[A-Z0-9_]{1,64}$/);
const ActSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export const PackSourceSchema = z.enum(["regular", "elite", "boss", "shop", "event"]);
export type PackSource = z.infer<typeof PackSourceSchema>;

export const PackLogSchema = z.strictObject({
  at: z.string().max(40),
  source: PackSourceSchema,
  actIndex: ActSchema,
  offered: z.array(CardIdSchema).min(1).max(8),
  /** card id taken, "skip", or null when the player only recorded what was offered */
  picked: z.union([CardIdSchema, z.literal("skip")]).nullable(),
});
export type PackLog = z.infer<typeof PackLogSchema>;

export const PotionObservationSchema = z.strictObject({
  room: z.enum(["monster", "elite", "boss"]),
  dropped: z.boolean().optional(),
  forced: z.boolean().optional(),
});

export const UnknownObservationSchema = z.strictObject({
  outcome: z.enum(["fight", "treasure", "shop", "event"]).optional(),
});

export const RunStateSchema = z.strictObject({
  v: z.literal(RUN_STATE_VERSION),
  id: z.string().regex(/^[a-z0-9-]{8,40}$/),
  createdAt: z.string().max(40),
  updatedAt: z.string().max(40),
  build: BuildIdSchema,
  character: z.enum(PLAYABLE_CLASSES).nullable(),
  ascension: AscensionSchema,
  /** false until the player confirms the ascension; calculators then say "assumed A0" */
  ascensionConfirmed: z.boolean(),
  actIndex: ActSchema,
  hp: z
    .strictObject({
      current: z.number().int().min(1).max(999),
      max: z.number().int().min(1).max(999),
    })
    .nullable(),
  deck: z
    .array(z.strictObject({ id: CardIdSchema, count: z.number().int().min(1).max(30) }))
    .max(120),
  packs: z.array(PackLogSchema).max(200),
  potions: z.array(PotionObservationSchema).max(200),
  /** "?" rooms met in the CURRENT act (the counters reset every act) */
  unknownRooms: z.array(UnknownObservationSchema).max(60),
  profile: z.strictObject({
    /** a profile's very first run has scripted early rewards; unknown is the honest default */
    firstRun: z.enum(["unknown", "no", "yes"]),
  }),
  risk: z.enum(["safe", "balanced", "aggressive"]),
});
export type RunState = z.infer<typeof RunStateSchema>;

function randomId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

export function newRun(character: PlayableClass | null = null, now = new Date()): RunState {
  const iso = now.toISOString();
  const facts = character ? characterFacts(character) : null;
  return {
    v: RUN_STATE_VERSION,
    id: randomId(),
    createdAt: iso,
    updatedAt: iso,
    build: SUPPORTED_BUILD_ID,
    character,
    ascension: 0,
    ascensionConfirmed: false,
    actIndex: 0,
    hp: facts ? { current: facts.startingHp, max: facts.startingHp } : null,
    deck: character ? starterDeck(character) : [],
    packs: [],
    potions: [],
    unknownRooms: [],
    profile: { firstRun: "unknown" },
    risk: "balanced",
  };
}

/** Switching character resets the character-specific parts but keeps what is character-independent. */
export function withCharacter(
  state: RunState,
  character: PlayableClass,
  now = new Date(),
): RunState {
  const fresh = newRun(character, now);
  return {
    ...fresh,
    id: state.id,
    createdAt: state.createdAt,
    ascension: state.ascension,
    ascensionConfirmed: state.ascensionConfirmed,
    risk: state.risk,
    profile: state.profile,
  };
}

export function touch(state: RunState, now = new Date()): RunState {
  return { ...state, updatedAt: now.toISOString() };
}

export function sourceToReward(source: PackSource): RewardSource {
  switch (source) {
    case "regular":
      return { kind: "encounter", room: "regular" };
    case "elite":
      return { kind: "encounter", room: "elite" };
    case "boss":
      return { kind: "encounter", room: "boss" };
    case "shop":
      return { kind: "shop" };
    case "event":
      return { kind: "base", table: "regular" };
  }
}

/** What the logged packs tell the odds engine: exact rarity counts read off the catalog. */
export function packObservations(state: RunState): PackObservation[] {
  const out: PackObservation[] = [];
  for (const p of state.packs) {
    const cards = p.offered.map((id) => getCard(id));
    if (cards.some((c) => !c)) {
      continue; // unknown id (e.g. a card from a later build): skip rather than guess
    }
    const rarities = cards.map((c) => c?.rarity);
    out.push({
      source: sourceToReward(p.source),
      cards: p.offered.length,
      rares: rarities.filter((r) => r === "rare").length,
      uncommons: rarities.filter((r) => r === "uncommon").length,
    });
  }
  return out;
}

export function potionObservations(state: RunState): PotionObservation[] {
  return state.potions.map((p) => ({
    room: p.room,
    ...(p.dropped === undefined ? {} : { dropped: p.dropped }),
    ...(p.forced === undefined ? {} : { forced: p.forced }),
  }));
}

export function unknownObservations(state: RunState): UnknownObservation[] {
  return state.unknownRooms.map((r) => (r.outcome === undefined ? {} : { outcome: r.outcome }));
}

export type ParseResult = { ok: true; state: RunState } | { ok: false; error: string };

/** Parse and validate untrusted JSON (localStorage or an imported file). Never throws. */
export function parseRunState(text: string): ParseResult {
  if (text.length > MAX_IMPORT_BYTES) {
    return { ok: false, error: `File is larger than ${String(MAX_IMPORT_BYTES / 1024)} KB.` };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "Not valid JSON." };
  }
  const migrated = migrate(raw);
  const parsed = RunStateSchema.safeParse(migrated);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: `Invalid run file: ${first?.path.join(".") ?? ""} ${first?.message ?? ""}`.trim(),
    };
  }
  const unknownCards = [
    ...parsed.data.deck.map((d) => d.id),
    ...parsed.data.packs.flatMap((p) => p.offered),
  ].filter((id) => !getCard(id));
  if (unknownCards.length > 0) {
    return {
      ok: false,
      error: `Unknown card id(s) for build ${parsed.data.build}: ${[...new Set(unknownCards)].slice(0, 5).join(", ")}`,
    };
  }
  return { ok: true, state: parsed.data };
}

/** Versioned migrations: add a case here whenever RUN_STATE_VERSION changes. */
export function migrate(raw: unknown): unknown {
  return raw;
}
