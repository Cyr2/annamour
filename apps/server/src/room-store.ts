import { generateRoomCode, ROOM_RETENTION_MS } from "@annamour/protocol";
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

  constructor(repository: RoomRepository, { random = Math.random, now = Date.now }: RoomStoreOptions = {}) {
    this.repository = repository;
    this.random = random;
    this.now = now;
  }

  create(title: string, imported: ImportedMedia, now: number): Room {
    const code = this.freeCode();
    const first = { id: 0, label: undefined };
    this.repository.insert({
      code,
      title,
      episodes: [{ ...first, media: imported }],
      current: 0,
      nextEpisodeId: 1,
      position: 0,
      createdAt: now,
      lastUsedAt: now,
    });
    return this.remember(new Room(code, title, [{ ...first, imported }], now, { persistence: this.persistence(code) }));
  }

  /** The live room, or the saved one brought back paused at its last position. */
  get(code: string): Room | undefined {
    const live = this.live.get(code);
    if (live) return live;
    const stored = this.repository.find(code);
    if (!stored) return undefined;
    const episodes = stored.episodes.map(({ id, label, media }) => ({ id, label, imported: media }));
    const room = new Room(code, stored.title, episodes, this.now(), {
      position: stored.position,
      current: stored.current,
      nextEpisodeId: stored.nextEpisodeId,
      persistence: this.persistence(code),
    });
    return this.remember(room);
  }

  /** Queues an imported episode after the room's others, on disk and for everyone in it. Returns its index. */
  addEpisode(room: Room, label: string | undefined, imported: ImportedMedia): number {
    const episode = { id: room.nextEpisodeId, label };
    this.repository.addEpisode(room.code, { ...episode, media: imported });
    return room.addEpisode({ ...episode, imported });
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
