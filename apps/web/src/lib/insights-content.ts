import { count, INSIGHTS, points, share } from "@/lib/insights";

/**
 * The words of the insights page that are not read from a data file: what each Ascension changes (with the rule that says so), what is
 * not yet known, and how the game is covered. Anything that quotes a number takes it from `INSIGHTS`; a test checks that every rule id
 * cited here is in the rule register and that the open questions quote the data they name.
 */
export interface AscensionLevel {
  readonly level: number;
  readonly name: string;
  readonly change: string;
  readonly rules: readonly string[];
}

export const ASCENSION_LEVELS: readonly AscensionLevel[] = [
  {
    level: 1,
    name: "Swarming Elites",
    change: "Each act's map has eight elite fights instead of five.",
    rules: ["ASC-6", "MAP-4"],
  },
  {
    level: 2,
    name: "Weary Traveler",
    change:
      "The Ancient at the start of each act heals 80 % of your missing HP instead of all of it.",
    rules: ["ASC-6", "ANC-1"],
  },
  {
    level: 3,
    name: "Poverty",
    change: "Gold from fights and treasure is cut to three quarters, rounded down.",
    rules: ["ASC-2", "TRS-1"],
  },
  { level: 4, name: "Tight Belt", change: "One potion slot fewer.", rules: ["ASC-3"] },
  {
    level: 5,
    name: "Ascender's Bane",
    change: "A curse that cannot be removed joins your starting deck.",
    rules: ["ASC-3", "DECK-1"],
  },
  {
    level: 6,
    name: "Inflation",
    change: "Removing a card costs 100 plus 50 for each removal so far, instead of 75 plus 25.",
    rules: ["ASC-4", "SHOP-4"],
  },
  {
    level: 7,
    name: "Scarcity",
    change:
      "Rare cards turn up about half as often in rewards, and fewer reward cards arrive upgraded.",
    rules: ["ASC-5", "CARD-3", "UPG-1"],
  },
  {
    level: 8,
    name: "Tough Enemies",
    change:
      "Enemies are tougher. The register records HP and damage for levels 8 and 9; the per-enemy figures are corroborated, not read from the game's source.",
    rules: ["ASC-7"],
  },
  { level: 9, name: "Deadly Enemies", change: "Enemies are deadlier.", rules: ["ASC-7"] },
  {
    level: 10,
    name: "Double Boss",
    change: "The last act has a second boss, chosen at the start of the run.",
    rules: ["RUN-4"],
  },
];

/** What the simulation says about each level: only Ascension 0 and 9 were played in held-out tests. */
export function ascensionStatus(level: number): {
  readonly text: string;
  readonly tone: "exact" | "neutral" | "unverified";
} {
  if (level === 9) return { text: "tested, with 1 to 8 in force", tone: "exact" };
  if (level === 10) return { text: "second boss never played", tone: "unverified" };
  return { text: "not tested alone", tone: "neutral" };
}

export interface OpenQuestion {
  readonly id: string;
  readonly question: string;
  readonly why: string;
  readonly first: string;
}

/** What the evidence does not reach, in the order this project means to close it. Numbers are quoted from the data. */
export function openQuestions(): readonly OpenQuestion[] {
  const a0 = INSIGHTS.runsEnd.find((v) => v.id === "a0");
  const late = INSIGHTS.lateDrivers.endpoints;
  const gold = a0?.goldMedian ?? 0;
  const silent = a0?.perClass.find((c) => c.character === "silent");
  const silentAct1 = silent ? silent.diedAct1 / silent.completed : 0;
  const relicsKept =
    INSIGHTS.levers.find((l) => l.id === "relics-along-the-way")?.rows[0]?.difference ?? 0;
  return [
    {
      id: "later",
      question: "What wins a run, as opposed to getting past the first boss?",
      why: `Every card value on this site is measured at the Act-1 boss, and the best simulated pilot wins ${share((a0?.won ?? 0) / (a0?.completed ?? 1))} of its games. Of ${count(late.act2.runs)} runs that reached the Act-2 boss, ${count(late.act2.passed)} got past it, which is the evidence there is for the second half of a run.`,
      first:
        "Refit the values for the Act-2 boss from the runs that exist, then test a pilot that follows them on held-out seeds.",
    },
    {
      id: "elites",
      question: "Should you fight elites?",
      why: "The thresholds that told the pilot when to fight an elite were tuned in a simulator that dropped every relic a run gains, and elites are where relics come from. Route Lab compares odds; it cannot say whether the fight is worth the HP.",
      first: "Tune the route and rest thresholds again with the relics kept, then test the result.",
    },
    {
      id: "relics",
      question: "What are the relics you find along the way worth, one by one?",
      why: `Keeping the relics a run gains moves the share past the Act-1 boss by ${points(relicsKept)} in total, but only the opening relic has a value for each option. Boss relics, shop relics and chest relics have none.`,
      first:
        "Randomise the choice among boss relics and the purchase of shop relics, fit a value for each, and test the rule that follows them.",
    },
    {
      id: "events",
      question: "What do events and enchantments do to a deck?",
      why: `The game has ${count(INSIGHTS.inventory.counts.events.total)} events and ${count(INSIGHTS.inventory.counts.enchantments.total)} enchantments, and most "?" rooms are events. The advisor has no event advice and its deck cannot record an enchanted card.`,
      first:
        "A facts-only table of what each event offers, written in our own words, then a measurement of the choices.",
    },
    {
      id: "gold",
      question: "What should the gold buy?",
      why: `Simulated runs end holding a median of ${count(gold)} gold at Ascension 0, enough for a card removal. Shop prices are exact on the Odds page; what to buy is not measured.`,
      first:
        "Randomise shop purchases the way card picks were, and fit the value of a removal, a card and a relic in gold.",
    },
    {
      id: "pilot",
      question: "How much of this is the pilot?",
      why: `Every value comes from one rules pilot. Two pilots' card values agree at about +0.59 (Ironclad), the engine credit of the synergy term was set to zero on runs of a rules pilot that may not play engine decks well, and the Silent pilot dies in act 1 in ${share(silentAct1)} of its games at Ascension 0.`,
      first: "A stronger pilot, or run logs from people, to see which values survive.",
    },
    {
      id: "live",
      question: "Does any of it hold in the live game?",
      why: "Not known. The simulator has never been compared with the game, so every figure here is model output. A handful of fixed scenarios replayed in an owned copy would show how far it can be trusted.",
      first: "Needs a copy of the game on the owner's machine.",
    },
  ];
}
