import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { parseOptionalRow } from "./rows.ts";

const CacheRow = z.object({ body: z.string(), fetched_at: z.number() });

/** Answers from TMDB and Naka kept by key, with when they were fetched. */
export class CatalogCacheRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  /** The answer kept under `key` if fetched after `freshSince`. */
  get(key: string, freshSince: number): string | undefined {
    const row = parseOptionalRow(
      CacheRow,
      this.db.prepare("SELECT body, fetched_at FROM catalog_cache WHERE key = ?").get(key),
    );
    return row && row.fetched_at >= freshSince ? row.body : undefined;
  }

  put(key: string, body: string, now: number): void {
    this.db
      .prepare(
        `INSERT INTO catalog_cache (key, body, fetched_at) VALUES (?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at`,
      )
      .run(key, body, now);
  }

  /** Forgets what was fetched before `cutoff`. */
  prune(cutoff: number): void {
    this.db.prepare("DELETE FROM catalog_cache WHERE fetched_at < ?").run(cutoff);
  }
}
