import { describe, expect, it } from "vitest";

import { CHARACTER_FACTS, type PlayableClass } from "@slay2/game-data";

import { evaluateDraft } from "../src";

/**
 * Deck situations an experienced player can judge without a calculator. Two kinds of check:
 *  - a twin: the same card is worth more to the deck that supplies what it needs (or uses what it supplies) than to the
 *    deck that does not;
 *  - an order: given a deck and an offer, which card comes first.
 * They are written from how the cards work, before looking at the advisor's numbers; a failing one is either a wrong tag
 * or a wrong expectation, and the fix says which.
 */
type Extras = Readonly<Record<string, number>>;

function deckOf(cls: PlayableClass, extras: Extras = {}) {
  const facts = CHARACTER_FACTS.find((c) => c.id === cls);
  if (!facts) throw new Error(`no class ${cls}`);
  const counts = new Map(facts.startingDeck.map((c) => [c.id, c.count]));
  for (const [id, n] of Object.entries(extras)) counts.set(id, (counts.get(id) ?? 0) + n);
  return [...counts.entries()].map(([id, count]) => ({ id, count }));
}

function rank(cls: PlayableClass, extras: Extras, offered: string[], act: 0 | 1 | 2 = 0) {
  const r = evaluateDraft({
    build: "sts2-main-0.107.1",
    character: cls,
    ascension: 0,
    actIndex: act,
    deck: deckOf(cls, extras),
    offered,
    source: "regular",
    riskPreference: "balanced",
  });
  const score = new Map<string, number>();
  for (const o of r.ranking)
    score.set(o.action.kind === "skip" ? "SKIP" : o.action.cardId, o.indexDelta);
  return {
    score,
    order: r.ranking.map((o) => (o.action.kind === "skip" ? "SKIP" : o.action.cardId)),
    response: r,
  };
}

/** The synergy part of the card's index: what its needs, its scalers and its engines add, as the advisor reports it. */
function worth(cls: PlayableClass, extras: Extras, card: string, act: 0 | 1 | 2 = 0): number {
  const option = rank(cls, extras, [card], act).response.ranking.find(
    (o) => o.action.kind === "pick" && o.action.cardId === card,
  );
  if (!option) throw new Error("no option");
  return option.reasons.filter((r) => r.kind === "synergy").reduce((acc, r) => acc + r.delta, 0);
}

interface Twin {
  readonly name: string;
  readonly cls: PlayableClass;
  readonly card: string;
  readonly supported: Extras;
  readonly bare: Extras;
  /** The smallest number of index points of synergy the supported deck must be ahead by (default 0.5). */
  readonly margin?: number;
  readonly act?: 0 | 1 | 2;
}

interface Order {
  readonly name: string;
  readonly cls: PlayableClass;
  readonly extras: Extras;
  readonly offered: string[];
  readonly first: string;
  /** Cards that must score below skipping. */
  readonly belowSkip?: string[];
  readonly act?: 0 | 1 | 2;
}

const TWINS: Twin[] = [
  // ---- Ironclad
  {
    name: "Dark Embrace is worth more with exhaust cards",
    cls: "ironclad",
    card: "DARK_EMBRACE",
    supported: { FEEL_NO_PAIN: 1, TRUE_GRIT: 1, BURNING_PACT: 1 },
    bare: {},
  },
  {
    name: "Feel No Pain is worth more with exhaust cards",
    cls: "ironclad",
    card: "FEEL_NO_PAIN",
    supported: { BURNING_PACT: 1, TRUE_GRIT: 1, HAVOC: 1 },
    bare: {},
  },
  {
    name: "Burning Pact is worth more to an exhaust deck than to a bare one",
    cls: "ironclad",
    card: "BURNING_PACT",
    supported: { FEEL_NO_PAIN: 1, DARK_EMBRACE: 1 },
    bare: {},
  },
  {
    name: "Inflame is worth more with several multi-hit attacks",
    cls: "ironclad",
    card: "INFLAME",
    supported: { TWIN_STRIKE: 1, SWORD_BOOMERANG: 1, CONFLAGRATION: 1 },
    bare: { BLUDGEON: 1, SHRUG_IT_OFF: 1, TRUE_GRIT: 1 },
  },
  {
    name: "Twin Strike is worth more with Strength",
    cls: "ironclad",
    card: "TWIN_STRIKE",
    supported: { INFLAME: 1, DEMON_FORM: 1 },
    bare: {},
  },
  {
    name: "Juggernaut is worth more with many block cards",
    cls: "ironclad",
    card: "JUGGERNAUT",
    supported: { SHRUG_IT_OFF: 1, IRON_WAVE: 1, FLAME_BARRIER: 1, TRUE_GRIT: 1, BLOOD_WALL: 1 },
    bare: {},
  },
  {
    name: "Bloodletting is worth more with Rupture",
    cls: "ironclad",
    card: "BLOODLETTING",
    supported: { RUPTURE: 1, INFERNO: 1 },
    bare: {},
  },
  {
    name: "Perfected Strike is worth more with more Strike cards",
    cls: "ironclad",
    card: "PERFECTED_STRIKE",
    supported: { TWIN_STRIKE: 1, POMMEL_STRIKE: 1, SETUP_STRIKE: 1 },
    bare: { SHRUG_IT_OFF: 1 },
    margin: 0.2,
  },
  {
    name: "Cruelty is worth more with several ways to apply Vulnerable",
    cls: "ironclad",
    card: "CRUELTY",
    supported: { THUNDERCLAP: 1, TREMBLE: 1, TAUNT: 1 },
    bare: {},
  },
  {
    name: "Stomp is worth more in a deck of attacks",
    cls: "ironclad",
    card: "STOMP",
    supported: { TWIN_STRIKE: 1, SWORD_BOOMERANG: 1, POMMEL_STRIKE: 1, HEADBUTT: 1 },
    bare: { SHRUG_IT_OFF: 1, TRUE_GRIT: 1, FLAME_BARRIER: 1, IRON_WAVE: 1 },
    margin: 0.3,
  },
  // ---- Silent
  {
    name: "Accuracy is worth more with Shiv makers",
    cls: "silent",
    card: "ACCURACY",
    supported: { BLADE_DANCE: 2, CLOAK_AND_DAGGER: 1 },
    bare: {},
  },
  {
    name: "Outbreak is worth more with Poison",
    cls: "silent",
    card: "OUTBREAK",
    supported: { NOXIOUS_FUMES: 1, DEADLY_POISON: 1 },
    bare: {},
  },
  {
    name: "Memento Mori is worth more with ways to discard",
    cls: "silent",
    card: "MEMENTO_MORI",
    supported: { ACROBATICS: 1, PREPARED: 1, DAGGER_THROW: 1 },
    bare: {},
  },
  {
    name: "Flechettes is worth more in a deck of Skills",
    cls: "silent",
    card: "FLECHETTES",
    supported: { BACKFLIP: 1, BLUR: 1, DEFLECT: 1, LEG_SWEEP: 1 },
    bare: { DAGGER_SPRAY: 1, SLICE: 1, SUCKER_PUNCH: 1, DASH: 1 },
  },
  {
    name: "Afterimage is worth more with many cheap cards",
    cls: "silent",
    card: "AFTERIMAGE",
    supported: { SLICE: 2, DEFLECT: 2, PREPARED: 1 },
    bare: { HAZE: 1, REFLEX: 1, PINPOINT: 1 },
    margin: 0.3,
  },
  {
    name: "Noxious Fumes is worth more with Poison payoffs",
    cls: "silent",
    card: "NOXIOUS_FUMES",
    supported: { OUTBREAK: 1, ACCELERANT: 1, MIRAGE: 1 },
    bare: {},
  },
  {
    name: "Speedster is worth more with card draw",
    cls: "silent",
    card: "SPEEDSTER",
    supported: { ACROBATICS: 1, BACKFLIP: 1, EXPERTISE: 1 },
    bare: {},
  },
  {
    name: "Footwork is worth more with many Block cards",
    cls: "silent",
    card: "FOOTWORK",
    supported: { BACKFLIP: 1, BLUR: 1, DEFLECT: 1, UNTOUCHABLE: 1 },
    bare: { SLICE: 1, DASH: 1, DAGGER_SPRAY: 1, SUCKER_PUNCH: 1 },
  },
  {
    name: "Blade Dance is worth more with Shiv payoffs",
    cls: "silent",
    card: "BLADE_DANCE",
    supported: { ACCURACY: 1, PHANTOM_BLADES: 1 },
    bare: {},
  },
  // ---- Regent
  {
    name: "Parry is worth more when Forge is plentiful",
    cls: "regent",
    card: "PARRY",
    supported: { FURNACE: 1, REFINE_BLADE: 1, SUMMON_FORTH: 1 },
    bare: {},
  },
  {
    name: "Black Hole is worth more with a supply of Stars",
    cls: "regent",
    card: "BLACK_HOLE",
    supported: { GENESIS: 1, GLOW: 1, GATHER_LIGHT: 1 },
    bare: {},
  },
  {
    name: "Pillar of Creation is worth more with card creation",
    cls: "regent",
    card: "PILLAR_OF_CREATION",
    supported: { QUASAR: 1, BUNDLE_OF_JOY: 1, COLLISION_COURSE: 1 },
    bare: {},
  },
  {
    name: "Comet is worth more with Stars to spend",
    cls: "regent",
    card: "COMET",
    supported: { GENESIS: 1, ROYAL_GAMBLE: 1, HIDDEN_CACHE: 1 },
    bare: {},
    // the Regent's starting relic already gives Stars every combat, so the bare deck is less bare than for other cards
    margin: 0.3,
  },
  {
    name: "Lunar Blast is worth more in a deck of Skills",
    cls: "regent",
    card: "LUNAR_BLAST",
    supported: { GATHER_LIGHT: 1, GLITTERSTREAM: 1, HIDDEN_CACHE: 1, REFINE_BLADE: 1 },
    bare: { SOLAR_STRIKE: 1, GUIDING_STAR: 1, PHOTON_CUT: 1, ASTRAL_PULSE: 1 },
  },
  {
    name: "Furnace is worth more with Sovereign Blade payoffs",
    cls: "regent",
    card: "FURNACE",
    supported: { PARRY: 1, SWORD_SAGE: 1 },
    bare: {},
  },
  // ---- Necrobinder
  // (the Osty cards are not here: Osty is always there, see "what a starting relic already gives" below. The first version of
  // this list had "Flatten is worth more with Osty summoners" and "Reanimate is worth more with Osty attackers"; simulated runs
  // showed no such dependence and the table was corrected, ADR-050.)
  {
    name: "Times Up is worth more with Doom",
    cls: "necrobinder",
    card: "TIMES_UP",
    supported: { COUNTDOWN: 1, DEATHBRINGER: 1, NO_ESCAPE: 1 },
    bare: {},
  },
  {
    name: "Pull From Below is worth more with Ethereal cards",
    cls: "necrobinder",
    card: "PULL_FROM_BELOW",
    supported: { DEFILE: 1, FEAR: 1, PARSE: 1 },
    bare: {},
  },
  {
    name: "Haunt is worth more with Souls",
    cls: "necrobinder",
    card: "HAUNT",
    supported: { CAPTURE_SPIRIT: 1, SEVERANCE: 1, GRAVE_WARDEN: 1 },
    bare: {},
  },
  {
    name: "Countdown is worth more with Doom payoffs",
    cls: "necrobinder",
    card: "COUNTDOWN",
    supported: { TIMES_UP: 1, SHROUD: 1, DEATHS_DOOR: 1 },
    bare: {},
  },
  {
    name: "Death March is worth more with card draw",
    cls: "necrobinder",
    card: "DEATH_MARCH",
    supported: { PARSE: 1, SCOURGE: 1, DEMESNE: 1 },
    bare: {},
  },
  // ---- Defect
  {
    name: "Loop is worth more with several orbs",
    cls: "defect",
    card: "LOOP",
    supported: { GLACIER: 1, BALL_LIGHTNING: 1, COLD_SNAP: 1 },
    bare: {},
  },
  {
    name: "Hailstorm is worth more with Frost makers",
    cls: "defect",
    card: "HAILSTORM",
    supported: { GLACIER: 1, COLD_SNAP: 1, COOLHEADED: 1 },
    bare: {},
  },
  {
    name: "Storm is worth more with several Powers",
    cls: "defect",
    card: "STORM",
    supported: { DEFRAGMENT: 1, LOOP: 1, CAPACITOR: 1 },
    bare: {},
  },
  {
    name: "All For One is worth more with free cards",
    cls: "defect",
    card: "ALL_FOR_ONE",
    supported: { CLAW: 2, BEAM_CELL: 1, GO_FOR_THE_EYES: 1 },
    bare: {},
  },
  {
    name: "Ice Lance is worth more with orb payoffs",
    cls: "defect",
    card: "ICE_LANCE",
    supported: { LOOP: 1, HAILSTORM: 1, COOLANT: 1 },
    bare: {},
  },
  {
    name: "Defragment is worth more with many orbs",
    cls: "defect",
    card: "DEFRAGMENT",
    supported: { GLACIER: 1, BALL_LIGHTNING: 1, COLD_SNAP: 1 },
    bare: {},
  },
];

const ORDERS: Order[] = [
  {
    name: "an unsupported exhaust payoff loses to a plain good card and to Inflame",
    cls: "ironclad",
    extras: {},
    offered: ["DARK_EMBRACE", "INFLAME", "BURNING_PACT"],
    first: "INFLAME",
  },
  {
    name: "Inflame leads when the deck is full of multi-hit attacks",
    cls: "ironclad",
    extras: { TWIN_STRIKE: 1, SWORD_BOOMERANG: 1, WHIRLWIND: 1 },
    offered: ["INFLAME", "POMMEL_STRIKE", "BARRICADE"],
    first: "INFLAME",
  },
  {
    name: "Barricade without block cards is not the pick",
    cls: "ironclad",
    extras: {},
    offered: ["BARRICADE", "SHRUG_IT_OFF"],
    first: "SHRUG_IT_OFF",
  },
  {
    name: "an exhaust deck takes Dark Embrace over a plain attack",
    cls: "ironclad",
    extras: { FEEL_NO_PAIN: 1, TRUE_GRIT: 1, BURNING_PACT: 1, HAVOC: 1 },
    offered: ["DARK_EMBRACE", "ANGER"],
    first: "DARK_EMBRACE",
  },
  {
    name: "a poison deck takes Outbreak over a plain draw card",
    cls: "silent",
    extras: { NOXIOUS_FUMES: 1, DEADLY_POISON: 1 },
    offered: ["OUTBREAK", "BACKFLIP", "ACCURACY"],
    first: "OUTBREAK",
    belowSkip: ["ACCURACY"],
  },
  {
    name: "a shiv deck takes Accuracy and leaves Outbreak",
    cls: "silent",
    extras: { BLADE_DANCE: 2, CLOAK_AND_DAGGER: 1 },
    offered: ["ACCURACY", "BACKFLIP", "OUTBREAK"],
    first: "ACCURACY",
    belowSkip: ["OUTBREAK"],
  },
  {
    name: "a starting Silent does not take an unsupported Shiv payoff",
    cls: "silent",
    extras: {},
    offered: ["PHANTOM_BLADES", "BACKFLIP"],
    first: "BACKFLIP",
  },
  {
    name: "an orb deck takes Loop over Skim",
    cls: "defect",
    extras: { GLACIER: 1, BALL_LIGHTNING: 1, COLD_SNAP: 1, COOLHEADED: 1 },
    offered: ["LOOP", "SKIM", "SUBROUTINE"],
    first: "LOOP",
  },
  {
    name: "a starting Defect prefers Skim to a Power that needs Powers",
    cls: "defect",
    extras: {},
    offered: ["STORM", "SKIM"],
    first: "SKIM",
  },
  {
    name: "a starting Necrobinder does not take a Doom payoff with no Doom",
    cls: "necrobinder",
    extras: {},
    offered: ["TIMES_UP", "REAVE"],
    first: "REAVE",
  },
  {
    name: "a Doom deck takes the payoff",
    cls: "necrobinder",
    extras: { COUNTDOWN: 1, DEATHBRINGER: 1, BLIGHT_STRIKE: 1 },
    offered: ["TIMES_UP", "REAVE", "DEFY"],
    first: "TIMES_UP",
  },
  {
    name: "a Forge deck takes Parry",
    cls: "regent",
    extras: { FURNACE: 1, REFINE_BLADE: 1, SPOILS_OF_BATTLE: 1 },
    offered: ["PARRY", "CLOAK_OF_STARS", "COSMIC_INDIFFERENCE"],
    first: "PARRY",
  },
];

describe("synergy: the same card is worth more where its partners are", () => {
  for (const t of TWINS) {
    it(t.name, () => {
      const a = worth(t.cls, t.supported, t.card, t.act ?? 0);
      const b = worth(t.cls, t.bare, t.card, t.act ?? 0);
      expect(
        a - b,
        `${t.card}: synergy ${a.toFixed(2)} where supported, ${b.toFixed(2)} where bare`,
      ).toBeGreaterThanOrEqual(t.margin ?? 0.5);
    });
  }
});

describe("synergy: what an experienced player would pick", () => {
  for (const o of ORDERS) {
    it(o.name, () => {
      const r = rank(o.cls, o.extras, o.offered, o.act ?? 0);
      expect(
        r.order[0],
        JSON.stringify([...r.score.entries()].map(([k, v]) => [k, Number(v.toFixed(2))])),
      ).toBe(o.first);
      for (const id of o.belowSkip ?? []) expect(r.score.get(id) ?? 0, id).toBeLessThan(0);
    });
  }
});

describe("synergy: how the advisor says it", () => {
  it("names the cards a payoff leans on and the cards that supply it", () => {
    const r = rank("ironclad", { TRUE_GRIT: 1 }, ["DARK_EMBRACE"]);
    const text = r.response.ranking[0]?.reasons.map((x) => x.text).join(" ") ?? "";
    expect(text).toMatch(/Dark Embrace needs Exhaust \(from True Grit\)/);
  });

  it("says when a payoff has nothing to lean on", () => {
    const r = rank("ironclad", {}, ["FEEL_NO_PAIN"]);
    const text = r.response.ranking[0]?.reasons.map((x) => x.text).join(" ") ?? "";
    expect(text).toMatch(/needs Exhaust \(nothing in your deck yet\)/);
  });

  it("credits a source for the engine it completes, naming both sides", () => {
    const r = rank("silent", { OUTBREAK: 1 }, ["NOXIOUS_FUMES"]);
    const reasons = r.response.ranking[0]?.reasons.filter((x) => x.kind === "synergy") ?? [];
    expect(reasons.map((x) => x.text).join(" ")).toMatch(
      /Poison engine \(Noxious Fumes supplies it; Outbreak uses it\)/,
    );
  });

  it("credits Strength with the attacks it makes hit harder", () => {
    const r = rank("ironclad", { TWIN_STRIKE: 1 }, ["INFLAME"]);
    const text = r.response.ranking[0]?.reasons.map((x) => x.text).join(" ") ?? "";
    expect(text).toMatch(/Strength makes .*Twin Strike.* hit harder/);
  });

  it("changes nothing for a plain card in a plain deck", () => {
    const r = rank("silent", {}, ["SLICE"]);
    const synergy = r.response.ranking[0]?.reasons.filter((x) => x.kind === "synergy") ?? [];
    expect(synergy).toEqual([]);
  });
});

describe("synergy: what a starting relic already gives", () => {
  it("does not hold an Osty card back in a deck with no other Osty card (the Necrobinder's Bound Phylactery summons Osty every combat)", () => {
    const r = rank("necrobinder", {}, ["POKE", "FLATTEN"]);
    for (const o of r.response.ranking) {
      const synergy = o.reasons.filter((x) => x.kind === "synergy");
      expect(synergy.map((x) => x.text)).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/held back/)]),
      );
    }
    expect(r.response.deckSynergy.waiting).toEqual([]);
  });

  it("names the relic as the source of a need it meets, for a class that needs it to be there (Stars for the Regent)", () => {
    const r = rank("regent", {}, ["COMET"]);
    const text = r.response.ranking[0]?.reasons.map((x) => x.text).join(" ") ?? "";
    expect(text).toMatch(/Stars \(from Divine Right/);
  });

  it("does not make Kingly Punch wait for card draw: it grows each time it is drawn, and is strong without help", () => {
    const bare = worth("regent", {}, "KINGLY_PUNCH");
    expect(bare).toBeGreaterThan(-0.05);
  });
});
