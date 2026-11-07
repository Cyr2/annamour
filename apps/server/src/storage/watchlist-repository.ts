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
  /** Everyone it is shared with, the author included. */
  memberIds: readonly string[];
  /** Those who already say « J'ai envie ». */
  wantedBy: readonly string[];
}

const ItemRow = z.object({
  id: z.string(),
  title: z.string(),
  added_by: z.string(),
  added_at: z.number(),
  watched_at: z.number().nullable(),
});

const MemberRow = z.object({
  item_id: z.string(),
  account_id: z.string(),
  name: z.string(),
  color: BubbleColor,
  wants: z.number(),
});

/** The shared watchlist: each title, and the people it is shared with. */
export class WatchlistRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  insert(item: NewWatchlistItem): void {
    this.db
      .prepare("INSERT INTO watchlist_items (id, catalog_key, title, added_by, added_at) VALUES (?, ?, ?, ?, ?)")
      .run(item.id, item.catalogKey, JSON.stringify(item.title), item.addedBy, item.addedAt);
    for (const accountId of item.memberIds) this.addMember(item.id, accountId, item.wantedBy.includes(accountId));
  }

  /** Shares an item with one more person (kept as is when already shared). */
  addMember(itemId: string, accountId: string, wants: boolean): void {
    this.db
      .prepare("INSERT OR IGNORE INTO watchlist_members (item_id, account_id, wants) VALUES (?, ?, ?)")
      .run(itemId, accountId, wants ? 1 : 0);
  }

  isMember(itemId: string, accountId: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM watchlist_members WHERE item_id = ? AND account_id = ?")
      .get(itemId, accountId);
    return row !== undefined;
  }

  /** The item of this title still to watch that `accountId` already sees, if any. */
  findToWatch(accountId: string, catalogKey: string): string | undefined {
    const row = this.db
      .prepare(
        `SELECT i.id FROM watchlist_items i JOIN watchlist_members m ON m.item_id = i.id
         WHERE m.account_id = ? AND i.catalog_key = ? AND i.watched_at IS NULL`,
      )
      .get(accountId, catalogKey);
    return parseOptionalRow(z.object({ id: z.string() }), row)?.id;
  }

  setWant(itemId: string, accountId: string, wants: boolean): void {
    this.db
      .prepare("UPDATE watchlist_members SET wants = ? WHERE item_id = ? AND account_id = ?")
      .run(wants ? 1 : 0, itemId, accountId);
  }

  setWatched(itemId: string, watchedAt: number | null): void {
    this.db.prepare("UPDATE watchlist_items SET watched_at = ? WHERE id = ?").run(watchedAt, itemId);
  }

  /** Removes the item for everyone it was shared with. Returns false when there was none. */
  delete(itemId: string): boolean {
    return changedRows(this.db.prepare("DELETE FROM watchlist_items WHERE id = ?").run(itemId)) > 0;
  }

  /** Every item shared with `accountId`, with its people. */
  listFor(accountId: string): WatchlistItem[] {
    const items = parseRows(
      ItemRow,
      this.db
        .prepare(
          `SELECT i.id, i.title, i.added_by, i.added_at, i.watched_at
           FROM watchlist_items i JOIN watchlist_members m ON m.item_id = i.id
           WHERE m.account_id = ? ORDER BY i.added_at DESC`,
        )
        .all(accountId),
    );
    const members = this.membersOf(accountId);
    return items.map((row) => {
      const people = members.get(row.id) ?? [];
      const toParticipant = (m: z.infer<typeof MemberRow>) => ({
        accountId: m.account_id,
        name: m.name,
        color: m.color,
      });
      const author = people.find((m) => m.account_id === row.added_by);
      return {
        id: row.id,
        title: CatalogTitle.parse(JSON.parse(row.title)),
        // The author always is a member; the fallback only guards a hand-edited database.
        addedBy: author ? toParticipant(author) : { accountId: row.added_by, name: "?", color: "peach" },
        addedAt: row.added_at,
        ...(row.watched_at === null ? {} : { watchedAt: row.watched_at }),
        sharedWith: people.map(toParticipant),
        wantedBy: people.filter((m) => m.wants === 1).map((m) => m.account_id),
      };
    });
  }

  /** The people of every item shared with `accountId`, by item. */
  private membersOf(accountId: string): Map<string, z.infer<typeof MemberRow>[]> {
    const rows = this.db
      .prepare(
        `SELECT m.item_id, m.account_id, a.name, a.color, m.wants
         FROM watchlist_members m JOIN accounts a ON a.id = m.account_id
         WHERE m.item_id IN (SELECT item_id FROM watchlist_members WHERE account_id = ?)
         ORDER BY m.rowid`,
      )
      .all(accountId);
    const byItem = new Map<string, z.infer<typeof MemberRow>[]>();
    for (const row of parseRows(MemberRow, rows)) byItem.set(row.item_id, [...(byItem.get(row.item_id) ?? []), row]);
    return byItem;
  }
}
