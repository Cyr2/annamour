/** Narrows away null/undefined in tests, failing with a readable message instead of a later TypeError. */
export function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Expected ${what}`);
  return value;
}
