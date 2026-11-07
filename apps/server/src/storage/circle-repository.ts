import type { DatabaseSync } from "node:sqlite";
import { BubbleColor, type Circle } from "@annamour/protocol";
import { z } from "zod";
import { changedRows, parseOptionalRow, parseRows } from "./rows.ts";

const CircleRow = z.object({
  id: z.string(),
  name: z.string().nullable(),
  evenings: z.number(),
  last_used_at: z.number().nullable(),
});

const MemberRow = z.object({ circle_id: z.string(), account_id: z.string(), name: z.string(), color: BubbleColor });
const IdRow = z.object({ id: z.string() });
const AccountRow = z.object({ account_id: z.string() });

/** Circles, their members, the séances in them and their invitation links. */
export class CircleRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  create(id: string, name: string | null, now: number, memberIds: readonly string[]): void {
    this.db.prepare("INSERT INTO circles (id, name, created_at) VALUES (?, ?, ?)").run(id, name, now);
    for (const accountId of memberIds) this.addMember(id, accountId, now);
  }

  addMember(circleId: string, accountId: string, now: number): void {
    this.db
      .prepare("INSERT OR IGNORE INTO circle_members (circle_id, account_id, joined_at) VALUES (?, ?, ?)")
      .run(circleId, accountId, now);
  }

  /** Takes someone out; a circle nobody is left in disappears. */
  removeMember(circleId: string, accountId: string): void {
    this.db.prepare("DELETE FROM circle_members WHERE circle_id = ? AND account_id = ?").run(circleId, accountId);
    this.db
      .prepare("DELETE FROM circles WHERE id = ? AND NOT EXISTS (SELECT 1 FROM circle_members WHERE circle_id = ?)")
      .run(circleId, circleId);
  }

  /**
   * Whether a circle is still forming around this one séance: nobody named it,
   * and no other séance, title or invitation hangs on it yet.
   */
  isForming(circleId: string, code: string): boolean {
    const row = this.db
      .prepare(
        `SELECT 1 FROM circles c WHERE c.id = ? AND c.name IS NULL
           AND NOT EXISTS (SELECT 1 FROM rooms r WHERE r.circle_id = c.id AND r.code <> ?)
           AND NOT EXISTS (SELECT 1 FROM watchlist_items w WHERE w.circle_id = c.id)
           AND NOT EXISTS (SELECT 1 FROM circle_invites i WHERE i.circle_id = c.id)`,
      )
      .get(circleId, code);
    return row !== undefined;
  }

  remove(circleId: string): void {
    this.db.prepare("DELETE FROM circles WHERE id = ?").run(circleId);
  }

  rename(circleId: string, name: string): boolean {
    return changedRows(this.db.prepare("UPDATE circles SET name = ? WHERE id = ?").run(name, circleId)) > 0;
  }

  isMember(circleId: string, accountId: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM circle_members WHERE circle_id = ? AND account_id = ?")
      .get(circleId, accountId);
    return row !== undefined;
  }

  memberIds(circleId: string): string[] {
    const rows = this.db.prepare("SELECT account_id FROM circle_members WHERE circle_id = ?").all(circleId);
    return parseRows(AccountRow, rows).map((row) => row.account_id);
  }

  /** The circle made of exactly these people, if there is one (the most recently created). */
  findByMembers(accountIds: readonly string[]): string | undefined {
    const row = this.db
      .prepare(
        `SELECT c.id FROM circles c JOIN circle_members m ON m.circle_id = c.id
         GROUP BY c.id
         HAVING COUNT(*) = ? AND SUM(m.account_id IN (SELECT value FROM json_each(?))) = ?
         ORDER BY c.created_at DESC LIMIT 1`,
      )
      .get(accountIds.length, JSON.stringify(accountIds), accountIds.length);
    return parseOptionalRow(IdRow, row)?.id;
  }

  /** The circles `accountId` is in, with their people, how many séances, and when last used. */
  listFor(accountId: string): Circle[] {
    const circles = parseRows(
      CircleRow,
      this.db
        .prepare(
          `SELECT c.id, c.name,
             (SELECT COUNT(*) FROM rooms r WHERE r.circle_id = c.id) AS evenings,
             (SELECT MAX(r.last_used_at) FROM rooms r WHERE r.circle_id = c.id) AS last_used_at
           FROM circles c JOIN circle_members me ON me.circle_id = c.id AND me.account_id = ?`,
        )
        .all(accountId),
    );
    const members = parseRows(
      MemberRow,
      this.db
        .prepare(
          `SELECT m.circle_id, m.account_id, a.name, a.color
           FROM circle_members m JOIN accounts a ON a.id = m.account_id
           WHERE m.circle_id IN (SELECT circle_id FROM circle_members WHERE account_id = ?)
           ORDER BY m.joined_at, m.rowid`,
        )
        .all(accountId),
    );
    return circles.map((row) => ({
      id: row.id,
      ...(row.name === null ? {} : { name: row.name }),
      members: members
        .filter((m) => m.circle_id === row.id)
        .map((m) => ({ accountId: m.account_id, name: m.name, color: m.color })),
      evenings: row.evenings,
      ...(row.last_used_at === null ? {} : { lastUsedAt: row.last_used_at }),
    }));
  }

  /** One circle as its members see it. */
  find(circleId: string): Circle | undefined {
    const someone = this.memberIds(circleId)[0];
    return someone ? this.listFor(someone).find((circle) => circle.id === circleId) : undefined;
  }

  /* ---------- séances ---------- */

  roomCircle(code: string): string | undefined {
    const row = this.db.prepare("SELECT circle_id AS id FROM rooms WHERE code = ? AND circle_id IS NOT NULL").get(code);
    return parseOptionalRow(IdRow, row)?.id;
  }

  setRoomCircle(code: string, circleId: string): void {
    this.db.prepare("UPDATE rooms SET circle_id = ? WHERE code = ?").run(circleId, code);
  }

  /** The accounts that took part in a séance (whether they kept it in their history or not). */
  roomAccounts(code: string): string[] {
    const rows = this.db.prepare("SELECT account_id FROM participations WHERE room_code = ? ORDER BY rowid").all(code);
    return parseRows(AccountRow, rows).map((row) => row.account_id);
  }

  /** Séances of several people not yet in a circle (made before circles existed). */
  roomsWithoutCircle(): string[] {
    const rows = this.db
      .prepare(
        `SELECT r.code AS id FROM rooms r
         WHERE r.circle_id IS NULL AND (SELECT COUNT(*) FROM participations p WHERE p.room_code = r.code) >= 2`,
      )
      .all();
    return parseRows(IdRow, rows).map((row) => row.id);
  }

  /* ---------- invitations ---------- */

  insertInvite(tokenHash: string, circleId: string, expiresAt: number): void {
    this.db
      .prepare("INSERT INTO circle_invites (token_hash, circle_id, expires_at) VALUES (?, ?, ?)")
      .run(tokenHash, circleId, expiresAt);
  }

  /** The circle an invitation still valid at `now` opens. */
  circleForInvite(tokenHash: string, now: number): string | undefined {
    const row = this.db
      .prepare("SELECT circle_id AS id FROM circle_invites WHERE token_hash = ? AND expires_at > ?")
      .get(tokenHash, now);
    return parseOptionalRow(IdRow, row)?.id;
  }
}
