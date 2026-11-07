import type { DatabaseSync } from "node:sqlite";
import { AudioTrack, SubtitleTrack } from "@annamour/protocol";
import { z } from "zod";
import type { ImportedMedia } from "../hls.ts";
import { parseOptionalRow, parseRows } from "./rows.ts";

export interface StoredRoom {
  code: string;
  title: string;
  media: ImportedMedia;
  /** Last saved position, in seconds. */
  position: number;
  createdAt: number;
  lastUsedAt: number;
}

const FileEntries = z.array(z.tuple([z.string(), z.string()]));

/** How an imported stream is kept on disk: Maps become [name, text] pairs. */
const StoredMedia = z.object({
  playlists: FileEntries,
  audio: z.array(AudioTrack),
  subtitleFiles: FileEntries,
  subtitles: z.array(z.object(SubtitleTrack.shape).omit({ url: true })),
  duration: z.number().nullable(),
});

const RoomRow = z.object({
  code: z.string(),
  title: z.string(),
  media: z.string(),
  position: z.number(),
  created_at: z.number(),
  last_used_at: z.number(),
});

function serializeMedia(media: ImportedMedia): string {
  return JSON.stringify({
    playlists: [...media.playlists],
    audio: media.audio,
    subtitleFiles: [...media.subtitleFiles],
    subtitles: media.subtitles,
    duration: media.duration ?? null,
  } satisfies z.input<typeof StoredMedia>);
}

function deserializeMedia(json: string): ImportedMedia {
  const stored = StoredMedia.parse(JSON.parse(json));
  return {
    playlists: new Map(stored.playlists),
    audio: stored.audio,
    subtitleFiles: new Map(stored.subtitleFiles),
    subtitles: stored.subtitles,
    duration: stored.duration ?? undefined,
  };
}

export class RoomRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  insert(room: StoredRoom): void {
    this.db
      .prepare(
        `INSERT INTO rooms (code, title, media, duration, position, created_at, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        room.code,
        room.title,
        serializeMedia(room.media),
        room.media.duration ?? null,
        room.position,
        room.createdAt,
        room.lastUsedAt,
      );
  }

  exists(code: string): boolean {
    return this.db.prepare("SELECT 1 FROM rooms WHERE code = ?").get(code) !== undefined;
  }

  find(code: string): StoredRoom | undefined {
    const row = parseOptionalRow(RoomRow, this.db.prepare("SELECT * FROM rooms WHERE code = ?").get(code));
    if (!row) return undefined;
    return {
      code: row.code,
      title: row.title,
      media: deserializeMedia(row.media),
      position: row.position,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    };
  }

  /** Saving a position also marks the room as used now. */
  savePosition(code: string, position: number, now: number): void {
    this.db.prepare("UPDATE rooms SET position = ?, last_used_at = ? WHERE code = ?").run(position, now, code);
  }

  /** Deletes rooms (and, by cascade, their participations) unused since `cutoff`. */
  deleteUnusedSince(cutoff: number): string[] {
    const rows = this.db.prepare("DELETE FROM rooms WHERE last_used_at < ? RETURNING code").all(cutoff);
    return parseRows(z.object({ code: z.string() }), rows).map((row) => row.code);
  }
}
