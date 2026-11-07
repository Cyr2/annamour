/**
 * When a device should hold the room, and when it may let it go.
 *
 * A short stall is a local hiccup: the device catches up by itself, so the
 * room only waits once it lasts. And once the room waits, it only resumes when
 * the device has a real lead downloaded: resuming on the first frames makes it
 * stall again a few seconds later, pausing everyone over and over.
 */

/** A stall shorter than this does not pause the room (ms). */
export const STALL_GRACE_MS = 2000;

/** Seconds downloaded ahead of the position before the room may resume. */
export const RESUME_LEAD = 12;

/** Seconds downloaded past `position`, in the range that contains it (0 if none does). */
export function bufferedAhead(ranges: ReadonlyArray<readonly [number, number]>, position: number): number {
  // A tiny gap is tolerated: players often sit a few ms before a range's start.
  const range = ranges.find(([start, end]) => start - 0.25 <= position && position <= end);
  return range ? range[1] - position : 0;
}

/** Enough is downloaded to play on without stalling soon (or up to the end). */
export function readyToResume(ahead: number, remaining: number): boolean {
  return ahead >= Math.min(RESUME_LEAD, Math.max(0, remaining - 0.5));
}
