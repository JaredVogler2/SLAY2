import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CATALOG,
  MECHANIC_IDS,
  PLAYABLE_CLASSES,
  RELIC_CATALOG,
  RELIC_SYNERGY,
  getCard,
  hasRelicTags,
  relicTags,
  rewardPool,
  synergyTags,
  type CardEntry,
  type RelicEntry,
} from "@slay2/game-data";

import {
  GROUPS,
  PART_WEIGHT,
  baseWeights,
  enginesOf,
  mulberry32,
  profileDeck,
  rankWith,
  scoreTerms,
  total,
  type DeckEntry,
  type Setting,
} from "../src";

/**
 * The deck index is also written in Python (`sim/slay2_sim/advisor.py`), so the simulator can measure it against simulated
 * runs and play card rewards by it. This file is what the TypeScript code (the original) computes for 160 fixed random decks,
 * after them 40 more that also hold relics (ADR-051) and, after those, 40 whose relics are chosen so that every relic the table
 * tags is held by at least one case (the ones only the event pool offers, and the one that takes a mechanic away, included);
 * `sim/tests/test_advisor_port.py` fails if the Python port does not reproduce every number in it, and this test fails if the
 * file is not what the code writes today. After a deliberate change to the index:
 *
 *     UPDATE_GOLDEN=1 pnpm --filter @slay2/decision test advisor-golden
 */
const FILE = join(__dirname, "golden", "advisor-index.json");
const CASES = 160;
/** Cases 160 to 199 hold relics too; the first 160 are exactly what they were before relics were an input. */
const RELIC_CASES = 40;
/** Cases 200 to 239 hold relics chosen to cover every tagged relic; the 200 before them are exactly what they were. */
const COVER_CASES = 40;

interface GoldenCase {
  readonly character: string;
  /** Present on the cases that hold relics: catalog ids, sorted. */
  readonly relics?: readonly string[];
  readonly actIndex: 0 | 1 | 2;
  readonly risk: "safe" | "balanced" | "aggressive";
  readonly deck: readonly (readonly [string, number])[];
  readonly offered: readonly string[];
  readonly profile: {
    readonly size: number;
    readonly meanPrior: number;
    readonly averageEnergyCost: number;
    readonly highCostCount: number;
    readonly starterShare: number;
    readonly groups: Readonly<Record<string, number>>;
    readonly synergy: number;
  };
  readonly terms: {
    readonly quality: number;
    readonly coverage: Readonly<Record<string, number>>;
    readonly curve: number;
    readonly size: number;
    readonly synergy: number;
    readonly total: number;
  };
  /** the engines the index counts: `PART_WEIGHT.engines` of `enginesJudged`, which is nothing at the strengths the page keeps */
  readonly engines: Readonly<Record<string, number>>;
  /** the engines as first judged, before the part weight: what the port's engine formula must reproduce whatever the index counts */
  readonly enginesJudged: Readonly<Record<string, number>>;
  readonly ranking: readonly (readonly [string, number])[];
}

function pickOne<T>(rnd: () => number, items: readonly T[]): T {
  const item = items[Math.floor(rnd() * items.length)];
  if (item === undefined) throw new Error("nothing to pick from");
  return item;
}

/** One to six relics the class could hold (its own pool or the shared one), most of them with tags so the cases exercise them. */
function pickRelics(rnd: () => number, character: string): string[] {
  const eligible = RELIC_CATALOG.relics.filter(
    (r) =>
      r.rarity !== "starter" &&
      r.rarity !== "none" &&
      (r.pools.includes("shared") || r.pools.includes(character as never)),
  );
  const tagged = eligible.filter((r) => Object.keys(relicTags(r.id).gives).length > 0);
  const n = 1 + Math.floor(rnd() * 6);
  const picked = new Set<string>();
  while (picked.size < n) {
    picked.add(pickOne(rnd, rnd() < 0.7 && tagged.length > 0 ? tagged : eligible).id);
  }
  return [...picked].sort();
}

/** The item at `index` of the list, walking round it. */
function cycle<T>(items: readonly T[], index: number): T {
  const item = items[index % items.length];
  if (item === undefined) throw new Error("nothing to walk round");
  return item;
}

const isGeneral = (r: RelicEntry): boolean =>
  r.pools.includes("shared") || r.pools.includes("event");

/**
 * The relics of a covering case: three of the tagged relics every class can hold (walking round the sorted list, so the cases
 * together hold all of them), two of the tagged ones only this class can hold, and up to two more from anywhere the class could
 * find a relic, tagged or not.
 */
function coveringRelics(rnd: () => number, character: string, k: number): string[] {
  const tagged = RELIC_CATALOG.relics
    .filter((r) => hasRelicTags(r.id))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const general = tagged.filter(isGeneral);
  const own = tagged.filter((r) => !isGeneral(r) && r.pools.includes(character as never));
  const picked = new Set<string>();
  for (let i = 0; i < 3; i += 1) picked.add(cycle(general, 3 * k + i).id);
  // the one relic that takes a mechanic away is held in a case in four, so every class has it
  if (k % 4 === 0) picked.add("BIG_MUSHROOM");
  const round = Math.floor(k / PLAYABLE_CLASSES.length);
  for (let i = 0; i < 2 && own.length > 0; i += 1) picked.add(cycle(own, 2 * round + i).id);
  const eligible = RELIC_CATALOG.relics.filter(
    (r) =>
      r.rarity !== "starter" &&
      r.rarity !== "none" &&
      (isGeneral(r) || r.pools.includes(character as never)),
  );
  const target = picked.size + Math.floor(rnd() * 3);
  while (picked.size < target) picked.add(pickOne(rnd, eligible).id);
  return [...picked].sort();
}

function buildCase(index: number): GoldenCase {
  const rnd = mulberry32(0x51a7 + index * 7919);
  const character = PLAYABLE_CLASSES[index % PLAYABLE_CLASSES.length] ?? "ironclad";
  const pool = rewardPool(character);
  const colorless = rewardPool("colorless");
  const basics = CATALOG.cards.filter((c) => c.class === character && c.rarity === "basic");
  const counts = new Map<string, number>();
  const add = (card: CardEntry, n = 1): void => {
    counts.set(card.id, (counts.get(card.id) ?? 0) + n);
  };
  // a run's deck: the starting cards, then the picks of a few floors (some repeated, a few colourless)
  for (const b of basics) add(b, 1 + Math.floor(rnd() * 5));
  const picks = Math.floor(rnd() * 22);
  for (let i = 0; i < picks; i += 1) {
    add(rnd() < 0.12 ? pickOne(rnd, colorless) : pickOne(rnd, pool));
  }
  const deck = [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const entries: DeckEntry[] = deck.map(([id, count]) => ({ card: must(id), count }));
  const offered = new Set<string>();
  const n = 1 + Math.floor(rnd() * 4);
  while (offered.size < n) offered.add(pickOne(rnd, pool).id);
  const actIndex = Math.floor(rnd() * 3) as 0 | 1 | 2;
  const risk = pickOne(rnd, ["safe", "balanced", "aggressive"] as const);
  // drawn last, so the cases before it keep the numbers they always had
  const relics =
    index >= CASES + RELIC_CASES
      ? coveringRelics(rnd, character, index - CASES - RELIC_CASES)
      : index >= CASES
        ? pickRelics(rnd, character)
        : [];
  // where the relic that takes Draw away is held, a card that needs Draw is among those offered, so the negative supply reaches the ranking
  if (relics.includes("BIG_MUSHROOM")) {
    const needy = pool.filter((c) => (synergyTags(c).wants.draw ?? 0) > 0);
    if (needy.length > 0) offered.add(pickOne(rnd, needy).id);
  }
  const setting: Setting = { character, relics };

  const weights = baseWeights(actIndex, risk);
  const profile = profileDeck(entries, actIndex, setting);
  const terms = scoreTerms(profile, weights);
  const engines = enginesOf(entries, setting);
  const enginesJudged = enginesOf(entries, setting, false);
  const ranking = rankWith(
    weights,
    profile,
    entries,
    [...offered].map((id) => must(id)),
    actIndex,
    setting,
  );
  return {
    character,
    ...(index >= CASES ? { relics } : {}),
    actIndex,
    risk,
    deck,
    offered: [...offered],
    profile: {
      size: profile.size,
      meanPrior: profile.meanPrior,
      averageEnergyCost: profile.averageEnergyCost,
      highCostCount: profile.highCostCount,
      starterShare: profile.starterShare,
      groups: Object.fromEntries(GROUPS.map((g) => [g, profile.groups[g]])),
      synergy: profile.synergy,
    },
    terms: {
      quality: terms.quality,
      coverage: Object.fromEntries(GROUPS.map((g) => [g, terms.coverage[g]])),
      curve: terms.curve,
      size: terms.size,
      synergy: terms.synergy,
      total: total(terms),
    },
    engines: Object.fromEntries(
      MECHANIC_IDS.flatMap((m) => (engines[m] === 0 ? [] : ([[m, engines[m]]] as const))),
    ),
    enginesJudged: Object.fromEntries(
      MECHANIC_IDS.flatMap((m) =>
        enginesJudged[m] === 0 ? [] : ([[m, enginesJudged[m]]] as const),
      ),
    ),
    ranking: ranking.map((r) => [r.action.kind === "skip" ? "skip" : r.action.cardId, r.delta]),
  };
}

function must(id: string): CardEntry {
  const card = getCard(id);
  if (!card) throw new Error(`no card ${id}`);
  return card;
}

function build(): { schema: 1; cases: GoldenCase[] } {
  return {
    schema: 1,
    cases: Array.from({ length: CASES + RELIC_CASES + COVER_CASES }, (_, i) => buildCase(i)),
  };
}

/** Deep equality with a tolerance for numbers, naming the first path that differs. */
function firstDifference(a: unknown, b: unknown, path = "$"): string | null {
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b))
      ? null
      : `${path}: ${String(a)} vs ${String(b)}`;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}: length ${String(a.length)} vs ${String(b.length)}`;
    for (let i = 0; i < a.length; i += 1) {
      const d = firstDifference(a[i], b[i], `${path}[${String(i)}]`);
      if (d) return d;
    }
    return null;
  }
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.join() !== kb.join()) return `${path}: keys ${ka.join()} vs ${kb.join()}`;
    for (const k of ka) {
      const d = firstDifference(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        `${path}.${k}`,
      );
      if (d) return d;
    }
    return null;
  }
  return a === b ? null : `${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
}

describe("the deck index's golden cases (the Python port is tested against them)", () => {
  it("are what the code computes today", () => {
    const golden = build();
    if (process.env.UPDATE_GOLDEN === "1") {
      writeFileSync(FILE, `${JSON.stringify(golden)}\n`);
    }
    const committed = JSON.parse(readFileSync(FILE, "utf8")) as unknown;
    expect(
      firstDifference(JSON.parse(JSON.stringify(golden)), committed),
      "the deck index changed: regenerate with UPDATE_GOLDEN=1 and run the Python parity test",
    ).toBeNull();
  });

  it("exercise what the port must reproduce: every class and act, engines, unmet needs, scalers, a bloated deck", () => {
    const golden = build();
    expect(new Set(golden.cases.map((c) => c.character)).size).toBe(PLAYABLE_CLASSES.length);
    expect(new Set(golden.cases.map((c) => c.actIndex))).toEqual(new Set([0, 1, 2]));
    // the engines are checked as first judged: the index counts none of them at the strengths the page keeps (ADR-050 addendum C)
    expect(golden.cases.some((c) => Object.keys(c.enginesJudged).length > 0)).toBe(true);
    for (const c of golden.cases) {
      expect(Object.keys(c.engines).length).toBeLessThanOrEqual(
        Object.keys(c.enginesJudged).length,
      );
      for (const [m, v] of Object.entries(c.enginesJudged)) {
        expect(c.engines[m] ?? 0).toBeCloseTo(PART_WEIGHT.engines * v, 12);
      }
    }
    expect(golden.cases.some((c) => c.terms.synergy < 0)).toBe(true);
    expect(golden.cases.some((c) => c.terms.synergy > 0)).toBe(true);
    expect(golden.cases.some((c) => c.profile.size > 30)).toBe(true);
    expect(golden.cases.some((c) => c.ranking[0]?.[0] === "skip")).toBe(true);
    expect(golden.cases.some((c) => c.ranking[0]?.[0] !== "skip")).toBe(true);
  });

  it("hold relics in 80 cases, most of them with tags, and the relics move the index", () => {
    const golden = build();
    const withRelics = golden.cases.filter((c) => c.relics !== undefined);
    expect(withRelics).toHaveLength(RELIC_CASES + COVER_CASES);
    expect(golden.cases.slice(0, CASES).every((c) => c.relics === undefined)).toBe(true);
    expect(
      withRelics.filter((c) =>
        (c.relics ?? []).some((id) => Object.keys(relicTags(id).gives).length > 0),
      ).length,
    ).toBeGreaterThan((RELIC_CASES + COVER_CASES) / 2);
    // the same deck without its relics scores differently in at least some cases: the relics are not decoration
    const moved = withRelics.filter((c) => {
      const entries: DeckEntry[] = c.deck.map(([id, count]) => ({ card: must(id), count }));
      const bare = profileDeck(entries, c.actIndex, c.character as never);
      return Math.abs(bare.synergy - c.profile.synergy) > 1e-9;
    });
    expect(moved.length).toBeGreaterThan(0);
  });

  it("hold every relic the table tags in at least one case: the event-pool ones and the one that takes a mechanic away too", () => {
    const golden = build();
    const held = new Set(golden.cases.flatMap((c) => c.relics ?? []));
    expect(Object.keys(RELIC_SYNERGY.relics).filter((id) => !held.has(id))).toEqual([]);
    // the relic that takes a mechanic away is held in every class, and it moves the ranking of the offered cards where it is held
    const mushroom = golden.cases.filter((c) => c.relics?.includes("BIG_MUSHROOM"));
    expect(new Set(mushroom.map((c) => c.character)).size).toBe(PLAYABLE_CLASSES.length);
    const moved = mushroom.filter((c) => {
      const entries: DeckEntry[] = c.deck.map(([id, count]) => ({ card: must(id), count }));
      const rank = (relics: readonly string[]): number[] => {
        const setting: Setting = { character: c.character as never, relics };
        return rankWith(
          baseWeights(c.actIndex, c.risk),
          profileDeck(entries, c.actIndex, setting),
          entries,
          c.offered.map((id) => must(id)),
          c.actIndex,
          setting,
        ).map((r) => r.delta);
      };
      const held = rank(c.relics ?? []);
      const without = rank((c.relics ?? []).filter((id) => id !== "BIG_MUSHROOM"));
      return held.some((d, i) => Math.abs(d - (without[i] ?? d)) > 1e-9);
    });
    expect(moved.length).toBeGreaterThan(0);
  });
});
