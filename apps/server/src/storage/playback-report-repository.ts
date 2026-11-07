import type { DatabaseSync } from "node:sqlite";
import { PlaybackReport } from "@annamour/protocol";
import { z } from "zod";
import { changedRows, parseRows } from "./rows.ts";

const ReportRow = z.object({ report: z.string(), updated_at: z.number() });

export interface StoredReport {
  report: PlaybackReport;
  updatedAt: number;
}

/** Playback reports, one per device page load; the report itself is kept as JSON. */
export class PlaybackReportRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  /** Saves a report, replacing the earlier version of the same viewing (never moving it to another séance). */
  save(roomCode: string, report: PlaybackReport, now: number): void {
    this.db
      .prepare(
        `INSERT INTO playback_reports (viewing_id, room_code, report, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (viewing_id) DO UPDATE SET report = excluded.report, updated_at = excluded.updated_at
         WHERE playback_reports.room_code = excluded.room_code`,
      )
      .run(report.viewingId, roomCode, JSON.stringify(report), now);
  }

  /** A séance's reports, newest first; rows that no longer read as a report are skipped. */
  listForRoom(roomCode: string): StoredReport[] {
    const rows = parseRows(
      ReportRow,
      this.db
        .prepare("SELECT report, updated_at FROM playback_reports WHERE room_code = ? ORDER BY updated_at DESC")
        .all(roomCode),
    );
    return rows.flatMap((row) => {
      const parsed = z.safeParse(PlaybackReport, safeJson(row.report));
      return parsed.success ? [{ report: parsed.data, updatedAt: row.updated_at }] : [];
    });
  }

  /** Forgets reports last updated before `cutoff`; returns how many. */
  deleteOlderThan(cutoff: number): number {
    return changedRows(this.db.prepare("DELETE FROM playback_reports WHERE updated_at < ?").run(cutoff));
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
