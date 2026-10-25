/** Narrow `T | undefined` to `T` or fail loudly (the code base forbids non-null assertions). */
export function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new Error(`internal error: expected ${what} to exist`);
  }
  return value;
}
