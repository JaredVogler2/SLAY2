import type { Rational } from "@slay2/odds";

/** "12.34%" from an exact rational; rounding is exact half-up, never through floating point. */
export function pct(r: Rational, digits = 2): string {
  return r.toPercent(digits);
}

/** Compact percentage that drops pointless zeros for display: 3% / 19.72% / <0.01%. */
export function pctSmart(r: Rational, digits = 2): string {
  if (r.isZero()) {
    return "0%";
  }
  if (r.eq(1)) {
    return "100%";
  }
  const fixed = r.mul(100).toFixed(digits);
  if (Number(fixed) === 0) {
    return `<${(10 ** -digits).toFixed(digits)}%`;
  }
  return `${fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed}%`;
}

/** Truncate very long exact fractions for display ("123456…/987654…") while keeping the full value for copy. */
export function shortFraction(r: Rational, max = 28): string {
  const s = r.toString();
  return s.length <= max
    ? s
    : `${s.slice(0, Math.floor(max / 2) - 1)}…/…${s.slice(-(Math.floor(max / 2) - 1))}`;
}
