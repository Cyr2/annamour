/*
 * A séance's lighter qualities are kept while it is watched, so seeking back
 * is instant. Many séances in a row could still fill the volume: past a cap,
 * the séances watched longest ago are deleted first, never one being watched.
 */

export const BYTES_PER_GB = 1_000_000_000;

/** A séance's encoded files on disk. */
export interface RoomUsage {
  code: string;
  bytes: number;
  /** When it was last watched (ms). */
  lastUse: number;
  /** Watched right now, or a moment ago: never evicted. */
  inUse: boolean;
}

/** The séances to delete, least recently watched first, to get back under `maxBytes`. */
export function roomsToEvict(rooms: readonly RoomUsage[], maxBytes: number): string[] {
  let total = rooms.reduce((sum, room) => sum + room.bytes, 0);
  const evicted: string[] = [];
  const candidates = rooms.filter((room) => !room.inUse).toSorted((a, b) => a.lastUse - b.lastUse);
  for (const room of candidates) {
    if (total <= maxBytes) break;
    evicted.push(room.code);
    total -= room.bytes;
  }
  return evicted;
}

/** "12.3 GB", for the server log. */
export function formatGb(bytes: number): string {
  return `${(bytes / BYTES_PER_GB).toFixed(1)} GB`;
}
