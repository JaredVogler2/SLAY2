import { Rational } from "./rational";

/** Exact binomial coefficient C(n, k) as a BigInt (0 outside 0 <= k <= n). */
export function choose(n: number, k: number): bigint {
  assertCount(n, "n");
  assertCount(k, "k");
  if (k > n) {
    return 0n;
  }
  const kk = Math.min(k, n - k);
  let acc = 1n;
  for (let i = 1; i <= kk; i += 1) {
    acc = (acc * BigInt(n - kk + i)) / BigInt(i);
  }
  return acc;
}

export function assertCount(x: number, name: string): void {
  if (!Number.isInteger(x) || x < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${String(x)}`);
  }
}

/** P(X = x) when drawing `n` cards without replacement from `total` containing `successes` targets. */
export function hypergeometricPmf(
  total: number,
  successes: number,
  draws: number,
  x: number,
): Rational {
  assertCount(total, "total");
  assertCount(successes, "successes");
  assertCount(draws, "draws");
  if (successes > total || draws > total) {
    throw new RangeError("hypergeometric: successes and draws cannot exceed total");
  }
  if (x < 0 || x > successes || x > draws || draws - x > total - successes) {
    return Rational.ZERO;
  }
  return Rational.of(
    choose(successes, x) * choose(total - successes, draws - x),
    choose(total, draws),
  );
}

/** The whole PMF, index = number of targets drawn. Sums to exactly 1. */
export function hypergeometricDistribution(
  total: number,
  successes: number,
  draws: number,
): Rational[] {
  const out: Rational[] = [];
  for (let x = 0; x <= Math.min(successes, draws); x += 1) {
    out.push(hypergeometricPmf(total, successes, draws, x));
  }
  return out;
}

/** P(X >= need). */
export function hypergeometricAtLeast(
  total: number,
  successes: number,
  draws: number,
  need: number,
): Rational {
  assertCount(need, "need");
  let acc = Rational.ZERO;
  for (let x = need; x <= Math.min(successes, draws); x += 1) {
    acc = acc.add(hypergeometricPmf(total, successes, draws, x));
  }
  return acc;
}

/** E[X] = draws * successes / total. */
export function hypergeometricMean(total: number, successes: number, draws: number): Rational {
  if (total === 0) {
    return Rational.ZERO;
  }
  return Rational.of(BigInt(draws) * BigInt(successes), total);
}
