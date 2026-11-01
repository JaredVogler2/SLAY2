import { act2Data, hasPrice, pctShare, pts, type Act2Test, type Act2TestKey } from "@/lib/act2";
import { allSets } from "@/lib/cardvalues";
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
    change: "Each act's map is built to hold eight elite rooms instead of five.",
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
      "The base chance of a rare card in a reward is halved and the counter that builds it up grows half as fast; reward cards arrive upgraded half as often.",
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

/**
 * What the simulation says about each level. The simulator's changes were read back against the register for levels 1 and 4 to 7
 * (`experiments/ascension9/ascension-check.json`); level 3's gold, level 2's heal after the first act and the enemy numbers of levels 8
 * and 9 were not (ADR-058). Only Ascension 0 and 9 were played in held-out tests.
 */
const READ_BACK = new Set([1, 4, 5, 6, 7]);
export function ascensionStatus(level: number): {
  readonly text: string;
  readonly tone: "exact" | "neutral" | "unverified";
} {
  if (level === 9)
    return { text: "played in the tests; enemy numbers not read back", tone: "neutral" };
  if (level === 10) return { text: "second boss never played", tone: "unverified" };
  if (READ_BACK.has(level)) return { text: "read back; not tested alone", tone: "neutral" };
  return { text: "not read back; not tested alone", tone: "unverified" };
}

export interface OpenQuestion {
  readonly id: string;
  readonly question: string;
  readonly why: string;
  readonly first: string;
}

const PILOT_OF: Record<Act2TestKey, string> = {
  L: "a pilot that takes only cards worth 0.2 or more in every act",
  P: "a pilot that is pickier in the second act only",
  V: "a pilot that follows values refitted for the second boss",
};

function studyLine(t: Act2Test): string {
  const second = `${pctShare(t.shares.arm)} against ${pctShare(t.shares.baseline)} past the second boss`;
  const verdict =
    t.verdict === "passed"
      ? "got more runs past it"
      : t.verdict === "reversed"
        ? "got fewer runs past it"
        : "showed no difference there";
  const price = hasPrice(t)
    ? `, and ${pctShare(t.actOne.shares.arm)} against ${pctShare(t.actOne.shares.baseline)} past the first (${pts(t.actOne.shares.arm - t.actOne.shares.baseline)})`
    : "";
  return `${PILOT_OF[t.key]} ${verdict} (${second}, ${pts(t.difference)}${price})`;
}

/**
 * What the registered Act-2 study (ADR-060) adds to the question "what wins a run", at whichever stage the repository has reached; every
 * figure is read from its exported data, and which next step follows depends on whether any test passed.
 */
function laterStudy(): { readonly why: string; readonly first: string } {
  const refit =
    "Refit the values for the Act-2 boss from the runs that exist, then test a pilot that follows them on held-out seeds.";
  const d = act2Data();
  if (!d?.fit) return { why: "", first: refit };
  const results = d.tests?.results;
  if (!results) {
    return {
      why: " A registered study (ADR-060) is under way: the values were refitted for the second boss, a development screen chose what to play, and the held-out games are not finished, so there is no result yet.",
      first:
        "Wait for the held-out tests of that study (ADR-060): they say whether a pickier pilot or the refitted values get more runs past the second boss.",
    };
  }
  const played = (["L", "P", "V"] as const).flatMap((k) => {
    const t = results[k];
    return t ? [t] : [];
  });
  const skipped = [
    ...(d.dev && !d.dev.P.advance
      ? ["no threshold for the second act qualified in its development screen"]
      : []),
    ...(d.dev && !d.dev.V.advance ? ["the refitted values did not qualify in it either"] : []),
  ];
  const why = ` A registered study (ADR-060) then asked it of the second boss on held-out seeds: ${played.map(studyLine).join("; ")}${skipped.length > 0 ? `; ${skipped.join(", and ")}` : ""}. Every one of these is a statement about simulated rules pilots, and none is about winning.`;
  const anyPassed = played.some((t) => t.verdict === "passed");
  return {
    why,
    first: anyPassed
      ? "Find which acts' card picks carry the effect and whether it reaches winning: a new registration with wins as its endpoint (the study's win counts are descriptive, not a registered endpoint)."
      : "Look for what moves the later acts elsewhere than in the card picks: the elite thresholds tuned again with the relics kept, or the relics themselves (the next two questions).",
  };
}

/** What the evidence does not reach, in the order this project means to close it. Numbers are quoted from the data. */
export function openQuestions(): readonly OpenQuestion[] {
  const a0 = INSIGHTS.runsEnd.find((v) => v.id === "a0");
  const late = INSIGHTS.lateDrivers.endpoints;
  const gold = a0?.goldMedian ?? 0;
  const silent = a0?.perClass.find((c) => c.character === "silent");
  const drift = allSets().find((c) => c.character === "ironclad")?.drift?.spearman ?? null;
  const silentAct1 = silent ? silent.diedAct1 / silent.completed : 0;
  const relicsKept =
    INSIGHTS.levers.find((l) => l.id === "relics-along-the-way")?.rows[0]?.difference ?? 0;
  const study = laterStudy();
  return [
    {
      id: "later",
      question: "What wins a run, as opposed to getting past the first boss?",
      why: `Every card value on this site is measured at the Act-1 boss, and the pilot that follows the shown values wins ${share((a0?.won ?? 0) / (a0?.completed ?? 1))} of its games at Ascension 0. In the exploration games ${count(late.act2.runs)} runs reached the Act-2 boss and ${count(late.act2.passed)} got past it; the endings of the pilot's own games above are another reading. Neither was designed to answer the question.${study.why}`,
      first: study.first,
    },
    {
      id: "elites",
      question: "Should you fight elites?",
      why: "The thresholds that told the pilot when to fight an elite were tuned in a simulator that dropped every relic a run gains, and elites are one place relics come from. Route Lab compares odds; it cannot say whether the fight is worth the HP.",
      first:
        "Tune the elite thresholds again with the relics kept (and screen the heal, rest and shop ones), then test the result.",
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
      why: `The extracted data hold ${count(INSIGHTS.inventory.counts.events.total)} event records (they include the Ancients that open the acts and the event that closes a run, which no "?" room offers) and ${count(INSIGHTS.inventory.counts.enchantments.total)} enchantments, and a "?" room turns into an event more often than into anything else (UNK-2). The advisor has no event advice and its deck cannot record an enchanted card.`,
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
      why: `Every value comes from rules pilots of one family, not from people. ${drift === null ? "" : `Card values measured with two of those pilots agree with a rank correlation of ${drift.toFixed(2)} for Ironclad, so a value depends, moderately, on who plays. `}The engine credit of the synergy term was set to zero on runs of a rules pilot that may not play engine decks well, and the Silent pilot dies in act 1 in ${share(silentAct1)} of its games at Ascension 0.`,
      first: "A stronger pilot, or run logs from people, to see which values survive.",
    },
    {
      id: "live",
      question: "Does any of it hold in the live game?",
      why: "Not known. The simulator has never been compared with the game, so every performance figure here is model output. A handful of fixed scenarios replayed in an owned copy could show where the simulator departs from the game.",
      first: "Needs a copy of the game on the owner's machine.",
    },
  ];
}
