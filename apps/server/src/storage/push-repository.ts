import type { DatabaseSync } from "node:sqlite";
import type { PushSubscriptionRequest } from "@annamour/protocol";
import { z } from "zod";
import { parseRows } from "./rows.ts";

const SubscriptionRow = z.object({
  account_id: z.string(),
  endpoint: z.string(),
  p256dh: z.string(),
  auth: z.string(),
});

export interface StoredSubscription extends PushSubscriptionRequest {
  accountId: string;
}

/** Each device's push subscription, by account. */
export class PushRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  /** A device signed in to another account since keeps only its latest subscription. */
  save(accountId: string, { endpoint, keys }: PushSubscriptionRequest, now: number): void {
    this.db
      .prepare(
        `INSERT INTO push_subscriptions (endpoint, account_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (endpoint) DO UPDATE SET account_id = excluded.account_id, p256dh = excluded.p256dh, auth = excluded.auth`,
      )
      .run(endpoint, accountId, keys.p256dh, keys.auth, now);
  }

  remove(endpoint: string, accountId?: string): void {
    if (accountId === undefined) {
      this.db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
      return;
    }
    this.db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND account_id = ?").run(endpoint, accountId);
  }

  ofAccounts(accountIds: readonly string[]): StoredSubscription[] {
    if (accountIds.length === 0) return [];
    const rows = this.db
      .prepare(
        `SELECT account_id, endpoint, p256dh, auth FROM push_subscriptions
         WHERE account_id IN (${accountIds.map(() => "?").join(", ")})`,
      )
      .all(...accountIds);
    return parseRows(SubscriptionRow, rows).map((row) => ({
      accountId: row.account_id,
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth },
    }));
  }
}
