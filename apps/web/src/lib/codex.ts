import {
  CATALOG,
  matchScore,
  type CardEntry,
  type CardRarity,
  type CardClass,
  type Role,
} from "@slay2/game-data";

/** The five playable classes, colourless cards, and everything that is not a collectible card (curses, statuses ...). */
export const CODEX_CLASSES = [
  "ironclad",
  "silent",
  "regent",
  "necrobinder",
  "defect",
  "colorless",
  "other",
] as const;
export type CodexClass = (typeof CODEX_CLASSES)[number];

export const CODEX_RARITY_FILTERS = ["basic", "common", "uncommon", "rare", "other"] as const;
export type CodexRarity = (typeof CODEX_RARITY_FILTERS)[number];

export const CODEX_TYPES = ["attack", "skill", "power", "other"] as const;
export type CodexType = (typeof CODEX_TYPES)[number];

export type CodexSort = "name" | "cost" | "rarity";

export interface CodexQuery {
  readonly cls: CodexClass | "all";
  readonly text: string;
  readonly rarity: CodexRarity | "any";
  readonly type: CodexType | "any";
  readonly role: Role | "any";
  /** Only cards that can appear in a card reward (the pool the advisor and the odds tools work with). */
  readonly rewardPoolOnly: boolean;
  readonly sort: CodexSort;
}

export const DEFAULT_QUERY: CodexQuery = {
  cls: "ironclad",
  text: "",
  rarity: "any",
  type: "any",
  role: "any",
  rewardPoolOnly: false,
  sort: "name",
};

const COLLECTIBLE: ReadonlySet<CardClass> = new Set([
  "ironclad",
  "silent",
  "regent",
  "necrobinder",
  "defect",
  "colorless",
]);

export function codexClassOf(card: CardEntry): CodexClass {
  return COLLECTIBLE.has(card.class) ? (card.class as CodexClass) : "other";
}

function rarityBucket(r: CardRarity): CodexRarity {
  return r === "basic" || r === "common" || r === "uncommon" || r === "rare" ? r : "other";
}

function typeBucket(t: CardEntry["type"]): CodexType {
  return t === "attack" || t === "skill" || t === "power" ? t : "other";
}

const RARITY_ORDER: Record<CardRarity, number> = {
  basic: 0,
  common: 1,
  uncommon: 2,
  rare: 3,
  ancient: 4,
  event: 5,
  curse: 6,
  status: 7,
  token: 8,
  quest: 9,
};

function costKey(cost: CardEntry["cost"]): number {
  if (cost === null) {
    return 100; // unplayable last
  }
  return cost === "X" ? 50 : cost;
}

/** Filter, search and sort the catalog. With text, relevance leads (ties by the chosen sort). Pure and deterministic. */
export function filterCodex(q: CodexQuery): CardEntry[] {
  const text = q.text.trim();
  const rows: { card: CardEntry; score: number }[] = [];
  for (const card of CATALOG.cards) {
    if (q.cls !== "all" && codexClassOf(card) !== q.cls) {
      continue;
    }
    if (q.rarity !== "any" && rarityBucket(card.rarity) !== q.rarity) {
      continue;
    }
    if (q.type !== "any" && typeBucket(card.type) !== q.type) {
      continue;
    }
    if (q.role !== "any" && !card.roles.includes(q.role)) {
      continue;
    }
    if (q.rewardPoolOnly && !card.rewardEligible) {
      continue;
    }
    const score = text.length > 0 ? matchScore(text, card) : 1;
    if (score > 0) {
      rows.push({ card, score });
    }
  }
  const tie = (a: CardEntry, b: CardEntry): number => {
    if (q.sort === "cost") {
      const d = costKey(a.cost) - costKey(b.cost);
      if (d !== 0) {
        return d;
      }
    } else if (q.sort === "rarity") {
      const d = RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
      if (d !== 0) {
        return d;
      }
    }
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  };
  rows.sort((a, b) => (text.length > 0 ? b.score - a.score : 0) || tie(a.card, b.card));
  return rows.map((r) => r.card);
}

export function codexCounts(): Record<CodexClass | "all", number> {
  const out: Record<CodexClass | "all", number> = {
    all: CATALOG.cards.length,
    ironclad: 0,
    silent: 0,
    regent: 0,
    necrobinder: 0,
    defect: 0,
    colorless: 0,
    other: 0,
  };
  for (const card of CATALOG.cards) {
    out[codexClassOf(card)] += 1;
  }
  return out;
}

/** The roles worth filtering on (the ones at least three catalog cards carry), most common first. */
export function codexRoles(): Role[] {
  const counts = new Map<Role, number>();
  for (const card of CATALOG.cards) {
    for (const r of card.roles) {
      counts.set(r, (counts.get(r) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([r]) => r);
}
