/**
 * The two versions of Act 1 and what each can throw at a deck (STS2 main v0.107.1).
 *
 * Act 1 comes in two versions, **Overgrowth** (the one every profile starts with) and **Underdocks** (the alternate Act 1,
 * unlocked later). They share the act's length and its first Ancient (Neow) and differ in their fights: each has its own
 * three elites, three bosses and its own pool of ordinary encounters. Acts 2 and 3 have one version each (Hive, Glory).
 *
 * Facts, in our own words, read from the game's own source on 2026-10-26 (the act definitions and the monsters' hit points,
 * move cycles and powers); hit points are the Ascension 0 to 7 figures (Ascension 8 raises HP, Ascension 9 damage). Nothing
 * is copied from the game's text, code or art (ADR-011). `asks` is SLAY2's own judgement of what a fight rewards in a deck;
 * it is a heuristic input to the advisor (ADR-048), not a measurement.
 */
export const ACT1_VARIANTS = ["overgrowth", "underdocks"] as const;
export type Act1Variant = (typeof ACT1_VARIANTS)[number];

/** What a fight rewards in a deck. The advisor maps each to the coverage groups it already scores. */
export const ASKS = [
  "aoe", // several enemies, or enemies that appear when one dies
  "single-target", // one enemy that must die first while others only follow it
  "multi-hit", // many small hits beat a rule that punishes big ones
  "burst", // a hit-point threshold or a clock: kill or break it fast
  "sustained", // damage over several turns beats a per-turn cap
  "block", // large or growing incoming damage
  "setup", // free or slow turns: time to scale, draw and build
  "draw", // the number of cards played matters
] as const;
export type Ask = (typeof ASKS)[number];

export interface FightBrief {
  /** Stable id of the fight, lower-case. */
  readonly id: string;
  readonly name: string;
  readonly kind: "elite" | "boss";
  /** How many enemies stand in front of you, as a phrase. */
  readonly enemies: string;
  /** Hit points at Ascension 0 to 7. */
  readonly hp: string;
  readonly summary: string;
  readonly asks: readonly Ask[];
}

export interface Act1Brief {
  readonly variant: Act1Variant;
  readonly name: string;
  readonly alternate: boolean;
  readonly summary: string;
  readonly elites: readonly FightBrief[];
  readonly bosses: readonly FightBrief[];
  /** The easier groups of the first rooms. */
  readonly weak: readonly string[];
  /** The ordinary groups of the rest of the act. */
  readonly normal: readonly string[];
}

export const ACT1_BRIEFS: Readonly<Record<Act1Variant, Act1Brief>> = {
  overgrowth: {
    variant: "overgrowth",
    name: "Overgrowth",
    alternate: false,
    summary:
      "The jungle Act 1 every profile starts with. Many of its ordinary fights are groups, and its three elites and three bosses are listed below.",
    elites: [
      {
        id: "bygone-effigy",
        name: "Bygone Effigy",
        kind: "elite",
        enemies: "1 enemy",
        hp: "127",
        summary:
          "Does nothing on turns 1 and 2 (it wakes on turn 2 with +10 Strength), then hits for 23 every turn. Each card you play in a turn makes it take 10 % more Attack damage that turn.",
        asks: ["draw", "burst", "block"],
      },
      {
        id: "byrdonis",
        name: "Byrdonis",
        kind: "elite",
        enemies: "1 enemy",
        hp: "81 to 84",
        summary:
          "Alternates a 3 x 3 peck and a 17-damage swoop, and gains 1 Strength at the end of each of its turns: the longer it lives, the harder it hits.",
        asks: ["burst", "block"],
      },
      {
        id: "phrog-parasite",
        name: "Phrog Parasite",
        kind: "elite",
        enemies: "1 enemy, then 4 more when it dies",
        hp: "61 to 64 (its Wrigglers: 17 to 21 each)",
        summary:
          "Alternates putting 3 Infection cards in your discard pile and a 4 x 4 lash. When it dies it releases four Wrigglers that must be cleared too.",
        asks: ["aoe", "block"],
      },
    ],
    bosses: [
      {
        id: "vantom",
        name: "Vantom",
        kind: "boss",
        enemies: "1 enemy",
        hp: "173",
        summary:
          "Slippery: each of its first 8 hits that get through do only 1 damage, so many small hits strip it quickly and one big hit is wasted early. It cycles 7 damage, a 6 x 2 lance, Dismember (26 damage and 3 Wounds in your discard pile) and a Strength-gaining turn.",
        asks: ["multi-hit", "block"],
      },
      {
        id: "ceremonial-beast",
        name: "Ceremonial Beast",
        kind: "boss",
        enemies: "1 enemy",
        hp: "252",
        summary:
          "Is stunned the first time it falls to 150 HP or less. On some turns you can play only 1 card, and it keeps gaining Strength (Plow 18, Stomp 15, Crush 17 with +3 Strength).",
        asks: ["burst", "block"],
      },
      {
        id: "the-kin",
        name: "The Kin",
        kind: "boss",
        enemies: "3 enemies: a Priest and two Followers",
        hp: "Priest 190, Followers 58 to 59",
        summary:
          "The Followers are Minions that leave the fight when the Priest dies. The Priest cycles Frail and Weak orbs, a 3 x 3 beam and a Strength gain; the Followers slash, boomerang and gain Strength.",
        asks: ["single-target", "block"],
      },
    ],
    weak: ["Fuzzy Wurm Crawler", "Nibbits (one)", "Shrinker Beetle", "Slimes (three)"],
    normal: [
      "Cubex Construct",
      "Flyconid",
      "Fogmog",
      "Inklets (three)",
      "Mawler",
      "Nibbits (two)",
      "Overgrowth Crawlers (two)",
      "Ruby Raiders (three)",
      "Slimes (a mixed group)",
      "Slithering Strangler with a Snapping Jaxfruit",
      "Snapping Jaxfruit with a Flyconid",
      "Vine Shambler",
    ],
  },
  underdocks: {
    variant: "underdocks",
    name: "Underdocks",
    alternate: true,
    summary:
      "The alternate Act 1, unlocked after Overgrowth. Different elites, different bosses and a different pool of ordinary fights.",
    elites: [
      {
        id: "phantasmal-gardeners",
        name: "Phantasmal Gardeners",
        kind: "elite",
        enemies: "4 enemies",
        hp: "26 to 31 each",
        summary:
          "Four small enemies that cycle bite, lash, flail and a Strength-gaining enlarge. The first time each one is hit in a turn it gains Block.",
        asks: ["aoe", "multi-hit"],
      },
      {
        id: "skulking-colony",
        name: "Skulking Colony",
        kind: "elite",
        enemies: "1 enemy",
        hp: "75",
        summary:
          "Hardened Shell: it cannot lose more than 20 HP in a turn, so burst beyond that is wasted. It cycles two 14-damage zooms, a 9-damage hit that adds Strength, and piercing stabs.",
        asks: ["sustained", "block"],
      },
      {
        id: "terror-eel",
        name: "Terror Eel",
        kind: "elite",
        enemies: "1 enemy",
        hp: "140",
        summary:
          "Is stunned the first time it falls to half its HP, and right after that puts a very long Vulnerable on you, so you take extra damage for the rest of the fight. Otherwise it crashes for 16 and thrashes while gaining Vigor.",
        asks: ["block", "burst"],
      },
    ],
    bosses: [
      {
        id: "waterfall-giant",
        name: "Waterfall Giant",
        kind: "boss",
        enemies: "1 enemy",
        hp: "240",
        summary:
          "Builds Steam Eruption as it fights and can heal itself; when it dies, that damage hits you at the end of your next turn. Keep Block ready for the finish.",
        asks: ["block", "sustained"],
      },
      {
        id: "soul-fysh",
        name: "Soul Fysh",
        kind: "boss",
        enemies: "1 enemy",
        hp: "211",
        summary:
          "Puts Beckon cards in your hand (each costs 1 energy to play away and hurts you for 6 if left in hand at the end of the turn), screams Vulnerable at you, and becomes Intangible for stretches (all damage to it drops to 1).",
        asks: ["multi-hit", "draw"],
      },
      {
        id: "lagavulin-matriarch",
        name: "Lagavulin Matriarch",
        kind: "boss",
        enemies: "1 enemy",
        hp: "222",
        summary:
          "Starts asleep behind Plating (12) and wakes after 3 turns or as soon as damage gets through. Awake, she hits hard and her Soul Siphon takes 2 Strength and 2 Dexterity from you.",
        asks: ["setup", "block"],
      },
    ],
    weak: ["Corpse Slugs (two)", "Seapunk", "Sludge Spinner", "Toadpoles (two)"],
    normal: [
      "Corpse Slugs (three)",
      "Cultists (a Calcified and a Damp)",
      "Fossil Stalker",
      "Gremlin Merc",
      "Haunted Ship",
      "Living Fog",
      "Punch Construct",
      "Seapunk with a Calcified Cultist",
      "Sewer Clam",
      "Two-Tailed Rats (three)",
    ],
  },
};

export function isAct1Variant(x: unknown): x is Act1Variant {
  return typeof x === "string" && (ACT1_VARIANTS as readonly string[]).includes(x);
}

export function act1Fights(variant: Act1Variant): readonly FightBrief[] {
  const brief = ACT1_BRIEFS[variant];
  return [...brief.elites, ...brief.bosses];
}

export function getAct1Boss(variant: Act1Variant, id: string): FightBrief | undefined {
  return ACT1_BRIEFS[variant].bosses.find((b) => b.id === id);
}

/** Every Act 1 boss id of either version, for validating a saved run. */
export const ACT1_BOSS_IDS: readonly string[] = ACT1_VARIANTS.flatMap((v) =>
  ACT1_BRIEFS[v].bosses.map((b) => b.id),
);
