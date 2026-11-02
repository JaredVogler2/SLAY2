import type { PackSource } from "@/lib/run-state";
import {
  PICKIER_ACT_INDEX,
  PICKIER_THRESHOLD,
  simulationPick,
  type SimulationPick,
} from "@/lib/simulation-pick";
import { threshData, type ThreshClassResult, type ThreshData, type ThreshTest } from "@/lib/thresh";

/**
 * The card rewards the pilot of the threshold study (ADR-062) changed are the ones after a fight; a shop's cards and an event's choices are decided by
 * other rules of the pilot and were not part of the test.
 */
export const PICKIER_SOURCES: readonly PackSource[] = ["regular", "elite", "boss"];

export type PickierWhy =
  "no-result" | "not-passed" | "class" | "behind" | "act" | "source" | "unmeasured";

export type PickierOpinion =
  | { readonly available: false; readonly why: PickierWhy; readonly reason: string }
  | {
      readonly available: true;
      /** what the pickier pilot (bar 0.2, Act 2) does with this offer */
      readonly pick: Exclude<SimulationPick, { readonly kind: "unmeasured" }>;
      /** what the ordinary simulated pilot (bar 0) does with it, for the comparison the panel makes */
      readonly baseline: SimulationPick;
      /** the registered test that offers it, and the class's own row of it */
      readonly test: ThreshTest;
      readonly classResult: ThreshClassResult;
      readonly level: number;
    };

const no = (why: PickierWhy, reason: string): PickierOpinion => ({ available: false, why, reason });

/**
 * The optional second opinion of the advisor for the card rewards of Act 2 (ADR-063; ADR-061 addendum B and ADR-062 item 8 (iii) decided in advance when it
 * may exist): what the simulated pilot that takes a card only if it is measured above 0.2 does with this offer. It is offered only if the registered
 * replication (T1 of ADR-062: that pilot, in Act 2, against the pilot with the bar 0) passed; only for a class that test played (Ironclad and Defect) and in
 * which that pilot was not behind at an exact p below 0.01; only in Act 2 and only for the rewards after a fight; and only for the bar that was tested,
 * 0.2. The figures that sit beside it are read from the registered test's exported file, never typed.
 */
export function pickierOpinion(input: {
  character: string;
  actIndex: number;
  source: PackSource;
  offered: readonly string[];
  deckSize: number;
  /** the exporter's file by default; tests pass their own */
  data?: ThreshData | null;
}): PickierOpinion {
  const data = input.data === undefined ? threshData() : input.data;
  const tests = data?.tests;
  const t1 = tests?.results.T1;
  if (tests?.results.T1?.arm !== "t020" || t1?.baseline !== "s")
    return no("no-result", "The registered replication of the Act-2 rule has no result yet.");
  if (t1.verdict !== "passed")
    return no(
      "not-passed",
      "The registered replication of the Act-2 rule did not show that it wins more games, so nothing is offered.",
    );
  const classResult = t1.perClass.find((c) => c.character === input.character);
  if (!classResult) return no("class", "The test played Ironclad and Defect only.");
  if (classResult.verdict === "baseline")
    return no("behind", "In this class the pickier pilot was behind the baseline in the test.");
  if (input.actIndex !== PICKIER_ACT_INDEX)
    return no("act", "The pickier rule was tested in the card rewards of Act 2 only.");
  if (!PICKIER_SOURCES.includes(input.source))
    return no("source", "The pickier rule was tested in the card rewards after a fight only.");
  const pick = simulationPick({
    character: input.character,
    offered: input.offered,
    deckSize: input.deckSize,
    threshold: PICKIER_THRESHOLD,
  });
  if (pick.kind === "unmeasured") return no("unmeasured", pick.reason);
  const baseline = simulationPick({
    character: input.character,
    offered: input.offered,
    deckSize: input.deckSize,
  });
  return { available: true, pick, baseline, test: t1, classResult, level: tests.level };
}
