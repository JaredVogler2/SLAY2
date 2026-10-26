import cardvalues from "@/content/cardvalues.generated.json";

/** One measured set of card values (experiments/cardvalue, ADR-031), exported by scripts/export-site-data.mjs. */
export type CardValueSet = (typeof cardvalues.sets)[number];
export type MeasuredCard = CardValueSet["cards"][number];

/** The set the site shows. A new fit is a new file (v2) and a deliberate change here, never an edit of v1. */
export const CURRENT_SET_ID = "ironclad-a0-v1";

export function currentSet(): CardValueSet | undefined {
  return cardvalues.sets.find((s) => s.id === CURRENT_SET_ID);
}

const BY_ID: ReadonlyMap<string, MeasuredCard> = new Map(
  (currentSet()?.cards ?? []).map((c) => [c.id, c]),
);

/** The measurement of a catalog card id, if the simulated runs ever put that card in a deck at the Act-1 boss. */
export function measuredValue(cardId: string): MeasuredCard | undefined {
  return BY_ID.get(cardId);
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

export function measuredCount(): number {
  return BY_ID.size;
}

/** The ``n`` best and ``n`` worst measured cards that are not starter cards (those can only be removed, never picked). */
export function extremes(n: number): { best: MeasuredCard[]; worst: MeasuredCard[] } {
  const cards = (currentSet()?.cards ?? []).filter(
    (c) => c.id !== "STRIKE_IRONCLAD" && c.id !== "DEFEND_IRONCLAD",
  );
  return { best: cards.slice(0, n), worst: cards.slice(-n).reverse() };
}

/** How many measured cards have an interval strictly above / below zero (the rest are unclear). */
export function signCounts(): Record<ValueSign, number> {
  const out: Record<ValueSign, number> = { helps: 0, hurts: 0, unclear: 0 };
  for (const c of currentSet()?.cards ?? []) {
    out[valueSign(c)] += 1;
  }
  return out;
}
