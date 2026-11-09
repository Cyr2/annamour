import { type EpisodeInfo, nextEpisodeLabel, type RoomSnapshot, type WatchlistItem } from "@annamour/protocol";

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

/**
 * « S2 · É5 », or for a video without a label: « Épisode 5 » in a series, the
 * séance's own title when it is a single film.
 */
export function episodeName(episodes: readonly EpisodeInfo[], index: number, title: string): string {
  const label = episodes[index]?.label;
  if (label) return label;
  return episodes.length > 1 ? `Épisode ${index + 1}` : title;
}

/** The label offered for the episode after the last one queued. */
export function suggestedLabel(episodes: readonly EpisodeInfo[]): string {
  return nextEpisodeLabel(episodes.at(-1)?.label, episodes.length);
}

type EpisodesOf = Pick<RoomSnapshot, "episodes" | "current">;

/** The video on screen is an episode of a series: from the catalog, or one of several pasted videos. */
export function onSeries({ episodes, current }: EpisodesOf): boolean {
  const catalog = episodes[current]?.catalog;
  return catalog ? catalog.type === "tv" : episodes.length > 1;
}

/** The heading of the list of what the séance plays: « Épisodes » for a series, « File » for films. */
export function queueTitle(room: EpisodesOf): string {
  return onSeries(room) ? "Épisodes" : "File";
}

/**
 * The series on screen, as it stands in Notre liste and not yet watched: at
 * the end of the last episode queued, the end screen offers to mark it watched.
 */
export function seriesToMarkWatched(items: readonly WatchlistItem[], room: EpisodesOf): WatchlistItem | undefined {
  const catalog = room.episodes[room.current]?.catalog;
  if (catalog?.type !== "tv" || room.current + 1 < room.episodes.length) return undefined;
  return items.find((item) => item.title.type === "tv" && item.title.id === catalog.id && !item.watchedAt);
}

/** A séance of one video is a film: its end screen speaks of a film, not of an episode. */
export function endTitle(episodeCount: number): string {
  return episodeCount > 1 ? "Épisode terminé" : "C'est fini";
}
