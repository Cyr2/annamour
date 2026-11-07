import { type EpisodeInfo, nextEpisodeLabel, type RoomSnapshot } from "@annamour/protocol";

/* What the player shows around episodes: the end screen, the countdown, the « Épisodes » list. */

/** Which end screen to show, if any (see the mockup « Épisode suivant »). */
export type EpisodeEnd = "countdown" | "next-ready" | "nothing-next" | null;

export function episodeEndOf(
  room: Pick<RoomSnapshot, "finished" | "countdownUntil" | "current" | "episodes">,
): EpisodeEnd {
  if (!room.finished) return null;
  if (room.countdownUntil !== null) return "countdown";
  return room.current + 1 < room.episodes.length ? "next-ready" : "nothing-next";
}

/** Whole seconds left before the next episode starts by itself (never below 0). */
export function secondsLeft(countdownUntil: number, serverNow: number): number {
  return Math.max(0, Math.ceil((countdownUntil - serverNow) / 1000));
}

/** Where an episode stands for the séance: before the one on screen (ticked), that one, or still to come. */
export type EpisodeState = "watched" | "current" | "upcoming";

export function episodeState(index: number, current: number): EpisodeState {
  if (index === current) return "current";
  return index < current ? "watched" : "upcoming";
}

/** « S2 · É5 », or « Épisode 5 » for an episode without a label. */
export function episodeName(episodes: readonly EpisodeInfo[], index: number): string {
  return episodes[index]?.label ?? `Épisode ${index + 1}`;
}

/** The label offered for the episode after the last one queued. */
export function suggestedLabel(episodes: readonly EpisodeInfo[]): string {
  return nextEpisodeLabel(episodes.at(-1)?.label, episodes.length);
}

/** A séance of one video is a film: its end screen speaks of a film, not of an episode. */
export function endTitle(episodeCount: number): string {
  return episodeCount > 1 ? "Épisode terminé" : "C'est fini";
}
