import {
  RELIC_CATALOG,
  matchScore,
  type RelicEntry,
  type RelicPool,
  type RelicRarity,
} from "@slay2/game-data";

/** The pools a visitor can look at: every relic, one pool per class, the shared pool and the event pool (the fallback relic is only listed under "all"). */
export const RELIC_POOL_FILTERS = [
  "all",
  "ironclad",
  "silent",
  "regent",
  "necrobinder",
  "defect",
  "shared",
  "event",
] as const;
export type RelicPoolFilter = (typeof RELIC_POOL_FILTERS)[number];

export const RELIC_SORTS = ["name", "rarity"] as const;
export type RelicSort = (typeof RELIC_SORTS)[number];

export interface RelicQuery {
  readonly pool: RelicPoolFilter;
  readonly text: string;
  readonly rarity: RelicRarity | "any";
  readonly sort: RelicSort;
}

export const DEFAULT_RELIC_QUERY: RelicQuery = {
  pool: "all",
  text: "",
  rarity: "any",
  sort: "name",
};

export const RELIC_RARITY_STYLE: Record<
  RelicRarity,
  { label: string; glyph: string; className: string }
> = {
  starter: { label: "Starter", glyph: "○", className: "text-muted" },
  common: { label: "Common", glyph: "●", className: "text-parchment" },
  uncommon: { label: "Uncommon", glyph: "◆", className: "text-teal" },
  rare: { label: "Rare", glyph: "★", className: "text-copper" },
  shop: { label: "Shop", glyph: "◈", className: "text-gold" },
  ancient: { label: "Ancient", glyph: "✹", className: "text-gold" },
  event: { label: "Event", glyph: "✧", className: "text-gold" },
  none: { label: "Placeholder", glyph: "–", className: "text-muted" },
};

export const RELIC_POOL_LABEL: Record<RelicPool, string> = {
  ironclad: "Ironclad pool",
  silent: "Silent pool",
  regent: "Regent pool",
  necrobinder: "Necrobinder pool",
  defect: "Defect pool",
  shared: "Shared pool",
  event: "Event pool",
  fallback: "Fallback pool",
};

const RARITY_ORDER: Record<RelicRarity, number> = {
  starter: 0,
  common: 1,
  uncommon: 2,
  rare: 3,
  shop: 4,
  ancient: 5,
  event: 6,
  none: 7,
};

/** Filter, search and sort the relic list. With text, relevance leads (ties by the chosen sort). Pure and deterministic. */
export function filterRelics(q: RelicQuery): RelicEntry[] {
  const text = q.text.trim();
  const rows: { relic: RelicEntry; score: number }[] = [];
  for (const relic of RELIC_CATALOG.relics) {
    if (q.pool !== "all" && !relic.pools.includes(q.pool)) {
      continue;
    }
    if (q.rarity !== "any" && relic.rarity !== q.rarity) {
      continue;
    }
    const score = text.length > 0 ? matchScore(text, relic) : 1;
    if (score > 0) {
      rows.push({ relic, score });
    }
  }
  const tie = (a: RelicEntry, b: RelicEntry): number => {
    if (q.sort === "rarity") {
      const d = RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
      if (d !== 0) {
        return d;
      }
    }
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  };
  rows.sort((a, b) => (text.length > 0 ? b.score - a.score : 0) || tie(a.relic, b.relic));
  return rows.map((r) => r.relic);
}

/** How many relics each pool filter shows (the event and shared pools overlap in three relics). */
export function relicCounts(): Record<RelicPoolFilter, number> {
  const out: Record<RelicPoolFilter, number> = {
    all: RELIC_CATALOG.relics.length,
    ironclad: 0,
    silent: 0,
    regent: 0,
    necrobinder: 0,
    defect: 0,
    shared: 0,
    event: 0,
  };
  for (const relic of RELIC_CATALOG.relics) {
    for (const pool of relic.pools) {
      if (pool !== "fallback") {
        out[pool] += 1;
      }
    }
  }
  return out;
}
