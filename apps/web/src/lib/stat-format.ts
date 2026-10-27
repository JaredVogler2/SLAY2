/**
 * Two small formatters for the figures of a study, kept apart from `methods-data` because that module reads the whole evidence file
 * (150 KB) and a page that only needs these must not send it to the browser (test/bundle-weight.test.ts).
 */

/** "61.2%" from a share between 0 and 1. */
export function pct(x: number, digits = 2): string {
  return `${(x * 100).toFixed(digits)}%`;
}

/** "p = 0.0018", or exponent form when tiny (exact paired tests reach hundreds of orders of magnitude below 1e-4). */
export function formatP(p: number): string {
  if (p === 0) return "p < 1e-300";
  return `p = ${p < 1e-4 ? p.toExponential(1) : p.toPrecision(2)}`;
}
