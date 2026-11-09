import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { parseOptionalRow } from "./rows.ts";

const AccountIdRow = z.object({ account_id: z.string() });

/** Signed-in devices: only a hash of each session token is kept. */
export class AuthSessionRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  insert(tokenHash: string, accountId: string, now: number, expiresAt: number): void {
    this.db
      .prepare("INSERT INTO auth_sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run(tokenHash, accountId, now, expiresAt);
  }

  findAccountId(tokenHash: string, now: number): string | undefined {
    const row = this.db
      .prepare("SELECT account_id FROM auth_sessions WHERE token_hash = ? AND expires_at > ?")
      .get(tokenHash, now);
    return parseOptionalRow(AccountIdRow, row)?.account_id;
  }

  delete(tokenHash: string): void {
    this.db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(tokenHash);
  }

  deleteExpired(now: number): void {
    this.db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(now);
  }
}

/** One-time tokens shown as a QR code to sign another device in. */
export class LinkTokenRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  insert(tokenHash: string, accountId: string, expiresAt: number): void {
    this.db
      .prepare("INSERT INTO link_tokens (token_hash, account_id, expires_at) VALUES (?, ?, ?)")
      .run(tokenHash, accountId, expiresAt);
  }

  /** The account a token still opens, leaving the token usable. */
  find(tokenHash: string, now: number): string | undefined {
    const row = this.db
      .prepare("SELECT account_id FROM link_tokens WHERE token_hash = ? AND expires_at > ?")
      .get(tokenHash, now);
    return parseOptionalRow(AccountIdRow, row)?.account_id;
  }

  /** Deletes the token while reading it, so it can never be used twice. */
  consume(tokenHash: string, now: number): string | undefined {
    const row = this.db
      .prepare("DELETE FROM link_tokens WHERE token_hash = ? RETURNING account_id, expires_at")
      .get(tokenHash);
    const token = parseOptionalRow(AccountIdRow.extend({ expires_at: z.number() }), row);
    return token && token.expires_at > now ? token.account_id : undefined;
  }

  deleteExpired(now: number): void {
    this.db.prepare("DELETE FROM link_tokens WHERE expires_at <= ?").run(now);
  }
}
