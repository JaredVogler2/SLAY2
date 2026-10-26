/** Stable identifiers for the five playable characters, ascension levels, acts and room kinds (STS2 main v0.107.1). */

export const CHARACTER_IDS = ["IRONCLAD", "SILENT", "REGENT", "NECROBINDER", "DEFECT"] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

export const CHARACTER_NAMES: Readonly<Record<CharacterId, string>> = {
  IRONCLAD: "Ironclad",
  SILENT: "Silent",
  REGENT: "Regent",
  NECROBINDER: "Necrobinder",
  DEFECT: "Defect",
};

/** Ascension is cumulative (level N includes 1..N). The maximum in STS2 is 10; there is no A11-A20 (ASC-1). */
export const MAX_ASCENSION = 10;

export const ASCENSION_EFFECTS: readonly { level: number; id: string; summary: string }[] = [
  { level: 1, id: "SwarmingElites", summary: "More elites (8 per run instead of 5)." },
  { level: 2, id: "WearyTraveler", summary: "Ancients heal 80% of missing HP." },
  { level: 3, id: "Poverty", summary: "Combat gold is reduced to 75% (rounded down)." },
  { level: 4, id: "TightBelt", summary: "One fewer potion slot." },
  { level: 5, id: "AscendersBane", summary: "Start with Ascender's Bane in the deck." },
  { level: 6, id: "Inflation", summary: "Card removal costs 100 + 50n instead of 75 + 25n." },
  {
    level: 7,
    id: "Scarcity",
    summary: "Rarer card rewards are rarer; reward upgrades and rarity pity grow half as fast.",
  },
  { level: 8, id: "ToughEnemies", summary: "Enemies have more HP." },
  { level: 9, id: "DeadlyEnemies", summary: "Enemies deal more damage." },
  { level: 10, id: "DoubleBoss", summary: "The final act has two bosses." },
];

/** Act indices: 0 = Overgrowth or Underdocks, 1 = Hive, 2 = Glory. There is no Act 4 (RUN-1). */
export const ACT_INDICES = [0, 1, 2] as const;
export type ActIndex = (typeof ACT_INDICES)[number];

export const REWARD_ROOMS = ["regular", "elite", "boss"] as const;
export type RewardRoom = (typeof REWARD_ROOMS)[number];

export function hasAscension(level: number, effect: number): boolean {
  return level >= effect;
}
