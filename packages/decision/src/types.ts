import { z } from "zod";

import { AscensionSchema, BuildIdSchema } from "@slay2/game-schema";
import { ACT1_VARIANTS, PLAYABLE_CLASSES } from "@slay2/game-data";

import type { DeckSynergy } from "./synergy";

export const DRAFT_SOURCES = ["regular", "elite", "boss", "shop", "event"] as const;
export const RISK_PREFERENCES = ["safe", "balanced", "aggressive"] as const;

const CardIdSchema = z.string().regex(/^[A-Z0-9_]{1,64}$/, "card id must be UPPER_SNAKE_CASE");
const RelicIdSchema = z.string().regex(/^[A-Z0-9_]{1,64}$/, "relic id must be UPPER_SNAKE_CASE");

export const DraftRequestSchema = z.strictObject({
  build: BuildIdSchema,
  character: z.enum(PLAYABLE_CLASSES),
  ascension: AscensionSchema,
  actIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  deck: z
    .array(z.strictObject({ id: CardIdSchema, count: z.number().int().min(1).max(30) }))
    .min(1, "the deck must contain at least one card (start from the starter deck)")
    .max(120),
  offered: z.array(CardIdSchema).min(1).max(5),
  /**
   * The relics the run holds, by catalog id (the starting relic is already counted). A relic that provides a mechanic counts as a
   * supplier of it, like a card that provides it (ADR-051); SLAY2's reading of what a relic provides is a judgement, not yet tested
   * in simulation, and what a relic does beyond that is not modelled.
   */
  relics: z.array(RelicIdSchema).max(60).optional(),
  source: z.enum(DRAFT_SOURCES),
  riskPreference: z.enum(RISK_PREFERENCES),
  hp: z
    .strictObject({
      current: z.number().int().min(1).max(999),
      max: z.number().int().min(1).max(999),
    })
    .refine((h) => h.current <= h.max, "current HP cannot exceed max HP")
    .optional(),
  /**
   * Which Act 1 the run is in and, if known, the boss on its map (ADR-048). Only Act 1 has two versions with different
   * elites and bosses; the context tilts the heuristic's coverage weights and is ignored, with a warning, in other acts.
   */
  actContext: z
    .strictObject({
      variant: z.enum(ACT1_VARIANTS),
      boss: z
        .string()
        .regex(/^[a-z]+(-[a-z]+)*$/)
        .nullable()
        .optional(),
    })
    .optional(),
});
export type DraftRequest = z.infer<typeof DraftRequestSchema>;

export type DraftAction =
  { readonly kind: "pick"; readonly cardId: string } | { readonly kind: "skip" };

export interface Reason {
  readonly kind: "quality" | "coverage" | "curve" | "size" | "synergy" | "context";
  /** Signed contribution to the advisor index, in index points. */
  readonly delta: number;
  readonly text: string;
}

export interface RankedOption {
  readonly action: DraftAction;
  readonly label: string;
  readonly rank: number;
  /** Advisor-index change relative to skipping. NOT a probability and NOT a win-rate change. */
  readonly indexDelta: number;
  readonly reasons: readonly Reason[];
}

export interface DraftResponse {
  readonly schema: 1;
  readonly gameId: "STS2";
  readonly build: string;
  readonly policyVersion: "draft-heuristic-v1";
  /** The ranking is a heuristic; nothing here is an estimate of win probability. */
  readonly method: "heuristic";
  readonly calibrated: false;
  readonly legalActions: readonly DraftAction[];
  readonly recommendation: RankedOption;
  readonly ranking: readonly RankedOption[];
  /** How close the call is, and how often the top choice survives random changes to the heuristic's own weights. */
  readonly confidence: {
    readonly margin: number;
    readonly closeCall: boolean;
    readonly stability: {
      readonly perturbations: number;
      readonly topChoiceKept: number;
      readonly otherTopChoices: Readonly<Record<string, number>>;
    };
  };
  readonly tradeoffs: readonly string[];
  readonly warnings: readonly string[];
  readonly assumptions: readonly string[];
  readonly notModelled: readonly string[];
  readonly missingInputs: readonly string[];
  readonly deck: {
    readonly size: number;
    readonly meanPrior: number;
    readonly averageEnergyCost: number;
    readonly roleCounts: Readonly<Record<string, number>>;
    readonly starterShare: number;
  };
  /** What the deck is building and which cards are still waiting for support: SLAY2's judgement of mechanics, not a measurement. */
  readonly deckSynergy: DeckSynergy;
  /** The relics of the request as the index read them (absent when none were listed). */
  readonly relics?: {
    /** Relics whose tags supply a mechanic, with the mechanics they supply (labels). */
    readonly supplying: readonly {
      readonly id: string;
      readonly name: string;
      readonly mechanics: readonly string[];
    }[];
    /** Relics whose tags take a mechanic away, with the mechanics they take (the index counts them against the cards that need them). */
    readonly taking: readonly {
      readonly id: string;
      readonly name: string;
      readonly mechanics: readonly string[];
    }[];
    /** Relics the catalog knows but the table has nothing to say about (the index reads nothing from them). */
    readonly unread: readonly string[];
  };
  /** Present when the request named an Act 1 version: what it changed. */
  readonly actContext?: {
    readonly applied: boolean;
    readonly variant: string;
    readonly boss: string | null;
    /** Each coverage group whose weight was tilted, with the fights that drive it. */
    readonly adjustments: readonly {
      readonly group: string;
      readonly label: string;
      /** Signed change of the group's weight, in percent. */
      readonly percent: number;
      readonly because: readonly string[];
    }[];
    readonly note: string;
  };
  readonly stateDigest: string;
}
