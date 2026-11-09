import { type CatalogRef, generateRoomCode, ROOM_RETENTION_MS } from "@annamour/protocol";
import type { ImportedMedia } from "./hls.ts";
import { Room, type RoomPersistence } from "./rooms.ts";
import type { RoomRepository } from "./storage/room-repository.ts";

/** An empty room leaves memory after this long; it stays on disk and reopens on demand. */
export const EVICT_EMPTY_ROOM_AFTER_MS = 10 * 60 * 1000;
/** How often the position of rooms in use is saved, so a crash loses little. */
export const CHECKPOINT_INTERVAL_MS = 30 * 1000;

export interface RoomStoreOptions {
  random?: () => number;
  now?: () => number;
  /** A film of the catalog was watched to its end in this séance (it becomes « vu »). */
  onFilmWatched?: (code: string, film: CatalogRef) => void;
}

/** What is known of a séance's first video beyond the stream: its label and the catalog title it came from. */
export interface FirstEpisode {
  label?: string | undefined;
  catalog?: CatalogRef | undefined;
}

export interface SweepResult {
  evicted: number;
  deleted: number;
}

/**
 * Live rooms stay in memory while people use them; every room also lives in
 * the database, so a session can be reopened days later or after a restart.
 */
export class RoomStore {
  private readonly live = new Map<string, Room>();
  private readonly repository: RoomRepository;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly onFilmWatched: RoomStoreOptions["onFilmWatched"];

  constructor(
    repository: RoomRepository,
    { random = Math.random, now = Date.now, onFilmWatched }: RoomStoreOptions = {},
  ) {
    this.repository = repository;
    this.onFilmWatched = onFilmWatched;
    this.random = random;
    this.now = now;
  }

  /** `first` names the séance's first video when it is an episode of something (« S1 · É1 » of a series). */
  create(title: string, imported: ImportedMedia, now: number, first: FirstEpisode = {}): Room {
    const code = this.freeCode();
    const episode = { id: 0, label: first.label, catalog: first.catalog };
    this.repository.insert({
      code,
      title,
      episodes: [{ ...episode, media: imported }],
      current: 0,
      nextEpisodeId: 1,
      position: 0,
      createdAt: now,
      lastUsedAt: now,
    });
    return this.remember(
      new Room(code, title, [{ ...episode, imported }], now, { persistence: this.persistence(code) }),
    );
  }

  /** The live room, or the saved one brought back paused at its last position. */
  get(code: string): Room | undefined {
    const live = this.live.get(code);
    if (live) return live;
    const stored = this.repository.find(code);
    if (!stored) return undefined;
    const episodes = stored.episodes.map(({ id, label, media, catalog }) => ({ id, label, catalog, imported: media }));
    const room = new Room(code, stored.title, episodes, this.now(), {
      position: stored.position,
      current: stored.current,
      nextEpisodeId: stored.nextEpisodeId,
      persistence: this.persistence(code),
    });
    return this.remember(room);
  }

  /**
   * Queues an imported episode after the room's others, on disk and for everyone
   * in it, told it came from the device `byClientId`. Returns its index.
   */
  addEpisode(
    room: Room,
    label: string | undefined,
    imported: ImportedMedia,
    catalog?: CatalogRef,
    byClientId?: string,
  ): number {
    const episode = { id: room.nextEpisodeId, label, catalog };
    this.repository.addEpisode(room.code, { ...episode, media: imported });
    return room.addEpisode({ ...episode, imported }, byClientId);
  }

  /** Where a room in memory is right now; undefined when it is only on disk. */
  livePosition(code: string, now: number): number | undefined {
    return this.live.get(code)?.positionAt(now);
  }

  /** Number of rooms currently in memory. */
  get size(): number {
    return this.live.size;
  }

  /** Saves the position of every room someone is in. */
  checkpoint(now: number): void {
    for (const room of this.live.values()) if (room.size > 0) room.saveNow(now);
  }

  /** A séance deleted for everyone: whoever is still in it is let go, and it is gone from memory. */
  forget(code: string): void {
    this.live.get(code)?.closeAll();
    this.live.delete(code);
  }

  /** Forgets rooms unused for longer than the retention and frees memory from idle ones. */
  sweep(now: number): SweepResult {
    let evicted = 0;
    for (const [code, room] of this.live) {
      if (room.emptySince !== null && now - room.emptySince > EVICT_EMPTY_ROOM_AFTER_MS) {
        this.live.delete(code);
        evicted++;
      }
    }
    const deleted = this.repository.deleteUnusedSince(now - ROOM_RETENTION_MS);
    for (const code of deleted) {
      this.live.get(code)?.closeAll();
      this.live.delete(code);
    }
    return { evicted, deleted: deleted.length };
  }

  private remember(room: Room): Room {
    this.live.set(room.code, room);
    return room;
  }

  private persistence(code: string): RoomPersistence {
    const repository = this.repository;
    return {
      savePosition: (position, now) => repository.savePosition(code, position, now),
      saveCurrentEpisode: (current, duration, now) => repository.saveCurrentEpisode(code, current, duration, now),
      removeEpisode: (id) => repository.removeEpisode(code, id),
      // A series is not « vu » after one episode: only a film is.
      episodeEnded: (catalog) => {
        if (catalog?.type === "movie") this.onFilmWatched?.(code, catalog);
      },
    };
  }

  private freeCode(): string {
    for (let tries = 0; tries <= 50; tries++) {
      const code = generateRoomCode(this.random);
      if (!this.live.has(code) && !this.repository.exists(code)) return code;
    }
    throw new Error("No free room code");
  }
}
