import {
  CATALOG,
  MECHANICS,
  MECHANIC_IDS,
  RELIC_CATALOG,
  RELIC_SYNERGY,
  SYNERGY,
  getCard,
  synergyTags,
  type MechanicId,
} from "@slay2/game-data";

import synergyEvidence from "@/content/synergy.generated.json";
import { allSets, type CardValueSet } from "@/lib/cardvalues";
import { INSIGHTS } from "@/lib/insights";
import { NEOW } from "@/lib/neow";

/**
 * The parts of the insights page that need the card catalog, the synergy table or the measured values. These modules are only ever
 * imported by server components, so none of it is sent to the browser except what a client component is handed as props (the atlas).
 */

const LABEL: Record<string, string> = {
  ironclad: "Ironclad",
  silent: "Silent",
  regent: "Regent",
  necrobinder: "Necrobinder",
  defect: "Defect",
  colorless: "Colorless",
};
export const CLASS_IDS = ["ironclad", "silent", "regent", "necrobinder", "defect"] as const;
export const classLabel = (id: string): string => LABEL[id] ?? id;

// ---- where measured and hand-written ratings disagree

export interface Surprise {
  readonly id: string;
  readonly name: string;
  readonly beta: number;
  readonly ci95: readonly number[];
  readonly games: number;
  /** 1 is the best of the class's measured cards */
  readonly ratedRank: number;
  readonly measuredRank: number;
}

export interface ClassSurprises {
  readonly character: string;
  readonly label: string;
  readonly set: {
    readonly games: number;
    readonly bossFights: number;
    readonly relicsKept: boolean;
    readonly cards: number;
    readonly spearman: number | null;
  };
  readonly better: readonly Surprise[];
  readonly worse: readonly Surprise[];
}

const MIN_GAMES = 200;
const SHOWN = 4;

export function surprisesFor(set: CardValueSet): ClassSurprises {
  const pool = set.cards.filter((c) => c.staticRating !== null && c.gamesWithCard >= MIN_GAMES);
  const rank = (key: (c: (typeof pool)[number]) => number): Map<string, number> =>
    new Map(
      [...pool]
        .sort((a, b) => key(b) - key(a) || a.id.localeCompare(b.id))
        .map((c, i) => [c.id, i + 1]),
    );
  const ratedRank = rank((c) => c.staticRating ?? 0);
  const measuredRank = rank((c) => c.beta);
  // a card is listed as worth more than its rating only if even the low end of its interval ranks far above its rating, and as worth less only if
  // even the high end ranks far below it: noise in a card's value cannot put it on a list
  const lowRank = rank((c) => c.ci95[0] ?? c.beta);
  const highRank = rank((c) => c.ci95[1] ?? c.beta);
  const rows = pool.map((c) => ({
    surprise: {
      id: c.id,
      name: getCard(c.id)?.name ?? c.id,
      beta: c.beta,
      ci95: c.ci95,
      games: c.gamesWithCard,
      ratedRank: ratedRank.get(c.id) ?? 0,
      measuredRank: measuredRank.get(c.id) ?? 0,
    } satisfies Surprise,
    gapLow: (ratedRank.get(c.id) ?? 0) - (lowRank.get(c.id) ?? 0),
    gapHigh: (ratedRank.get(c.id) ?? 0) - (highRank.get(c.id) ?? 0),
  }));
  // far enough to mean something: at least 15 % of the class's measured cards, and never fewer than three places
  const far = Math.max(3, Math.ceil(pool.length * 0.15));
  const better = [...rows]
    .filter((r) => r.gapLow >= far)
    .sort((a, b) => b.gapLow - a.gapLow || a.surprise.id.localeCompare(b.surprise.id))
    .slice(0, SHOWN);
  const worse = [...rows]
    .filter((r) => r.gapHigh <= -far)
    .sort((a, b) => a.gapHigh - b.gapHigh || a.surprise.id.localeCompare(b.surprise.id))
    .slice(0, SHOWN);
  return {
    character: set.character,
    label: classLabel(set.character),
    set: {
      games: set.games,
      bossFights: set.bossFights,
      relicsKept: set.relicsKept,
      cards: pool.length,
      spearman: set.spearmanWithStaticRating,
    },
    better: better.map((r) => r.surprise),
    worse: worse.map((r) => r.surprise),
  };
}

export function allSurprises(): readonly ClassSurprises[] {
  const sets = allSets();
  return CLASS_IDS.flatMap((id) => {
    const set = sets.find((s) => s.character === id);
    return set ? [surprisesFor(set)] : [];
  });
}

// ---- the synergy atlas (handed to a client component as props)

export interface AtlasCard {
  readonly id: string;
  readonly name: string;
  readonly cls: string;
  /** 1 to 3: how much the card supplies the mechanic, or how much its worth depends on it */
  readonly level: number;
}

export interface AtlasMechanic {
  readonly id: string;
  readonly label: string;
  readonly about: string;
  readonly measured: {
    readonly decks: number;
    readonly ratio: number;
    readonly ci95: readonly number[];
  } | null;
  readonly suppliers: readonly AtlasCard[];
  readonly payoffs: readonly AtlasCard[];
}

/** The mechanics that are counted from a card's type, cost or name rather than read from what it does: they say nothing a player could act on. */
const SHAPE = new Set<MechanicId>(["attack", "skill", "power", "cheap", "zero_cost", "strike"]);
const PLAYABLE = new Set<string>([...CLASS_IDS, "colorless"]);

export function atlasData(): readonly AtlasMechanic[] {
  const measured = new Map(
    synergyEvidence.b1.mechanics.rows.map((r) => [
      r.mechanic,
      { decks: r.decks, ratio: r.ratio.toQuality, ci95: r.ratio.ci95 },
    ]),
  );
  const cards = CATALOG.cards.filter((c) => PLAYABLE.has(c.class));
  return MECHANIC_IDS.filter((m) => !SHAPE.has(m)).map((m) => {
    const suppliers: AtlasCard[] = [];
    const payoffs: AtlasCard[] = [];
    for (const card of cards) {
      const tags = synergyTags(card);
      const gives = tags.gives[m] ?? 0;
      const wants = tags.wants[m] ?? 0;
      if (gives > 0)
        suppliers.push({
          id: card.id,
          name: card.name,
          cls: card.class,
          level: Math.min(3, gives),
        });
      if (wants > 0)
        payoffs.push({ id: card.id, name: card.name, cls: card.class, level: Math.min(3, wants) });
    }
    const order = (a: AtlasCard, b: AtlasCard): number =>
      b.level - a.level || a.name.localeCompare(b.name);
    const meta = MECHANICS[m];
    return {
      id: m,
      label: meta.label,
      about: meta.about,
      measured: measured.get(m) ?? null,
      suppliers: suppliers.sort(order),
      payoffs: payoffs.sort(order),
    };
  });
}

// ---- what the site captures of each part of the game

export type CoverageStatus = "full" | "partial" | "none" | "na";
export interface CoverageCell {
  readonly status: CoverageStatus;
  readonly text: string;
}
export interface CoverageRow {
  readonly id: string;
  readonly label: string;
  /** how many of them the game has, where that is a count */
  readonly inGame: string;
  readonly facts: CoverageCell;
  readonly odds: CoverageCell;
  readonly measured: CoverageCell;
  readonly tested: CoverageCell;
  readonly advice: CoverageCell;
}

const cell = (status: CoverageStatus, text: string): CoverageCell => ({ status, text });

export function coverageRows(): readonly CoverageRow[] {
  const inv = INSIGHTS.inventory.counts;
  const measuredCards = allSets().reduce((n, s) => n + s.cards.length, 0);
  const taggedCards = Object.keys(SYNERGY.cards).length;
  const taggedRelics = Object.keys(RELIC_SYNERGY.relics).length;
  const openingRelics = NEOW.values?.relics.length ?? 0;
  const bosses = inv.monsters.byType.Boss;
  const elites = inv.monsters.byType.Elite;
  return [
    {
      id: "cards",
      label: "Cards",
      inGame: String(inv.cards.total),
      facts: cell(
        "full",
        `${String(CATALOG.cards.length)} in the catalog: id, name, class, rarity, cost, type`,
      ),
      odds: cell(
        "full",
        "Reward rarity with the hidden counter, upgrades, shop prices, removal cost",
      ),
      measured: cell(
        "partial",
        `A value for ${String(measuredCards)} cards across the five classes, and ${String(taggedCards)} cards tagged for synergy (a judgement)`,
      ),
      tested: cell("full", "The card values and the synergy term, on held-out seeds"),
      advice: cell("full", "The draft advisor"),
    },
    {
      id: "relics",
      label: "Relics",
      inGame: String(inv.relics.total),
      facts: cell("full", `${String(RELIC_CATALOG.relics.length)} in the catalog: tier and pools`),
      odds: cell("partial", "What the merchant and the chests offer, not what each relic does"),
      measured: cell(
        "partial",
        `${String(openingRelics)} opening relics valued; ${String(taggedRelics)} relics tagged for synergy (a judgement)`,
      ),
      tested: cell("partial", "The opening-relic rule, on held-out seeds"),
      advice: cell(
        "partial",
        "The opening relic; relics you hold count as suppliers. No boss, shop or chest advice",
      ),
    },
    {
      id: "potions",
      label: "Potions",
      inGame: String(inv.potions.total),
      facts: cell("none", "No catalog"),
      odds: cell("full", "How often a fight drops one, and its rarity"),
      measured: cell("none", "Not measured"),
      tested: cell("none", "Not tested"),
      advice: cell("none", "None"),
    },
    {
      id: "events",
      label: "Events",
      inGame: String(inv.events.total),
      facts: cell("none", "No catalog"),
      odds: cell("partial", `How often a "?" room is an event, not what each event offers`),
      measured: cell("none", "Not measured"),
      tested: cell("none", "Not tested"),
      advice: cell("none", "None"),
    },
    {
      id: "enchantments",
      label: "Enchantments",
      inGame: String(inv.enchantments.total),
      facts: cell("none", "No catalog"),
      odds: cell("none", "Not covered"),
      measured: cell("none", "Not measured"),
      tested: cell("none", "Not tested"),
      advice: cell("none", "The deck cannot record an enchanted card"),
    },
    {
      id: "monsters",
      label: "Enemies",
      inGame: `${String(inv.monsters.total)} (${String(bosses)} bosses, ${String(elites)} elites)`,
      facts: cell(
        "none",
        "No catalog; the two Act 1 versions' elites and bosses are named in the advisor",
      ),
      odds: cell("none", "Not covered"),
      measured: cell("partial", "Which enemies end simulated runs (below)"),
      tested: cell("none", "Not tested"),
      advice: cell("partial", "The Act 1 version tilts the ranking: a judgement"),
    },
    {
      id: "ancients",
      label: "Ancients (the start of each act)",
      inGame: "1 per act",
      facts: cell(
        "partial",
        "The opening event's options and their effects; the later two are not covered",
      ),
      odds: cell("partial", "The opening event's offer"),
      measured: cell("partial", "The opening relics only"),
      tested: cell("partial", "The opening-relic rule only"),
      advice: cell("partial", "The opening relic only"),
    },
    {
      id: "map",
      label: "The map and routes",
      inGame: "3 acts",
      facts: cell("full", "Layout, room counts and placement rules"),
      odds: cell("full", "Route Lab: what the next rooms hold, exactly"),
      measured: cell(
        "partial",
        "Route and rest thresholds tuned, in a game without relics from elites",
      ),
      tested: cell("partial", "The tuned thresholds, in that game"),
      advice: cell("partial", "Route Lab compares routes; it does not choose one"),
    },
    {
      id: "shops",
      label: "Shops",
      inGame: "3 per act",
      facts: cell("full", "Stock, prices and card-removal cost"),
      odds: cell("full", "Exact prices and odds"),
      measured: cell("none", "What to buy is not measured"),
      tested: cell("none", "Not tested"),
      advice: cell("none", "None"),
    },
    {
      id: "rest",
      label: "Rest sites",
      inGame: "5 to 7 per act",
      facts: cell("full", "What a rest site offers, and the heal"),
      odds: cell("na", ""),
      measured: cell("partial", "Heal thresholds tuned"),
      tested: cell("none", "Not tested on their own"),
      advice: cell("none", "None"),
    },
    {
      id: "combat",
      label: "Combat",
      inGame: "every fight",
      facts: cell("none", "Not covered"),
      odds: cell("partial", "The exact opening-hand report for your deck"),
      measured: cell("partial", "A research planner, not on the site"),
      tested: cell("partial", "The planner, on 300 held-out games"),
      advice: cell("none", "None"),
    },
    {
      id: "ascension",
      label: "Ascension 1 to 10",
      inGame: "10 levels",
      facts: cell("full", "What each level changes"),
      odds: cell("na", ""),
      measured: cell("partial", "Level 9 only; level 10 is not modelled"),
      tested: cell("partial", "Level 9, three results"),
      advice: cell("partial", "A line on each panel says what was tested"),
    },
  ];
}
