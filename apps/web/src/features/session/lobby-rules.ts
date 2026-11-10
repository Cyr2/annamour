import { type PlaybackState, type RoomSnapshot, seanceFinished } from "@annamour/protocol";

/** What the salon's button does: launch, resume where the séance stopped, or watch it again from the start. */
export type LobbyStart = { kind: "start" } | { kind: "resume"; at: number } | { kind: "rewatch" };

type RoomSpot = Pick<RoomSnapshot, "current" | "episodes"> & { media: Pick<RoomSnapshot["media"], "duration"> };

/** The salon's button, by the same rule as the séances' list: a séance over is watched again, not resumed. */
export function lobbyStart(room: RoomSpot | null, playback: PlaybackState | null): LobbyStart {
  const position = playback?.position ?? 0;
  if (position <= 1 || !room) return { kind: "start" };
  const spot = { position, duration: room.media.duration, index: room.current, count: room.episodes.length };
  return seanceFinished(spot) ? { kind: "rewatch" } : { kind: "resume", at: position };
}
