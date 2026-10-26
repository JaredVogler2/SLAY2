import { describe, expect, it } from "vitest";

import {
  ALL_UNLOCKED,
  CATALOG,
  CHARACTER_FACTS,
  NO_EPOCHS,
  PLAYABLE_CLASSES,
  cardsOfClass,
  characterFacts,
  getCard,
  matchScore,
  poolSizes,
  rewardPool,
  searchCards,
  starterDeck,
} from "../src/index";

describe("catalog integrity", () => {
  it("has 577 unique cards for build 0.107.1 and a content hash", () => {
    expect(CATALOG.build).toBe("sts2-main-0.107.1");
    expect(CATALOG.cards).toHaveLength(577);
    expect(new Set(CATALOG.cards.map((c) => c.id)).size).toBe(577);
    expect(CATALOG.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stores facts only: no text, art or effect-number fields", () => {
    const allowed = new Set([
      "id",
      "name",
      "class",
      "rarity",
      "type",
      "cost",
      "starCost",
      "keywords",
      "roles",
      "prior",
      "rewardEligible",
      "multiplayer",
      "epochGate",
    ]);
    for (const c of CATALOG.cards) {
      for (const key of Object.keys(c)) {
        expect(allowed.has(key), `${c.id}.${key}`).toBe(true);
      }
    }
    const forbidden =
      /^(image|image_url|description|text|flavor|flavour|vars|upgrade|damage|block|template)/i;
    for (const c of CATALOG.cards) {
      expect(Object.keys(c).filter((k) => forbidden.test(k))).toEqual([]);
    }
  });

  it("names the two third-party sources by pinned SHA", () => {
    const ids = CATALOG.provenance.sources.map((s) => s.id).sort();
    expect(ids).toEqual(["spire-archive", "sts2-rl-agent"]);
    for (const s of CATALOG.provenance.sources) {
      expect(s.sha).toMatch(/^[0-9a-f]{40}$/);
    }
  });
});

describe("solo reward pools (resolves open question Q3)", () => {
  it("each class has 20 commons, 35 uncommons and 25 rares once every epoch is revealed", () => {
    for (const cls of PLAYABLE_CLASSES) {
      expect(poolSizes(cls, ALL_UNLOCKED), cls).toEqual({ common: 20, uncommon: 35, rare: 25 });
    }
  });

  it("each class excludes exactly one multiplayer-only uncommon and one multiplayer-only rare", () => {
    for (const cls of PLAYABLE_CLASSES) {
      const mp = cardsOfClass(cls).filter((c) => c.multiplayer === "multiplayer-only");
      expect(mp.map((c) => c.rarity).sort(), cls).toEqual(["rare", "uncommon"]);
    }
  });

  it("starter and ancient cards never appear in rewards", () => {
    for (const cls of PLAYABLE_CLASSES) {
      for (const c of rewardPool(cls)) {
        expect(["common", "uncommon", "rare"]).toContain(c.rarity);
      }
    }
    expect(getCard("STRIKE_IRONCLAD")?.rewardEligible).toBe(false);
    expect(getCard("BASH")?.rarity).toBe("basic");
  });

  it("a profile that has revealed no epochs sees smaller pools", () => {
    const none = poolSizes("ironclad", NO_EPOCHS);
    expect(none).toEqual({ common: 17, uncommon: 32, rare: 22 });
    const molten = getCard("MOLTEN_FIST");
    expect(molten?.epochGate).toBe("IRONCLAD2");
    expect(rewardPool("ironclad", NO_EPOCHS).some((c) => c.id === "MOLTEN_FIST")).toBe(false);
    expect(
      rewardPool("ironclad", { revealedEpochs: new Set(["IRONCLAD2"]), mode: "solo" }).some(
        (c) => c.id === "MOLTEN_FIST",
      ),
    ).toBe(true);
  });

  it("co-op swaps the multiplayer constraint", () => {
    const coop = poolSizes("ironclad", { revealedEpochs: "all", mode: "coop" });
    expect(coop.uncommon).toBe(36);
    expect(coop.rare).toBe(26);
  });
});

describe("card search", () => {
  it("finds cards by exact name, prefix, word prefix and typo-tolerant subsequence", () => {
    expect(searchCards("bash")[0]?.id).toBe("BASH");
    expect(searchCards("Shrug")[0]?.id).toBe("SHRUG_IT_OFF");
    expect(searchCards("shr it")[0]?.id).toBe("SHRUG_IT_OFF");
    expect(searchCards("dmnfrm", { classes: ["ironclad"] })[0]?.id).toBe("DEMON_FORM");
    expect(searchCards("zzzzqq")).toHaveLength(0);
  });

  it("respects class and reward filters and the limit", () => {
    const res = searchCards("strike", {
      classes: ["ironclad"],
      rewardEligibleOnly: true,
      limit: 3,
    });
    expect(res.length).toBeLessThanOrEqual(3);
    for (const c of res) {
      expect(c.class).toBe("ironclad");
      expect(c.rewardEligible).toBe(true);
    }
  });

  it("scores exact matches above prefix matches", () => {
    const bash = getCard("BASH");
    expect(bash).toBeDefined();
    if (bash) {
      expect(matchScore("bash", bash)).toBeGreaterThan(matchScore("ba", bash));
      expect(matchScore("", bash)).toBe(1);
    }
  });
});

describe("character facts (E1)", () => {
  it("has the five characters with their starting HP, gold, energy and starting decks", () => {
    expect(CHARACTER_FACTS.map((c) => [c.id, c.startingHp])).toEqual([
      ["ironclad", 80],
      ["silent", 70],
      ["regent", 75],
      ["necrobinder", 66],
      ["defect", 75],
    ]);
    for (const c of CHARACTER_FACTS) {
      expect(c.startingGold).toBe(99);
      expect(c.maxEnergy).toBe(3);
      // the Silent starts with 12 cards (5 Strike, 5 Defend, 2 specials); everyone else with 10
      const size = starterDeck(c.id).reduce((n, e) => n + e.count, 0);
      expect(size, c.id).toBe(c.id === "silent" ? 12 : 10);
    }
    expect(characterFacts("defect").baseOrbSlots).toBe(3);
    expect(characterFacts("ironclad").startingRelics[0]?.name).toBe("Burning Blood");
  });

  it("starter cards are basic-rarity catalog cards of the same class", () => {
    for (const c of CHARACTER_FACTS) {
      for (const e of starterDeck(c.id)) {
        const card = getCard(e.id);
        expect(card?.rarity, e.id).toBe("basic");
        expect(card?.class, e.id).toBe(c.id);
      }
    }
  });
});
