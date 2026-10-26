import { z } from "zod";

import {
  ACT1_VARIANTS,
  ASCENDERS_BANE_FROM,
  getAct1Boss,
  getCard,
  getOpeningOption,
  starterDeck,
  startingHpAt,
  PLAYABLE_CLASSES,
  type PlayableClass,
} from "@slay2/game-data";
import { AscensionSchema, BuildIdSchema, SUPPORTED_BUILD_ID } from "@slay2/game-schema";
import { MAX_UNKNOWN_ROOMS_PER_ACT } from "@slay2/odds";
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
export const RUN_STATE_VERSION = 2 as const;
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

/**
 * One thing the opening Ancient gave the player: the option's id and what the player told us it did, as short lines (the deck
 * and HP were changed when it was applied; the lines are the log of that). Several entries exist because Neow's Bones hands
 * out further relics of the same kind.
 */
export const OpeningEntrySchema = z.strictObject({
  id: z.string().refine((id) => getOpeningOption(id) !== undefined, "unknown opening option"),
  lines: z.array(z.string().max(160)).max(14),
});
export type OpeningEntry = z.infer<typeof OpeningEntrySchema>;

export const DeckEntrySchema = z
  .strictObject({
    id: CardIdSchema,
    count: z.number().int().min(1).max(30),
    /** How many of the copies are upgraded (the advisor ignores upgrades; the deck shows them). Absent means none. */
    upgraded: z.number().int().min(0).max(30).optional(),
  })
  .refine(
    (d) => (d.upgraded ?? 0) <= d.count,
    "upgraded copies cannot exceed the copies in the deck",
  );
export type DeckEntryState = z.infer<typeof DeckEntrySchema>;

/**
 * One row per card. The deck helpers assume it, and a hand-edited file may repeat a card: the copies (and the upgraded
 * copies) of rows with the same id are added, within the limits of a row.
 */
function mergeDeckRows(rows: DeckEntryState[]): DeckEntryState[] {
  const merged = new Map<string, { count: number; upgraded: number }>();
  for (const row of rows) {
    const so_far = merged.get(row.id) ?? { count: 0, upgraded: 0 };
    merged.set(row.id, {
      count: so_far.count + row.count,
      upgraded: so_far.upgraded + (row.upgraded ?? 0),
    });
  }
  return [...merged].map(([id, m]) => {
    const count = Math.min(30, m.count);
    const upgraded = Math.min(m.upgraded, count);
    return upgraded > 0 ? { id, count, upgraded } : { id, count };
  });
}

export const RunStateSchema = z
  .strictObject({
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
    deck: z.array(DeckEntrySchema).max(120).transform(mergeDeckRows),
    /** Which Act 1 the run is in (they have different elites and bosses); null until the player says */
    act1: z.enum(ACT1_VARIANTS).nullable().default(null),
    /** The Act 1 boss shown on the map, an id of that version's bosses; null when not known */
    act1Boss: z.string().nullable().default(null),
    /** What the opening Ancient gave the player and how the deck changed */
    opening: z
      .strictObject({ entries: z.array(OpeningEntrySchema).max(6) })
      .default({ entries: [] }),
    packs: z.array(PackLogSchema).max(200),
    potions: z.array(PotionObservationSchema).max(200),
    /** "?" rooms met in the CURRENT act (the counters reset every act) */
    unknownRooms: z.array(UnknownObservationSchema).max(MAX_UNKNOWN_ROOMS_PER_ACT),
    profile: z.strictObject({
      /** a profile's very first run has scripted early rewards; unknown is the honest default */
      firstRun: z.enum(["unknown", "no", "yes"]),
    }),
    risk: z.enum(["safe", "balanced", "aggressive"]),
  })
  .refine(
    (r) =>
      r.act1Boss === null || (r.act1 !== null && getAct1Boss(r.act1, r.act1Boss) !== undefined),
    { message: "act1Boss must be a boss of the chosen Act 1", path: ["act1Boss"] },
  );
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
    hp: character ? startingHpAt(character, 0) : null,
    deck: character ? starterDeck(character) : [],
    act1: null,
    act1Boss: null,
    opening: { entries: [] },
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
    // the start of a run depends on the ascension: Ascender's Bane from A5, the 80 % heal at Neow from A2
    deck: starterDeck(character, state.ascension),
    hp: startingHpAt(character, state.ascension),
    // the version of Act 1 and its boss are about the run, not the class; the opening's deck changes belong to the old deck
    act1: state.act1,
    act1Boss: state.act1Boss,
    risk: state.risk,
    profile: state.profile,
  };
}

const ASCENDERS_BANE = "ASCENDERS_BANE";

/** Ascender's Bane in the deck exactly when the ascension has it. */
function withBane(deck: RunState["deck"], want: boolean): RunState["deck"] {
  const has = deck.find((d) => d.id === ASCENDERS_BANE);
  if (want && !has) {
    return [...deck, { id: ASCENDERS_BANE, count: 1 }];
  }
  if (!want && has) {
    return deck.flatMap((d) =>
      d.id !== ASCENDERS_BANE
        ? [d]
        : d.count > 1
          ? [{ id: ASCENDERS_BANE, count: d.count - 1 }]
          : [],
    );
  }
  return deck;
}

/**
 * The player says (or corrects) the ascension. It changes how a run starts, so the deck and hit points follow: Ascender's
 * Bane joins the deck from A5 (and leaves it below), and the HP the opening Ancient left is moved by the difference between
 * the two ascensions' starting HP (from A2 Neow heals 80 % of the missing HP instead of all of it), which keeps what the
 * opening Ancient added or took on top.
 */
export function withAscension(state: RunState, ascension: number): RunState {
  const next: RunState = { ...state, ascension, ascensionConfirmed: true };
  const character = state.character;
  if (!character) {
    return next;
  }
  const { hp } = state;
  const shift =
    startingHpAt(character, ascension).current - startingHpAt(character, state.ascension).current;
  return {
    ...next,
    deck: withBane(state.deck, ascension >= ASCENDERS_BANE_FROM),
    hp: hp ? { current: Math.max(1, Math.min(hp.max, hp.current + shift)), max: hp.max } : hp,
  };
}

/** Back to how the run starts: the starter deck of this class and ascension, the starting HP, nothing recorded from Neow. */
export function resetToStart(state: RunState): RunState {
  const character = state.character;
  if (!character) {
    return state;
  }
  return {
    ...state,
    deck: starterDeck(character, state.ascension),
    hp: startingHpAt(character, state.ascension),
    opening: { entries: [] },
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

/**
 * Versioned migrations: add a case here whenever RUN_STATE_VERSION changes.
 *
 * Version 1 is the run before the Act 1 version, the opening Ancient and upgraded copies were recorded. Its files (and
 * the first build that wrote these fields, which still called itself version 1) load into version 2: the new fields have
 * defaults, so adding the version number is all it takes. A version-2 file is refused by a page that only knows version 1
 * (a clean "Invalid run file"), which is what the version is for.
 */
export function migrate(raw: unknown): unknown {
  if (
    typeof raw === "object" &&
    raw !== null &&
    !Array.isArray(raw) &&
    (raw as { v?: unknown }).v === 1
  ) {
    return { ...raw, v: RUN_STATE_VERSION };
  }
  return raw;
}
