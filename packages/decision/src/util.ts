/** Narrow `T | undefined` to `T` or fail loudly (the code base forbids non-null assertions). */
export function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new Error(`internal error: expected ${what} to exist`);
  }
  return value;
}

/** 21 -> "21st", 22 -> "22nd", 23 -> "23rd", 24 -> "24th"; 11 to 13 (and 111 to 113) take "th". */
export function ordinal(n: number): string {
  const lastTwo = n % 100;
  const suffix =
    lastTwo >= 11 && lastTwo <= 13
      ? "th"
      : (({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th");
  return `${String(n)}${suffix}`;
}
