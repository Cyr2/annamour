import type { DatabaseSync } from "node:sqlite";
import { BubbleColor, CatalogTitle, type WatchlistItem } from "@annamour/protocol";
import { z } from "zod";
import { changedRows, parseOptionalRow, parseRows } from "./rows.ts";

export interface NewWatchlistItem {
  id: string;
  catalogKey: string;
  title: CatalogTitle;
  addedBy: string;
  addedAt: number;
  /** The people picked, the author included. */
  memberIds: readonly string[];
  /** « Tout le monde »: everyone in the author's history, now and later. */
  everyone: boolean;
  /** Those who already say « J'ai envie ». */
  wantedBy: readonly string[];
  /** The circle it belongs to: everyone in it sees it. */
  circleId?: string;
}

/**
 * Who sees each item: the people picked, plus, for « Tout le monde », everyone
 * the author watched with in a séance still in their history.
 */
const AUDIENCE = `audience (item_id, account_id) AS (
  SELECT item_id, account_id FROM watchlist_members
  UNION
  SELECT i.id, seen.account_id FROM watchlist_items i
    JOIN participations author ON author.account_id = i.added_by AND author.hidden = 0
    JOIN participations seen ON seen.room_code = author.room_code
  WHERE i.everyone = 1
  UNION
  SELECT i.id, cm.account_id FROM watchlist_items i
    JOIN circle_members cm ON cm.circle_id = i.circle_id
)`;

const ItemRow = z.object({
  id: z.string(),
  title: z.string(),
  added_by: z.string(),
  added_at: z.number(),
  watched_at: z.number().nullable(),
  watched_by_room: z.string().nullable(),
  marker_id: z.string().nullable(),
  marker_name: z.string().nullable(),
  marker_color: z.nullable(BubbleColor),
  circle_id: z.string().nullable(),
});
type ItemRow = z.infer<typeof ItemRow>;

const PersonRow = z.object({
  item_id: z.string(),
  account_id: z.string(),
  name: z.string(),
  color: BubbleColor,
  wants: z.number(),
});
type PersonRow = z.infer<typeof PersonRow>;

/** The shared watchlist: each title, and the people who see it. */
export class WatchlistRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  insert(item: NewWatchlistItem): void {
    this.db
      .prepare(
        `INSERT INTO watchlist_items (id, catalog_key, title, added_by, added_at, everyone, circle_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        item.id,
        item.catalogKey,
        JSON.stringify(item.title),
        item.addedBy,
        item.addedAt,
        item.everyone ? 1 : 0,
        item.circleId ?? null,
      );
    for (const accountId of item.memberIds) this.addMember(item.id, accountId, item.wantedBy.includes(accountId));
  }

  /** Shares an item with one more person (kept as is when already shared). */
  addMember(itemId: string, accountId: string, wants: boolean): void {
    this.db
      .prepare("INSERT OR IGNORE INTO watchlist_members (item_id, account_id, wants) VALUES (?, ?, ?)")
      .run(itemId, accountId, wants ? 1 : 0);
  }

  /** Opens an item to « Tout le monde ». */
  shareWithEveryone(itemId: string): void {
    this.db.prepare("UPDATE watchlist_items SET everyone = 1 WHERE id = ?").run(itemId);
  }

  canSee(itemId: string, accountId: string): boolean {
    const row = this.db
      .prepare(`WITH ${AUDIENCE} SELECT 1 FROM audience WHERE item_id = ? AND account_id = ?`)
      .get(itemId, accountId);
    return row !== undefined;
  }

  /** The item of this title still to watch that `accountId` already sees (in this circle, if one is given). */
  findToWatch(accountId: string, catalogKey: string, circleId?: string): string | undefined {
    const row = this.db
      .prepare(
        `WITH ${AUDIENCE}
         SELECT i.id FROM watchlist_items i JOIN audience a ON a.item_id = i.id
         WHERE a.account_id = ? AND i.catalog_key = ? AND i.watched_at IS NULL AND (? IS NULL OR i.circle_id = ?)`,
      )
      .get(accountId, catalogKey, circleId ?? null, circleId ?? null);
    return parseOptionalRow(z.object({ id: z.string() }), row)?.id;
  }

  /** « J'ai envie » or not; someone seeing it through « Tout le monde » gets their own row. */
  setWant(itemId: string, accountId: string, wants: boolean): void {
    this.db
      .prepare(
        `INSERT INTO watchlist_members (item_id, account_id, wants) VALUES (?, ?, ?)
         ON CONFLICT (item_id, account_id) DO UPDATE SET wants = excluded.wants`,
      )
      .run(itemId, accountId, wants ? 1 : 0);
  }

  /** `bySeance`: the séance that reached the end of the film, so deleting it can take the mark back. */
  setWatched(itemId: string, watchedAt: number | null, bySeance: string | null = null): void {
    this.db
      .prepare("UPDATE watchlist_items SET watched_at = ?, watched_by_room = ?, watched_by_account = NULL WHERE id = ?")
      .run(watchedAt, watchedAt === null ? null : bySeance, itemId);
  }

  /** Someone said « C'est vu » by hand: remembered so the others learn who did. */
  markWatchedBy(itemId: string, watchedAt: number, accountId: string): void {
    this.db
      .prepare("UPDATE watchlist_items SET watched_at = ?, watched_by_room = NULL, watched_by_account = ? WHERE id = ?")
      .run(watchedAt, accountId, itemId);
  }

  /** A séance is deleted: the titles it marked « vu » go back to watch. */
  unwatchSeance(code: string): void {
    this.db
      .prepare(
        "UPDATE watchlist_items SET watched_at = NULL, watched_by_room = NULL, watched_by_account = NULL WHERE watched_by_room = ?",
      )
      .run(code);
  }

  /** Removes the item for everyone who sees it. Returns false when there was none. */
  delete(itemId: string): boolean {
    return changedRows(this.db.prepare("DELETE FROM watchlist_items WHERE id = ?").run(itemId)) > 0;
  }

  /** Every item `accountId` sees, with its people. */
  listFor(accountId: string): WatchlistItem[] {
    const items = parseRows(
      ItemRow,
      this.db
        .prepare(
          `WITH ${AUDIENCE}
           SELECT i.id, i.title, i.added_by, i.added_at, i.watched_at, i.watched_by_room, i.circle_id,
             marker.id AS marker_id, marker.name AS marker_name, marker.color AS marker_color
           FROM watchlist_items i LEFT JOIN accounts marker ON marker.id = i.watched_by_account
           WHERE i.id IN (SELECT item_id FROM audience WHERE account_id = ?)
           ORDER BY i.added_at DESC`,
        )
        .all(accountId),
    );
    const people = this.peopleOf(accountId);
    return items.map((row) => {
      const audience = people.get(row.id) ?? [];
      const toParticipant = (p: PersonRow) => ({ accountId: p.account_id, name: p.name, color: p.color });
      const author = audience.find((p) => p.account_id === row.added_by);
      return {
        id: row.id,
        title: CatalogTitle.parse(JSON.parse(row.title)),
        // The author always sees their item; the fallback only guards a hand-edited database.
        addedBy: author ? toParticipant(author) : { accountId: row.added_by, name: "?", color: "peach" },
        addedAt: row.added_at,
        ...watchedFields(row),
        // The author first, then the others by name.
        sharedWith: [...audience]
          .sort((a, b) => Number(b.account_id === row.added_by) - Number(a.account_id === row.added_by))
          .map(toParticipant),
        wantedBy: audience.filter((p) => p.wants === 1).map((p) => p.account_id),
        ...(row.circle_id === null ? {} : { circleId: row.circle_id }),
      };
    });
  }

  /** The people who see each item `accountId` sees, by item, with their « J'ai envie ». */
  private peopleOf(accountId: string): Map<string, PersonRow[]> {
    const rows = this.db
      .prepare(
        `WITH ${AUDIENCE}
         SELECT a.item_id, a.account_id, acc.name, acc.color, COALESCE(m.wants, 0) AS wants
         FROM audience a
         JOIN accounts acc ON acc.id = a.account_id
         LEFT JOIN watchlist_members m ON m.item_id = a.item_id AND m.account_id = a.account_id
         WHERE a.item_id IN (SELECT item_id FROM audience WHERE account_id = ?)
         ORDER BY acc.name`,
      )
      .all(accountId);
    const byItem = new Map<string, PersonRow[]>();
    for (const row of parseRows(PersonRow, rows)) byItem.set(row.item_id, [...(byItem.get(row.item_id) ?? []), row]);
    return byItem;
  }
}

/** When it was watched, and how: in a séance, or marked by hand by someone. */
function watchedFields(row: ItemRow): Pick<WatchlistItem, "watchedAt" | "watchedInSeance" | "watchedBy"> {
  if (row.watched_at === null) return {};
  if (row.watched_by_room !== null) return { watchedAt: row.watched_at, watchedInSeance: true };
  const { marker_id: accountId, marker_name: name, marker_color: color } = row;
  if (accountId === null || name === null || color === null) return { watchedAt: row.watched_at };
  return { watchedAt: row.watched_at, watchedBy: { accountId, name, color } };
}
