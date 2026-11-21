import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { parseRows } from "./rows.ts";

const PlanRow = z.object({ code: z.string(), title: z.string(), planned_at: z.number(), reminders_sent: z.number() });
const RecipientRow = z.object({ id: z.string(), name: z.string() });

export interface StoredPlan {
  code: string;
  title: string;
  plannedAt: number;
  remindersSent: number;
}

/** The evening planned for each séance, and how many of its reminders went out. */
export class PlanRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  /** A new time starts its reminders over. */
  plan(code: string, at: number): void {
    this.db.prepare("UPDATE rooms SET planned_at = ?, reminders_sent = 0 WHERE code = ?").run(at, code);
  }

  cancel(code: string): void {
    this.db.prepare("UPDATE rooms SET planned_at = NULL, reminders_sent = 0 WHERE code = ?").run(code);
  }

  markSent(code: string, sent: number): void {
    this.db.prepare("UPDATE rooms SET reminders_sent = ? WHERE code = ?").run(sent, code);
  }

  /** The evenings planned up to `until`. */
  until(until: number): StoredPlan[] {
    const rows = this.db
      .prepare("SELECT code, title, planned_at, reminders_sent FROM rooms WHERE planned_at <= ? ORDER BY planned_at")
      .all(until);
    return parseRows(PlanRow, rows).map((row) => ({
      code: row.code,
      title: row.title,
      plannedAt: row.planned_at,
      remindersSent: row.reminders_sent,
    }));
  }

  /** Everyone who sees the séance among theirs (the same people as VISIBLE_ROOMS, seen from the séance). */
  recipients(code: string): { id: string; name: string }[] {
    const rows = this.db
      .prepare(
        `SELECT a.id, a.name FROM accounts a
         WHERE a.id IN (SELECT account_id FROM participations WHERE room_code = :code AND hidden = 0)
            OR (a.id IN (SELECT m.account_id FROM circle_members m JOIN rooms r ON r.circle_id = m.circle_id
                         WHERE r.code = :code)
                AND a.id NOT IN (SELECT account_id FROM participations WHERE room_code = :code)
                AND a.id NOT IN (SELECT account_id FROM room_dismissals WHERE room_code = :code))
         ORDER BY a.rowid`,
      )
      .all({ code });
    return parseRows(RecipientRow, rows);
  }
}
