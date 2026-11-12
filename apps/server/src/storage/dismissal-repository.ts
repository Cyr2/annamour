import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { parseRows } from "./rows.ts";

const DismissalRow = z.object({ title_key: z.string(), account_id: z.string() });

/** « Pas pour nous » on a circle's suggestions. */
export class DismissalRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  dismiss(circleId: string, titleKey: string, accountId: string, now: number): void {
    this.db
      .prepare(
        `INSERT INTO suggestion_dismissals (circle_id, title_key, account_id, dismissed_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (circle_id, title_key) DO UPDATE SET account_id = excluded.account_id, dismissed_at = excluded.dismissed_at`,
      )
      .run(circleId, titleKey, accountId, now);
  }

  /** The titles dismissed in this circle since `since`, and by whom. */
  since(circleId: string, since: number): { titleKey: string; accountId: string }[] {
    const rows = this.db
      .prepare("SELECT title_key, account_id FROM suggestion_dismissals WHERE circle_id = ? AND dismissed_at >= ?")
      .all(circleId, since);
    return parseRows(DismissalRow, rows).map((row) => ({ titleKey: row.title_key, accountId: row.account_id }));
  }
}
