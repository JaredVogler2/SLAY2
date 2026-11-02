import { describe, expect, it } from "vitest";

import { ALL_UNLOCKED, PLAYABLE_CLASSES, getCard, rewardPool, starterDeck } from "@slay2/game-data";

import {
  LEGACY_SIZE_FROM,
  LEGACY_SIZE_PRICE,
  SIZE_FROM,
  SIZE_PRICE,
  baseWeights,
  evaluateDraft,
  mulberry32,
  profileDeck,
  rankWith,
  type DeckEntry,
  type DraftRequest,
} from "../src/index";

/**
 * The price of a slot (ADR-065). A user said that the advisor always recommends taking cards, and that skipping is sometimes best because
 * the offered cards do not fit the deck's strategy and the more cards a deck holds, the less likely it is that you draw the ones you need.
 * The index was a sum of terms that only grew as cards were added (a mean rating that every reward card beats, because the starting cards
 * drag it down, and role coverage that counts cards, not how often they show up); the only brake was 0.6 points per card from the 31st
 * on. These tests pin the brake that replaced it, the behaviour it gives, and the numbers of the version it replaced.
 */

interface Row {
  id: string;
  count: number;
}

function request(deck: Row[], offered: string[], over: Partial<DraftRequest> = {}): DraftRequest {
  return {
    build: "sts2-main-0.107.1",
    character: "ironclad",
    ascension: 0,
    actIndex: 1,
    deck,
    offered,
    source: "regular",
    riskPreference: "balanced",
    ...over,
  };
}

const size = (deck: readonly Row[]): number => deck.reduce((s, d) => s + d.count, 0);

/** The ironclad starter deck plus `extra` cards drawn deterministically from the common and uncommon reward pool. */
function grown(extra: number): Row[] {
  const pool = rewardPool("ironclad", ALL_UNLOCKED)
    .filter((c) => c.rarity === "common" || c.rarity === "uncommon")
    .map((c) => c.id);
  const deck = starterDeck("ironclad").map((d) => ({ ...d }));
  for (let i = 0; i < extra; i += 1) {
    const id = must(pool[(i * 7) % pool.length]);
    const row = deck.find((d) => d.id === id);
    if (row) row.count += 1;
    else deck.push({ id, count: 1 });
  }
  return deck;
}

const MEDIOCRE = ["ANGER", "SHRUG_IT_OFF", "BODY_SLAM"];
const STRONG = ["POMMEL_STRIKE", "INFLAME", "OFFERING"];

describe("the price of a slot", () => {
  it("is one point from the 21st card on, the same for every card after it, and nothing before", () => {
    expect([SIZE_FROM, SIZE_PRICE]).toEqual([20, 1]);
    for (const [extra, priced] of [
      [9, false], // 19 cards: the 20th is free
      [10, true], // 20 cards: the 21st is the first to pay
    ] as const) {
      const deck = grown(extra);
      const r = evaluateDraft(request(deck, STRONG));
      const first = r.ranking.find((o) => o.action.kind === "pick");
      expect(first?.reasons.some((x) => x.kind === "size")).toBe(priced);
    }
    const sizes: number[] = [];
    for (const extra of [11, 15, 25, 30]) {
      const deck = grown(extra);
      sizes.push(size(deck));
      const r = evaluateDraft(request(deck, STRONG));
      for (const o of r.ranking.filter((x) => x.action.kind === "pick")) {
        const line = o.reasons.find((x) => x.kind === "size");
        expect(line?.delta).toBeCloseTo(-SIZE_PRICE, 10); // a constant price per card, not one that grows or that stops
      }
    }
    expect(sizes.every((n) => n > SIZE_FROM)).toBe(true);
  });

  it("is added to the index of the deck exactly where the code says it is, and not before", () => {
    const w = baseWeights(1, "balanced");
    expect(w.size).toBe(SIZE_PRICE);
    expect(w.sizeFrom).toBe(SIZE_FROM);
    const at = (n: number) =>
      profileDeck(
        grown(n - 10).map((d) => ({ card: must(getCard(d.id)), count: d.count })),
        1,
        { character: "ironclad", relics: [] },
      );
    expect(at(20).size).toBe(20);
    expect(at(21).size).toBe(21);
  });

  it("makes a deck of mediocre cards skip a mediocre offer, and says why in plain words", () => {
    const deck = grown(14); // 24 cards
    expect(size(deck)).toBe(24);
    const r = evaluateDraft(request(deck, MEDIOCRE));
    expect(r.recommendation.action.kind).toBe("skip");
    expect(r.tradeoffs[0]).toMatch(/No offered card earns its slot/);
    expect(r.tradeoffs[0]).toMatch(/25th card costs 1\.00/);
    const best = r.ranking.find((o) => o.action.kind === "pick");
    expect(best?.indexDelta).toBeLessThan(0);
    // without the price the best card would have been taken: the price is what moved the call, and the page can say by how much
    const slot = best?.reasons.find((x) => x.kind === "size");
    expect(slot?.delta).toBeCloseTo(-1, 10);
    expect((best?.indexDelta ?? 0) - (slot?.delta ?? 0)).toBeGreaterThan(0);
    const skip = r.ranking.find((o) => o.action.kind === "skip");
    expect(skip?.reasons[0]?.text).toMatch(/spares the price of a slot/);
    expect(r.assumptions.join(" ")).toMatch(/price of a slot/);
  });

  it("still takes a card that earns its slot: a strong, fitting card in a big deck", () => {
    for (const extra of [14, 18]) {
      const r = evaluateDraft(request(grown(extra), STRONG));
      expect(r.recommendation.action).toEqual({ kind: "pick", cardId: "INFLAME" });
      expect(r.recommendation.indexDelta).toBeGreaterThan(3);
    }
  });

  it("leaves small decks alone: the same mediocre offer is taken at 12 and 16 cards", () => {
    for (const extra of [2, 6]) {
      const r = evaluateDraft(request(grown(extra), MEDIOCRE));
      expect(r.recommendation.action).toEqual({ kind: "pick", cardId: "SHRUG_IT_OFF" });
      expect(r.ranking.some((o) => o.reasons.some((x) => x.kind === "size"))).toBe(false);
    }
  });

  it("skips more as the deck grows, in every class, and almost never in a small one", () => {
    // 40 decks of each size band for each class, built from the reward pool by a seeded generator, offered three random cards of the pool
    const rnd = mulberry32(20261102);
    const bands: [string, number, number][] = [
      ["small", 8, 15],
      ["middle", 21, 25],
      ["big", 26, 32],
    ];
    const share = { v1: new Map<string, number>(), v2: new Map<string, number>() };
    const total = new Map<string, number>();
    for (const character of PLAYABLE_CLASSES) {
      const pool = rewardPool(character, ALL_UNLOCKED).filter((c) =>
        ["common", "uncommon", "rare"].includes(c.rarity),
      );
      for (const [band, lo, hi] of bands) {
        for (let k = 0; k < 40; k += 1) {
          const target = lo + Math.floor(rnd() * (hi - lo + 1));
          const rows: Row[] = starterDeck(character).map((d) => ({ ...d }));
          while (size(rows) < target) {
            const c = must(pool[Math.floor(rnd() * pool.length)]);
            const row = rows.find((d) => d.id === c.id);
            if (row) row.count += 1;
            else rows.push({ id: c.id, count: 1 });
          }
          const picks = new Set<string>();
          while (picks.size < 3) picks.add(must(pool[Math.floor(rnd() * pool.length)]).id);
          const entries: DeckEntry[] = rows.map((d) => ({
            card: must(getCard(d.id)),
            count: d.count,
          }));
          const offered = [...picks].map((id) => must(getCard(id)));
          const act = band === "small" ? 0 : band === "middle" ? 1 : 2;
          const setting = { character, relics: [] };
          const base = profileDeck(entries, act, setting);
          for (const [name, weights] of [
            ["v2", baseWeights(act, "balanced")],
            [
              "v1",
              {
                ...baseWeights(act, "balanced"),
                size: LEGACY_SIZE_PRICE,
                sizeFrom: LEGACY_SIZE_FROM,
              },
            ],
          ] as const) {
            const first = rankWith(weights, base, entries, offered, act, setting)[0];
            if (first?.action.kind === "skip")
              share[name].set(band, (share[name].get(band) ?? 0) + 1);
          }
          total.set(band, (total.get(band) ?? 0) + 1);
        }
      }
    }
    const rate = (name: "v1" | "v2", band: string): number =>
      (share[name].get(band) ?? 0) / (total.get(band) ?? 1);
    // the version the user used skipped next to nothing, in a deck of any size (30+ cards were the only ones it priced at all)
    expect(rate("v1", "small")).toBeLessThan(0.05);
    expect(rate("v1", "middle")).toBeLessThan(0.1);
    expect(rate("v1", "big")).toBeLessThan(0.2);
    // the price changes nothing for small decks and a good deal for big ones
    expect(rate("v2", "small")).toBeLessThan(0.05);
    expect(rate("v2", "middle")).toBeGreaterThan(rate("v1", "middle") + 0.1);
    expect(rate("v2", "big")).toBeGreaterThan(rate("v1", "big") + 0.15);
    expect(rate("v2", "big")).toBeGreaterThan(rate("v2", "middle"));
  });

  it("keeps the numbers of version 1, which every earlier simulated game used", () => {
    expect([LEGACY_SIZE_FROM, LEGACY_SIZE_PRICE]).toEqual([30, 0.6]);
  });
});

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected a value");
  return value;
}
