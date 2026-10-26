import type { CardEntry, PlayableClass } from "@slay2/game-data";

import { synergyOf } from "./synergy";

export const GROUPS = ["damage", "aoe", "block", "scaling", "draw", "energy", "debuff"] as const;
export type Group = (typeof GROUPS)[number];

/** Roles that count as "scaling or engine" for coverage purposes. */
const SCALING_ROLES = [
  "strength",
  "dexterity",
  "focus",
  "engine",
  "poison",
  "doom",
  "summon",
  "forge",
  "orbs",
  "thorns",
  "vigor",
  "intangible",
] as const;
const DEBUFF_ROLES = ["vulnerable", "weak", "poison", "doom"] as const;

export interface DeckEntry {
  readonly card: CardEntry;
  readonly count: number;
}

export interface DeckProfile {
  readonly size: number;
  readonly playable: number;
  readonly meanPrior: number;
  readonly averageEnergyCost: number;
  readonly highCostCount: number;
  readonly starterShare: number;
  readonly groups: Readonly<Record<Group, number>>;
  readonly strengthCards: number;
  readonly multiHitCards: number;
  readonly roleCounts: Readonly<Record<string, number>>;
  /**
   * How well the cards work together, in advisor index points: negative while cards' needs go unmet, positive for the
   * engines the deck has built and for the cards Strength, Dexterity or Focus lift (see synergy.ts).
   */
  readonly synergy: number;
}

function energyCost(card: CardEntry): number | null {
  if (card.cost === null || card.roles.includes("unplayable")) {
    return null;
  }
  return card.cost === "X" ? 2 : card.cost;
}

export function profileDeck(
  entries: readonly DeckEntry[],
  actIndex: 0 | 1 | 2 = 0,
  character: PlayableClass | null = null,
): DeckProfile {
  let size = 0;
  let priorSum = 0;
  let playable = 0;
  let costSum = 0;
  let highCost = 0;
  let starters = 0;
  const groups: Record<Group, number> = {
    damage: 0,
    aoe: 0,
    block: 0,
    scaling: 0,
    draw: 0,
    energy: 0,
    debuff: 0,
  };
  const roleCounts: Record<string, number> = {};
  let strengthCards = 0;
  let multiHitCards = 0;
  for (const { card, count } of entries) {
    size += count;
    priorSum += card.prior * count;
    if (card.rarity === "basic") {
      starters += count;
    }
    const cost = energyCost(card);
    if (cost !== null) {
      playable += count;
      costSum += cost * count;
      if (cost >= 3) {
        highCost += count;
      }
    }
    const has = (r: string): boolean => card.roles.includes(r as never);
    for (const role of card.roles) {
      roleCounts[role] = (roleCounts[role] ?? 0) + count;
    }
    if (has("damage")) groups.damage += count;
    if (has("aoe")) groups.aoe += count;
    if (has("block")) groups.block += count;
    if (has("draw")) groups.draw += count;
    if (has("energy")) groups.energy += count;
    if (SCALING_ROLES.some(has)) groups.scaling += count;
    if (DEBUFF_ROLES.some(has)) groups.debuff += count;
    if (has("strength")) strengthCards += count;
    if (has("multi-hit")) multiHitCards += count;
  }
  return {
    size,
    playable,
    meanPrior: size === 0 ? 0 : priorSum / size,
    averageEnergyCost: playable === 0 ? 0 : costSum / playable,
    highCostCount: highCost,
    starterShare: size === 0 ? 0 : starters / size,
    groups,
    strengthCards,
    multiHitCards,
    roleCounts,
    synergy: synergyOf(entries, actIndex, character),
  };
}
