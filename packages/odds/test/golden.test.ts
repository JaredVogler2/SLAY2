import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  Rational,
  cardRemovalCost,
  cardRarityPmf,
  combatGoldRange,
  drawDistribution,
  drawJointAtLeast,
  enumeratePack,
  evaluateRoute,
  forecastPotions,
  forecastUnknownRoom,
  inferCounter,
  inferPotionCounter,
  inferUnknownState,
  marginalTable,
  nextHandWithReshuffle,
  priceDistribution,
  rarityRulesForAscension,
  rewardUpgradeChance,
  summarizePack,
  treasureGoldPmf,
  type PackObservation,
  type PotionObservation,
  type PotionRoom,
  type Rarity,
  type RewardSource,
  type RouteRoom,
  type ShopItem,
  type UnknownObservation,
} from "../src/index";

/**
 * Cross-implementation check: every case in golden-python.json was produced by the independent Python oracle
 * (sim/slay2_sim/oracle_odds.py, `fractions.Fraction`). The TypeScript engines must agree EXACTLY (rational equality).
 */
interface GoldenCase {
  kind: string;
  name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

const golden = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "golden-python.json"), "utf8"),
) as {
  cases: GoldenCase[];
};

const frac = (s: unknown): Rational => Rational.parse(String(s));

function expectDist(
  actual: ReadonlyMap<number | string, Rational>,
  expected: Record<string, unknown>,
  label: string,
): void {
  const got = Object.fromEntries([...actual].map(([k, v]) => [String(k), v.toString()]));
  const want = Object.fromEntries(
    Object.entries(expected).map(([k, v]) => [k, frac(v).toString()]),
  );
  expect(got, label).toEqual(want);
}

function byKind(kind: string): GoldenCase[] {
  return golden.cases.filter((c) => c.kind === kind);
}

describe("golden (independent Python oracle) - card rarity", () => {
  it("has the expected number of cases", () => {
    expect(golden.cases.length).toBeGreaterThan(700);
  });

  it("rarity_pmf matches exactly", () => {
    for (const c of byKind("rarity_pmf")) {
      const i = c.input as { source: RewardSource; counter: number; scarcity: boolean };
      const got = cardRarityPmf(i.source, i.counter, { scarcity: i.scarcity });
      for (const r of ["common", "uncommon", "rare"] as const) {
        expect(got[r].toString(), `${c.name} ${r}`).toBe(frac(c.output[r]).toString());
      }
    }
  });

  it("pack summaries match exactly", () => {
    for (const c of byKind("pack")) {
      const i = c.input as {
        source: RewardSource;
        counter: number;
        cards: number;
        scarcity: boolean;
      };
      const rules = { scarcity: i.scarcity };
      const s = summarizePack(enumeratePack(i.source, i.counter, i.cards, rules), i.cards);
      expect(s.atLeastOneRare.toString(), c.name).toBe(frac(c.output.atLeastOneRare).toString());
      expect(s.expectedRares.toString(), c.name).toBe(frac(c.output.expectedRares).toString());
      expect(s.rareCountPmf.map(String), c.name).toEqual(
        (c.output.rareCountPmf as unknown[]).map((x) => frac(x).toString()),
      );
      expectDist(
        s.endCounter,
        c.output.endCounter as Record<string, unknown>,
        `${c.name} endCounter`,
      );
    }
  });

  it("posteriors match exactly (including impossible histories)", () => {
    for (const c of byKind("rarity_posterior")) {
      const i = c.input as { history: PackObservation[]; scarcity: boolean };
      const inf = inferCounter(i.history, { scarcity: i.scarcity });
      expect(inf.evidence.toString(), c.name).toBe(frac(c.output.evidence).toString());
      expect(inf.impossible, c.name).toBe(frac(c.output.evidence).isZero());
      expectDist(inf.posterior, c.output.posterior as Record<string, unknown>, c.name);
    }
  });

  it("upgrade chances match exactly", () => {
    for (const c of byKind("upgrade")) {
      const i = c.input as {
        rarity: Rarity;
        act: 0 | 1 | 2;
        scarcity: boolean;
        source: "encounter" | "shop";
      };
      expect(
        rewardUpgradeChance(i.rarity, i.act, { scarcity: i.scarcity }, i.source).toString(),
        c.name,
      ).toBe(frac(c.output.p).toString());
    }
  });
});

describe("golden (independent Python oracle) - potions and '?' rooms", () => {
  it("potion posteriors and forecasts match exactly", () => {
    for (const c of byKind("potion_posterior")) {
      const i = c.input as { history: PotionObservation[] };
      const inf = inferPotionCounter(i.history);
      expect(inf.evidence.toString(), c.name).toBe(frac(c.output.evidence).toString());
      expectDist(inf.posterior, c.output.posterior as Record<string, unknown>, c.name);
    }
    for (const c of byKind("potion_forecast")) {
      const i = c.input as { history: PotionObservation[]; upcoming: PotionRoom[] };
      const f = forecastPotions(inferPotionCounter(i.history).posterior, i.upcoming);
      expect(f.nextDropProbability.toString(), c.name).toBe(
        frac(c.output.nextDropProbability).toString(),
      );
      expect(f.expectedDrops.toString(), c.name).toBe(frac(c.output.expectedDrops).toString());
      expect(f.dropCountPmf.map(String), c.name).toEqual(
        (c.output.dropCountPmf as unknown[]).map((x) => frac(x).toString()),
      );
      expectDist(
        f.counterAfter,
        c.output.counterAfter as Record<string, unknown>,
        `${c.name} counterAfter`,
      );
    }
  });

  it("'?' room posteriors, forecasts and the marginal table match exactly", () => {
    for (const c of byKind("unknown_posterior")) {
      const i = c.input as { history: UnknownObservation[] };
      const inf = inferUnknownState(i.history);
      expect(inf.evidence.toString(), c.name).toBe(frac(c.output.evidence).toString());
      if (c.output.forecast === null) {
        expect(inf.impossible, c.name).toBe(true);
        continue;
      }
      const f = forecastUnknownRoom(inf);
      const want = c.output.forecast as Record<string, unknown>;
      for (const k of ["fight", "treasure", "shop", "event"] as const) {
        expect(f[k].toString(), `${c.name} ${k}`).toBe(frac(want[k]).toString());
      }
    }
    const table = byKind("unknown_marginal")[0];
    expect(table).toBeDefined();
    const rows = (table?.output.rows ?? []) as Record<string, unknown>[];
    const got = marginalTable(rows.length);
    rows.forEach((row, n) => {
      for (const k of ["fight", "treasure", "shop", "event"] as const) {
        expect(got[n]?.[k].toString(), `row ${String(n + 1)} ${k}`).toBe(frac(row[k]).toString());
      }
    });
  });
});

describe("golden (independent Python oracle) - economy and draws", () => {
  it("shop price distributions match exactly", () => {
    for (const c of byKind("price")) {
      const i = c.input as { kind: string; rarity: string; onSale: boolean };
      const item: ShopItem =
        i.kind === "relic"
          ? { kind: "relic", rarity: i.rarity as "common" | "uncommon" | "rare" | "shop" }
          : i.kind === "potion"
            ? { kind: "potion", rarity: i.rarity as "common" | "uncommon" | "rare" }
            : {
                kind: "card",
                rarity: i.rarity as "common" | "uncommon" | "rare",
                colorless: i.kind === "card-colorless",
              };
      const d = priceDistribution(item, i.onSale);
      expectDist(d.pmf, c.output.pmf as Record<string, unknown>, c.name);
      expect(
        [...d.pmf.values()].reduce((a, b) => a.add(b), Rational.ZERO).eq(1),
        `${c.name} sums to 1`,
      ).toBe(true);
    }
  });

  it("card removal cost and gold ranges match", () => {
    for (const c of byKind("removal")) {
      const i = c.input as { removals: number; ascension: number };
      expect(cardRemovalCost(i.removals, i.ascension), c.name).toBe(c.output.cost);
    }
    for (const c of byKind("gold")) {
      const i = c.input as { room: "monster" | "elite" | "boss"; ascension: number };
      const r = combatGoldRange(i.room, i.ascension);
      expect([r.min, r.max], c.name).toEqual([c.output.min, c.output.max]);
    }
  });

  it("hypergeometric, reshuffle and joint draw probabilities match exactly", () => {
    for (const c of byKind("hypergeometric")) {
      const i = c.input as { pile: number; targets: number; draws: number };
      expect(drawDistribution(i).map(String), c.name).toEqual(
        (c.output.pmf as unknown[]).map((x) => frac(x).toString()),
      );
    }
    for (const c of byKind("reshuffle")) {
      const i = c.input as {
        drawPile: number;
        targetsInDrawPile: number;
        discardPile: number;
        targetsInDiscard: number;
        draws: number;
        need: number;
      };
      expect(nextHandWithReshuffle(i, i.need).toString(), c.name).toBe(frac(c.output.p).toString());
    }
    for (const c of byKind("joint")) {
      const i = c.input as {
        pile: number;
        draws: number;
        groups: { count: number; need: number }[];
      };
      expect(drawJointAtLeast(i.pile, i.draws, i.groups).toString(), c.name).toBe(
        frac(c.output.p).toString(),
      );
    }
  });

  it("treasure gold matches exactly (TRS-1)", () => {
    for (const c of byKind("treasure_gold")) {
      const i = c.input as { ascension: number };
      expectDist(treasureGoldPmf(i.ascension), c.output.pmf as Record<string, unknown>, c.name);
    }
  });

  it("route reports match exactly (every case of the independent oracle)", () => {
    const cases = byKind("route");
    expect(cases.length).toBeGreaterThanOrEqual(16);
    for (const c of cases) {
      const i = c.input as {
        rooms: RouteRoom[];
        ascension: number;
        unknownHistory: UnknownObservation[];
        packHistory: PackObservation[];
        potionHistory: PotionObservation[];
      };
      const rare = inferCounter(i.packHistory, rarityRulesForAscension(i.ascension));
      const potion = inferPotionCounter(i.potionHistory);
      const r = evaluateRoute({
        rooms: i.rooms,
        ascension: i.ascension,
        unknownHistory: i.unknownHistory,
        rareCounter: rare.posterior,
        potionCounter: potion.posterior,
      });
      const o = c.output;
      expect(r.counts, c.name).toEqual(o.counts);
      for (const outcome of ["fight", "treasure", "shop", "event"] as const) {
        expect(r.unknown.expected[outcome].toString(), `${c.name} E[${outcome}]`).toBe(
          frac((o.unknownExpected as Record<string, unknown>)[outcome]).toString(),
        );
        expect(r.unknown.pmf[outcome].map(String), `${c.name} pmf ${outcome}`).toEqual(
          ((o.unknownPmf as Record<string, unknown[]>)[outcome] ?? []).map((x) =>
            frac(x).toString(),
          ),
        );
      }
      const same = (got: Rational, want: unknown, what: string): void => {
        expect(got.toString(), `${c.name} ${what}`).toBe(frac(want).toString());
      };
      same(r.fights.expected, o.fightsExpected, "fights");
      same(r.cardPacks.expectedRares, o.expectedRares, "expected rares");
      same(r.cardPacks.atLeastOneRare, o.atLeastOneRare, "P(a rare)");
      same(r.potions.expectedDrops, o.expectedPotions, "expected potions");
      same(r.potions.atLeastOne, o.atLeastOnePotion, "P(a potion)");
      same(r.gold.fromFights, o.goldFromFights, "gold from fights");
      same(r.gold.fromTreasure, o.goldFromTreasure, "gold from treasure");
      same(r.shops.expected, o.shopsExpected, "shops");
      same(r.relics.expectedTreasure, o.treasuresExpected, "treasures");
      expect([r.gold.min, r.gold.max], `${c.name} gold bounds`).toEqual([o.goldMin, o.goldMax]);
    }
  });

  it("derives ruleset flags from ascension", () => {
    expect(rarityRulesForAscension(6).scarcity).toBe(false);
    expect(rarityRulesForAscension(7).scarcity).toBe(true);
    expect(rarityRulesForAscension(10).scarcity).toBe(true);
  });
});
