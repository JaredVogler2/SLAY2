import { CATALOG, RELIC_CATALOG, getCard, synergyTags, type MechanicId } from "@slay2/game-data";
import { describe, expect, it } from "vitest";

import rules from "@/content/rules.generated.json";
import { type CardValueSet } from "@/lib/cardvalues";
import {
  EVIDENCE,
  INSIGHTS,
  bossDeaths,
  count,
  enemyName,
  evidenceClass,
  findings,
  ladderScale,
  leverLadder,
  oddsChange,
  ordinal,
  pointRange,
  points,
  roughly,
  segments,
  share,
  type RunsEnd,
} from "@/lib/insights";
import { ASCENSION_LEVELS, ascensionStatus, openQuestions } from "@/lib/insights-content";
import { atlasData, coverageRows, surprisesFor } from "@/lib/insights-server";

/**
 * The library behind the insights page (ADR-059): every sentence that quotes a number builds it from the exported data, so these tests
 * read the data and check the sentences against it, check the formatters on cases whose answer is known, and check that what the page
 * says it holds of the game (counts, rule ids, rule numbers) is what the catalogs and the rule register say.
 */
describe("the formatters", () => {
  it("writes a difference of shares as signed points and an interval as two signed numbers", () => {
    expect(points(0.259)).toBe("+25.9 points");
    expect(points(-0.014)).toBe("−1.4 points");
    expect(points(0.0713, 0)).toBe("+7 points");
    expect(pointRange([0.063, 0.08])).toBe("+6.3 to +8.0");
    expect(pointRange([-0.01, 0.02])).toBe("−1.0 to +2.0");
  });

  it("rounds a headline count to three figures and says so", () => {
    expect(roughly(352391)).toBe("about 352,000");
    expect(roughly(9999)).toBe("about 10,000");
    expect(roughly(1234)).toBe("about 1,230");
    expect(count(262759)).toBe("262,759");
    expect(share(0.4039)).toBe("40.4%");
  });

  it("writes the ordinals of a rank, the teens included", () => {
    const got = [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112].map(ordinal);
    expect(got).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "101st",
      "111th",
      "112th",
    ]);
  });

  it("turns an odds ratio into a change in the odds", () => {
    expect(oddsChange(1.24)).toBe("+24 %");
    expect(oddsChange(0.7)).toBe("−30 %");
    expect(oddsChange(1.004)).toBe("no change");
  });

  it("names an enemy, a fight against two of one kind and a fight against two kinds", () => {
    expect(enemyName("VANTOM")).toBe("Vantom");
    expect(enemyName("KIN_PRIEST")).toBe("Kin Priest");
    expect(enemyName("THE_INSATIABLE")).toBe("The Insatiable");
    expect(enemyName("SCROLL_OF_BITING,SCROLL_OF_BITING")).toBe("Scroll of Biting ×2");
    expect(enemyName("CRUSHER,ROCKET")).toBe("Crusher & Rocket");
  });

  it("accepts the evidence classes it can explain and refuses any other", () => {
    for (const k of Object.keys(EVIDENCE)) expect(evidenceClass(k)).toBe(k);
    expect(() => evidenceClass("proven")).toThrow(/unknown evidence class/);
    for (const e of Object.values(EVIDENCE)) {
      expect(e.meaning.length).toBeGreaterThan(40);
      expect(["exact", "heuristic", "neutral", "unverified"]).toContain(e.tone);
    }
  });
});

describe("the lever ladder", () => {
  it("orders the levers by their size at Ascension 0, largest first, and puts every bar on one axis", () => {
    const ladder = leverLadder();
    expect(ladder).toHaveLength(INSIGHTS.levers.length);
    const size = (i: number): number => {
      const l = ladder[i];
      const r = l?.rows.find((x) => x.when === "a0") ?? l?.rows[0];
      return Math.abs(r?.difference ?? 0);
    };
    for (let i = 1; i < ladder.length; i++) expect(size(i - 1)).toBeGreaterThanOrEqual(size(i));
    expect(ladder[0]?.id).toBe("card-values");
    const scale = ladderScale();
    for (const l of ladder)
      for (const r of l.rows) {
        expect(scale).toBeGreaterThanOrEqual(Math.abs(r.difference));
        for (const end of r.ci95) expect(scale).toBeGreaterThanOrEqual(Math.abs(end));
      }
    expect(Math.round(scale * 20)).toBeCloseTo(scale * 20, 9);
  });

  it("is internally consistent: each difference is the first share less the second, inside its interval, with the p-value it was read with", () => {
    for (const l of INSIGHTS.levers)
      for (const r of l.rows) {
        expect(r.difference).toBeCloseTo(r.first - r.second, 9);
        expect(r.ci95[0]).toBeLessThanOrEqual(r.difference);
        expect(r.ci95[1]).toBeGreaterThanOrEqual(r.difference);
        expect(r.aOnly + r.bOnly).toBeGreaterThan(0);
        expect(r.p).toBeGreaterThanOrEqual(0);
        expect(r.p).toBeLessThanOrEqual(1);
        expect(r.pairs).toBeGreaterThan(0);
      }
  });

  it("measured the three levers it compares across Ascensions at both levels, and the other four at one", () => {
    const both = INSIGHTS.levers.filter(
      (l) => l.rows.some((r) => r.when === "a0") && l.rows.some((r) => r.when === "a9"),
    );
    expect(both.map((l) => l.id).sort()).toEqual(["card-values", "opening-relic", "synergy"]);
    // each of the three is smaller in points at Ascension 9, which the pages say
    for (const l of both) {
      const a0 = l.rows.find((r) => r.when === "a0");
      const a9 = l.rows.find((r) => r.when === "a9");
      expect(a9?.difference ?? 1).toBeLessThan(a0?.difference ?? 0);
    }
  });
});

describe("the findings", () => {
  const all = findings();
  const lever = (id: string) => INSIGHTS.levers.find((l) => l.id === id);

  it("are six, each with a number, a caption, a sentence and a place on the page", () => {
    expect(all.map((f) => f.id)).toEqual([
      "cards",
      "relics",
      "synergy",
      "ends",
      "second-boss",
      "ascension",
    ]);
    for (const f of all) {
      expect(f.figure.length).toBeGreaterThan(0);
      expect(f.caption.length).toBeGreaterThan(5);
      expect(f.body.length).toBeGreaterThan(60);
      expect(["#levers", "#runs-end", "#second-boss", "#ascension"]).toContain(f.href);
      expect(f.body + f.figure).not.toMatch(/undefined|NaN|\[object/);
    }
  });

  it("quote the data and never claim a stronger kind of evidence than the files they rest on", () => {
    const by = Object.fromEntries(all.map((f) => [f.id, f]));
    const a9 = lever("card-values")?.rows.find((r) => r.when === "a9");
    expect(by.cards?.body).toContain(share(a9?.first ?? 0));
    expect(by.cards?.body).toContain(share(a9?.second ?? 0));
    expect(a9?.evidence).toBe("registered");
    expect(by.cards?.evidence).toBe("registered");
    // the relics lever is a development measurement, and so is its finding
    expect(lever("relics-along-the-way")?.rows[0]?.evidence).toBe("development");
    expect(by.relics?.evidence).toBe("development");
    // the Ascension 0 side of the card-value pair is the descriptive twin, so a finding that quotes both sides is descriptive
    expect(lever("card-values")?.rows.find((r) => r.when === "a0")?.evidence).toBe("descriptive");
    expect(by.ascension?.evidence).toBe("descriptive");
    for (const r of lever("synergy")?.rows ?? []) expect(r.evidence).toBe("registered");
    expect(by.synergy?.evidence).toBe("registered");
    expect(by["second-boss"]?.evidence).toBe("exploratory");
    expect(by.ends?.evidence).toBe("descriptive");
  });

  it("say the second boss differently from the first only as far as the data do", () => {
    const upgraded = INSIGHTS.lateDrivers.features.find((f) => f.id === "upgraded");
    const body = findings().find((f) => f.id === "second-boss")?.body ?? "";
    expect(body).toContain(oddsChange(upgraded?.act1.oddsRatio ?? 1));
    expect(body).toContain(oddsChange(upgraded?.act2.oddsRatio ?? 1));
  });
});

describe("where runs end", () => {
  it("splits a game's end into four parts that sum to one", () => {
    for (const v of INSIGHTS.runsEnd) {
      const segs = segments(v);
      expect(segs.map((s) => s.id)).toEqual(["act1", "act2", "act3", "won"]);
      expect(segs.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 12);
      expect(v.goldMedian).toBeGreaterThan(0);
      expect(v.goldShare150).toBeGreaterThanOrEqual(v.goldShare300);
      for (const c of v.perClass)
        expect(c.diedAct1 + c.diedAct2 + c.diedAct3 + c.won).toBe(c.completed);
    }
  });

  it("counts a death in a boss fight as one of the deaths of its act, from a made-up game and from the real ones", () => {
    const first = INSIGHTS.runsEnd[0];
    if (!first) throw new Error("no variant");
    const made: RunsEnd = {
      ...first,
      diedAct1: 10,
      diedAct2: 20,
      diedAct3: 0,
      bossAct1: 4,
      bossAct2: 5,
      bossAct3: 0,
    };
    const b = bossDeaths(made);
    expect(b.all).toBeCloseTo(9 / 30, 12);
    expect(b.byAct).toEqual([0.4, 0.25, null]); // nobody died in act 3: no share
    for (const v of INSIGHTS.runsEnd) {
      const real = bossDeaths(v);
      expect(real.all).toBeGreaterThan(0);
      expect(real.all).toBeLessThan(1);
      // not "most of them": the claim this panel once made, which the games do not support
      expect(real.all).toBeLessThan(0.5);
    }
  });

  it("holds the shop prices its gold sentence quotes (a removal at 75, a common card at 50) as the rule register states them", () => {
    const text = (id: string): string => rules.rules.find((r) => r.id === id)?.text ?? "";
    expect(text("SHOP-4")).toMatch(/75 \+ 25n/);
    expect(text("SHOP-2")).toMatch(/common 50/);
  });
});

describe("what a card's measurement and its rating say of each other", () => {
  const card = (id: string, beta: number, half: number, games: number, rating: number) => ({
    id,
    simId: id,
    beta,
    ci95: [beta - half, beta + half],
    gamesWithCard: games,
    staticRating: rating,
  });
  // twelve cards rated 12 down to 1; the measurements are mostly in the same order, with four exceptions that are built to tell apart
  const set = {
    character: "ironclad",
    games: 1000,
    bossFights: 900,
    relicsKept: true,
    spearmanWithStaticRating: 0.3,
    cards: [
      card("A", 1.2, 0.1, 500, 12),
      card("B", 1.0, 0.1, 500, 11),
      card("C", 0.8, 0.1, 500, 10),
      card("D", 0.6, 0.1, 500, 9),
      card("E", 0.4, 0.1, 500, 8),
      card("F", 0.2, 0.1, 500, 7),
      card("G", 0.0, 0.1, 500, 6),
      card("H", -0.2, 0.1, 500, 5),
      card("I", 0.9, 0.1, 500, 1), // rated last, measured among the best, tight interval: worth more than its rating
      card("J", 0.9, 0.9, 500, 2), // the same point estimate with an interval so wide that its low end sits low: not listed
      card("K", 0.9, 0.1, 50, 3), // too few runs to read
      card("L", -1.0, 0.1, 500, 13), // rated first, measured last, tight interval: worth less than its rating
    ],
  } as unknown as CardValueSet;

  it("lists a card only when even the less favourable end of its interval sits far from where its rating puts it", () => {
    const s = surprisesFor(set);
    expect(s.better.map((c) => c.id)).toEqual(["I"]);
    expect(s.worse.map((c) => c.id)).toEqual(["L"]);
    expect(s.set.cards).toBe(11); // K has too few runs
    expect(s.better.map((c) => c.id)).not.toContain("J");
    expect(s.better.map((c) => c.id)).not.toContain("K");
    const i = s.better[0];
    expect(i?.ratedRank).toBeGreaterThan(i?.measuredRank ?? 99);
  });

  it("lists nothing for a class whose measurements follow its ratings", () => {
    const aligned = {
      ...set,
      cards: set.cards.slice(0, 8),
    } as CardValueSet;
    const s = surprisesFor(aligned);
    expect(s.better).toEqual([]);
    expect(s.worse).toEqual([]);
  });

  it("names a card by the catalog and falls back to its id", () => {
    const real = CATALOG.cards.find((c) => c.class === "ironclad" && c.rarity === "common");
    const withReal = {
      ...set,
      cards: [...set.cards.slice(0, 8), card(real?.id ?? "?", 0.9, 0.05, 500, 1)],
    } as unknown as CardValueSet;
    expect(surprisesFor(withReal).better[0]?.name).toBe(getCard(real?.id ?? "?")?.name);
    expect(surprisesFor(set).better[0]?.name).toBe("I");
  });
});

describe("the synergy atlas", () => {
  const atlas = atlasData();
  const shape = new Set(["attack", "skill", "power", "cheap", "zero_cost", "strike"]);

  it("leaves out the mechanics that are counted from a card's type, cost or name", () => {
    expect(atlas.map((m) => m.id).some((id) => shape.has(id))).toBe(false);
    expect(atlas.length).toBeGreaterThan(15);
  });

  it("lists, for each mechanic, exactly the playable cards the tags say supply it and the ones whose worth depends on it", () => {
    const playable = CATALOG.cards.filter((c) =>
      ["ironclad", "silent", "regent", "necrobinder", "defect", "colorless"].includes(c.class),
    );
    for (const m of atlas) {
      const give = playable.filter((c) => (synergyTags(c).gives[m.id as MechanicId] ?? 0) > 0);
      const want = playable.filter((c) => (synergyTags(c).wants[m.id as MechanicId] ?? 0) > 0);
      expect(m.suppliers.map((c) => c.id).sort(), m.id).toEqual(give.map((c) => c.id).sort());
      expect(m.payoffs.map((c) => c.id).sort(), m.id).toEqual(want.map((c) => c.id).sort());
      for (const c of [...m.suppliers, ...m.payoffs]) {
        expect([1, 2, 3]).toContain(c.level);
        expect(getCard(c.id)?.name).toBe(c.name);
      }
      // strongest first, then by name
      const lv = m.suppliers.map((c) => c.level);
      expect([...lv].sort((a, b) => b - a)).toEqual(lv);
    }
  });

  it("carries the measured worth of a mechanic only where the exploratory reading has one, with its interval around it", () => {
    const measured = atlas.filter((m) => m.measured);
    expect(measured.length).toBeGreaterThan(5);
    for (const m of measured) {
      expect(m.measured?.ci95[0] ?? 0).toBeLessThanOrEqual(m.measured?.ratio ?? 0);
      expect(m.measured?.ci95[1] ?? 0).toBeGreaterThanOrEqual(m.measured?.ratio ?? 0);
      expect(m.measured?.decks).toBeGreaterThan(0);
    }
  });
});

describe("what the site says it holds of the game", () => {
  const rows = coverageRows();
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));

  it("counts the cards and the relics of its own catalogs, and the game holds exactly as many (nothing is missing from them)", () => {
    expect(INSIGHTS.inventory.counts.cards.total).toBe(CATALOG.cards.length);
    expect(INSIGHTS.inventory.counts.relics.total).toBe(RELIC_CATALOG.relics.length);
    expect(by.cards?.inGame).toBe(String(CATALOG.cards.length));
    expect(by.relics?.inGame).toBe(String(RELIC_CATALOG.relics.length));
    expect(by.cards?.facts.text).toContain(String(CATALOG.cards.length));
    expect(by.relics?.facts.text).toContain(String(RELIC_CATALOG.relics.length));
  });

  it("gives every part of the game the five columns, with a status the legend explains", () => {
    expect(rows.length).toBeGreaterThanOrEqual(12);
    for (const r of rows)
      for (const c of [r.facts, r.odds, r.measured, r.tested, r.advice]) {
        expect(["full", "partial", "none", "na"]).toContain(c.status);
        if (c.status !== "na") expect(c.text.length).toBeGreaterThan(3);
      }
  });

  it("does not claim a catalog, a measurement or advice for the parts that have none", () => {
    for (const id of ["potions", "events", "enchantments"]) {
      expect(by[id]?.facts.status, id).toBe("none");
      expect(by[id]?.measured.status, id).toBe("none");
      expect(by[id]?.advice.status, id).toBe("none");
    }
    expect(by.potions?.inGame).toBe(String(INSIGHTS.inventory.counts.potions.total));
    expect(by.events?.inGame).toBe(String(INSIGHTS.inventory.counts.events.total));
    expect(by.enchantments?.inGame).toBe(String(INSIGHTS.inventory.counts.enchantments.total));
    expect(by.combat?.advice.status).toBe("none");
    expect(by.shops?.advice.status).toBe("none");
  });
});

describe("the Ascension ladder", () => {
  const text = (id: string): string => rules.rules.find((r) => r.id === id)?.text ?? "";

  it("covers levels 1 to 10 once each and cites only rules that are in the register", () => {
    expect(ASCENSION_LEVELS.map((l) => l.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const ids = new Set(rules.rules.map((r) => r.id));
    for (const l of ASCENSION_LEVELS) {
      expect(l.rules.length).toBeGreaterThan(0);
      for (const r of l.rules)
        expect(ids.has(r), `${r} cited by level ${String(l.level)}`).toBe(true);
    }
  });

  it("says what each level changes in the numbers the rule register gives", () => {
    const change = (n: number): string => ASCENSION_LEVELS.find((l) => l.level === n)?.change ?? "";
    expect(text("MAP-4")).toMatch(/5 elites, 8 with A1/);
    expect(change(1)).toMatch(/eight elite fights instead of five/);
    expect(text("ASC-6")).toMatch(/heals 80 %/);
    expect(change(2)).toMatch(/80 %/);
    expect(text("ASC-2")).toMatch(/0\.75/);
    expect(change(3)).toMatch(/three quarters/);
    expect(text("ASC-3")).toMatch(/-1 potion slot/);
    expect(change(4)).toMatch(/One potion slot fewer/);
    expect(text("ASC-4")).toMatch(/100 \+ 50\*n instead of 75 \+ 25\*n/);
    expect(change(6)).toMatch(/100 plus 50.*75 plus 25/);
    expect(text("RUN-4")).toMatch(/second, different boss/);
  });

  it("says that only level 9 was tested, and that level 10's second boss is never played", () => {
    expect(ascensionStatus(9).tone).toBe("exact");
    expect(ascensionStatus(10).tone).toBe("unverified");
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) expect(ascensionStatus(n).text).toMatch(/not tested/);
  });
});

describe("what is not known yet", () => {
  const q = Object.fromEntries(openQuestions().map((x) => [x.id, x]));

  it("lists seven questions in the order the project means to close them, each with a first step", () => {
    expect(openQuestions().map((x) => x.id)).toEqual([
      "later",
      "elites",
      "relics",
      "events",
      "gold",
      "pilot",
      "live",
    ]);
    for (const x of openQuestions()) {
      expect(x.first.length).toBeGreaterThan(20);
      expect(x.why + x.question).not.toMatch(/undefined|NaN|\[object/);
    }
  });

  it("quotes the data it names", () => {
    const late = INSIGHTS.lateDrivers.endpoints;
    expect(q.later?.why).toContain(count(late.act2.runs));
    expect(q.later?.why).toContain(count(late.act2.passed));
    expect(q.events?.why).toContain(count(INSIGHTS.inventory.counts.events.total));
    expect(q.events?.why).toContain(count(INSIGHTS.inventory.counts.enchantments.total));
    const a0 = INSIGHTS.runsEnd.find((v) => v.id === "a0");
    expect(q.gold?.why).toContain(count(a0?.goldMedian ?? 0));
    const relics = INSIGHTS.levers.find((l) => l.id === "relics-along-the-way")?.rows[0];
    expect(q.relics?.why).toContain(points(relics?.difference ?? 0));
  });

  it("says that nothing is known about the live game, not that the answer is no", () => {
    expect(q.live?.why).toMatch(/^Not known/);
  });

  it("does not claim that the pilot plays engine decks badly: only that it may not play them well", () => {
    expect(q.pilot?.why).toMatch(/may not play engine decks well/);
    expect(q.pilot?.why).not.toMatch(/plays engines badly/);
  });
});
