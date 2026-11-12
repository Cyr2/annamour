import type { DatabaseSync } from "node:sqlite";
import { BubbleColor, CatalogTitle, type Rating, Rating as RatingSchema, type TitleRating } from "@annamour/protocol";
import { z } from "zod";
import { parseRows } from "./rows.ts";
import { VISIBLE_ROOMS } from "./visible-rooms.ts";

const RatingRow = z.object({
  account_id: z.string(),
  name: z.string(),
  color: BubbleColor,
  title: z.string(),
  rating: RatingSchema,
  rated_at: z.number(),
});

/** The title as saved; a row whose title no longer reads is skipped rather than failing the whole list. */
function titleOf(json: string): CatalogTitle | undefined {
  try {
    const parsed = CatalogTitle.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** « Ton avis » on films and series. */
export class RatingRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  /** Gives or changes this account's avis on a title. */
  rate(accountId: string, title: CatalogTitle, rating: Rating, now: number): void {
    this.db
      .prepare(
        `INSERT INTO ratings (account_id, title_type, title_id, title, rating, rated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (account_id, title_type, title_id)
         DO UPDATE SET title = excluded.title, rating = excluded.rating, rated_at = excluded.rated_at`,
      )
      .run(accountId, title.type, title.id, JSON.stringify(title), rating, now);
  }

  unrate(accountId: string, type: CatalogTitle["type"], id: number): void {
    this.db
      .prepare("DELETE FROM ratings WHERE account_id = ? AND title_type = ? AND title_id = ?")
      .run(accountId, type, id);
  }

  /** Mine, and those of the people I share a circle or a séance with. */
  visibleTo(accountId: string): TitleRating[] {
    const rows = this.db
      .prepare(
        `SELECT r.account_id, a.name, a.color, r.title, r.rating, r.rated_at
         FROM ratings r JOIN accounts a ON a.id = r.account_id
         WHERE r.account_id = :me
            OR r.account_id IN (
              SELECT m.account_id FROM circle_members m
              WHERE m.circle_id IN (SELECT circle_id FROM circle_members WHERE account_id = :me))
            OR r.account_id IN (SELECT p.account_id FROM participations p WHERE p.room_code IN (${VISIBLE_ROOMS}))
         ORDER BY r.rated_at DESC`,
      )
      .all({ me: accountId });
    return parseRows(RatingRow, rows).flatMap((row) => {
      const title = titleOf(row.title);
      if (!title) return [];
      const by = { accountId: row.account_id, name: row.name, color: row.color };
      return [{ by, title, rating: row.rating, ratedAt: row.rated_at }];
    });
  }
}
