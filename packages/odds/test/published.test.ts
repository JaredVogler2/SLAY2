import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  POTION_RARITY_PMF,
  Rational,
  cardRarityPmf,
  cardRemovalCost,
  combatGoldRange,
  enumeratePack,
  marginalTable,
  priceDistribution,
  rareChanceAtCounter,
  rarityRulesForAscension,
  rewardUpgradeChance,
  summarizePack,
  type PackOutcome,
  type RarityRules,
  type RewardSource,
  type ShopItem,
} from "../src/index";

/**
 * Cross-check against numbers published by third-party references for v0.107.1 (transcribed as facts into
 * fixtures/published.json). These are the independent arbiters for both the TypeScript engines and the Python oracle.
 */
const published = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "published.json"), "utf8"),
) as Record<string, unknown>;

/** Narrow a section of the fixture; the fixture is test data we control, so a cast is acceptable here. */
function section(key: string): unknown {
  return published[key];
}

const A0: RarityRules = rarityRulesForAscension(0);
const A7: RarityRules = rarityRulesForAscension(7);
const pct = (s: string): Rational => Rational.parse(s).div(100);

describe("published pity-offset table (sts.wiki, 28 cells)", () => {
  const t = section("offsetTable") as {
    counters: number[];
    regularRarePercent: string[];
    eliteRarePercent: string[];
    regularA7RarePercent: string[];
    eliteA7RarePercent: string[];
  };

  it.each([
    ["regular A0", "regular", A0, t.regularRarePercent],
    ["elite A0", "elite", A0, t.eliteRarePercent],
    ["regular A7", "regular", A7, t.regularA7RarePercent],
    ["elite A7", "elite", A7, t.eliteA7RarePercent],
  ] as const)("rare chance by counter: %s", (_label, room, rules, expected) => {
    t.counters.forEach((k, i) => {
      expect(rareChanceAtCounter(room, k, rules).toString(), `counter ${String(k)}`).toBe(
        pct(expected[i] ?? "").toString(),
      );
    });
  });
});

describe("published base odds", () => {
  const base = section("baseOddsPercent") as Record<string, Record<string, string>>;

  it("matches at offset 0 (counter 5) for fights, elites and the shop, and exactly for boss and other sources", () => {
    const cases: [string, RewardSource][] = [
      ["regular", { kind: "encounter", room: "regular" }],
      ["elite", { kind: "encounter", room: "elite" }],
      ["shop", { kind: "shop" }],
      ["boss", { kind: "encounter", room: "boss" }],
      ["otherSources", { kind: "base", table: "regular" }],
    ];
    for (const [key, src] of cases) {
      const pmf = cardRarityPmf(src, 5, A0);
      const want = base[key] ?? {};
      for (const r of ["common", "uncommon", "rare"] as const) {
        expect(pmf[r].toString(), `${key} ${r}`).toBe(pct(want[r] ?? "").toString());
      }
    }
  });

  it("shows the shifted uncommon boundary at the run start: regular 0 / 35 / 65", () => {
    const pmf = cardRarityPmf({ kind: "encounter", room: "regular" }, 0, A0);
    expect([pmf.rare, pmf.uncommon, pmf.common].map((x) => x.toPercent(2))).toEqual([
      "0.00%",
      "35.00%",
      "65.00%",
    ]);
  });
});

describe("published after-a-rare and run-average checks (Almanauts)", () => {
  const after = section("afterRare") as Record<string, string>;

  it("first card and pack right after a rare", () => {
    expect(
      rareChanceAtCounter("regular", 0, A0).eq(pct(after.regularFirstCardRarePercent ?? "")),
    ).toBe(true);
    expect(rareChanceAtCounter("elite", 0, A0).eq(pct(after.eliteFirstCardRarePercent ?? ""))).toBe(
      true,
    );
    const reg = summarizePack(enumeratePack({ kind: "encounter", room: "regular" }, 0, 3, A0), 3);
    const eli = summarizePack(enumeratePack({ kind: "encounter", room: "elite" }, 0, 3, A0), 3);
    expect(reg.atLeastOneRare.toPercent(0)).toBe(
      `${after.regularAtLeastOneRarePercentRounded ?? ""}%`,
    );
    expect(eli.atLeastOneRare.toPercent(0)).toBe(
      `${after.eliteAtLeastOneRarePercentRounded ?? ""}%`,
    );
    expect(eli.atLeastOneRare.toPercent(2)).toBe("16.95%");
  });

  /** Stationary distribution of the counter at reward boundaries, by float power iteration (test-only). */
  function runAverage(room: "regular" | "elite"): number {
    const src: RewardSource = { kind: "encounter", room };
    const cap = 45;
    const transitions: Map<number, number>[] = [];
    const atLeastOne: number[] = [];
    for (let k = 0; k <= cap; k += 1) {
      const outs: PackOutcome[] = enumeratePack(src, k, 3, A0);
      const m = new Map<number, number>();
      for (const o of outs) {
        m.set(o.endCounter, (m.get(o.endCounter) ?? 0) + o.probability.toNumber());
      }
      transitions.push(m);
      atLeastOne.push(summarizePack(outs, 3).atLeastOneRare.toNumber());
    }
    let pi: number[] = Array.from({ length: cap + 1 }, (_, k) => (k === 0 ? 1 : 0));
    for (let iter = 0; iter < 5000; iter += 1) {
      const next = Array.from({ length: cap + 1 }, () => 0);
      pi.forEach((mass, k) => {
        for (const [to, p] of transitions[k] ?? []) {
          next[to] = (next[to] ?? 0) + mass * p;
        }
      });
      pi = next;
    }
    return pi.reduce((acc, mass, k) => acc + mass * (atLeastOne[k] ?? 0), 0);
  }

  it("reproduces the published run averages (19.7% regular, 30.9% elite)", () => {
    const avg = section("runAverageAtLeastOneRarePercent") as Record<string, string>;
    expect((runAverage("regular") * 100).toFixed(1)).toBe(avg.regular);
    expect((runAverage("elite") * 100).toFixed(1)).toBe(avg.elite);
  });
});

describe("published upgrade chances (sts.wiki)", () => {
  it("25% x act index (A7: 12.5% x act index), never for rares or shop cards", () => {
    const u = section("upgradeChancePercent") as { a0: number[]; a7: number[] };
    ([0, 1, 2] as const).forEach((act) => {
      expect(rewardUpgradeChance("common", act, A0).toNumber() * 100).toBeCloseTo(
        u.a0[act] ?? NaN,
        10,
      );
      expect(rewardUpgradeChance("uncommon", act, A7).toNumber() * 100).toBeCloseTo(
        u.a7[act] ?? NaN,
        10,
      );
      expect(rewardUpgradeChance("rare", act, A0).isZero()).toBe(true);
      expect(rewardUpgradeChance("common", act, A0, "shop").isZero()).toBe(true);
    });
  });
});

describe("published '?' room table (Almanauts)", () => {
  it("matches the engine's marginal table to the published precision", () => {
    const rows = (section("unknownRoomTablePercent") as { rows: Record<string, number>[] }).rows;
    const got = marginalTable(rows.length);
    rows.forEach((row, n) => {
      for (const k of ["event", "fight", "shop", "treasure"] as const) {
        const want = row[k] ?? NaN;
        const decimals = (String(want).split(".")[1] ?? "").length;
        const tolerance = 0.5 * 10 ** -decimals + 1e-9;
        const value = (got[n]?.[k].toNumber() ?? NaN) * 100;
        expect(
          Math.abs(value - want),
          `room ${String(n + 1)} ${k}: ${String(value)} vs ${String(want)}`,
        ).toBeLessThanOrEqual(tolerance);
      }
    });
  });
});

describe("published economy tables (Almanauts)", () => {
  const ranges = section("shopPriceRanges") as Record<string, Record<string, [number, number]>>;

  function bounds(item: ShopItem, onSale = false): [number, number] {
    const d = priceDistribution(item, onSale);
    return [d.min, d.max];
  }

  /** Published ranges round the interval endpoints half-up; the endpoint itself has probability zero. */
  function expectRange(got: [number, number], want: [number, number], label: string): void {
    expect(got[0], `${label} min`).toBeGreaterThanOrEqual(want[0]);
    expect(got[0], `${label} min`).toBeLessThanOrEqual(want[0] + 0);
    expect(got[1], `${label} max`).toBeLessThanOrEqual(want[1]);
    expect(got[1], `${label} max`).toBeGreaterThanOrEqual(want[1] - 1);
  }

  it("card, colorless, sale, relic and potion price ranges", () => {
    for (const r of ["common", "uncommon", "rare"] as const) {
      expectRange(bounds({ kind: "card", rarity: r }), ranges.card?.[r] ?? [0, 0], `card ${r}`);
      expectRange(
        bounds({ kind: "card", rarity: r, colorless: true }),
        ranges.cardColorless?.[r] ?? [0, 0],
        `colorless ${r}`,
      );
      expectRange(
        bounds({ kind: "card", rarity: r }, true),
        ranges.cardOnSale?.[r] ?? [0, 0],
        `sale ${r}`,
      );
      expectRange(
        bounds({ kind: "potion", rarity: r }),
        ranges.potion?.[r] ?? [0, 0],
        `potion ${r}`,
      );
    }
    for (const r of ["common", "uncommon", "rare", "shop"] as const) {
      expectRange(bounds({ kind: "relic", rarity: r }), ranges.relic?.[r] ?? [0, 0], `relic ${r}`);
    }
  });

  it("card removal and combat gold", () => {
    const rem = section("cardRemoval") as { a0: number[]; a6: number[] };
    rem.a0.forEach((cost, n) => {
      expect(cardRemovalCost(n, 0)).toBe(cost);
      expect(cardRemovalCost(n, 5)).toBe(cost);
    });
    rem.a6.forEach((cost, n) => {
      expect(cardRemovalCost(n, 6)).toBe(cost);
      expect(cardRemovalCost(n, 10)).toBe(cost);
    });
    const gold = section("gold") as {
      a0: Record<string, [number, number]>;
      a3: Record<string, [number, number]>;
    };
    for (const room of ["monster", "elite", "boss"] as const) {
      const a0 = combatGoldRange(room, 2);
      expect([a0.min, a0.max]).toEqual(gold.a0[room]);
      const a3 = combatGoldRange(room, 3);
      expect([a3.min, a3.max]).toEqual(gold.a3[room]);
    }
  });

  it("potion rarity split sums to one", () => {
    const p = section("potionRarityPercent") as Record<string, number>;
    expect(POTION_RARITY_PMF.common.toNumber() * 100).toBeCloseTo(p.common ?? NaN, 10);
    expect(POTION_RARITY_PMF.uncommon.toNumber() * 100).toBeCloseTo(p.uncommon ?? NaN, 10);
    expect(POTION_RARITY_PMF.rare.toNumber() * 100).toBeCloseTo(p.rare ?? NaN, 10);
    expect(
      POTION_RARITY_PMF.common.add(POTION_RARITY_PMF.uncommon).add(POTION_RARITY_PMF.rare).eq(1),
    ).toBe(true);
  });
});
