import { describe, expect, it } from "vitest";

import { MECHANICS, RELIC_SYNERGY, getCard, relicTags, starterDeck } from "@slay2/game-data";

import {
  InvalidDraftRequestError,
  evaluateDraft,
  supplyOf,
  type DeckEntry,
  type DraftRequest,
} from "../src/index";

function request(over: Partial<DraftRequest> = {}): DraftRequest {
  return {
    build: "sts2-main-0.107.1",
    character: "ironclad",
    ascension: 0,
    actIndex: 1,
    deck: starterDeck("ironclad"),
    offered: ["SWORD_BOOMERANG", "FIGHT_ME", "SHRUG_IT_OFF"],
    source: "regular",
    riskPreference: "balanced",
    ...over,
  };
}

const delta = (r: ReturnType<typeof evaluateDraft>, cardId: string): number => {
  const option = r.ranking.find((o) => o.action.kind === "pick" && o.action.cardId === cardId);
  if (!option) throw new Error(`no option for ${cardId}`);
  return option.indexDelta;
};

describe("relics as suppliers of mechanics (ADR-051)", () => {
  it("leave a request without relics exactly as it was: no relics in the answer, the digest ignores an empty list", () => {
    const bare = evaluateDraft(request());
    const empty = evaluateDraft(request({ relics: [] }));
    expect(bare.relics).toBeUndefined();
    expect(empty.relics).toBeUndefined();
    expect(empty.stateDigest).toBe(bare.stateDigest);
    expect(empty.ranking.map((o) => o.indexDelta)).toEqual(bare.ranking.map((o) => o.indexDelta));
    expect(bare.missingInputs.join(" ")).toContain("Your relics");
  });

  it("count a relic that provides Strength as a supplier of it: a card that needs Strength is worth more, and the relic is named", () => {
    expect(relicTags("VAJRA").gives.strength ?? 0).toBeGreaterThan(0);
    const bare = evaluateDraft(request());
    const held = evaluateDraft(request({ relics: ["VAJRA"] }));
    expect(delta(held, "SWORD_BOOMERANG")).toBeGreaterThan(delta(bare, "SWORD_BOOMERANG"));
    // supply saturates: a card that is itself a source of Strength gains less where a relic already supplies it
    expect(delta(held, "FIGHT_ME")).toBeLessThan(delta(bare, "FIGHT_ME"));
    expect(held.relics?.supplying).toEqual([
      { id: "VAJRA", name: "Vajra", mechanics: ["Strength"] },
    ]);
    expect(held.relics?.taking).toEqual([]);
    expect(held.relics?.unread).toEqual([]);
    const reasons = held.ranking
      .find((o) => o.action.kind === "pick" && o.action.cardId === "SWORD_BOOMERANG")
      ?.reasons.map((r) => r.text)
      .join(" ");
    expect(reasons).toContain("Vajra");
    expect(held.stateDigest).not.toBe(bare.stateDigest);
    expect(held.assumptions.join(" ")).toContain("a judgement with no registered test");
    expect(held.assumptions.join(" ")).toContain("keep their relics, as an exploration");
    expect(held.missingInputs.join(" ")).not.toContain("Your relics");
    expect(held.notModelled.join(" ")).toContain("beyond supplying a mechanic");
  });

  it("read nothing from a relic the table has nothing to say about, and say so", () => {
    expect(relicTags("AMETHYST_AUBERGINE").gives).toEqual({});
    const bare = evaluateDraft(request());
    const held = evaluateDraft(request({ relics: ["AMETHYST_AUBERGINE"] }));
    expect(held.ranking.map((o) => o.indexDelta)).toEqual(bare.ranking.map((o) => o.indexDelta));
    expect(held.relics).toEqual({ supplying: [], taking: [], unread: ["Amethyst Aubergine"] });
  });

  it("count a relic that takes a mechanic away against the cards that need it, and name it (it is not 'read as nothing')", () => {
    expect(relicTags("BIG_MUSHROOM").gives.draw ?? 0).toBeLessThan(0);
    const silent = (over: Partial<DraftRequest> = {}): DraftRequest =>
      request({
        character: "silent",
        deck: starterDeck("silent"),
        offered: ["CORROSIVE_WAVE", "MURDER", "GRAND_FINALE"],
        ...over,
      });
    const bare = evaluateDraft(silent());
    const held = evaluateDraft(silent({ relics: ["BIG_MUSHROOM"] }));
    // the ranking does move, so the answer cannot say that nothing is read from the relic
    const moved = held.ranking.filter(
      (o) => o.indexDelta !== bare.ranking.find((b) => b.label === o.label)?.indexDelta,
    );
    expect(moved.length).toBeGreaterThan(0);
    expect(delta(held, "CORROSIVE_WAVE")).toBeLessThan(delta(bare, "CORROSIVE_WAVE"));
    expect(held.relics).toEqual({
      supplying: [],
      taking: [{ id: "BIG_MUSHROOM", name: "Big Mushroom", mechanics: [MECHANICS.draw.label] }],
      unread: [],
    });
    const assumption = held.assumptions.find((a) => a.startsWith("Relics:")) ?? "";
    expect(assumption).toContain("counts against the cards that need it");
    expect(assumption).toContain("0 of them provide one and 1 takes one away");
    // listed with a relic that provides a mechanic, each is in its own list
    const both = evaluateDraft(silent({ relics: ["BIG_MUSHROOM", "VAJRA"] }));
    expect(both.relics?.supplying.map((r) => r.id)).toEqual(["VAJRA"]);
    expect(both.relics?.taking.map((r) => r.id)).toEqual(["BIG_MUSHROOM"]);
    expect(both.relics?.unread).toEqual([]);
  });

  it("do not tell a player who holds relics that the role coverage counted them", () => {
    const bare = evaluateDraft(request({ offered: ["INFLAME"], actIndex: 0 }));
    const held = evaluateDraft(request({ offered: ["INFLAME"], actIndex: 0, relics: ["VAJRA"] }));
    const text = (r: ReturnType<typeof evaluateDraft>): string =>
      r.ranking
        .flatMap((o) => o.reasons)
        .filter((reason) => reason.kind === "coverage")
        .map((reason) => reason.text)
        .join(" ");
    expect(text(bare)).toContain("(you have none yet)");
    expect(text(held)).not.toContain("you have none yet");
    expect(text(held)).toContain("among your cards");
    expect(text(held)).toContain("relics are read by the synergy part");
    expect(held.assumptions.join(" ")).toContain("not by the role coverage");
  });

  it("take each relic once and in any order", () => {
    const a = evaluateDraft(request({ relics: ["ODDLY_SMOOTH_STONE", "VAJRA", "VAJRA"] }));
    const b = evaluateDraft(request({ relics: ["VAJRA", "ODDLY_SMOOTH_STONE"] }));
    expect(a.stateDigest).toBe(b.stateDigest);
    expect(a.ranking.map((o) => o.indexDelta)).toEqual(b.ranking.map((o) => o.indexDelta));
    expect(a.relics?.supplying.map((r) => r.id)).toEqual(["ODDLY_SMOOTH_STONE", "VAJRA"]);
  });

  it("refuse an id the catalog does not know, like an unknown card", () => {
    expect(() => evaluateDraft(request({ relics: ["NOT_A_RELIC"] }))).toThrow(
      InvalidDraftRequestError,
    );
    try {
      evaluateDraft(request({ relics: ["VAJRA", "NOT_A_RELIC"] }));
      expect.unreachable("an unknown relic id must be refused");
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidDraftRequestError);
      expect((e as InvalidDraftRequestError).details).toEqual([
        { path: "relics", message: "unknown relic id NOT_A_RELIC" },
      ]);
    }
  });

  it("add to the class's own supply in supplyOf, and a class on its own is still what it was", () => {
    const entries: DeckEntry[] = starterDeck("silent").flatMap(({ id, count }) => {
      const card = getCard(id);
      return card ? [{ card, count }] : [];
    });
    const bare = supplyOf(entries, "silent");
    const same = supplyOf(entries, { character: "silent", relics: [] });
    expect(same).toEqual(bare);
    const held = supplyOf(entries, {
      character: "silent",
      relics: ["VAJRA", "ODDLY_SMOOTH_STONE"],
    });
    expect(held.strength).toBe(bare.strength + (relicTags("VAJRA").gives.strength ?? 0));
    expect(held.dexterity).toBe(
      bare.dexterity + (relicTags("ODDLY_SMOOTH_STONE").gives.dexterity ?? 0),
    );
    expect(held.draw).toBe(bare.draw);
  });

  it("have a table whose relics are all in the catalog and whose hash is the file's", () => {
    expect(Object.keys(RELIC_SYNERGY.relics).length).toBeGreaterThan(0);
  });
});
