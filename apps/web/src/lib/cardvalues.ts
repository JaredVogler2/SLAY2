import { getCard } from "@slay2/game-data";

import cardvalues from "@/content/cardvalues.generated.json";
import type { PooledTest } from "@/lib/synergy-evidence";

/**
 * The held-out test of acting on a class's values, when it has been run: by default the policy that follows them against
 * the one that follows the hand-written ratings (rules_v2 against rules_v1 on the same seeds); a set that replaces an
 * earlier measurement is tested against the pilot that follows the earlier one (ADR-046).
 */
export interface Validation {
  readonly comparison: string;
  /** significance level fixed before the test (ADR-031 / ADR-034 / ADR-046) */
  readonly alpha: number;
  readonly pairedGames: number;
  readonly passRate: number;
  readonly passRateBase: number;
  /** exact McNemar p-value of "got past the Act-1 boss" on the shared seeds */
  readonly p: number;
  /** what the pilot that followed these values was compared with: "ratings" (the hand-written ones) or "first-values" */
  readonly against: string;
  readonly passed: boolean;
}

/** The baseline of a held-out test, in words. */
export function againstText(v: Validation): string {
  return v.against === "first-values"
    ? "the first measurement of the values"
    : v.against === "current-values"
      ? "the values measured in the simulator that drops the relics"
      : "the hand-written ratings";
}

/** How far a set that replaces an earlier one moved from it (a descriptive comparison, ADR-046; not a test). */
export interface Drift {
  readonly previous: string;
  readonly previousSha256: string;
  readonly previousBossFights: number;
  readonly previousPassRate: number;
  /** cards measured in both */
  readonly cardsInBoth: number;
  /** Spearman correlation of the two sets of values over those cards */
  readonly spearman: number;
  /** the k best and k worst cards of one compared with the other's */
  readonly k: number;
  readonly bestShared: number;
  readonly worstShared: number;
  /** cards whose 95 % intervals do not overlap */
  readonly disjointIntervals: number;
  /** two measurements of the same pilot: the games split by seed, cards fitted in both halves */
  readonly noiseCards: number;
  readonly noiseSpearman: number;
  /** the same corrected to the full number of games, 2r / (1 + r) */
  readonly noiseSpearmanBrown: number;
}

export interface MeasuredCard {
  /** catalog id */
  readonly id: string;
  /** the simulator's own name for the card (it appends `_CARD` when the name collides with a power) */
  readonly simId: string;
  /** log-odds of getting past the Act-1 boss per extra copy */
  readonly beta: number;
  readonly ci95: readonly number[];
  readonly gamesWithCard: number;
  readonly staticRating: number | null;
}

/** One measured set of card values for one class (experiments/cardvalue, ADR-031 / ADR-034), exported by scripts/export-site-data.mjs. */
export interface CardValueSet {
  readonly id: string;
  readonly character: string;
  readonly validation: Validation | null;
  /** the id of the set this one replaces, and how far it moved from it */
  readonly supersedes: string | null;
  readonly drift: Drift | null;
  /** whether the runs the values were fitted from kept the relics they gained (the pinned simulator drops them: gap G14, ADR-052) */
  readonly relicsKept: boolean;
  readonly file: string;
  readonly sha256: string;
  readonly outcome: string;
  readonly games: number;
  readonly bossFights: number;
  readonly passRate: number;
  readonly model: {
    readonly l2: number;
    readonly folds: number;
    readonly features: number;
    readonly bootstrapDraws: number;
    readonly cvLogLoss: number;
    readonly cvAuc: number;
    readonly baselineLogLoss: number;
  };
  readonly spearmanWithStaticRating: number | null;
  readonly batches: readonly { readonly id: string; readonly contentSha256: string }[];
  readonly cards: readonly MeasuredCard[];
}

/** One class of the test of the values measured again with the relics kept (ADR-053). */
export interface KeepValuesClass {
  readonly new: {
    readonly file: string;
    readonly sha256: string;
    /** the games the new fit rests on, those that reached the Act-1 boss, and the share that got past it */
    readonly games: number;
    readonly bossFights: number;
    readonly passRate: number;
  };
  readonly current: { readonly file: string; readonly sha256: string };
  /** this class's own comparison (descriptive; the pooled test is the registered one): pairs only the new values / only the current ones got past the boss */
  readonly own: { readonly aOnly: number; readonly bOnly: number; readonly p: number };
  /** the class's own comparison shows the current values significantly ahead (two-sided exact McNemar, level 0.05) */
  readonly currentSignificantlyAhead: boolean;
  /** the rule of ADR-053 item 5 gives this class the new values */
  readonly adopted: boolean;
}

/**
 * The one registered held-out test of the card values measured again with the relics kept (ADR-053): `rules_v3` following the new
 * values against `rules_v3` following the values the site showed, both with the relics kept, five classes pooled.
 */
export interface KeepValuesTest {
  readonly adr: string;
  readonly alpha: number;
  readonly primary: PooledTest;
  /** the exporter's reading (a `KeepValuesVerdict`); the page recomputes it with `keepValuesVerdict` */
  readonly verdict: string;
  readonly adopted: readonly string[];
  readonly classes: Readonly<Record<string, KeepValuesClass>>;
}

/** The reading rule of ADR-053 item 5: a significant pooled gain for the new values, a significant loss, or neither. */
export type KeepValuesVerdict = "gain" | "loss" | "none";

export function keepValuesVerdict(
  test: Pick<KeepValuesTest, "alpha" | "primary">,
): KeepValuesVerdict {
  const t = test.primary.reachedAct2.pairedTable;
  if (t.mcnemar_p >= test.alpha) return "none";
  return t.a_only > t.b_only ? "gain" : "loss";
}

/** The test, once it has been run and read (null before). */
export const KEEP_VALUES_TEST: KeepValuesTest | null = cardvalues.keepTest;

const SETS: readonly CardValueSet[] = cardvalues.sets;

/** A card's measurement together with the set it came from (a colorless card can be measured once per class). */
export interface Measurement {
  readonly card: MeasuredCard;
  readonly set: CardValueSet;
}

export interface ValueIndex {
  readonly sets: readonly CardValueSet[];
  readonly byClass: ReadonlyMap<string, CardValueSet>;
  readonly byCard: ReadonlyMap<string, readonly Measurement[]>;
}

/** Index a list of sets; one set per class (a later file for the same class is a deliberate replacement, not a merge). */
export function buildIndex(sets: readonly CardValueSet[]): ValueIndex {
  const byClass = new Map<string, CardValueSet>();
  for (const s of sets) {
    byClass.set(s.character, s);
  }
  const byCard = new Map<string, Measurement[]>();
  for (const set of byClass.values()) {
    for (const card of set.cards) {
      const list = byCard.get(card.id) ?? [];
      list.push({ card, set });
      byCard.set(card.id, list);
    }
  }
  return { sets: [...byClass.values()], byClass, byCard };
}

const INDEX = buildIndex(SETS);

export function allSets(index: ValueIndex = INDEX): readonly CardValueSet[] {
  return index.sets;
}

/** The measured set of a class, or nothing when that class has not been measured. */
export function setFor(character: string, index: ValueIndex = INDEX): CardValueSet | undefined {
  return index.byClass.get(character);
}

/**
 * Whether acting on a class's values beat their baseline (the hand-written ratings, or for a set that replaces an earlier
 * one that earlier measurement) in the pre-registered held-out test. Values of a class that was not tested, or failed the
 * test, are still shown as measurements; they are never offered as a second opinion.
 */
export function isValidated(set: CardValueSet | undefined): boolean {
  return set?.validation?.passed === true;
}

/** Every measurement of a catalog card id (the card's own class first for class cards, one per class for colorless cards). */
export function measurementsOf(cardId: string, index: ValueIndex = INDEX): readonly Measurement[] {
  return index.byCard.get(cardId) ?? [];
}

/** The measurement of a card within one class's set. */
export function measuredValue(
  cardId: string,
  character: string,
  index: ValueIndex = INDEX,
): Measurement | undefined {
  return measurementsOf(cardId, index).find((m) => m.set.character === character);
}

export type ValueSign = "helps" | "hurts" | "unclear";

/** "helps" / "hurts" only when the whole 95 % bootstrap interval is on one side of zero. */
export function valueSign(m: Pick<MeasuredCard, "ci95">): ValueSign {
  const [lo, hi] = m.ci95;
  if (lo !== undefined && lo > 0) return "helps";
  if (hi !== undefined && hi < 0) return "hurts";
  return "unclear";
}

/** Signed value with a real minus sign, two decimals: the unit is log-odds per extra copy. */
export function formatBeta(beta: number): string {
  return `${beta >= 0 ? "+" : "−"}${Math.abs(beta).toFixed(2)}`;
}

/** The same number as a multiplier on the odds of getting past the Act-1 boss ("×5.7"). */
export function oddsMultiplier(beta: number): string {
  const x = Math.exp(beta);
  return `×${x >= 10 ? x.toFixed(0) : x.toFixed(x >= 1 ? 1 : 2)}`;
}

export function measuredCount(index: ValueIndex = INDEX): number {
  return index.sets.reduce((n, s) => n + s.cards.length, 0);
}

/** The ``n`` best and ``n`` worst measured cards of a set that are not starter cards (those can only be removed, never picked). */
export function extremes(
  set: CardValueSet,
  n: number,
): { best: readonly MeasuredCard[]; worst: readonly MeasuredCard[] } {
  const cards = set.cards.filter((c) => getCard(c.id)?.rarity !== "basic");
  return { best: cards.slice(0, n), worst: cards.slice(-n).reverse() };
}

/** How many measured cards of a set have an interval strictly above / below zero (the rest are unclear). */
export function signCounts(set: CardValueSet): Record<ValueSign, number> {
  const out: Record<ValueSign, number> = { helps: 0, hurts: 0, unclear: 0 };
  for (const c of set.cards) {
    out[valueSign(c)] += 1;
  }
  return out;
}

export const MEASURABLE_CLASSES = [
  "ironclad",
  "silent",
  "regent",
  "necrobinder",
  "defect",
] as const;

export type CoverageState = "validated" | "measured" | "untested" | "none";

export interface CoverageLine {
  readonly character: string;
  readonly label: string;
  readonly state: CoverageState;
  readonly detail: string;
}

const LABEL: Record<string, string> = {
  ironclad: "Ironclad",
  silent: "Silent",
  regent: "Regent",
  necrobinder: "Necrobinder",
  defect: "Defect",
};

const pct1 = (x: number): string => `${(x * 100).toFixed(1)}%`;
const pText = (p: number): string =>
  p === 0 ? "p < 1e-300" : `p = ${p < 1e-4 ? p.toExponential(1) : p.toPrecision(2)}`;

/** Where each class stands: nothing, measured but not tested, tested without improvement, or tested and improved. Read from the data. */
export function coverage(index: ValueIndex = INDEX): CoverageLine[] {
  return MEASURABLE_CLASSES.map((character) => {
    const set = index.byClass.get(character);
    const label = LABEL[character] ?? character;
    if (!set) {
      return { character, label, state: "none", detail: "not measured yet" };
    }
    const v = set.validation;
    if (!v) {
      return {
        character,
        label,
        state: "untested",
        detail: `${String(set.cards.length)} cards measured, not tested against play yet`,
      };
    }
    const result = `got past the Act-1 boss in ${pct1(v.passRate)} of ${v.pairedGames.toLocaleString("en-US")} held-out simulated games against ${pct1(v.passRateBase)} for ${againstText(v)} (${pText(v.p)})`;
    return v.passed
      ? { character, label, state: "validated", detail: `playing by the measured values ${result}` }
      : {
          character,
          label,
          state: "measured",
          detail: `measured, but playing by the values did not beat ${againstText(v)} at the pre-registered level (${result})`,
        };
  });
}
