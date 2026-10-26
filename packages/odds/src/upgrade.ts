import { R, Rational } from "./rational";
import type { Rarity, RarityRules } from "./rarity";

/** UPG-1: chance that a reward card is already upgraded. */
export function rewardUpgradeChance(
  rarity: Rarity,
  actIndex: 0 | 1 | 2,
  rules: RarityRules,
  source: "encounter" | "shop" = "encounter",
): Rational {
  if (source === "shop" || rarity === "rare") {
    return Rational.ZERO;
  }
  const step = rules.scarcity ? R(1, 8) : R(1, 4);
  return step.mul(actIndex);
}
