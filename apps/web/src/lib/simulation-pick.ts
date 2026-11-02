import {
  againstText,
  isValidated,
  measuredValue,
  setFor,
  type MeasuredCard,
} from "@/lib/cardvalues";

/** The deck size at which the validated pilot (rules_v2, ADR-031) stops taking cards. */
export const DECK_CAP = 32;

/**
 * The bar of the pickier pilot in the card rewards of Act 2 (`rules_v2_late`, `late_acts` [1], `late_threshold` 0.2: ADR-060, ADR-061's A2, ADR-062's T1), and the act it
 * applies to (the game's acts counted from 0, as `run.act` and the run state count them). Everywhere else the pilot's bar is 0.
 */
export const PICKIER_THRESHOLD = 0.2;
export const PICKIER_ACT_INDEX = 1;

export type SimulationPick =
  | { readonly kind: "unmeasured"; readonly reason: string }
  | { readonly kind: "skip"; readonly reason: string }
  | {
      readonly kind: "pick";
      readonly cardId: string;
      readonly value: MeasuredCard;
      readonly reason: string;
    };

/**
 * The card-reward rule of the pilot the measured values were validated with (`rules_v2`): take the offered card with the
 * largest measured value if it is above zero and the deck is under the cap, otherwise skip; a card that was never measured
 * counts as zero. Ties go to the earlier card. Python is the specification: the golden cases in
 * test/fixtures/simulation-pick-golden.json come from the policy itself.
 *
 * It answers "what did the simulated pilot do", not "what should you do": the values come from a simulator that has not
 * been compared with the live game, and from one pilot's way of playing the cards. It speaks only for a class whose values
 * passed their held-out test (acting on them beat the hand-written ratings).
 *
 * `threshold` is the bar the best card's value has to be strictly above (default 0, the pilot of ADR-031); 0.2 is the pickier
 * pilot of Act 2 (`PICKIER_THRESHOLD`), whose only difference is that it skips more rewards.
 */
export function simulationPick(input: {
  character: string;
  offered: readonly string[];
  deckSize: number;
  threshold?: number;
}): SimulationPick {
  const { character, offered, deckSize } = input;
  const threshold = input.threshold ?? 0;
  const bar = threshold === 0 ? "zero" : String(threshold);
  const set = setFor(character);
  if (!set) {
    return {
      kind: "unmeasured",
      reason: "Simulated runs have not measured this class's cards yet.",
    };
  }
  if (!isValidated(set)) {
    return {
      kind: "unmeasured",
      reason:
        set.validation === null
          ? "This class's card values have not been tested against play yet, so the simulated runs give no opinion."
          : `This class's card values did not beat ${againstText(set.validation)} in the held-out test, so they are shown on the codex as measurements only, not as advice.`,
    };
  }
  const values = offered.map((id) => measuredValue(id, character)?.card);
  if (!values.some((v) => v !== undefined)) {
    return {
      kind: "unmeasured",
      reason:
        "None of the offered cards was in enough simulated decks to be measured, so the runs say nothing about this offer.",
    };
  }
  let bestIndex = -1;
  let bestBeta = Number.NEGATIVE_INFINITY;
  values.forEach((v, i) => {
    const beta = v?.beta ?? 0;
    if (beta > bestBeta) {
      bestBeta = beta;
      bestIndex = i;
    }
  });
  const best = values[bestIndex];
  if (deckSize >= DECK_CAP) {
    return {
      kind: "skip",
      reason: `The deck already has ${String(deckSize)} cards; the simulated pilot stops taking cards at ${String(DECK_CAP)}.`,
    };
  }
  const id = offered[bestIndex];
  if (best !== undefined && id !== undefined && best.beta > threshold) {
    return {
      kind: "pick",
      cardId: id,
      value: best,
      reason: `It has the largest measured value among the offered cards, and that value is above ${bar}.`,
    };
  }
  return {
    kind: "skip",
    reason: `No offered card has a measured value above ${bar} (a card that was never measured counts as zero), so the simulated pilot skips.`,
  };
}
