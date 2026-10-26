/**
 * Exact rational arithmetic on BigInt (ADR-013). Every probability the engines return is a `Rational`, so
 * distributions sum to exactly 1 and golden values compare with `eq`. Floats exist only at the display boundary
 * (`toNumber`, `toFixed`, `toPercent`).
 */

function abs(a: bigint): bigint {
  return a < 0n ? -a : a;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
}

function pow10(exp: number): bigint {
  return 10n ** BigInt(exp);
}

function bitLength(a: bigint): number {
  return a === 0n ? 0 : abs(a).toString(2).length;
}

export type RationalLike = Rational | bigint | number;

export class Rational {
  static readonly ZERO = new Rational(0n, 1n);
  static readonly ONE = new Rational(1n, 1n);

  private constructor(
    /** numerator (carries the sign) */
    readonly n: bigint,
    /** denominator, always > 0, gcd(n, d) = 1 */
    readonly d: bigint,
  ) {}

  /** `of(3, 100)` is 3/100. Numbers must be safe integers. */
  static of(n: bigint | number, d: bigint | number = 1n): Rational {
    const nn = toBigInt(n);
    const dd = toBigInt(d);
    if (dd === 0n) {
      throw new RangeError("Rational: zero denominator");
    }
    if (nn === 0n) {
      return Rational.ZERO;
    }
    const g = gcd(nn, dd);
    const sign = dd < 0n ? -1n : 1n;
    return new Rational((sign * nn) / g, (sign * dd) / g);
  }

  /** Exact parse of "3/100", "-0.05", "1.49", "12", "1e-3". Never goes through floating point. */
  static parse(text: string): Rational {
    const s = text.trim();
    const frac = /^([+-]?\d+)\s*\/\s*(\d+)$/.exec(s);
    if (frac) {
      return Rational.of(BigInt(frac[1] ?? "0"), BigInt(frac[2] ?? "1"));
    }
    const dec = /^([+-]?)(\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(s);
    if (!dec || (dec[2] === "" && dec[3] === undefined)) {
      throw new SyntaxError(`Rational.parse: cannot parse ${JSON.stringify(text)}`);
    }
    const sign = dec[1] === "-" ? -1n : 1n;
    const intPart = dec[2] === "" ? "0" : (dec[2] ?? "0");
    const fracPart = dec[3] ?? "";
    const exp = dec[4] === undefined ? 0 : Number.parseInt(dec[4], 10);
    let num = BigInt(intPart + fracPart);
    let den = pow10(fracPart.length);
    if (exp >= 0) {
      num *= pow10(exp);
    } else {
      den *= pow10(-exp);
    }
    return Rational.of(sign * num, den);
  }

  static from(x: RationalLike): Rational {
    return x instanceof Rational ? x : Rational.of(x);
  }

  // ---- arithmetic -------------------------------------------------------------------------------------------
  add(o: RationalLike): Rational {
    const r = Rational.from(o);
    return Rational.of(this.n * r.d + r.n * this.d, this.d * r.d);
  }

  sub(o: RationalLike): Rational {
    const r = Rational.from(o);
    return Rational.of(this.n * r.d - r.n * this.d, this.d * r.d);
  }

  mul(o: RationalLike): Rational {
    const r = Rational.from(o);
    return Rational.of(this.n * r.n, this.d * r.d);
  }

  div(o: RationalLike): Rational {
    const r = Rational.from(o);
    if (r.n === 0n) {
      throw new RangeError("Rational: division by zero");
    }
    return Rational.of(this.n * r.d, this.d * r.n);
  }

  neg(): Rational {
    return new Rational(-this.n, this.d);
  }

  abs(): Rational {
    return this.n < 0n ? this.neg() : this;
  }

  inv(): Rational {
    return Rational.ONE.div(this);
  }

  pow(k: number): Rational {
    if (!Number.isInteger(k)) {
      throw new RangeError("Rational.pow: integer exponent required");
    }
    if (k < 0) {
      return this.inv().pow(-k);
    }
    return new Rational(this.n ** BigInt(k), this.d ** BigInt(k));
  }

  // ---- comparison -------------------------------------------------------------------------------------------
  cmp(o: RationalLike): -1 | 0 | 1 {
    const r = Rational.from(o);
    const l = this.n * r.d;
    const rr = r.n * this.d;
    return l < rr ? -1 : l > rr ? 1 : 0;
  }

  eq(o: RationalLike): boolean {
    return this.cmp(o) === 0;
  }

  lt(o: RationalLike): boolean {
    return this.cmp(o) < 0;
  }

  le(o: RationalLike): boolean {
    return this.cmp(o) <= 0;
  }

  gt(o: RationalLike): boolean {
    return this.cmp(o) > 0;
  }

  ge(o: RationalLike): boolean {
    return this.cmp(o) >= 0;
  }

  isZero(): boolean {
    return this.n === 0n;
  }

  sign(): -1 | 0 | 1 {
    return this.n < 0n ? -1 : this.n > 0n ? 1 : 0;
  }

  min(o: RationalLike): Rational {
    const r = Rational.from(o);
    return this.le(r) ? this : r;
  }

  max(o: RationalLike): Rational {
    const r = Rational.from(o);
    return this.ge(r) ? this : r;
  }

  /** Clamp into [lo, hi] (the game clamps probabilities only implicitly, by comparing against r in [0,1)). */
  clamp(lo: RationalLike, hi: RationalLike): Rational {
    return this.max(lo).min(hi);
  }

  floor(): bigint {
    const q = this.n / this.d;
    return this.n < 0n && this.n % this.d !== 0n ? q - 1n : q;
  }

  ceil(): bigint {
    const q = this.n / this.d;
    return this.n > 0n && this.n % this.d !== 0n ? q + 1n : q;
  }

  // ---- display boundary -------------------------------------------------------------------------------------
  /** Nearest double; accurate to ~1e-30 absolute even when numerator and denominator exceed the double range. */
  toNumber(): number {
    if (bitLength(this.n) < 1000 && bitLength(this.d) < 1000) {
      const direct = Number(this.n) / Number(this.d);
      if (Number.isFinite(direct)) {
        return direct;
      }
    }
    const scale = pow10(30);
    return Number((this.n * scale) / this.d) / 1e30;
  }

  /** Decimal string rounded half away from zero to `digits` places: exact, no floating point. */
  toFixed(digits: number): string {
    if (!Number.isInteger(digits) || digits < 0) {
      throw new RangeError("toFixed: digits must be a non-negative integer");
    }
    const scale = pow10(digits);
    const twice = abs(this.n) * scale * 2n + this.d;
    const q = twice / (2n * this.d);
    const neg = this.n < 0n && q !== 0n;
    const s = q.toString().padStart(digits + 1, "0");
    const head = s.slice(0, s.length - digits);
    const tail = s.slice(s.length - digits);
    return `${neg ? "-" : ""}${head}${digits > 0 ? `.${tail}` : ""}`;
  }

  /** Percentage string, e.g. `R(3,100).toPercent(2)` is `"3.00%"`. */
  toPercent(digits = 2): string {
    return `${this.mul(100).toFixed(digits)}%`;
  }

  toString(): string {
    return this.d === 1n ? this.n.toString() : `${this.n.toString()}/${this.d.toString()}`;
  }

  toJSON(): RationalJson {
    return { n: this.n.toString(), d: this.d.toString() };
  }

  static fromJSON(j: RationalJson): Rational {
    return Rational.of(BigInt(j.n), BigInt(j.d));
  }
}

export interface RationalJson {
  n: string;
  d: string;
}

function toBigInt(x: bigint | number): bigint {
  if (typeof x === "bigint") {
    return x;
  }
  if (!Number.isSafeInteger(x)) {
    throw new RangeError(
      `Rational.of: ${String(x)} is not a safe integer; pass a bigint or use Rational.parse`,
    );
  }
  return BigInt(x);
}

/** Shorthand: `R(3, 100)`. */
export function R(n: bigint | number, d: bigint | number = 1n): Rational {
  return Rational.of(n, d);
}

/** Exact sum of many values. */
export function sum(values: Iterable<Rational>): Rational {
  let acc = Rational.ZERO;
  for (const v of values) {
    acc = acc.add(v);
  }
  return acc;
}
