import { DECK_CAP, PICKIER_THRESHOLD } from "@/lib/simulation-pick";
import {
  formatP,
  levelText,
  pctShare,
  pts,
  type ThreshClassResult,
  type ThreshTest,
} from "@/lib/thresh";

/**
 * The words of the advisor's optional Act-2 opinion (ADR-063) that quote the registered test (ADR-062, T1). Every figure is read from the exporter's file; nothing is
 * typed. ADR-062 item 5 requires every page that says "passed" to give the pooled difference and its interval, the discordant pairs, the same in each class, and the
 * shares past the first and the second boss: the first three are here, the boss shares and the floors come from `bossSentence` of the threshold library.
 */
const n = (x: number): string => x.toLocaleString("en-US");

/** The pooled result, in the order the registration reads it. */
export function pooledSentence(t: ThreshTest, level: number, seeds: number, adr: string): string {
  return `In a registered test (${adr}: its rules for reading it were written down before any of its games was played) on ${n(seeds)} seeds that no earlier study had played, each played in both Ironclad and Defect, the pickier simulated pilot won ${pctShare(t.shares.arm)} of the ${n(t.pairs)} paired games both pilots finished, against ${pctShare(t.shares.baseline)} for the ordinary simulated pilot above, which takes the best card offered if that card is measured above zero and otherwise skips (${pts(t.difference)}; ${levelText(level)} interval ${pts(t.ci[0] ?? 0)} to ${pts(t.ci[1] ?? 0)}; exact ${formatP(t.p)}). A pair is one seed played by both pilots: ${n(t.armOnly)} pairs were won only by the pickier pilot and ${n(t.baselineOnly)} only by the ordinary one.`;
}

/** One class's own row of the same test: what it says on its own, which for a class that is not shown alone at the class level is only a direction. */
export function classSentence(c: ThreshClassResult, label: string, yours: boolean): string {
  const own =
    c.verdict === "arm"
      ? "ahead on its own at the class level 0.01 (secondary, uncorrected)"
      : c.verdict === "level"
        ? "not shown on its own at the class level 0.01, so the pooled test is the evidence here"
        : "behind on its own";
  return `${label}${yours ? " (your class)" : ""}: ${pctShare(c.shares.arm)} against ${pctShare(c.shares.baseline)} (${pts(c.difference)}; ${n(c.armOnly)} pairs only the pickier pilot, ${n(c.baselineOnly)} only the ordinary one; exact ${formatP(c.p)}), ${own}.`;
}

/** The size of the pooled difference, derived: half a point of the win share is about one extra win in two hundred games. */
export function sizeSentence(t: ThreshTest): string {
  if (!(t.difference > 0)) return "";
  const per = Math.max(10, Math.round(1 / t.difference / 10) * 10);
  return `The pooled difference is ${pts(t.difference)} of the share of games won, about one extra win in ${n(per)} games, by pilots that win ${pctShare(t.shares.baseline, 1)} to ${pctShare(t.shares.arm, 1)} of their paired games.`;
}

/** What the visitor at Ascension 1 to 10 is told: every game of the test was played at Ascension 0 (ADR-062 does not claim anything above it). */
export function ascensionSentence(level: number): string {
  return `Every game of this test was played at Ascension 0. You said you are at Ascension ${String(level)}: nothing is known about whether the rule holds there.`;
}

/** Why the answer is a skip when the deck is full, so that a skip caused by the cap is not read as the bar's. */
export function cappedHeadline(): string {
  return `With ${String(DECK_CAP)} or more cards a simulated pilot stops taking cards whatever its bar, so it would skip this reward; the bar of ${String(PICKIER_THRESHOLD)} makes no difference here.`;
}

/** The sentence that says what the figures are about, directly under the answer. */
export const NOT_A_RECOMMENDATION =
  "This is not a recommendation to skip, or to take: the figures below describe this rule applied at every Act-2 card reward of whole simulated runs, and say nothing about this one choice.";

/** The limits of the test that the panel states beside every figure. */
export function limitsText(): string {
  return `Every game of the test was played at Ascension 0, by rules-playing pilots, in a simulator that has never been compared with the live game, and it is not a measurement of you: your HP, relics, deck and what a card does for your build matter more than one number. The bar was tested as a rule for every card reward of Act 2 (in the simulator that includes the few an event or a relic gives); this panel shows it only for the rewards after a fight. The reward right after the Act 1 boss counts as Act 1, the one after the Act 2 boss as Act 2. Only the bar ${String(PICKIER_THRESHOLD)} was tested on seeds the screening did not use.`;
}
