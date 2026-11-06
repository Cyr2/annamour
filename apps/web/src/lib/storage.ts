import type { z } from "zod";

/*
 * localStorage that never throws (Safari private mode, quota, disabled
 * storage) and never trusts what it reads: every value goes through zod.
 */

export function readStored<Schema extends z.ZodType>(key: string, schema: Schema): z.infer<Schema> | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not persisted this time; the in-memory value still works.
  }
}

export function removeStored(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to clean up.
  }
}
