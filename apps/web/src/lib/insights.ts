import insights from "@/content/insights.generated.json";
import { formatP, pct } from "@/lib/stat-format";

/**
 * The insights page (ADR-059). Every number on it is read from `insights.generated.json`, which the exporter writes from the committed
 * experiment files (scripts/lib/insights.mjs), and every sentence that quotes one is built here from it, so a number cannot be typed into
 * the page and drift from its source. The page says what each number is: its evidence class.
 */
export type EvidenceClass =
  "registered" | "development" | "exploratory" | "descriptive" | "judgement" | "rule";

export const EVIDENCE: Record<
  EvidenceClass,
  {
    readonly label: string;
    readonly tone: "exact" | "heuristic" | "neutral" | "unverified";
    readonly meaning: string;
  }
> = {
  registered: {
    label: "Registered test",
    tone: "exact",
    meaning:
      "A paired comparison on held-out seeds, written down before its first game and read by its registered rule: an exact McNemar test, with a whole-seed interval when five classes are pooled and a paired Wald interval for one class.",
  },
  development: {
    label: "Development result",
    tone: "heuristic",
    meaning:
      "Played on development seeds while building or tuning something. A measurement, not a test: nothing was registered and the seeds were not held out.",
  },
  exploratory: {
    label: "Exploratory reading",
    tone: "heuristic",
    meaning:
      "A description fitted to existing runs to see what is there. It can suggest what to test; it is not a test.",
  },
  descriptive: {
    label: "Descriptive",
    tone: "neutral",
    meaning:
      "Played and reported as a comparison, but no decision rests on it and no test was registered for it.",
  },
  judgement: {
    label: "Judgement",
    tone: "heuristic",
    meaning:
      "SLAY2's own reading of how the game works, written down and checked against simulated runs only as far as the page says.",
  },
  rule: {
    label: "Rule of the game",
    tone: "exact",
    meaning:
      "Read from the game's own logic or official statements, and checked against an independent calculation.",
  },
};

const CLASSES_OF_EVIDENCE = Object.keys(EVIDENCE) as readonly EvidenceClass[];

/** The evidence class a data file names, refused when it is not one the page knows how to explain. */
export function evidenceClass(value: string): EvidenceClass {
  const found = CLASSES_OF_EVIDENCE.find((k) => k === value);
  if (!found) throw new Error(`unknown evidence class "${value}"`);
  return found;
}

export type Insights = typeof insights;
export type Lever = Insights["levers"][number];
export type LeverRow = Lever["rows"][number];
export type RunsEnd = Insights["runsEnd"][number];
export type LateFeature = Insights["lateDrivers"]["features"][number];

export const INSIGHTS: Insights = insights;

// ---- number formatting

/** "+25.9 points" from a difference of shares between 0 and 1. */
export function points(x: number, digits = 1): string {
  const v = (x * 100).toFixed(digits);
  return `${x < 0 ? "−" : "+"}${v.replace("-", "")} points`;
}

export function pointRange(ci: readonly number[]): string {
  const [lo = 0, hi = 0] = ci;
  const f = (v: number): string => `${v < 0 ? "−" : "+"}${Math.abs(v * 100).toFixed(1)}`;
  return `${f(lo)} to ${f(hi)}`;
}

export function count(n: number): string {
  return n.toLocaleString("en-US");
}

/** "about 352,000": a count written to three figures for a headline. */
export function roughly(n: number): string {
  const magnitude = 10 ** (Math.floor(Math.log10(n)) - 2);
  return `about ${count(Math.round(n / magnitude) * magnitude)}`;
}

export const share = (x: number): string => pct(x, 1);
export { formatP, pct };

// ---- the levers

export type WhenId = "a0" | "a9" | "a0-dropped";
export const WHEN_LABEL: Record<string, string> = {
  a0: "Ascension 0, relics kept",
  a9: "Ascension 9, relics kept",
  "a0-dropped": "Ascension 0, the simulator's old rule (relics dropped)",
};

export const ADVISOR_LABEL: Record<
  string,
  { readonly text: string; readonly tone: "exact" | "heuristic" | "neutral" }
> = {
  yes: { text: "In the advisor", tone: "exact" },
  "second-opinion": { text: "A second opinion in the advisor", tone: "heuristic" },
  "four-classes": { text: "In the advisor for four classes", tone: "heuristic" },
  no: { text: "Not in the advisor yet", tone: "neutral" },
};

/** The levers in the order of their size at Ascension 0 (the level every lever was measured at), largest first. */
export function leverLadder(): readonly Lever[] {
  const size = (l: Lever): number => {
    const a0 = l.rows.find((r) => r.when === "a0") ?? l.rows[0];
    return a0 ? Math.abs(a0.difference) : 0;
  };
  return [...INSIGHTS.levers].sort((a, b) => size(b) - size(a));
}

/** The scale of the bars: the largest difference or interval end on the page, so that every bar is read on the same axis. */
export function ladderScale(): number {
  let top = 0;
  for (const l of INSIGHTS.levers)
    for (const r of l.rows) top = Math.max(top, Math.abs(r.difference), ...r.ci95.map(Math.abs));
  return Math.ceil(top * 20) / 20;
}

/** What a row is called: its own label where it has one (a comparison of two simulators), otherwise the level and the relics. */
export function rowLabel(row: LeverRow): string {
  return row.label ?? WHEN_LABEL[row.when] ?? row.when;
}

/** The classes whose own games had the first arm behind, with their shares: a lever that helps on the whole may not help everywhere. */
export function behindText(row: LeverRow): string | null {
  if (row.behind.length === 0) return null;
  const parts = row.behind.map(
    (b) =>
      `${b.character.charAt(0).toUpperCase()}${b.character.slice(1)} went the other way (${share(b.first)} against ${share(b.second)} in ${count(b.pairs)} pairs)`,
  );
  return `${parts.join("; ")}.`;
}

/** How many times longer a game of the first arm takes, for the lever whose cost is part of what it is. */
export function slowdownText(row: LeverRow): string | null {
  return row.slowdown === null
    ? null
    : `A game takes about ${count(Math.round(row.slowdown))} times as long as one of the rules pilot.`;
}

export function leverSentence(r: LeverRow, l: Lever): string {
  return `${l.first} got past the Act-1 boss in ${share(r.first)} of ${count(r.pairs)} paired games against ${share(r.second)} for ${l.second}`;
}

// ---- where runs end

export interface Segment {
  readonly id: "act1" | "act2" | "act3" | "won";
  readonly label: string;
  readonly share: number;
}

export function segments(v: {
  completed: number;
  diedAct1: number;
  diedAct2: number;
  diedAct3: number;
  won: number;
}): readonly Segment[] {
  const n = v.completed;
  return [
    { id: "act1", label: "died in act 1", share: v.diedAct1 / n },
    { id: "act2", label: "died in act 2", share: v.diedAct2 / n },
    { id: "act3", label: "died in act 3", share: v.diedAct3 / n },
    { id: "won", label: "won", share: v.won / n },
  ];
}

/**
 * The share of the runs that died whose death was in a boss fight, overall and act by act (a death on the floor of an act's boss is a
 * death in that fight). `null` for an act in which nobody died.
 */
export function bossDeaths(v: RunsEnd): {
  readonly all: number;
  readonly byAct: readonly (number | null)[];
} {
  const died = [v.diedAct1, v.diedAct2, v.diedAct3];
  const boss = [v.bossAct1, v.bossAct2, v.bossAct3];
  const total = died.reduce((a, b) => a + b, 0);
  return {
    all: total === 0 ? 0 : boss.reduce((a, b) => a + b, 0) / total,
    byAct: died.map((n, i) => (n === 0 ? null : (boss[i] ?? 0) / n)),
  };
}

const SMALL = new Set(["of", "the", "a", "an", "and"]);
function words(id: string): string {
  return id
    .toLowerCase()
    .split("_")
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** "CRUSHER,ROCKET" is a fight against two enemies, "AXEBOT,AXEBOT" against two of one kind. */
export function enemyName(id: string): string {
  const parts = id.split(",");
  const unique = [...new Set(parts)];
  if (unique.length === 1 && parts.length > 1)
    return `${words(unique[0] ?? id)} ×${String(parts.length)}`;
  return unique.map(words).join(" & ");
}

// ---- the second boss

export const GROUPS: readonly { readonly title: string; readonly ids: readonly string[] }[] = [
  { title: "What you carry into the fight", ids: ["hp", "potions", "max_hp", "gold"] },
  {
    title: "What the deck is made of",
    ids: ["attacks", "skills", "powers", "other", "starters", "upgraded"],
  },
  { title: "What you found on the way", ids: ["relics"] },
];

export const MATTERS_TEXT: Record<string, string> = {
  earlier: "a weaker association at the second boss",
  later: "a stronger association at the second boss",
  same: "no clear difference",
};

/** The odds ratio as a change in the odds: 1.24 is "+24 %". */
export function oddsChange(or: number): string {
  const c = (or - 1) * 100;
  const text = Math.abs(c) < 0.5 ? "no change" : `${c < 0 ? "−" : "+"}${Math.abs(c).toFixed(0)} %`;
  return text;
}

export function lateFeature(id: string): LateFeature | undefined {
  return INSIGHTS.lateDrivers.features.find((f) => f.id === id);
}

// ---- the findings at the top of the page

export interface Finding {
  readonly id: string;
  readonly figure: string;
  /** what the figure is, in a few words */
  readonly caption: string;
  readonly headline: string;
  readonly body: string;
  readonly evidence: EvidenceClass;
  readonly href: string;
}

function lever(id: string): Lever {
  const l = INSIGHTS.levers.find((x) => x.id === id);
  if (!l) throw new Error(`no lever ${id}`);
  return l;
}
function row(l: Lever, when: string): LeverRow {
  const r = l.rows.find((x) => x.when === when);
  if (!r) throw new Error(`no row ${when} in ${l.id}`);
  return r;
}

export function findings(): readonly Finding[] {
  const values = lever("card-values");
  const relics = lever("relics-along-the-way");
  const synergy = lever("synergy");
  const a0End = INSIGHTS.runsEnd.find((v) => v.id === "a0");
  const a9End = INSIGHTS.runsEnd.find((v) => v.id === "a9");
  if (!a0End || !a9End) throw new Error("the runs-end variants are missing");
  const upgraded = lateFeature("upgraded");
  const hp = lateFeature("hp");
  const wonA0 = a0End.won / a0End.completed;
  const beforeAct3 = (v: RunsEnd): number => (v.diedAct1 + v.diedAct2) / v.completed;
  const out: Finding[] = [
    {
      id: "cards",
      caption: "past the Act-1 boss, Ascension 9",
      figure: points(row(values, "a9").difference, 0),
      headline:
        "Choosing cards by measured value is the biggest difference between simulated pilots",
      body: `At Ascension 9 a pilot that follows measured card values got past the Act-1 boss in ${share(row(values, "a9").first)} of games against ${share(row(values, "a9").second)} for the hand-written ratings; at Ascension 0 with the relics kept the gap was ${points(row(values, "a0").difference, 0)}. The size depends on the baseline it is set against.`,
      evidence: "registered",
      href: "#levers",
    },
    {
      id: "relics",
      caption: "past the Act-1 boss, Ascension 0",
      figure: points(row(relics, "a0").difference, 0),
      headline: "Keeping the relics a run finds is worth a lot in the simulator",
      body: `The same pilot with the relics it gains kept, against the pinned simulator's old rule of dropping them (a simulator gap, G14): ${share(row(relics, "a0").first)} against ${share(row(relics, "a0").second)} past the Act-1 boss. The game keeps them, so this is the size of what relics are worth together, not a choice. The advisor recommends an opening relic only.`,
      evidence: "development",
      href: "#levers",
    },
    {
      id: "synergy",
      caption: "past the Act-1 boss, Ascension 0",
      figure: points(row(synergy, "a0").difference, 0),
      headline: "Counting how cards work together helped the advisor's index, modestly",
      body: `The synergy term raised the share past the Act-1 boss of the pilot that picks by the advisor's index by ${points(row(synergy, "a0").difference)} at Ascension 0 and ${points(row(synergy, "a9").difference)} at Ascension 9, in every test.`,
      evidence: "registered",
      href: "#levers",
    },
    {
      id: "ends",
      caption: "of simulated games ended before act 3, Ascension 0",
      figure: share(beforeAct3(a0End)),
      headline: "Most simulated runs end before act 3, and these pilots win little",
      body: `The pilot that follows the card values shown on the site died in act 1 in ${share(a0End.diedAct1 / a0End.completed)} of its games at Ascension 0 (${share(a9End.diedAct1 / a9End.completed)} at Ascension 9), in act 2 in ${share(a0End.diedAct2 / a0End.completed)}, and won ${share(wonA0)} of them: what these figures can say about the end of a run is thin.`,
      evidence: "descriptive",
      href: "#runs-end",
    },
  ];
  if (upgraded && hp) {
    out.push({
      id: "second-boss",
      caption: "odds per upgraded card, first boss to second",
      figure: `×${upgraded.act1.oddsRatio.toFixed(2)} → ×${upgraded.act2.oddsRatio.toFixed(2)}`,
      headline: "The second boss looks like a different test",
      body: `In simulated Ascension 0 games with ${pct(INSIGHTS.lateDrivers.exploreShare, 0)} of the card picks random (relics kept), each upgraded card went with ${oddsChange(upgraded.act1.oddsRatio)} higher odds of getting past the Act-1 boss and ${oddsChange(upgraded.act2.oddsRatio)} at the Act-2 boss; the HP the run held kept most of its weight (×${hp.act1.oddsRatio.toFixed(2)} and ×${hp.act2.oddsRatio.toFixed(2)} per ten percentage points of the maximum).`,
      evidence: "exploratory",
      href: "#second-boss",
    });
  }
  const twinA0 = INSIGHTS.ascension.pooled.a0.first;
  const twinA9 = INSIGHTS.ascension.pooled.a9.first;
  out.push({
    id: "ascension",
    caption: "past the Act-1 boss, Ascension 0 to 9",
    figure: `${pct(twinA0, 0)} → ${pct(twinA9, 0)}`,
    headline: "Ascension 9 is a different game",
    body: `The same pilot, following the same card values, got past the Act-1 boss in ${share(twinA0)} of its games at Ascension 0 and ${share(twinA9)} at Ascension 9, and the three levers measured at both levels shrink in points at the harder one.`,
    evidence: "descriptive",
    href: "#ascension",
  });
  return out;
}

/** 1st, 2nd, 3rd, 4th, 11th, 21st. */
export function ordinal(n: number): string {
  const last = n % 100;
  if (last >= 11 && last <= 13) return `${String(n)}th`;
  const suffix = ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${String(n)}${suffix}`;
}
