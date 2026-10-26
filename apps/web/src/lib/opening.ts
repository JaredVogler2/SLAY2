import {
  basicCardId,
  getCard,
  getOpeningOption,
  isRemovable,
  isUpgradable,
  resolveStepCards,
  startingHpAt,
  type OpeningOption,
  type OpeningStep,
  type PlayableClass,
} from "@slay2/game-data";

import type { OpeningEntry, RunState } from "./run-state";

/** The deck as the run stores it: one row per card, `upgraded` of the `count` copies upgraded. */
export type Deck = RunState["deck"];

function name(id: string): string {
  return getCard(id)?.name ?? id;
}

export function deckCopies(deck: Deck, id: string): number {
  return deck.find((d) => d.id === id)?.count ?? 0;
}

export function deckUpgraded(deck: Deck, id: string): number {
  return deck.find((d) => d.id === id)?.upgraded ?? 0;
}

function tidy(entry: Deck[number]): Deck[number] {
  const { upgraded, ...rest } = entry;
  return upgraded && upgraded > 0 ? { ...rest, upgraded: Math.min(upgraded, entry.count) } : rest;
}

/** Add `n` base copies of a card. */
export function deckAdd(deck: Deck, id: string, n = 1): Deck {
  if (n <= 0) {
    return deck;
  }
  if (deck.some((d) => d.id === id)) {
    return deck.map((d) => (d.id === id ? tidy({ ...d, count: Math.min(30, d.count + n) }) : d));
  }
  return [...deck, { id, count: Math.min(30, n) }];
}

/** Remove `n` copies, base copies first (an upgraded copy is the last to go). The row disappears at zero. */
export function deckRemove(deck: Deck, id: string, n = 1): Deck {
  return deck
    .map((d) => {
      if (d.id !== id) {
        return d;
      }
      const count = d.count - n;
      const upgraded = Math.min(d.upgraded ?? 0, count);
      return tidy({ ...d, count, upgraded });
    })
    .filter((d) => d.count > 0);
}

/** Change how many copies of a card are upgraded, within 0 and the copies held. */
export function deckSetUpgraded(deck: Deck, id: string, upgraded: number): Deck {
  return deck.map((d) =>
    d.id === id ? tidy({ ...d, upgraded: Math.max(0, Math.min(upgraded, d.count)) }) : d,
  );
}

export interface OpeningResult {
  readonly run: RunState;
  readonly lines: readonly string[];
}

/**
 * What the player tells the form, by step index: the card ids of a `pick`, `remove` or `upgradeChosen` step, and the
 * resulting card of a `transform` step (the transformed card is chosen from the deck, or fixed by the step). Index and step
 * are paired by position in `option.steps`.
 */
export type OpeningAnswers = Readonly<Record<number, readonly string[]>>;

export interface TransformAnswer {
  readonly from: string | undefined;
  readonly to: string | undefined;
}

/** A transform step is answered with [to] when the step fixes what is transformed, and [from, to] otherwise. */
export function transformAnswer(
  step: Extract<OpeningStep, { kind: "transform" }>,
  answer: readonly string[] | undefined,
  character: PlayableClass,
): TransformAnswer {
  if (step.only) {
    return { from: basicCardId(character, step.only), to: answer?.[0] };
  }
  return { from: answer?.[0], to: answer?.[1] };
}

/** What is still missing or impossible before the option can be applied; an empty list means it can. */
export function openingProblems(
  run: RunState,
  option: OpeningOption,
  answers: OpeningAnswers,
): string[] {
  const character = run.character;
  if (!character) {
    return ["Choose a character first."];
  }
  if (run.opening.entries.some((e) => e.id === option.id)) {
    // a relic is taken once; the log is how the run stands, so a correction is an Undo
    return [`${option.name} is already recorded for this run. Use Undo to change it.`];
  }
  const problems: string[] = [];
  // copies still available to remove, transform or upgrade, as steps use them one after another
  let deck: Deck = run.deck;
  option.steps.forEach((step, i) => {
    const answer = answers[i] ?? [];
    switch (step.kind) {
      case "add":
        for (const id of resolveStepCards(character, step.cards)) {
          deck = deckAdd(deck, id);
        }
        break;
      case "pick": {
        const chosen = answer.filter(Boolean);
        if (!step.optional && chosen.length < step.count) {
          problems.push(
            `${step.label}: choose ${String(step.count)} card${step.count === 1 ? "" : "s"}.`,
          );
        }
        for (const id of chosen) {
          if (!getCard(id)) {
            problems.push(`${step.label}: unknown card ${id}.`);
          } else {
            deck = deckAdd(deck, id);
          }
        }
        break;
      }
      case "remove": {
        const chosen = answer.filter(Boolean);
        if (chosen.length < step.count) {
          problems.push(`${step.label}: choose ${String(step.count)} from your deck.`);
        }
        for (const id of chosen) {
          if (deckCopies(deck, id) < 1) {
            problems.push(`${step.label}: ${name(id)} is not in your deck any more.`);
          } else if (!isRemovable(id)) {
            problems.push(`${step.label}: ${name(id)} cannot be removed from a deck.`);
          } else {
            deck = deckRemove(deck, id);
          }
        }
        break;
      }
      case "transform": {
        const { from, to } = transformAnswer(step, answer, character);
        if (!from || !to) {
          problems.push(
            `${step.label}: choose ${step.only ? "the new card" : "the old and the new card"}.`,
          );
        } else if (deckCopies(deck, from) < 1) {
          problems.push(`${step.label}: ${name(from)} is not in your deck.`);
        } else if (!isRemovable(from)) {
          problems.push(`${step.label}: ${name(from)} cannot be transformed.`);
        } else {
          deck = deckAdd(deckRemove(deck, from), to);
        }
        break;
      }
      case "upgrade":
        for (const role of step.cards) {
          const id = basicCardId(character, role);
          if (deckCopies(deck, id) - deckUpgraded(deck, id) < 1) {
            problems.push(`There is no base ${name(id)} left to upgrade.`);
          } else {
            deck = deckSetUpgraded(deck, id, deckUpgraded(deck, id) + 1);
          }
        }
        break;
      case "upgradeChosen": {
        const chosen = answer.filter(Boolean);
        if (chosen.length < step.count) {
          problems.push(`${step.label}: choose ${String(step.count)} from your deck.`);
        }
        for (const id of chosen) {
          if (!isUpgradable(id)) {
            problems.push(`${step.label}: ${name(id)} cannot be upgraded.`);
          } else if (deckCopies(deck, id) - deckUpgraded(deck, id) < 1) {
            problems.push(`${step.label}: no base ${name(id)} left to upgrade.`);
          } else {
            deck = deckSetUpgraded(deck, id, deckUpgraded(deck, id) + 1);
          }
        }
        break;
      }
      case "maxHp":
      case "hp":
      case "info":
        break;
    }
  });
  return problems;
}

/**
 * Apply an opening option to the run: the deck and HP change as the player reported, and the entry (with the lines that say
 * what happened) joins the run's opening log. Pure: the caller stores the result. Throws if the answers are not valid, so a
 * caller should check `openingProblems` first.
 */
export function applyOpening(
  run: RunState,
  optionId: string,
  answers: OpeningAnswers,
): OpeningResult {
  const option = getOpeningOption(optionId);
  const character = run.character;
  if (!option || !character) {
    throw new Error("unknown opening option or no character");
  }
  const problems = openingProblems(run, option, answers);
  if (problems.length > 0) {
    throw new Error(problems[0]);
  }
  let deck: Deck = run.deck;
  let hp = run.hp;
  const lines: string[] = [];
  option.steps.forEach((step, i) => {
    const answer = (answers[i] ?? []).filter(Boolean);
    switch (step.kind) {
      case "add": {
        for (const id of resolveStepCards(character, step.cards)) {
          deck = deckAdd(deck, id);
          lines.push(`Added ${name(id)} to the deck.`);
        }
        break;
      }
      case "pick":
        for (const id of answer) {
          deck = deckAdd(deck, id);
          lines.push(`Added ${name(id)} to the deck.`);
        }
        break;
      case "remove":
        for (const id of answer) {
          deck = deckRemove(deck, id);
          lines.push(`Removed ${name(id)} from the deck.`);
        }
        break;
      case "transform": {
        const { from, to } = transformAnswer(step, answers[i], character);
        if (from && to) {
          deck = deckAdd(deckRemove(deck, from), to);
          lines.push(`Transformed ${name(from)} into ${name(to)}.`);
        }
        break;
      }
      case "upgrade":
        for (const role of step.cards) {
          const id = basicCardId(character, role);
          deck = deckSetUpgraded(deck, id, deckUpgraded(deck, id) + 1);
          lines.push(`Upgraded a ${name(id)}.`);
        }
        break;
      case "upgradeChosen":
        for (const id of answer) {
          deck = deckSetUpgraded(deck, id, deckUpgraded(deck, id) + 1);
          lines.push(`Upgraded a ${name(id)}.`);
        }
        break;
      case "maxHp": {
        // without HP on record the run starts where the game puts it (ANC-1), so the change is still counted
        const from = hp ?? startingHpAt(character, run.ascension);
        const max = Math.max(1, from.max + step.delta);
        const current =
          step.delta > 0 ? Math.min(max, from.current + step.delta) : Math.min(from.current, max);
        hp = { current, max };
        lines.push(`Max HP ${step.delta > 0 ? "+" : "−"}${String(Math.abs(step.delta))}.`);
        break;
      }
      case "hp": {
        const from = hp ?? startingHpAt(character, run.ascension);
        hp = { current: Math.max(1, Math.min(from.max, from.current + step.delta)), max: from.max };
        lines.push(`HP ${step.delta > 0 ? "+" : "−"}${String(Math.abs(step.delta))}.`);
        break;
      }
      case "info":
        lines.push(`Not tracked: ${step.text}`);
        break;
    }
  });
  const entry: OpeningEntry = {
    id: option.id,
    lines: lines.slice(0, 14).map((l) => l.slice(0, 160)),
  };
  return {
    run: { ...run, deck, hp, opening: { entries: [...run.opening.entries, entry].slice(-6) } },
    lines,
  };
}
