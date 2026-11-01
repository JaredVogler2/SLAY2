import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { R, Rational, sum } from "../src/index";

const arbRational = fc
  .tuple(fc.integer({ min: -10_000, max: 10_000 }), fc.integer({ min: 1, max: 10_000 }))
  .map(([n, d]) => R(n, d));

describe("Rational construction", () => {
  it("normalises sign and common factors", () => {
    expect(R(2, 4).toString()).toBe("1/2");
    expect(R(3, -6).toString()).toBe("-1/2");
    expect(R(0, 7).toString()).toBe("0");
    expect(R(-0, 5).eq(0)).toBe(true);
  });

  it("rejects zero denominators and unsafe integers", () => {
    expect(() => R(1, 0)).toThrow(RangeError);
    expect(() => R(1.5)).toThrow(RangeError);
    expect(() => Rational.of(Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
  });

  it("parses decimals and fractions exactly", () => {
    expect(Rational.parse("0.03").eq(R(3, 100))).toBe(true);
    expect(Rational.parse("-0.05").eq(R(-5, 100))).toBe(true);
    expect(Rational.parse("1.49").eq(R(149, 100))).toBe(true);
    expect(Rational.parse("3/100").eq(R(3, 100))).toBe(true);
    expect(Rational.parse("1e-3").eq(R(1, 1000))).toBe(true);
    expect(Rational.parse("12").eq(12)).toBe(true);
    expect(Rational.parse(".5").eq(R(1, 2))).toBe(true);
    expect(() => Rational.parse("abc")).toThrow(SyntaxError);
    expect(() => Rational.parse("")).toThrow(SyntaxError);
    expect(() => Rational.parse("1/")).toThrow(SyntaxError);
  });

  it("is exact where floating point is not", () => {
    // 0.1 + 0.2 !== 0.3 in IEEE doubles
    expect(Rational.parse("0.1").add(Rational.parse("0.2")).eq(Rational.parse("0.3"))).toBe(true);
  });
});

describe("Rational arithmetic", () => {
  it("handles the basics", () => {
    expect(R(1, 3).add(R(1, 6)).eq(R(1, 2))).toBe(true);
    expect(R(1, 2).sub(R(3, 4)).eq(R(-1, 4))).toBe(true);
    expect(R(2, 3).mul(R(3, 4)).eq(R(1, 2))).toBe(true);
    expect(R(1, 2).div(R(1, 4)).eq(2)).toBe(true);
    expect(R(-3, 4).abs().eq(R(3, 4))).toBe(true);
    expect(R(2, 3).pow(3).eq(R(8, 27))).toBe(true);
    expect(R(2, 3).pow(-2).eq(R(9, 4))).toBe(true);
    expect(() => R(1, 2).div(0)).toThrow(RangeError);
    expect(() => R(1, 2).pow(0.5)).toThrow(RangeError);
  });

  it("floors and ceils toward the right infinity", () => {
    expect(R(7, 2).floor()).toBe(3n);
    expect(R(7, 2).ceil()).toBe(4n);
    expect(R(-7, 2).floor()).toBe(-4n);
    expect(R(-7, 2).ceil()).toBe(-3n);
    expect(R(4).floor()).toBe(4n);
    expect(R(-4).ceil()).toBe(-4n);
  });

  it("clamps, mins and maxes", () => {
    expect(R(-1, 5).clamp(0, 1).eq(0)).toBe(true);
    expect(R(6, 5).clamp(0, 1).eq(1)).toBe(true);
    expect(R(1, 5).clamp(0, 1).eq(R(1, 5))).toBe(true);
    expect(R(1, 3).min(R(1, 4)).eq(R(1, 4))).toBe(true);
    expect(R(1, 3).max(R(1, 4)).eq(R(1, 3))).toBe(true);
  });

  it("sums many values exactly", () => {
    expect(sum(Array.from({ length: 100 }, () => R(1, 100))).eq(1)).toBe(true);
    expect(sum([]).eq(0)).toBe(true);
  });

  it("compares equal values as 0 in both directions, never as -0 (the property test below once failed on this)", () => {
    for (const x of [R(0), R(-1), R(1, 3), R(-7, 2)]) {
      expect(x.cmp(R(x.n, x.d))).toBe(0);
      expect(R(x.n, x.d).cmp(x)).toBe(0);
      expect(x.cmp(x) + x.cmp(x)).toBe(0);
    }
    expect(R(1, 2).cmp(R(1, 3))).toBe(1);
    expect(R(1, 3).cmp(R(1, 2))).toBe(-1);
  });

  it("satisfies the field axioms (property tests)", () => {
    fc.assert(
      fc.property(arbRational, arbRational, arbRational, (a, b, c) => {
        expect(a.add(b).eq(b.add(a))).toBe(true);
        expect(a.mul(b).eq(b.mul(a))).toBe(true);
        expect(
          a
            .add(b)
            .add(c)
            .eq(a.add(b.add(c))),
        ).toBe(true);
        expect(a.mul(b.add(c)).eq(a.mul(b).add(a.mul(c)))).toBe(true);
        expect(a.sub(a).isZero()).toBe(true);
        if (!a.isZero()) {
          expect(a.mul(a.inv()).eq(1)).toBe(true);
        }
        // antisymmetry, written as a sum: -b.cmp(a) is -0 when the two are equal, and toBe compares with Object.is
        expect(a.cmp(b) + b.cmp(a)).toBe(0);
      }),
      { numRuns: 300 },
    );
  });
});

describe("display boundary", () => {
  it("formats decimals with exact half-up rounding", () => {
    expect(R(1, 3).toFixed(4)).toBe("0.3333");
    expect(R(2, 3).toFixed(4)).toBe("0.6667");
    expect(R(1, 8).toFixed(2)).toBe("0.13");
    expect(R(-1, 8).toFixed(2)).toBe("-0.13");
    expect(R(-1, 1000).toFixed(2)).toBe("0.00");
    expect(R(5).toFixed(0)).toBe("5");
    expect(R(1, 2).toFixed(0)).toBe("1");
    expect(R(1695, 10000).toPercent(2)).toBe("16.95%");
    expect(R(3, 100).toPercent(1)).toBe("3.0%");
  });

  it("converts to the nearest double, even beyond the double range", () => {
    expect(R(1, 3).toNumber()).toBeCloseTo(1 / 3, 15);
    const huge = R(10n ** 400n + 1n, 10n ** 400n * 2n);
    expect(huge.toNumber()).toBeCloseTo(0.5, 12);
  });

  it("round-trips through JSON", () => {
    const x = R(123456789n, 987654321n);
    expect(Rational.fromJSON(x.toJSON()).eq(x)).toBe(true);
    expect(JSON.stringify({ p: x })).toContain('"n"');
  });
});
