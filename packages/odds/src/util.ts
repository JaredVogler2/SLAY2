import { Rational } from "./rational";

/** Bounds-checked array access (the code base compiles with noUncheckedIndexedAccess and forbids `!`). */
export function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) {
    throw new RangeError(`index ${String(i)} out of range (length ${String(arr.length)})`);
  }
  return v;
}

/** A discrete probability distribution over keys of type K, as exact rationals. */
export type Dist<K> = Map<K, Rational>;

export function addMass<K>(dist: Dist<K>, key: K, mass: Rational): void {
  if (mass.isZero()) {
    return;
  }
  dist.set(key, (dist.get(key) ?? Rational.ZERO).add(mass));
}

export function totalMass<K>(dist: Dist<K>): Rational {
  let acc = Rational.ZERO;
  for (const m of dist.values()) {
    acc = acc.add(m);
  }
  return acc;
}

export function normalize<K>(dist: Dist<K>): { dist: Dist<K>; evidence: Rational } {
  const evidence = totalMass(dist);
  if (evidence.isZero()) {
    return { dist: new Map(), evidence };
  }
  const out: Dist<K> = new Map();
  for (const [k, m] of dist) {
    out.set(k, m.div(evidence));
  }
  return { dist: out, evidence };
}

export interface WeightedValue {
  readonly value: Rational;
  readonly weight: Rational;
}

/**
 * Central credible band of a discrete weighted distribution (weights must sum to 1): the smallest value whose
 * cumulative weight reaches `lowerTail`, and the smallest whose cumulative weight reaches `1 - lowerTail`.
 */
export function credibleBand(
  items: readonly WeightedValue[],
  lowerTail: Rational,
): { lo: Rational; hi: Rational } {
  if (items.length === 0) {
    throw new RangeError("credibleBand: empty distribution");
  }
  const sorted = [...items].sort((a, b) => a.value.cmp(b.value));
  const upperTarget = Rational.ONE.sub(lowerTail);
  let cum = Rational.ZERO;
  let lo: Rational | undefined;
  let hi: Rational | undefined;
  for (const it of sorted) {
    cum = cum.add(it.weight);
    lo ??= cum.ge(lowerTail) ? it.value : undefined;
    hi ??= cum.ge(upperTarget) ? it.value : undefined;
  }
  const first = at(sorted, 0).value;
  const last = at(sorted, sorted.length - 1).value;
  return { lo: lo ?? first, hi: hi ?? last };
}
