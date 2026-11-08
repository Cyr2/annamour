import type { DatabaseSync } from "node:sqlite";
import { type Account, BubbleColor } from "@annamour/protocol";
import { z } from "zod";
import { parseOptionalRow } from "./rows.ts";

export interface NewAccount {
  id: string;
  keyHash: string;
  name: string;
  color: BubbleColor;
  createdAt: number;
}

const AccountRow = z.object({
  id: z.string(),
  name: z.string(),
  color: BubbleColor,
  has_passkey: z.number(),
});

function toAccount(row: z.infer<typeof AccountRow>): Account {
  return { id: row.id, name: row.name, color: row.color, hasPasskey: row.has_passkey === 1 };
}

const SELECT_ACCOUNT = `
  SELECT id, name, color, EXISTS (SELECT 1 FROM passkeys WHERE account_id = accounts.id) AS has_passkey
  FROM accounts`;

export class AccountRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  insert(account: NewAccount): void {
    this.db
      .prepare("INSERT INTO accounts (id, key_hash, name, color, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(account.id, account.keyHash, account.name, account.color, account.createdAt);
  }

  findById(id: string): Account | undefined {
    const row = parseOptionalRow(AccountRow, this.db.prepare(`${SELECT_ACCOUNT} WHERE id = ?`).get(id));
    return row && toAccount(row);
  }

  findByKeyHash(keyHash: string): Account | undefined {
    const row = parseOptionalRow(AccountRow, this.db.prepare(`${SELECT_ACCOUNT} WHERE key_hash = ?`).get(keyHash));
    return row && toAccount(row);
  }

  keyHashExists(keyHash: string): boolean {
    return this.db.prepare("SELECT 1 FROM accounts WHERE key_hash = ?").get(keyHash) !== undefined;
  }

  replaceKeyHash(id: string, keyHash: string): void {
    this.db.prepare("UPDATE accounts SET key_hash = ? WHERE id = ?").run(keyHash, id);
  }

  update(id: string, changes: { name?: string | undefined; color?: BubbleColor | undefined }): void {
    this.db
      .prepare("UPDATE accounts SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ?")
      .run(changes.name ?? null, changes.color ?? null, id);
  }
}
