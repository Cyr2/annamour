import type { StatementResultingChanges } from "node:sqlite";
import type { z } from "zod";

/** Rows coming out of SQLite are external data: they are validated before use. */
export function parseRows<T>(schema: z.ZodType<T>, rows: unknown[]): T[] {
  return rows.map((row) => schema.parse(row));
}

export function parseOptionalRow<T>(schema: z.ZodType<T>, row: unknown): T | undefined {
  return row === undefined ? undefined : schema.parse(row);
}

export function changedRows(result: StatementResultingChanges): number {
  return Number(result.changes);
}
