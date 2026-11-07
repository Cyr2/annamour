import type { DatabaseSync } from "node:sqlite";
import { AudioTrack, CatalogRef, SubtitleTrack } from "@annamour/protocol";
import { z } from "zod";
import type { ImportedMedia } from "../hls.ts";
import { parseOptionalRow, parseRows } from "./rows.ts";

/** One video of a séance. Its id never changes, so links to its files stay right when the queue changes. */
export interface StoredEpisode {
  id: number;
  label: string | undefined;
  media: ImportedMedia;
  /** The catalog title it was made from; absent for a pasted link. */
  catalog?: CatalogRef | undefined;
}

export interface StoredRoom {
  code: string;
  title: string;
  /** In watching order. */
  episodes: StoredEpisode[];
  /** Index (in `episodes`) of the episode everyone is on. */
  current: number;
  /** The id the next added episode gets: ids only grow, a removed one is never given again. */
  nextEpisodeId: number;
  /** Last saved position in the current episode, in seconds. */
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
  position: z.number(),
  current_episode: z.number(),
  next_episode_id: z.number(),
  created_at: z.number(),
  last_used_at: z.number(),
});

const EpisodeRow = z.object({
  id: z.number(),
  label: z.string().nullable(),
  media: z.string(),
  catalog: z.string().nullable(),
});

/** A saved catalog reference, or undefined when absent or no longer readable (the episode still plays). */
function parseCatalog(json: string | null): CatalogRef | undefined {
  if (json === null) return undefined;
  try {
    const parsed = CatalogRef.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

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
    const current = room.episodes[room.current];
    this.db
      .prepare(
        `INSERT INTO rooms (code, title, duration, position, current_episode, next_episode_id, created_at, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        room.code,
        room.title,
        current?.media.duration ?? null,
        room.position,
        room.current,
        room.nextEpisodeId,
        room.createdAt,
        room.lastUsedAt,
      );
    for (const episode of room.episodes) this.insertEpisode(room.code, episode);
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
      episodes: this.episodes(code),
      current: row.current_episode,
      nextEpisodeId: row.next_episode_id,
      position: row.position,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    };
  }

  /** Queues an episode and moves the room's id counter past it. */
  addEpisode(code: string, episode: StoredEpisode): void {
    this.insertEpisode(code, episode);
    this.db.prepare("UPDATE rooms SET next_episode_id = ? WHERE code = ?").run(episode.id + 1, code);
  }

  removeEpisode(code: string, id: number): void {
    this.db.prepare("DELETE FROM room_episodes WHERE room_code = ? AND id = ?").run(code, id);
  }

  /** Saving a position also marks the room as used now. */
  savePosition(code: string, position: number, now: number): void {
    this.db.prepare("UPDATE rooms SET position = ?, last_used_at = ? WHERE code = ?").run(position, now, code);
  }

  /** The séance moved to another episode: from its start, with its own duration. */
  saveCurrentEpisode(code: string, current: number, duration: number | undefined, now: number): void {
    this.db
      .prepare("UPDATE rooms SET current_episode = ?, duration = ?, position = 0, last_used_at = ? WHERE code = ?")
      .run(current, duration ?? null, now, code);
  }

  /** Deletes rooms (and, by cascade, their episodes and participations) unused since `cutoff`. */
  deleteUnusedSince(cutoff: number): string[] {
    const rows = this.db.prepare("DELETE FROM rooms WHERE last_used_at < ? RETURNING code").all(cutoff);
    return parseRows(z.object({ code: z.string() }), rows).map((row) => row.code);
  }

  private insertEpisode(code: string, episode: StoredEpisode): void {
    this.db
      .prepare("INSERT INTO room_episodes (room_code, id, label, media, catalog) VALUES (?, ?, ?, ?, ?)")
      .run(
        code,
        episode.id,
        episode.label ?? null,
        serializeMedia(episode.media),
        episode.catalog ? JSON.stringify(episode.catalog) : null,
      );
  }

  private episodes(code: string): StoredEpisode[] {
    const rows = this.db
      .prepare("SELECT id, label, media, catalog FROM room_episodes WHERE room_code = ? ORDER BY id")
      .all(code);
    return parseRows(EpisodeRow, rows).map((row) => ({
      id: row.id,
      label: row.label ?? undefined,
      media: deserializeMedia(row.media),
      catalog: parseCatalog(row.catalog),
    }));
  }
}
