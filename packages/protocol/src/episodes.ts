/*
 * A séance can chain several videos: its episodes. Everyone watches the same
 * one; at its end a short countdown starts the next one for everybody, unless
 * someone says « Pas ce soir ». The server owns this state, every client
 * shows it; the rules live here, pure.
 */

/** How long the countdown lasts at the end of an episode before the next one starts for everyone. */
export const NEXT_EPISODE_COUNTDOWN_MS = 8000;
/** Episodes a séance can hold: a whole season and more. */
export const MAX_EPISODES = 50;

export interface EpisodeProgress {
  /** Index of the episode everyone is on. */
  current: number;
  /** Episodes in the séance. */
  count: number;
  /** The current episode was watched to its end. */
  finished: boolean;
  /** Server time at which the next episode starts by itself; null when no countdown runs. */
  countdownUntil: number | null;
  /** « Pas ce soir »: no countdown until the current episode changes or is watched again. */
  declined: boolean;
}

export function startProgress(current: number, count: number): EpisodeProgress {
  return { current, count, finished: false, countdownUntil: null, declined: false };
}

export function hasNextEpisode(progress: EpisodeProgress): boolean {
  return progress.current + 1 < progress.count;
}

/** Someone reached the end of `episode`: if another one follows, its countdown starts. */
export function episodeEnded(progress: EpisodeProgress, episode: number, now: number): EpisodeProgress {
  if (episode !== progress.current || progress.finished) return progress;
  const countdown = hasNextEpisode(progress) && !progress.declined;
  return { ...progress, finished: true, countdownUntil: countdown ? now + NEXT_EPISODE_COUNTDOWN_MS : null };
}

/**
 * Whether asking to go from episode `from` to episode `to` (the next one, a
 * later one, or one already watched) should move everyone there. `from` is
 * named so that a late or repeated ask (two devices reaching the end of the
 * countdown together) moves the séance only once.
 */
export function canGoToEpisode(progress: EpisodeProgress, from: number, to: number): boolean {
  return from === progress.current && to !== from && Number.isInteger(to) && to >= 0 && to < progress.count;
}

/** Everyone on episode `to`, from its start. */
export function goToEpisode(progress: EpisodeProgress, to: number): EpisodeProgress {
  return startProgress(to, progress.count);
}

/** « Pas ce soir »: the countdown stops for everyone, the next episode waits. */
export function declineNextEpisode(progress: EpisodeProgress): EpisodeProgress {
  return { ...progress, countdownUntil: null, declined: true };
}

/** Going back into the episode (« Revoir », a seek): it is no longer over. */
export function episodeResumed(progress: EpisodeProgress): EpisodeProgress {
  if (!progress.finished && !progress.declined) return progress;
  return { ...progress, finished: false, countdownUntil: null, declined: false };
}

export function episodeAdded(progress: EpisodeProgress): EpisodeProgress {
  return { ...progress, count: progress.count + 1 };
}

/** Only an episode still to come can leave the queue: the one on screen and those watched stay. */
export function canRemoveEpisode(progress: EpisodeProgress, episode: number): boolean {
  return Number.isInteger(episode) && episode > progress.current && episode < progress.count;
}

export function episodeRemoved(progress: EpisodeProgress): EpisodeProgress {
  const next = { ...progress, count: progress.count - 1 };
  return hasNextEpisode(next) ? next : { ...next, countdownUntil: null };
}

/**
 * Everyone left. An episode watched to its end gives way to the next one, so
 * that the séance reopens on it (« Pas ce soir » keeps it for next time).
 */
export function everyoneLeft(progress: EpisodeProgress): EpisodeProgress {
  if (progress.finished && hasNextEpisode(progress)) return goToEpisode(progress, progress.current + 1);
  return { ...progress, countdownUntil: null };
}

/**
 * The label suggested for the episode after `previous`: its last number plus
 * one (« S2 · É5 » → « S2 · É6 »), or « Épisode n » when there is no number.
 */
export function nextEpisodeLabel(previous: string | undefined, nextIndex: number): string {
  const numbers = previous ? [...previous.matchAll(/\d+/g)] : [];
  const last = numbers.at(-1);
  if (!previous || last?.index === undefined) return `Épisode ${nextIndex + 1}`;
  const next = String(Number(last[0]) + 1).padStart(last[0].length, "0");
  return previous.slice(0, last.index) + next + previous.slice(last.index + last[0].length);
}

/** « The Bear · S2 · É5 »: the séance's name, then the episode's when it has one. */
export function episodeTitle(title: string, label: string | undefined): string {
  return label ? `${title} · ${label}` : title;
}
