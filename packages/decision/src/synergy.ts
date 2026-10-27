import {
  MECHANICS,
  MECHANIC_IDS,
  benefitsFrom,
  getRelic,
  innateSupply,
  relicSupply,
  relicTags,
  resolveRelics,
  synergyTags,
  type CardEntry,
  type MechanicId,
  type PlayableClass,
  type Scaler,
} from "@slay2/game-data";

import type { DeckEntry } from "./profile";

/**
 * Synergy: a card is worth more when the deck supplies what it needs and less when it does not, and a card that supplies
 * what other cards need is worth more when the deck holds them. All of this is SLAY2's judgement of mechanics (the tag
 * table in `@slay2/game-data`), with hand-set strengths; none of it is measured yet. It replaces the one Ironclad-only
 * Strength-and-multi-hit term the first version had, so a card was rated by its own static rating and by which role the
 * deck lacked, whatever else was in the deck.
 *
 * Three parts, each in the advisor's index points:
 *
 * 1. Needs. A card's rating (`prior`) is read as its worth when what it needs is there. Per card in the deck:
 *      supply_m      = what the class's starting relic gives of mechanic m (the Osty of the Necrobinder) + sum over the
 *                      deck of copies x what the card gives of it
 *      fit           = sum over the card's needs of weight x saturation(supply_m) / sum of weights        (0 to 1)
 *      heldBack      = min(0.7, 0.25 x sum of weights) x (1 - fitUsed),  fitUsed = fit + future x (1 - fit)
 *    where `future` is the share of the gap the picks still to come are expected to close (larger in early acts).
 * 2. Scalers. Strength lifts every attack, Dexterity every card that gives Block, Focus every orb, by up to 25 % of its
 *    rating at full supply.
 * 3. Engines. A mechanic with both sources and payoffs in the deck is worth more than either alone:
 *      engine_m = E_m x saturation(sources) x (1 - exp(-payoff weight / 3))
 *
 *    realized = prior x (1 - heldBack) x (1 + scaler)
 *    synergy  = sum over the deck of (realized - prior) / 12  +  sum over mechanics of engine_m
 *
 * Adding a card changes the synergy through its own needs, through what it supplies to the cards already there, and through
 * the engines it starts or completes; `explainAddition` splits the change that way so the advisor can say which.
 */

export type Supply = Readonly<Record<MechanicId, number>>;

/**
 * How much of each hand-set part of the synergy term the index keeps: 1 is the first judgement, less means the simulated runs
 * valued the part less than the judgement did (ADR-050: stage B1 read the parts against simulated runs, stage B2 tests the index
 * with a pilot that plays by it). The strengths below are the judgement; these are what was kept of it. They are the strengths of
 * the pilot that the development stage chose on development seeds (addendum D): unmet needs in full, the lift from scalers at 0.7
 * of the judgement, and no engine credit. Engines are still found and named (`deckSynergy`, the explanations); the index does not
 * count them.
 */
export const PART_WEIGHT: Readonly<{ needs: number; scalers: number; engines: number }> = {
  needs: 1,
  scalers: 0.7,
  engines: 0,
};

/** The share of a card's rating that one unit of need weight puts at stake; a core need (weight 3) hits the cap. */
export const DEPENDENCE_PER_WEIGHT = 0.25;
export const MAX_DEPENDENCE = 0.7;

/** How much of the missing support the picks still to come are expected to bring, by act (a judgement: less each act). */
export const FUTURE_SUPPORT: readonly [number, number, number] = [0.3, 0.15, 0.05];

/** A scaler lifts every card of its kind by up to `beta` of the card's rating, in proportion to the supply it saturates. */
export const SCALER_BETA: Readonly<Record<Scaler, number>> = {
  strength: 0.25,
  dexterity: 0.25,
  focus: 0.25,
};

/** The held-back and scaler parts are divided by this many cards, so a long deck does not dilute what one engine card is worth. */
export const SYNERGY_CARDS = 12;

/** Units of payoff weight at which an engine's payoffs count 63 % (a core payoff has weight 3). */
export const ENGINE_PAYOFF_SCALE = 3;

export function saturation(mechanic: MechanicId, supply: number): number {
  return 1 - Math.exp(-Math.max(0, supply) / MECHANICS[mechanic].k);
}

export function emptySupply(): Record<MechanicId, number> {
  return Object.fromEntries(MECHANIC_IDS.map((m) => [m, 0])) as Record<MechanicId, number>;
}

/**
 * What a run has besides the cards of its deck: the class (its starting relic supplies some mechanics) and the relics it has taken
 * since, which stay for the rest of the run (their tags are SLAY2's judgement and are not yet tested in simulation, ADR-051).
 */
export interface Setting {
  readonly character: PlayableClass | null;
  readonly relics: readonly string[];
}

/** A class on its own (what the index always took) or the whole setting. */
export type SettingInput = PlayableClass | Setting | null | undefined;

export function settingOf(input: SettingInput): Setting {
  if (input === null || input === undefined) return { character: null, relics: [] };
  return typeof input === "string" ? { character: input, relics: [] } : input;
}

/**
 * What the deck supplies of each mechanic: the class's starting relic (always there), the relics taken since, and every card's
 * `gives`, per copy.
 */
export function supplyOf(
  entries: readonly DeckEntry[],
  input?: SettingInput,
): Record<MechanicId, number> {
  const { character, relics } = settingOf(input);
  const supply = emptySupply();
  const innate = innateSupply(character)?.gives ?? {};
  const fromRelics = relicSupply(relics);
  for (const m of MECHANIC_IDS) supply[m] += (innate[m] ?? 0) + fromRelics[m];
  for (const { card, count } of entries) {
    const gives = synergyTags(card).gives;
    for (const m of MECHANIC_IDS) {
      const g = gives[m];
      if (g) supply[m] += g * count;
    }
  }
  return supply;
}

/** The total weight of the deck's needs for each mechanic: what the supply is for. */
export function payoffMassOf(entries: readonly DeckEntry[]): Record<MechanicId, number> {
  const mass = emptySupply();
  for (const { card, count } of entries) {
    const wants = synergyTags(card).wants;
    for (const m of MECHANIC_IDS) {
      const w = wants[m];
      if (w) mass[m] += w * count;
    }
  }
  return mass;
}

export interface Needs {
  readonly list: readonly (readonly [MechanicId, number])[];
  readonly total: number;
  /** The share of the card's rating that rides on its needs (0 for a card with none). */
  readonly share: number;
}

const NEEDS = new Map<string, Needs>();

export function needsOf(card: CardEntry): Needs {
  const hit = NEEDS.get(card.id);
  if (hit) return hit;
  const list = MECHANIC_IDS.flatMap((m) => {
    const w = synergyTags(card).wants[m];
    return w ? ([[m, w]] as const) : [];
  });
  const total = list.reduce((acc, [, w]) => acc + w, 0);
  const needs: Needs = {
    list,
    total,
    share: PART_WEIGHT.needs * Math.min(MAX_DEPENDENCE, DEPENDENCE_PER_WEIGHT * total),
  };
  NEEDS.set(card.id, needs);
  return needs;
}

/** How well the supply covers the card's needs, 0 to 1; a card with no needs is fully covered. */
export function fitOf(card: CardEntry, supply: Supply): number {
  const { list, total } = needsOf(card);
  if (total === 0) return 1;
  const scale = synergyTags(card).scale;
  return (
    list.reduce((acc, [m, w]) => acc + w * saturation(m, supply[m] / (scale[m] ?? 1)), 0) / total
  );
}

function scalerBonus(card: CardEntry, supply: Supply): number {
  let bonus = 0;
  for (const s of benefitsFrom(card)) {
    bonus += PART_WEIGHT.scalers * SCALER_BETA[s] * saturation(s, supply[s]);
  }
  return bonus;
}

export interface Realized {
  readonly prior: number;
  readonly fit: number;
  /** Share of the rating held back by needs the deck does not meet, after the picks still to come (0 to 0.7). */
  readonly heldBack: number;
  /** Relative lift from scalers (Strength for attacks and so on). */
  readonly scaler: number;
  readonly value: number;
}

export function realizedOf(card: CardEntry, supply: Supply, actIndex: 0 | 1 | 2): Realized {
  const needs = needsOf(card);
  const fit = fitOf(card, supply);
  const fitUsed = fit + FUTURE_SUPPORT[actIndex] * (1 - fit);
  const heldBack = needs.share * (1 - fitUsed);
  const scaler = scalerBonus(card, supply);
  return {
    prior: card.prior,
    fit,
    heldBack,
    scaler,
    value: card.prior * (1 - heldBack) * (1 + scaler),
  };
}

/** The sum over the deck of `realized - prior`: negative while needs go unmet, positive when scalers have plenty to lift. */
export function realizedMass(
  entries: readonly DeckEntry[],
  actIndex: 0 | 1 | 2,
  setting?: SettingInput,
): number {
  const supply = supplyOf(entries, setting);
  let mass = 0;
  for (const { card, count } of entries) {
    const r = realizedOf(card, supply, actIndex);
    mass += count * (r.value - r.prior);
  }
  return mass;
}

/**
 * Points an engine of this mechanic is worth to the deck: sources and payoffs together, each saturating. `weighted` false gives
 * the strength as first judged, before the part weight (what the deck is building, whatever the index counts of it).
 */
export function engineValue(
  mechanic: MechanicId,
  supply: number,
  payoff: number,
  weighted = true,
): number {
  return (
    (weighted ? PART_WEIGHT.engines : 1) *
    MECHANICS[mechanic].engine *
    saturation(mechanic, supply) *
    (1 - Math.exp(-Math.max(0, payoff) / ENGINE_PAYOFF_SCALE))
  );
}

export function enginesOf(
  entries: readonly DeckEntry[],
  setting?: SettingInput,
  weighted = true,
): Record<MechanicId, number> {
  const supply = supplyOf(entries, setting);
  const payoff = payoffMassOf(entries);
  return Object.fromEntries(
    MECHANIC_IDS.map((m) => [m, engineValue(m, supply[m], payoff[m], weighted)]),
  ) as Record<MechanicId, number>;
}

/** The deck's synergy in index points. */
export function synergyOf(
  entries: readonly DeckEntry[],
  actIndex: 0 | 1 | 2,
  setting?: SettingInput,
): number {
  const engines = enginesOf(entries, setting);
  return (
    realizedMass(entries, actIndex, setting) / SYNERGY_CARDS +
    MECHANIC_IDS.reduce((acc, m) => acc + engines[m], 0)
  );
}

// ----------------------------------------------------------------------------------------------------- explanation

export interface Partner {
  readonly name: string;
  /** How many copies of the card the deck holds. */
  readonly count: number;
  /** The mechanic the new card changes for this one (a need of it, or a scaler that lifts it). */
  readonly mechanic: MechanicId;
  /** Change in the card's realized rating, in rating points per copy. */
  readonly gain: number;
}

export interface Need {
  readonly mechanic: MechanicId;
  readonly label: string;
  readonly weight: number;
  /** The cards in the deck (with the new one) that supply the mechanic, best first; `itself` when the new card does. */
  readonly suppliers: readonly string[];
}

export interface EngineChange {
  readonly mechanic: MechanicId;
  readonly label: string;
  /** The change in index points that the index counts (`PART_WEIGHT.engines` of `judged`). */
  readonly delta: number;
  /** The change as first judged, before the part weight: what the engine is worth whatever the index counts of it. */
  readonly judged: number;
  /** Cards (of the deck with the new one) that supply the mechanic, and cards that depend on it, best first. */
  readonly sources: readonly string[];
  readonly payoffs: readonly string[];
}

export interface SynergyExplanation {
  /** The new card's own needs, in index points: its realized rating against its static one. */
  readonly own: {
    readonly delta: number;
    readonly needs: readonly Need[];
    readonly heldBack: number;
    readonly scaler: number;
  };
  /** What the new card supplies to the cards already in the deck, in index points. */
  readonly support: { readonly delta: number; readonly partners: readonly Partner[] };
  /** Engines the card starts, completes or weakens, in index points. */
  readonly engines: { readonly delta: number; readonly changes: readonly EngineChange[] };
}

function ranked(
  entries: readonly DeckEntry[],
  value: (card: CardEntry) => number,
  exclude?: string,
): string[] {
  return entries
    .map((e) => ({ name: e.card.name, v: value(e.card) * e.count }))
    .filter((s) => s.v > 0 && s.name !== exclude)
    .sort((a, b) => b.v - a.v || (a.name < b.name ? -1 : 1))
    .slice(0, 4)
    .map((s) => s.name);
}

/**
 * Who supplies a mechanic, best first: the class's starting relic when it does, the relics taken since, then the cards of the deck.
 */
function suppliersOf(
  entries: readonly DeckEntry[],
  mechanic: MechanicId,
  input: SettingInput,
): string[] {
  const { character, relics } = settingOf(input);
  const innate = innateSupply(character);
  const start = innate && (innate.gives[mechanic] ?? 0) > 0 ? [innate.relic] : [];
  const taken = resolveRelics(relics)
    .known.map((id) => ({ name: getRelic(id)?.name ?? id, g: relicTags(id).gives[mechanic] ?? 0 }))
    .filter((r) => r.g > 0)
    .sort((a, b) => b.g - a.g || (a.name < b.name ? -1 : 1))
    .map((r) => r.name);
  return [...start, ...taken, ...ranked(entries, (c) => synergyTags(c).gives[mechanic] ?? 0)].slice(
    0,
    4,
  );
}

/** What adding one copy of `card` does to the synergy, split into its own needs, its support for others and the engines. */
export function explainAddition(
  entries: readonly DeckEntry[],
  card: CardEntry,
  actIndex: 0 | 1 | 2,
  withCardEntries: readonly DeckEntry[],
  setting?: SettingInput,
): SynergyExplanation {
  const before = supplyOf(entries, setting);
  const after = supplyOf(withCardEntries, setting);
  const partners: Partner[] = [];
  let support = 0;
  for (const { card: d, count } of entries) {
    const r0 = realizedOf(d, before, actIndex);
    const r1 = realizedOf(d, after, actIndex);
    const gain = r1.value - r0.value;
    support += count * gain;
    if (Math.abs(gain) * count >= 0.5) {
      const via = [
        ...needsOf(d).list.map(([m]) => m),
        ...(benefitsFrom(d) as readonly MechanicId[]),
      ].filter((m) => after[m] !== before[m]);
      partners.push({ name: d.name, count, mechanic: via[0] ?? "attack", gain });
    }
  }
  partners.sort(
    (a, b) => Math.abs(b.gain * b.count) - Math.abs(a.gain * a.count) || (a.name < b.name ? -1 : 1),
  );
  const own = realizedOf(card, after, actIndex);
  const needs: Need[] = needsOf(card).list.map(([mechanic, weight]) => ({
    mechanic,
    label: MECHANICS[mechanic].label,
    weight,
    suppliers: suppliersOf(withCardEntries, mechanic, setting).map((n) =>
      n === card.name ? "itself" : n,
    ),
  }));
  const e0 = enginesOf(entries, setting);
  const e1 = enginesOf(withCardEntries, setting);
  const j0 = enginesOf(entries, setting, false);
  const j1 = enginesOf(withCardEntries, setting, false);
  const everyChange = MECHANIC_IDS.map((m) => ({
    mechanic: m,
    label: MECHANICS[m].label,
    delta: e1[m] - e0[m],
    judged: j1[m] - j0[m],
    sources: suppliersOf(withCardEntries, m, setting),
    payoffs: ranked(withCardEntries, (c) => synergyTags(c).wants[m] ?? 0),
  }));
  // the sum is over every mechanic, so that the parts add up to the change in the deck's synergy exactly; only the list that is
  // shown leaves out the changes too small to mention, and it goes by the engine as first judged: the engines a card would build
  // or weaken are named whatever the index counts of them
  const changes: EngineChange[] = everyChange
    .filter((c) => Math.abs(c.judged) >= 0.01)
    .sort((a, b) => Math.abs(b.judged) - Math.abs(a.judged));
  return {
    own: {
      delta: (own.value - own.prior) / SYNERGY_CARDS,
      needs,
      heldBack: own.heldBack,
      scaler: own.scaler,
    },
    support: { delta: support / SYNERGY_CARDS, partners },
    engines: { delta: everyChange.reduce((acc, c) => acc + c.delta, 0), changes },
  };
}

// --------------------------------------------------------------------------------------------------- the deck as it is

export interface DeckEngine {
  readonly mechanic: MechanicId;
  readonly label: string;
  /** How strong the engine is as first judged, in index points before the part weight (the index counts `PART_WEIGHT.engines` of it). */
  readonly value: number;
  readonly sources: readonly string[];
  readonly payoffs: readonly string[];
}

export interface WaitingCard {
  readonly name: string;
  readonly count: number;
  /** The needs that are least covered, with the cards that supply them so far. */
  readonly lacking: readonly { readonly label: string; readonly suppliers: readonly string[] }[];
  /** Share of the card's rating held back (0 to 0.7). */
  readonly heldBack: number;
}

export interface DeckSynergy {
  /** The deck's synergy in index points: needs met or unmet, scalers and engines together. */
  readonly total: number;
  readonly engines: readonly DeckEngine[];
  readonly waiting: readonly WaitingCard[];
}

/** The engines a deck has built and the cards still waiting for support, for the advisor to show beside the ranking. */
export function deckSynergy(
  entries: readonly DeckEntry[],
  actIndex: 0 | 1 | 2,
  setting?: SettingInput,
): DeckSynergy {
  const supply = supplyOf(entries, setting);
  // what the deck is building is shown as first judged: the index may count little or none of an engine, but a player still wants
  // to see which cards feed which
  const values = enginesOf(entries, setting, false);
  const engines: DeckEngine[] = MECHANIC_IDS.filter((m) => values[m] >= 0.5)
    .sort((a, b) => values[b] - values[a])
    .slice(0, 4)
    .map((m) => ({
      mechanic: m,
      label: MECHANICS[m].label,
      value: values[m],
      sources: suppliersOf(entries, m, setting),
      payoffs: ranked(entries, (c) => synergyTags(c).wants[m] ?? 0),
    }));
  const waiting: WaitingCard[] = [];
  for (const { card, count } of entries) {
    const r = realizedOf(card, supply, actIndex);
    if (r.heldBack < 0.15) continue;
    const scale = synergyTags(card).scale;
    const lacking = needsOf(card)
      .list.map(([m, w]) => ({ m, w, s: saturation(m, supply[m] / (scale[m] ?? 1)) }))
      .filter((n) => n.s < 0.5)
      .sort((a, b) => b.w * (1 - b.s) - a.w * (1 - a.s))
      .map((n) => ({
        label: MECHANICS[n.m].label,
        suppliers: suppliersOf(entries, n.m, setting),
      }));
    if (lacking.length > 0) waiting.push({ name: card.name, count, lacking, heldBack: r.heldBack });
  }
  waiting.sort((a, b) => b.heldBack - a.heldBack || (a.name < b.name ? -1 : 1));
  return { total: synergyOf(entries, actIndex, setting), engines, waiting: waiting.slice(0, 5) };
}
