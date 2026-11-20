import type { DatabaseSync } from "node:sqlite";
import { BubbleColor, type CatalogRef, type SessionParticipant } from "@annamour/protocol";
import { z } from "zod";
import { parseCatalog } from "./room-repository.ts";
import { changedRows, parseRows } from "./rows.ts";
import { VISIBLE_ROOMS } from "./visible-rooms.ts";

export interface JoinedRoom {
  code: string;
  title: string;
  duration: number | undefined;
  position: number;
  lastUsedAt: number;
  episode: { index: number; count: number; label: string | undefined };
  circleId: string | undefined;
  /** The account that created it (it alone may delete it for everyone). */
  createdBy: string | undefined;
  /** The current episode's poster, when it came from the catalog. */
  posterUrl: string | undefined;
  /** The catalog title the current episode comes from (the series, for an episode). */
  catalog: { id: number; type: "movie" | "tv" } | undefined;
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
  episode_catalog: z.string().nullable(),
  circle_id: z.string().nullable(),
  created_by: z.string().nullable(),
});

const CompanionRow = z.object({
  room_code: z.string(),
  account_id: z.string(),
  name: z.string(),
  color: BubbleColor,
  hidden: z.number(),
});

const QueueRow = z.object({ room_code: z.string(), label: z.string().nullable(), catalog: z.string().nullable() });

/** A film or episode of a room as its history tells it; no title when neither the catalog nor a label names it. */
export interface QueuedItem {
  title?: string;
  type?: "movie" | "tv";
  posterUrl?: string;
}

function queuedItem(label: string | null, ref: CatalogRef | undefined): QueuedItem {
  const title = ref?.title ?? label ?? undefined;
  return {
    ...(title === undefined ? {} : { title }),
    ...(ref ? { type: ref.type } : {}),
    ...(ref?.posterUrl === undefined ? {} : { posterUrl: ref.posterUrl }),
  };
}

/** What the history tells of the catalog title a room plays. */
function catalogOf(ref: CatalogRef | undefined): Pick<JoinedRoom, "posterUrl" | "catalog"> {
  return { posterUrl: ref?.posterUrl, catalog: ref ? { id: ref.id, type: ref.type } : undefined };
}

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
    // The first account in a séance created it.
    this.db.prepare("UPDATE rooms SET created_by = ? WHERE code = ? AND created_by IS NULL").run(accountId, roomCode);
  }

  /** Séances saved before their creator was: the first account that entered them created them. */
  fillCreators(): void {
    this.db
      .prepare(
        `UPDATE rooms SET created_by = (
           SELECT p.account_id FROM participations p WHERE p.room_code = rooms.code ORDER BY p.rowid LIMIT 1
         ) WHERE created_by IS NULL`,
      )
      .run();
  }

  /** Returns false when this account does not see that room among its séances. */
  hide(roomCode: string, accountId: string): boolean {
    const result = this.db
      .prepare("UPDATE participations SET hidden = 1 WHERE room_code = ? AND account_id = ?")
      .run(roomCode, accountId);
    if (changedRows(result) > 0) return true;
    // A séance of one of its circles that it never entered.
    if (!this.includes(roomCode, accountId)) return false;
    this.db
      .prepare("INSERT OR IGNORE INTO room_dismissals (room_code, account_id) VALUES (?, ?)")
      .run(roomCode, accountId);
    return true;
  }

  /** This account sees that room among its séances. */
  includes(roomCode: string, accountId: string): boolean {
    const row = this.db
      .prepare(`SELECT 1 FROM (${VISIBLE_ROOMS}) visible WHERE visible.code = :code`)
      .get({ me: accountId, code: roomCode });
    return row !== undefined;
  }

  /** The séances this account sees (see VISIBLE_ROOMS), most recently used first. */
  visibleRooms(accountId: string): JoinedRoom[] {
    const rows = this.db
      .prepare(
        `SELECT r.code, r.title, r.duration, r.position, r.last_used_at, r.current_episode, r.circle_id, r.created_by,
           (SELECT COUNT(*) FROM room_episodes e WHERE e.room_code = r.code) AS episode_count,
           (SELECT e.label FROM room_episodes e
            WHERE e.room_code = r.code
              AND (SELECT COUNT(*) FROM room_episodes b WHERE b.room_code = e.room_code AND b.id < e.id) = r.current_episode
           ) AS episode_label,
           (SELECT e.catalog FROM room_episodes e
            WHERE e.room_code = r.code
              AND (SELECT COUNT(*) FROM room_episodes b WHERE b.room_code = e.room_code AND b.id < e.id) = r.current_episode
           ) AS episode_catalog
         FROM rooms r
         WHERE r.code IN (${VISIBLE_ROOMS})
         ORDER BY r.last_used_at DESC, r.rowid`,
      )
      .all({ me: accountId });
    return parseRows(JoinedRoomRow, rows).map((row) => ({
      code: row.code,
      title: row.title,
      duration: row.duration ?? undefined,
      position: row.position,
      lastUsedAt: row.last_used_at,
      episode: { index: row.current_episode, count: row.episode_count, label: row.episode_label ?? undefined },
      circleId: row.circle_id ?? undefined,
      createdBy: row.created_by ?? undefined,
      ...catalogOf(parseCatalog(row.episode_catalog)),
    }));
  }

  /** The other people of each visible room of this account, by room code, in joining order. */
  /**
   * The people of this account's visible history (séances it removed no longer count): the only people
   * it can share a watchlist title with, the same ones its profile shows.
   */
  companionIds(accountId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT p.account_id FROM participations p
         WHERE p.account_id <> ?
           AND p.room_code IN (SELECT room_code FROM participations WHERE account_id = ? AND hidden = 0)`,
      )
      .all(accountId, accountId);
    return parseRows(z.object({ account_id: z.string() }), rows).map((row) => row.account_id);
  }

  /** The films or episodes of each visible room of this account, by room code, in playing order. */
  queues(accountId: string): Map<string, QueuedItem[]> {
    const rows = this.db
      .prepare(
        `SELECT e.room_code, e.label, e.catalog FROM room_episodes e
         WHERE e.room_code IN (${VISIBLE_ROOMS})
         ORDER BY e.room_code, e.id`,
      )
      .all({ me: accountId });
    const byRoom = new Map<string, QueuedItem[]>();
    for (const row of parseRows(QueueRow, rows)) {
      const list = byRoom.get(row.room_code) ?? [];
      list.push(queuedItem(row.label, parseCatalog(row.catalog)));
      byRoom.set(row.room_code, list);
    }
    return byRoom;
  }

  companions(accountId: string): Map<string, SessionParticipant[]> {
    const rows = this.db
      .prepare(
        `SELECT p.room_code, a.id AS account_id, a.name, a.color, p.hidden
         FROM participations p JOIN accounts a ON a.id = p.account_id
         WHERE p.account_id <> :me AND p.room_code IN (${VISIBLE_ROOMS})
         ORDER BY p.rowid`,
      )
      .all({ me: accountId });
    const byRoom = new Map<string, SessionParticipant[]>();
    for (const row of parseRows(CompanionRow, rows)) {
      const list = byRoom.get(row.room_code) ?? [];
      list.push({
        accountId: row.account_id,
        name: row.name,
        color: row.color,
        ...(row.hidden ? { left: true } : {}),
      });
      byRoom.set(row.room_code, list);
    }
    return byRoom;
  }
}
