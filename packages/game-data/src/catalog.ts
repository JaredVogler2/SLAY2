import raw from "../data/cards.sts2-main-0.107.1.json";
import {
  CatalogSchema,
  PLAYABLE_CLASSES,
  REWARD_RARITIES,
  type CardEntry,
  type PlayableClass,
  type RewardRarity,
} from "./types";

/** Parsed (and validated) once per module instance. The schema is strict: any extra field fails the build. */
export const CATALOG = CatalogSchema.parse(raw);

const BY_ID = new Map<string, CardEntry>(CATALOG.cards.map((c) => [c.id, c]));

export function getCard(id: string): CardEntry | undefined {
  return BY_ID.get(id);
}

export function cardsOfClass(cls: PlayableClass | "colorless"): readonly CardEntry[] {
  return CATALOG.cards.filter((c) => c.class === cls);
}

export interface UnlockState {
  /** Epoch gates (e.g. "IRONCLAD2") that the profile has revealed. `"all"` = every card unlocked. */
  readonly revealedEpochs: ReadonlySet<string> | "all";
  /** Single-player runs exclude multiplayer-only cards; co-op excludes single-player-only cards. */
  readonly mode: "solo" | "coop";
}

export const ALL_UNLOCKED: UnlockState = { revealedEpochs: "all", mode: "solo" };
export const NO_EPOCHS: UnlockState = { revealedEpochs: new Set(), mode: "solo" };

/** Reward pool of a class: cards of rarity common/uncommon/rare that can appear in a card reward (E1 CardPoolModel.GetUnlockedCards). */
export function rewardPool(
  cls: PlayableClass | "colorless",
  unlock: UnlockState = ALL_UNLOCKED,
): readonly CardEntry[] {
  return cardsOfClass(cls).filter((c) => {
    if (!c.rewardEligible) {
      return false;
    }
    if (unlock.mode === "solo" && c.multiplayer === "multiplayer-only") {
      return false;
    }
    if (unlock.mode === "coop" && c.multiplayer === "singleplayer-only") {
      return false;
    }
    if (
      c.epochGate !== null &&
      unlock.revealedEpochs !== "all" &&
      !unlock.revealedEpochs.has(c.epochGate)
    ) {
      return false;
    }
    return true;
  });
}

export function poolSizes(
  cls: PlayableClass | "colorless",
  unlock: UnlockState = ALL_UNLOCKED,
): Record<RewardRarity, number> {
  const pool = rewardPool(cls, unlock);
  return Object.fromEntries(
    REWARD_RARITIES.map((r) => [r, pool.filter((c) => c.rarity === r).length]),
  ) as Record<RewardRarity, number>;
}

export function isPlayableClass(x: string): x is PlayableClass {
  return (PLAYABLE_CLASSES as readonly string[]).includes(x);
}
