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
  // The shared watchlist: a title (catalog JSON), and the people it is shared with, each saying « J'ai envie » or not.
  `
  CREATE TABLE watchlist_items (
    id TEXT PRIMARY KEY,
    catalog_key TEXT NOT NULL,
    title TEXT NOT NULL,
    added_by TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    added_at INTEGER NOT NULL,
    watched_at INTEGER
  );
  CREATE TABLE watchlist_members (
    item_id TEXT NOT NULL REFERENCES watchlist_items (id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    wants INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (item_id, account_id)
  );
  CREATE INDEX watchlist_members_account_id ON watchlist_members (account_id);
  `,
  // « Tout le monde » follows the author's history (people met later see it too). A title shared with
  // its author alone can only have meant that: it becomes « Tout le monde ».
  `
  ALTER TABLE watchlist_items ADD COLUMN everyone INTEGER NOT NULL DEFAULT 0;
  UPDATE watchlist_items SET everyone = 1
  WHERE (SELECT COUNT(*) FROM watchlist_members m WHERE m.item_id = watchlist_items.id) = 1;
  `,
  // How well each device played each séance (one row per page load, updated as it grows), kept 30 days.
  `
  CREATE TABLE IF NOT EXISTS playback_reports (
    viewing_id TEXT PRIMARY KEY,
    room_code TEXT NOT NULL,
    report TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS playback_reports_room ON playback_reports (room_code, updated_at);
  `,
  // Circles: the groups of people one watches with. Séances and watchlist titles belong to one; members
  // stay when a séance leaves someone's history; an invitation link (stored hashed) lets someone in.
  `
  CREATE TABLE circles (
    id TEXT PRIMARY KEY,
    name TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE circle_members (
    circle_id TEXT NOT NULL REFERENCES circles (id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (circle_id, account_id)
  );
  CREATE INDEX circle_members_account_id ON circle_members (account_id);
  CREATE TABLE circle_invites (
    token_hash TEXT PRIMARY KEY,
    circle_id TEXT NOT NULL REFERENCES circles (id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  ALTER TABLE rooms ADD COLUMN circle_id TEXT REFERENCES circles (id) ON DELETE SET NULL;
  ALTER TABLE watchlist_items ADD COLUMN circle_id TEXT REFERENCES circles (id) ON DELETE CASCADE;
  `,
  // Where each person put a circle among theirs (drag and drop on « Nous »); null until they order them.
  `
  ALTER TABLE circle_members ADD COLUMN position INTEGER;
  `,
  // Who created each séance (they alone may delete it for everyone; older ones get theirs at start, see
  // ParticipationRepository.fillCreators), and which séance marked a title « vu », so deleting it takes the mark back.
  `
  ALTER TABLE rooms ADD COLUMN created_by TEXT REFERENCES accounts (id) ON DELETE SET NULL;
  ALTER TABLE watchlist_items ADD COLUMN watched_by_room TEXT;
  `,
  // Who marked a title « vu » by hand, so its sheet can say « Marqué vu par Léo » to the others.
  `
  ALTER TABLE watchlist_items ADD COLUMN watched_by_account TEXT REFERENCES accounts (id) ON DELETE SET NULL;
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

const UserVersion = z.object({ user_version: z.number().int().min(0) });

function schemaVersion(db: DatabaseSync): number {
  return UserVersion.parse(db.prepare("PRAGMA user_version").get()).user_version;
}

/**
 * Runs the migrations this database has not seen yet, each in its own
 * transaction, up to `target` (all of them by default; tests stop earlier to
 * build a database as it was).
 */
export function migrate(db: DatabaseSync, target = MIGRATIONS.length): void {
  for (let version = schemaVersion(db); version < target; version++) {
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
