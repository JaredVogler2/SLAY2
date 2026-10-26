import { getCard } from "./catalog";
import type { PlayableClass } from "./types";

/**
 * What the opening Ancient (Neow) offers and what each option does to the run (STS2 main v0.107.1).
 *
 * Rules facts, in our own words: which relics can be offered, and the counts and amounts they change (cards added, removed,
 * transformed or upgraded, HP, max HP). They were read from the game's own source on 2026-10-26 (the event that builds the
 * offer and the relics' effect code); no text, code or art is copied (ADR-011). The advisor uses them to ask the player what
 * the option did to the deck, because several results are random and only the player saw them.
 *
 * The offer (rule ANC-2 in docs/game/MECHANICS-COVERAGE.md): one costly option is drawn first; the helpful pool then loses the
 * option it pairs with (Cursed Pearl removes Golden Pearl, Hefty Tablet removes Arcane Scroll, Leafy Poultice removes New
 * Leaf, Precarious Shears removes Precise Scissors), gains one of Lava Rock / Small Capsule (not with Large Capsule), one of
 * Nutritious Oyster / Stone Humidifier and one of Neow's Talisman / Pomander, and two helpful options are drawn from it.
 */
export type OpeningKind = "positive" | "cursed";

/** Where the cards of a `pick` step come from, which decides what the search box offers. */
export type PickSource =
  | "rare" // a Rare card of the player's class
  | "classReward" // any reward-eligible card of the player's class
  | "colorless"
  | "otherClass" // a card of one of the other four classes
  | "coop" // the multiplayer-only cards
  | "curse";

/** A basic card of the player's class that is named by role, because its id depends on the class. */
export type BasicRole = "strike" | "defend";

export type OpeningStep =
  /** Cards that are always added: catalog ids, or the roles "strike" and "defend", which resolve to the class's own cards. */
  | { readonly kind: "add"; readonly cards: readonly string[] }
  /** Cards the player chose or received at random: the player says which. */
  | {
      readonly kind: "pick";
      readonly from: PickSource;
      readonly count: number;
      readonly optional?: true;
      readonly label: string;
    }
  | { readonly kind: "remove"; readonly count: number; readonly label: string }
  /** A card turns into another. `only` fixes what is transformed (one Strike, one Defend). */
  | { readonly kind: "transform"; readonly only?: BasicRole; readonly label: string }
  /** Upgrades: fixed (`cards`) or the player's choice among the deck (`choose`). */
  | { readonly kind: "upgrade"; readonly cards: readonly BasicRole[] }
  | { readonly kind: "upgradeChosen"; readonly count: number; readonly label: string }
  | { readonly kind: "maxHp"; readonly delta: number }
  | { readonly kind: "hp"; readonly delta: number }
  /** Everything SLAY2 does not track: gold, potions, relics, later effects. Shown, not applied. */
  | { readonly kind: "info"; readonly text: string };

export interface OpeningOption {
  /** The relic's id as the game names it (UPPER_SNAKE). */
  readonly id: string;
  readonly name: string;
  readonly kind: OpeningKind;
  /** When it can show up beyond "it is in the pool". */
  readonly offeredWhen?: string;
  /** One sentence, our wording. */
  readonly summary: string;
  readonly steps: readonly OpeningStep[];
}

const info = (text: string): OpeningStep => ({ kind: "info", text });

export const OPENING_OPTIONS: readonly OpeningOption[] = [
  // ---- helpful options that are always in the pool (14)
  {
    id: "ARCANE_SCROLL",
    name: "Arcane Scroll",
    kind: "positive",
    offeredWhen: "Not offered next to Hefty Tablet.",
    summary: "Adds one random Rare card of your class to the deck.",
    steps: [{ kind: "pick", from: "rare", count: 1, label: "The Rare card you received" }],
  },
  {
    id: "BOOMING_CONCH",
    name: "Booming Conch",
    kind: "positive",
    summary:
      "On the first turn of every Elite fight you draw 2 extra cards and gain 1 extra energy.",
    steps: [info("The deck does not change.")],
  },
  {
    id: "FISHING_ROD",
    name: "Fishing Rod",
    kind: "positive",
    summary: "After every third normal fight, one random upgradable card in the deck is upgraded.",
    steps: [info("Mark each upgrade in the deck below when it happens.")],
  },
  {
    id: "GOLDEN_PEARL",
    name: "Golden Pearl",
    kind: "positive",
    offeredWhen: "Not offered next to Cursed Pearl.",
    summary: "Gives 150 gold.",
    steps: [info("+150 gold (gold is not tracked here).")],
  },
  {
    id: "KALEIDOSCOPE",
    name: "Kaleidoscope",
    kind: "positive",
    offeredWhen: "Only when all five classes are unlocked.",
    summary:
      "Two card rewards, each built from the other classes' cards; you may take one card from each.",
    steps: [
      {
        kind: "pick",
        from: "otherClass",
        count: 2,
        optional: true,
        label: "The cards you took (leave empty for a reward you skipped)",
      },
    ],
  },
  {
    id: "LEAD_PAPERWEIGHT",
    name: "Lead Paperweight",
    kind: "positive",
    summary: "Choose 1 of 2 Colorless cards to add to the deck.",
    steps: [{ kind: "pick", from: "colorless", count: 1, label: "The Colorless card you chose" }],
  },
  {
    id: "LOST_COFFER",
    name: "Lost Coffer",
    kind: "positive",
    summary: "A card reward from your class and one random potion.",
    steps: [
      {
        kind: "pick",
        from: "classReward",
        count: 1,
        optional: true,
        label: "The card you took (leave empty if you skipped)",
      },
      info("Plus a random potion."),
    ],
  },
  {
    id: "MASSIVE_SCROLL",
    name: "Massive Scroll",
    kind: "positive",
    summary: "Choose 1 of 3 co-op (multiplayer) cards to add to the deck.",
    steps: [{ kind: "pick", from: "coop", count: 1, label: "The co-op card you chose" }],
  },
  {
    id: "NEOWS_TORMENT",
    name: "Neow's Torment",
    kind: "positive",
    summary: "Adds one Neow's Fury to the deck.",
    steps: [{ kind: "add", cards: ["NEOWS_FURY"] }],
  },
  {
    id: "NEW_LEAF",
    name: "New Leaf",
    kind: "positive",
    offeredWhen: "Not offered next to Leafy Poultice.",
    summary: "Transform one card of your choice into a different card.",
    steps: [{ kind: "transform", label: "The card you transformed" }],
  },
  {
    id: "PHIAL_HOLSTER",
    name: "Phial Holster",
    kind: "positive",
    summary: "One more potion slot and two random potions.",
    steps: [info("+1 potion slot and 2 random potions. The deck does not change.")],
  },
  {
    id: "PRECISE_SCISSORS",
    name: "Precise Scissors",
    kind: "positive",
    offeredWhen: "Not offered next to Precarious Shears.",
    summary: "Remove one card of your choice from the deck.",
    steps: [{ kind: "remove", count: 1, label: "The card you removed" }],
  },
  {
    id: "SCROLL_BOXES",
    name: "Scroll Boxes",
    kind: "positive",
    summary:
      "Choose 1 of 2 packs (two Commons and an Uncommon of your class each) and add its cards to the deck.",
    steps: [
      {
        kind: "pick",
        from: "classReward",
        count: 3,
        label: "The three cards of the pack you chose",
      },
    ],
  },
  {
    id: "WINGED_BOOTS",
    name: "Winged Boots",
    kind: "positive",
    summary: "Three times you may ignore the path lines when choosing your next room.",
    steps: [info("The deck does not change.")],
  },
  // ---- helpful options that enter the pool in pairs (6)
  {
    id: "LAVA_ROCK",
    name: "Lava Rock",
    kind: "positive",
    offeredWhen: "Takes the place of Small Capsule half of the time; never next to Large Capsule.",
    summary: "The Act 1 boss drops 2 relics.",
    steps: [info("The deck does not change.")],
  },
  {
    id: "SMALL_CAPSULE",
    name: "Small Capsule",
    kind: "positive",
    offeredWhen: "Takes the place of Lava Rock half of the time; never next to Large Capsule.",
    summary: "Gives one random relic.",
    steps: [info("Plus one random relic.")],
  },
  {
    id: "NUTRITIOUS_OYSTER",
    name: "Nutritious Oyster",
    kind: "positive",
    offeredWhen: "Takes the place of Stone Humidifier half of the time.",
    summary: "Raises max HP by 11.",
    steps: [{ kind: "maxHp", delta: 11 }],
  },
  {
    id: "STONE_HUMIDIFIER",
    name: "Stone Humidifier",
    kind: "positive",
    offeredWhen: "Takes the place of Nutritious Oyster half of the time.",
    summary: "Each time you rest at a rest site, max HP rises by 5.",
    steps: [info("+5 max HP at every rest (add it yourself as it happens).")],
  },
  {
    id: "NEOWS_TALISMAN",
    name: "Neow's Talisman",
    kind: "positive",
    offeredWhen: "Takes the place of Pomander half of the time.",
    summary: "Upgrades one Strike and one Defend.",
    steps: [{ kind: "upgrade", cards: ["strike", "defend"] }],
  },
  {
    id: "POMANDER",
    name: "Pomander",
    kind: "positive",
    offeredWhen: "Takes the place of Neow's Talisman half of the time.",
    summary: "Upgrades one card of your choice.",
    steps: [{ kind: "upgradeChosen", count: 1, label: "The card you upgraded" }],
  },
  // ---- the costly option, always the third one (8)
  {
    id: "CURSED_PEARL",
    name: "Cursed Pearl",
    kind: "cursed",
    summary: "Adds the curse Greed to the deck and gives 333 gold.",
    steps: [{ kind: "add", cards: ["GREED"] }, info("+333 gold (gold is not tracked here).")],
  },
  {
    id: "HEFTY_TABLET",
    name: "Hefty Tablet",
    kind: "cursed",
    summary: "Choose 1 of 3 Rare cards to add, and add the curse Injury.",
    steps: [
      { kind: "add", cards: ["INJURY"] },
      { kind: "pick", from: "rare", count: 1, label: "The Rare card you chose" },
    ],
  },
  {
    id: "LARGE_CAPSULE",
    name: "Large Capsule",
    kind: "cursed",
    summary: "Gives 2 random relics and adds one more Strike and one more Defend.",
    steps: [{ kind: "add", cards: ["strike", "defend"] }, info("Plus 2 random relics.")],
  },
  {
    id: "LEAFY_POULTICE",
    name: "Leafy Poultice",
    kind: "cursed",
    summary: "Transforms one Strike and one Defend and costs 12 max HP.",
    steps: [
      { kind: "transform", only: "strike", label: "What your Strike became" },
      { kind: "transform", only: "defend", label: "What your Defend became" },
      { kind: "maxHp", delta: -12 },
    ],
  },
  {
    id: "NEOWS_BONES",
    name: "Neow's Bones",
    kind: "cursed",
    summary: "Gives 2 random Neow relics and adds one random curse to the deck.",
    steps: [
      { kind: "pick", from: "curse", count: 1, label: "The curse you received" },
      info(
        "Plus 2 random Neow relics: add each of them below as another thing the Ancient gave you.",
      ),
    ],
  },
  {
    id: "PRECARIOUS_SHEARS",
    name: "Precarious Shears",
    kind: "cursed",
    summary: "Removes 2 cards of your choice from the deck and costs 16 HP.",
    steps: [
      { kind: "remove", count: 2, label: "A card you removed" },
      { kind: "hp", delta: -16 },
    ],
  },
  {
    id: "SILKEN_TRESS",
    name: "Silken Tress",
    kind: "cursed",
    summary:
      "You lose all your gold, and every card in your first card reward is enchanted with Glam.",
    steps: [info("All gold is lost; the cards of your first reward carry the Glam enchantment.")],
  },
  {
    id: "SILVER_CRUCIBLE",
    name: "Silver Crucible",
    kind: "cursed",
    summary:
      "Your first three card rewards are upgraded, and the first treasure chest you open is empty.",
    steps: [
      info("The first three card rewards you see are upgraded; the first treasure chest is empty."),
    ],
  },
];

const BY_ID = new Map(OPENING_OPTIONS.map((o) => [o.id, o]));

export function getOpeningOption(id: string): OpeningOption | undefined {
  return BY_ID.get(id);
}

/** The class's own Strike or Defend, read from the catalog (their ids carry the class). */
export function basicCardId(character: PlayableClass, role: BasicRole): string {
  return `${role === "strike" ? "STRIKE" : "DEFEND"}_${character.toUpperCase()}`;
}

/** Resolve the card ids a step names for this class, refusing an id the catalog does not have. */
export function resolveStepCards(character: PlayableClass, cards: readonly string[]): string[] {
  return cards.map((c) => {
    const id = c === "strike" || c === "defend" ? basicCardId(character, c) : c;
    if (!getCard(id)) {
      throw new Error(`opening option names a card the catalog does not have: ${id}`);
    }
    return id;
  });
}
