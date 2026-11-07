import type { DatabaseSync } from "node:sqlite";
import { BubbleColor, type Participant } from "@annamour/protocol";
import { z } from "zod";
import { changedRows, parseRows } from "./rows.ts";

export interface JoinedRoom {
  code: string;
  title: string;
  duration: number | undefined;
  position: number;
  lastUsedAt: number;
  episode: { index: number; count: number; label: string | undefined };
}

const JoinedRoomRow = z.object({
  code: z.string(),
  title: z.string(),
  duration: z.number().nullable(),
  position: z.number(),
  last_used_at: z.number(),
  current_episode: z.number(),
  episode_count: z.number(),
  episode_label: z.string().nullable(),
});

const CompanionRow = z.object({
  room_code: z.string(),
  account_id: z.string(),
  name: z.string(),
  color: BubbleColor,
});

/** Who took part in which room: the sessions history of each account. */
export class ParticipationRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  /** Joining again brings a hidden session back. */
  record(roomCode: string, accountId: string, now: number): void {
    this.db
      .prepare(
        `INSERT INTO participations (room_code, account_id, last_seen_at, hidden) VALUES (?, ?, ?, 0)
         ON CONFLICT (room_code, account_id) DO UPDATE SET last_seen_at = excluded.last_seen_at, hidden = 0`,
      )
      .run(roomCode, accountId, now);
  }

  /** Returns false when this account never was in that room. */
  hide(roomCode: string, accountId: string): boolean {
    const result = this.db
      .prepare("UPDATE participations SET hidden = 1 WHERE room_code = ? AND account_id = ?")
      .run(roomCode, accountId);
    return changedRows(result) > 0;
  }

  /** Rooms this account joined and did not hide, most recently used first. */
  visibleRooms(accountId: string): JoinedRoom[] {
    const rows = this.db
      .prepare(
        `SELECT r.code, r.title, r.duration, r.position, r.last_used_at, r.current_episode,
           (SELECT COUNT(*) FROM room_episodes e WHERE e.room_code = r.code) AS episode_count,
           (SELECT e.label FROM room_episodes e
            WHERE e.room_code = r.code
              AND (SELECT COUNT(*) FROM room_episodes b WHERE b.room_code = e.room_code AND b.id < e.id) = r.current_episode
           ) AS episode_label
         FROM participations p JOIN rooms r ON r.code = p.room_code
         WHERE p.account_id = ? AND p.hidden = 0
         ORDER BY r.last_used_at DESC`,
      )
      .all(accountId);
    return parseRows(JoinedRoomRow, rows).map((row) => ({
      code: row.code,
      title: row.title,
      duration: row.duration ?? undefined,
      position: row.position,
      lastUsedAt: row.last_used_at,
      episode: { index: row.current_episode, count: row.episode_count, label: row.episode_label ?? undefined },
    }));
  }

  /** The other people of each visible room of this account, by room code, in joining order. */
  /** Everyone this account was ever in a séance with: the only people it can share a watchlist title with. */
  companionIds(accountId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT p.account_id FROM participations p
         WHERE p.account_id <> ? AND p.room_code IN (SELECT room_code FROM participations WHERE account_id = ?)`,
      )
      .all(accountId, accountId);
    return parseRows(z.object({ account_id: z.string() }), rows).map((row) => row.account_id);
  }

  companions(accountId: string): Map<string, Participant[]> {
    const rows = this.db
      .prepare(
        `SELECT p.room_code, a.id AS account_id, a.name, a.color
         FROM participations p JOIN accounts a ON a.id = p.account_id
         WHERE p.account_id <> ?
           AND p.room_code IN (SELECT room_code FROM participations WHERE account_id = ? AND hidden = 0)
         ORDER BY p.rowid`,
      )
      .all(accountId, accountId);
    const byRoom = new Map<string, Participant[]>();
    for (const row of parseRows(CompanionRow, rows)) {
      const list = byRoom.get(row.room_code) ?? [];
      list.push({ accountId: row.account_id, name: row.name, color: row.color });
      byRoom.set(row.room_code, list);
    }
    return byRoom;
  }
}
