import { DatabaseSync } from "node:sqlite";
import { z } from "zod";

/**
 * Each entry upgrades the schema by one version; PRAGMA user_version records
 * how many have run. Never edit a shipped migration: append a new one.
 */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE rooms (
    code TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    media TEXT NOT NULL,
    duration REAL,
    position REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL
  );
  CREATE INDEX rooms_last_used_at ON rooms (last_used_at);

  CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    key_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE participations (
    room_code TEXT NOT NULL REFERENCES rooms (code) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    last_seen_at INTEGER NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (room_code, account_id)
  );
  CREATE INDEX participations_account_id ON participations (account_id);

  CREATE TABLE auth_sessions (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE link_tokens (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE passkeys (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    public_key BLOB NOT NULL,
    counter INTEGER NOT NULL,
    transports TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX passkeys_account_id ON passkeys (account_id);
  `,
  `
  CREATE TABLE tv_pairings (
    poll_token_hash TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'approved', 'consumed')),
    account_id TEXT REFERENCES accounts (id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX tv_pairings_code_hash ON tv_pairings (code_hash);
  `,
  // A séance chains episodes: each keeps its own imported stream; the one a séance was created with becomes episode 0.
  `
  CREATE TABLE room_episodes (
    room_code TEXT NOT NULL REFERENCES rooms (code) ON DELETE CASCADE,
    id INTEGER NOT NULL,
    label TEXT,
    media TEXT NOT NULL,
    PRIMARY KEY (room_code, id)
  );
  INSERT INTO room_episodes (room_code, id, label, media) SELECT code, 0, NULL, media FROM rooms;
  ALTER TABLE rooms DROP COLUMN media;
  ALTER TABLE rooms ADD COLUMN current_episode INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE rooms ADD COLUMN next_episode_id INTEGER NOT NULL DEFAULT 1;
  `,
  // The catalog title (JSON) an episode was made from, so the PWA can offer the one that follows.
  `
  ALTER TABLE room_episodes ADD COLUMN catalog TEXT;
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

const UserVersion = z.object({ user_version: z.number().int().min(0) });

function schemaVersion(db: DatabaseSync): number {
  return UserVersion.parse(db.prepare("PRAGMA user_version").get()).user_version;
}

/** Runs the migrations this database has not seen yet, each in its own transaction. */
export function migrate(db: DatabaseSync): void {
  for (let version = schemaVersion(db); version < MIGRATIONS.length; version++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[version] ?? "");
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

/** Opens (or creates) the database at `path`; ":memory:" is used by tests. */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  // WAL lets the periodic position saves never block readers.
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db);
  return db;
}
