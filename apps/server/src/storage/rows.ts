import type { StatementResultingChanges } from "node:sqlite";
import { z } from "zod";

/** Rows coming out of SQLite are external data: they are validated before use (classic or mini schemas alike). */
export function parseRows<T>(schema: z.core.$ZodType<T>, rows: unknown[]): T[] {
  return rows.map((row) => z.parse(schema, row));
}

export function parseOptionalRow<T>(schema: z.core.$ZodType<T>, row: unknown): T | undefined {
  return row === undefined ? undefined : z.parse(schema, row);
}

export function changedRows(result: StatementResultingChanges): number {
  return Number(result.changes);
}
