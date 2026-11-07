import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { changedRows, parseOptionalRow } from "./rows.ts";

const TvPairingRow = z.object({
  poll_token_hash: z.string(),
  state: z.enum(["pending", "approved", "consumed"]),
  expires_at: z.number(),
});

export type TvPairingState = z.infer<typeof TvPairingRow>["state"];

export interface TvPairing {
  pollTokenHash: string;
  state: TvPairingState;
  expiresAt: number;
}

function toPairing(row: z.infer<typeof TvPairingRow>): TvPairing {
  return { pollTokenHash: row.poll_token_hash, state: row.state, expiresAt: row.expires_at };
}

const SELECT = "SELECT poll_token_hash, state, expires_at FROM tv_pairings";

/** TVs waiting to be linked: only hashes of their code and poll token are kept. */
export class TvPairingRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  insert(pollTokenHash: string, codeHash: string, expiresAt: number): void {
    this.db
      .prepare("INSERT INTO tv_pairings (poll_token_hash, code_hash, expires_at) VALUES (?, ?, ?)")
      .run(pollTokenHash, codeHash, expiresAt);
  }

  /** Whether a code is already shown on a TV, so two live pairings never share one. */
  liveCodeExists(codeHash: string, now: number): boolean {
    return (
      this.db.prepare("SELECT 1 FROM tv_pairings WHERE code_hash = ? AND expires_at > ?").get(codeHash, now) !==
      undefined
    );
  }

  /** The most recent pairing with this code (an old expired one may linger until the sweep). */
  findByCode(codeHash: string): TvPairing | undefined {
    const row = this.db.prepare(`${SELECT} WHERE code_hash = ? ORDER BY expires_at DESC LIMIT 1`).get(codeHash);
    const pairing = parseOptionalRow(TvPairingRow, row);
    return pairing && toPairing(pairing);
  }

  findByPollToken(pollTokenHash: string): TvPairing | undefined {
    const row = this.db.prepare(`${SELECT} WHERE poll_token_hash = ?`).get(pollTokenHash);
    const pairing = parseOptionalRow(TvPairingRow, row);
    return pairing && toPairing(pairing);
  }

  /** Links a pending pairing to an account; false if someone got there first. */
  approve(pollTokenHash: string, accountId: string): boolean {
    const result = this.db
      .prepare(
        "UPDATE tv_pairings SET state = 'approved', account_id = ? WHERE poll_token_hash = ? AND state = 'pending'",
      )
      .run(accountId, pollTokenHash);
    return changedRows(result) === 1;
  }

  /** Marks an approved pairing as used while reading its account, so it signs the TV in only once. */
  consume(pollTokenHash: string): string | undefined {
    const row = this.db
      .prepare(
        "UPDATE tv_pairings SET state = 'consumed' WHERE poll_token_hash = ? AND state = 'approved' RETURNING account_id",
      )
      .get(pollTokenHash);
    return parseOptionalRow(z.object({ account_id: z.string() }), row)?.account_id;
  }

  deleteExpired(now: number): void {
    this.db.prepare("DELETE FROM tv_pairings WHERE expires_at <= ?").run(now);
  }
}
