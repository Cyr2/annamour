import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { parseOptionalRow, parseRows } from "./rows.ts";

export interface StoredPasskey {
  /** WebAuthn credential id, base64url. */
  id: string;
  accountId: string;
  publicKey: Uint8Array<ArrayBuffer>;
  counter: number;
  transports: string[];
}

const PasskeyRow = z.object({
  id: z.string(),
  account_id: z.string(),
  public_key: z.instanceof(Uint8Array),
  counter: z.number(),
  transports: z.string(),
});

function toPasskey(row: z.infer<typeof PasskeyRow>): StoredPasskey {
  return {
    id: row.id,
    accountId: row.account_id,
    publicKey: new Uint8Array(row.public_key),
    counter: row.counter,
    transports: z.array(z.string()).parse(JSON.parse(row.transports)),
  };
}

export class PasskeyRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  insert(passkey: StoredPasskey, now: number): void {
    this.db
      .prepare(
        "INSERT INTO passkeys (id, account_id, public_key, counter, transports, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(passkey.id, passkey.accountId, passkey.publicKey, passkey.counter, JSON.stringify(passkey.transports), now);
  }

  find(id: string): StoredPasskey | undefined {
    const row = parseOptionalRow(PasskeyRow, this.db.prepare("SELECT * FROM passkeys WHERE id = ?").get(id));
    return row && toPasskey(row);
  }

  listForAccount(accountId: string): StoredPasskey[] {
    const rows = this.db.prepare("SELECT * FROM passkeys WHERE account_id = ? ORDER BY created_at").all(accountId);
    return parseRows(PasskeyRow, rows).map(toPasskey);
  }

  updateCounter(id: string, counter: number): void {
    this.db.prepare("UPDATE passkeys SET counter = ? WHERE id = ?").run(counter, id);
  }
}
