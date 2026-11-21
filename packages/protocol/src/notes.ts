import type { PlaybackStatus } from "./playback.ts";

/* « Un petit mot »: a short sentence anyone can send while the film is paused. */

/** Longest note, in characters: a line, not a chat. */
export const NOTE_MAX_LENGTH = 80;
/** Minimum delay between two notes from the same person, in ms. */
export const NOTE_COOLDOWN_MS = 2000;
/** How long a note stays on screen, in ms (unless the film starts again first). */
export const NOTE_LIFETIME_MS = 7000;

// Control characters (newlines, escapes) and bidi overrides that could reorder the sender's name.
const UNSAFE = /[\p{Cc}\p{Bidi_Control}]+/gu;

/** The note as shown to everyone (never longer than sent): one line, without control characters; empty when nothing is left. */
export function cleanNote(text: string): string {
  return text.replace(UNSAFE, " ").replace(/\s+/g, " ").trim();
}

export interface NoteContext {
  status: PlaybackStatus;
  /** The room is about to start, waiting for everyone's lead: no longer a pause. */
  readying: boolean;
  lastNoteAt: number;
  now: number;
}

/** The note to send to everyone, or null when it is refused: film playing, too soon, or nothing to say. */
export function acceptNote(text: string, context: NoteContext): string | null {
  if (context.status !== "paused" || context.readying) return null;
  if (context.now - context.lastNoteAt < NOTE_COOLDOWN_MS) return null;
  const note = cleanNote(text);
  return note === "" ? null : note;
}
