/**
 * Playback state, owned by the server. Every client derives the current
 * position from it and the shared clock, so nobody has to stream positions.
 */
export type PlaybackStatus = "playing" | "paused";

export interface PlaybackState {
  status: PlaybackStatus;
  /** Position in seconds at the server instant `at`. */
  position: number;
  /** Server clock, in ms, at which `position` was true. */
  at: number;
}

export const initialPlayback = (now: number): PlaybackState => ({
  status: "paused",
  position: 0,
  at: now,
});

/** Where the video should be at server time `now`. */
export function positionAt(state: PlaybackState, now: number): number {
  if (state.status === "paused") return state.position;
  return Math.max(0, state.position + (now - state.at) / 1000);
}

export function play(state: PlaybackState, now: number, position = positionAt(state, now)): PlaybackState {
  return { status: "playing", position: clampPosition(position), at: now };
}

export function pause(state: PlaybackState, now: number, position = positionAt(state, now)): PlaybackState {
  return { status: "paused", position: clampPosition(position), at: now };
}

export function seek(state: PlaybackState, now: number, position: number): PlaybackState {
  return { status: state.status, position: clampPosition(position), at: now };
}

function clampPosition(position: number): number {
  return Number.isFinite(position) ? Math.max(0, position) : 0;
}
