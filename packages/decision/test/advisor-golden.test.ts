import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CATALOG,
  MECHANIC_IDS,
  PLAYABLE_CLASSES,
  getCard,
  rewardPool,
  type CardEntry,
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
} from "../src";

/**
 * The deck index is also written in Python (`sim/slay2_sim/advisor.py`), so the simulator can measure it against simulated
 * runs and play card rewards by it. This file is what the TypeScript code (the original) computes for 160 fixed random decks;
 * `sim/tests/test_advisor_port.py` fails if the Python port does not reproduce every number in it, and this test fails if the
 * file is not what the code writes today. After a deliberate change to the index:
 *
 *     UPDATE_GOLDEN=1 pnpm --filter @slay2/decision test advisor-golden
 */
const FILE = join(__dirname, "golden", "advisor-index.json");
const CASES = 160;

interface GoldenCase {
  readonly character: string;
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

  const weights = baseWeights(actIndex, risk);
  const profile = profileDeck(entries, actIndex, character);
  const terms = scoreTerms(profile, weights);
  const engines = enginesOf(entries, character);
  const enginesJudged = enginesOf(entries, character, false);
  const ranking = rankWith(
    weights,
    profile,
    entries,
    [...offered].map((id) => must(id)),
    actIndex,
    character,
  );
  return {
    character,
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
  return { schema: 1, cases: Array.from({ length: CASES }, (_, i) => buildCase(i)) };
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
});
