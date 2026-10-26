import { SUPPORTED_BUILD_ID, requireSupportedBuild, type BuildId } from "@slay2/game-schema";

/**
 * Every calculator result carries where its numbers come from. Rule ids refer to the rows of
 * docs/game/MECHANICS-COVERAGE.md; evidence classes are defined there (E1 = decompiled v0.107.1 facts, E3/E4 =
 * published wikis, E6 = SLAY2's own exact arithmetic).
 */
export type EvidenceClass = "E1" | "E2" | "E3" | "E4" | "E5" | "E6";

export interface Provenance {
  readonly build: BuildId;
  readonly ruleIds: readonly string[];
  readonly evidence: readonly EvidenceClass[];
  /** Plain-language modelling assumptions that the user must be able to see. */
  readonly assumptions: readonly string[];
  /** Things the engine knowingly does not model (relic hooks, first-run scripting, ...). */
  readonly notModelled: readonly string[];
}

export interface Calc<T> {
  readonly value: T;
  /** `exact` = closed-form rational arithmetic; nothing here is sampled or estimated. */
  readonly method: "exact";
  readonly provenance: Provenance;
}

export const FLOAT_NOTE =
  "The game compares float32 thresholds; this engine uses ideal decimal arithmetic (difference below 1e-6).";

export const COMMON_NOT_MODELLED: readonly string[] = [
  "Relic and event hooks that change odds (e.g. Prayer Wheel, White Star, Molten Egg, Dingy Rug).",
  "Co-op: each seat has its own odds sets; only single-player is supported.",
];

export function checkedBuild(build: string | undefined): BuildId {
  const info = requireSupportedBuild(build ?? SUPPORTED_BUILD_ID);
  return info.id;
}

export function exact<T>(value: T, provenance: Provenance): Calc<T> {
  return { value, method: "exact", provenance };
}
