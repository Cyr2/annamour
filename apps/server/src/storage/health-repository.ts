import type { DatabaseSync } from "node:sqlite";
import type { CatalogHealth } from "@annamour/protocol";
import { z } from "zod";
import { parseOptionalRow } from "./rows.ts";

const HealthRow = z.object({
  health: z.enum(["ok", "bridge-down", "token-expired", "captcha", "naka-down"]),
  checked_at: z.number(),
});

/** What the evening check of the catalog last found, kept across restarts (one alert per failure). */
export class HealthRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  last(): { health: CatalogHealth; checkedAt: number } | undefined {
    const row = parseOptionalRow(HealthRow, this.db.prepare("SELECT health, checked_at FROM health_checks").get());
    return row && { health: row.health, checkedAt: row.checked_at };
  }

  save(health: CatalogHealth, now: number): void {
    this.db
      .prepare(
        `INSERT INTO health_checks (id, health, checked_at) VALUES (1, ?, ?)
         ON CONFLICT (id) DO UPDATE SET health = excluded.health, checked_at = excluded.checked_at`,
      )
      .run(health, now);
  }
}
