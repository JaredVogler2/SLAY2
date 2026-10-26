import { R, Rational } from "./rational";

/** Merchant prices (SHOP-2..SHOP-4). Prices are `round(base * U[lo, hi])`, so the support and PMF are exact. */
export type ShopItem =
  | {
      readonly kind: "card";
      readonly rarity: "common" | "uncommon" | "rare";
      readonly colorless?: boolean;
    }
  | { readonly kind: "relic"; readonly rarity: "common" | "uncommon" | "rare" | "shop" }
  | { readonly kind: "potion"; readonly rarity: "common" | "uncommon" | "rare" };

interface PriceModel {
  readonly base: number;
  readonly lo: Rational;
  readonly hi: Rational;
}

const CARD_BASE = { common: 50, uncommon: 75, rare: 150 } as const;
const COLORLESS_BASE = { common: 57, uncommon: 86, rare: 173 } as const;
const RELIC_BASE = { common: 175, uncommon: 225, rare: 275, shop: 200 } as const;
const POTION_BASE = { common: 50, uncommon: 75, rare: 100 } as const;

function priceModel(item: ShopItem): PriceModel {
  switch (item.kind) {
    case "card":
      return {
        base: item.colorless === true ? COLORLESS_BASE[item.rarity] : CARD_BASE[item.rarity],
        lo: R(95, 100),
        hi: R(105, 100),
      };
    case "relic":
      return { base: RELIC_BASE[item.rarity], lo: R(85, 100), hi: R(115, 100) };
    case "potion":
      return { base: POTION_BASE[item.rarity], lo: R(95, 100), hi: R(105, 100) };
  }
}

export interface PriceDistribution {
  readonly pmf: ReadonlyMap<number, Rational>;
  readonly min: number;
  readonly max: number;
  readonly mean: Rational;
}

/** Exact PMF of round(base * U[lo, hi]). Ties at .5 have probability zero, so the rounding mode does not matter. */
export function priceDistribution(item: ShopItem, onSale = false): PriceDistribution {
  const m = priceModel(item);
  const a = m.lo.mul(m.base);
  const b = m.hi.mul(m.base);
  const width = b.sub(a);
  const pmf = new Map<number, Rational>();
  const first = Number(a.sub(R(1, 2)).floor()) + 1;
  const last = Number(b.add(R(1, 2)).ceil()) - 1;
  for (let k = first; k <= last; k += 1) {
    const cellLo = R(2 * k - 1, 2).max(a);
    const cellHi = R(2 * k + 1, 2).min(b);
    if (cellHi.gt(cellLo)) {
      const price = onSale ? Math.floor(k / 2) : k;
      const mass = cellHi.sub(cellLo).div(width);
      pmf.set(price, (pmf.get(price) ?? Rational.ZERO).add(mass));
    }
  }
  const prices = [...pmf.keys()].sort((x, y) => x - y);
  let mean = Rational.ZERO;
  for (const [price, mass] of pmf) {
    mean = mean.add(mass.mul(price));
  }
  return { pmf, min: prices[0] ?? 0, max: prices[prices.length - 1] ?? 0, mean };
}

/** SHOP-4: cost of the next card removal after `removalsUsed` removals. */
export function cardRemovalCost(removalsUsed: number, ascension: number): number {
  if (!Number.isInteger(removalsUsed) || removalsUsed < 0) {
    throw new RangeError("removalsUsed must be a non-negative integer");
  }
  return ascension >= 6 ? 100 + 50 * removalsUsed : 75 + 25 * removalsUsed;
}
