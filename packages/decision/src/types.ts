import { z } from "zod";

import { AscensionSchema, BuildIdSchema } from "@slay2/game-schema";
import { ACT1_VARIANTS, PLAYABLE_CLASSES } from "@slay2/game-data";

export const DRAFT_SOURCES = ["regular", "elite", "boss", "shop", "event"] as const;
export const RISK_PREFERENCES = ["safe", "balanced", "aggressive"] as const;

const CardIdSchema = z.string().regex(/^[A-Z0-9_]{1,64}$/, "card id must be UPPER_SNAKE_CASE");

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
  readonly policyVersion: "draft-heuristic-v0";
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
