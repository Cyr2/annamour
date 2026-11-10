import {
  atCredits as videoAtCredits,
  type BubbleColor,
  catalogEpisodeLabel,
  episodeTitle,
  type SeanceSpot,
  type SessionSummary,
  seanceFinished,
} from "@annamour/protocol";
import { formatClock, formatDuration, joinNames } from "../../lib/format.ts";

/* What the sessions history means: finished or not, how far, with whom, and when, in French. */

/** The heart only means something once you have watched together more than once. */
export const FAVORITE_MIN_SESSIONS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"] as const;

const playing = (session: SessionSummary) => session.queue?.[session.episode.index];

/** A séance of films one after the other (not the episodes of a series, nor links). */
const isFilms = (session: SessionSummary) => session.queue?.every((item) => item.type === "movie") ?? false;

/** « The Bear · S2 · É5 »: the séance, and the episode it is on when it has a name; for films, the one playing. */
export function sessionTitle(session: SessionSummary): string {
  const film = playing(session);
  return film?.type === "movie" ? film.title : episodeTitle(session.title, session.episode.label);
}

/** « film 2 sur 3 », « épisode 5 sur 8 », or nothing for a séance of one video. */
export function queuePlace(session: SessionSummary): string {
  const { index, count } = session.episode;
  return count > 1 ? `${isFilms(session) ? "film" : "épisode"} ${index + 1} sur ${count}` : "";
}

/** The home card's kicker: « Reprendre », or « Reprendre · épisode 5 » (« · film 2 ») for a séance of several. */
export function resumeKicker(session: SessionSummary): string {
  if (session.episode.count < 2) return "Reprendre";
  return `Reprendre · ${isFilms(session) ? "film" : "épisode"} ${session.episode.index + 1}`;
}

/** Where the séance stopped, as the protocol's rules read it. */
const spotOf = (session: SessionSummary): SeanceSpot => ({
  position: session.position,
  duration: session.duration,
  index: session.episode.index,
  count: session.episode.count,
});

/** The video playing reached its credits. */
const atCredits = (session: SessionSummary) => videoAtCredits(spotOf(session));

/** Over once its last film or episode is (the same rule as the salon's « Revoir »). */
export function isFinished(session: SessionSummary): boolean {
  return seanceFinished(spotOf(session));
}

/** Between two videos: « Film suivant : Alien », or « Épisode suivant »; empty otherwise. */
function nextLabel(session: SessionSummary): string {
  if (!atCredits(session) || isFinished(session)) return "";
  const next = session.queue?.[session.episode.index + 1];
  return next?.type === "movie" ? `Film suivant : ${next.title}` : "Épisode suivant";
}

/**
 * The posters of a séance's different titles, the one playing in front, to fan them out;
 * empty for one title (a film, or a series however many episodes).
 */
export function fanPosters(session: SessionSummary): (string | undefined)[] {
  const current = playing(session);
  const titles = new Map<string, string | undefined>();
  if (current) titles.set(current.title, current.posterUrl);
  for (const item of session.queue ?? []) if (!titles.has(item.title)) titles.set(item.title, item.posterUrl);
  return titles.size > 1 ? [...titles.values()] : [];
}

/** 0 to 1, or null when the length of the video is unknown. */
export function progressOf(session: SessionSummary): number | null {
  if (!session.duration) return null;
  return Math.min(1, Math.max(0, session.position / session.duration));
}

/** « Arrêtés à 1:12:40 · reste 58 min », « Film suivant : Alien » between two, or « Terminé ». */
export function stopLabel(session: SessionSummary): string {
  if (isFinished(session)) return "Terminé";
  const next = nextLabel(session);
  if (next) return next;
  const stoppedAt = `Arrêtés à ${formatClock(session.position)}`;
  return session.duration === undefined ? stoppedAt : `${stoppedAt} · ${remainingLabel(session)}`;
}

/** « reste 58 min », « Film suivant : Alien » between two videos, or an empty string when the length is unknown. */
export function remainingLabel(session: SessionSummary): string {
  const next = nextLabel(session);
  if (next) return next;
  if (session.duration === undefined) return "";
  return `reste ${formatDuration(Math.max(0, session.duration - session.position))}`;
}

/**
 * The few words beside a card's progress bar, which already shows where it
 * stopped: « reste 58 min », « Terminée », or the stop time when the length is unknown.
 */
export function progressNote(session: SessionSummary): string {
  if (isFinished(session)) return "Terminée";
  return remainingLabel(session) || `Arrêtés à ${formatClock(session.position)}`;
}

/** « Aujourd'hui · avec Anna et Léo »: when, then with whom, on one line. */
export function whenAndWhoLabel(session: SessionSummary, now: number): string {
  return `${relativeDay(session.lastUsedAt, now)} · ${companionsLabel(session)}`;
}

const namesOf = (session: SessionSummary, left: boolean) =>
  session.participants.filter((person) => (person.left ?? false) === left).map((person) => person.name);

/**
 * « avec Anna et Léo », or « Rien que toi pour l'instant » before anyone with an account joined.
 * Who left still shows, said so: « avec Anna, et Léo, qui a quitté la séance ».
 */
export function companionsLabel(session: SessionSummary): string {
  const here = namesOf(session, false);
  const gone = namesOf(session, true);
  if (!here.length && !gone.length) return "Rien que toi pour l'instant";
  if (!gone.length) return `avec ${joinNames(here)}`;
  const left = `${joinNames(gone)}, qui ${gone.length > 1 ? "ont" : "a"} quitté la séance`;
  return here.length ? `avec ${joinNames(here)}, et ${left}` : `avec ${left}`;
}

/** The home card's line: « Il y a 3 jours avec Anna · reste 58 min ». Who left the séance is not waited for. */
export function resumeLine(session: SessionSummary, now: number): string {
  const when = relativeDay(session.lastUsedAt, now);
  const names = namesOf(session, false);
  const withWhom = names.length ? `${when} avec ${joinNames(names)}` : when;
  const remaining = remainingLabel(session);
  return remaining ? `${withWhom} · ${remaining}` : withWhom;
}

export function byMostRecent(sessions: readonly SessionSummary[]): SessionSummary[] {
  return [...sessions].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

/** The session the home screen offers to resume: the latest one not watched to the end. */
export function latestUnfinished(sessions: readonly SessionSummary[]): SessionSummary | null {
  let latest: SessionSummary | null = null;
  for (const session of sessions) {
    if (isFinished(session)) continue;
    if (!latest || session.lastUsedAt > latest.lastUsedAt) latest = session;
  }
  return latest;
}

export function splitByStatus(sessions: readonly SessionSummary[]): {
  ongoing: SessionSummary[];
  finished: SessionSummary[];
} {
  const ongoing: SessionSummary[] = [];
  const finished: SessionSummary[] = [];
  for (const session of sessions) (isFinished(session) ? finished : ongoing).push(session);
  return { ongoing, finished };
}

export function withPerson(sessions: readonly SessionSummary[], accountId: string | null): readonly SessionSummary[] {
  if (accountId === null) return sessions;
  return sessions.filter((session) => session.participants.some((p) => p.accountId === accountId));
}

export interface Person {
  accountId: string;
  name: string;
  color: BubbleColor;
  /** Number of sessions shared with me. */
  sessionCount: number;
  lastSeenAt: number;
}

/**
 * Everyone I watched with, once each, most shared sessions first (then the
 * most recent). Name and colour are taken from the latest session, since
 * people can change them.
 */
export function rankPeople(sessions: readonly SessionSummary[]): Person[] {
  const people = new Map<string, Person>();
  for (const session of sessions) {
    for (const participant of session.participants) {
      const known = people.get(participant.accountId);
      const isNewer = !known || session.lastUsedAt >= known.lastSeenAt;
      people.set(participant.accountId, {
        accountId: participant.accountId,
        name: isNewer ? participant.name : known.name,
        color: isNewer ? participant.color : known.color,
        sessionCount: (known?.sessionCount ?? 0) + 1,
        lastSeenAt: isNewer ? session.lastUsedAt : known.lastSeenAt,
      });
    }
  }
  return [...people.values()].sort((a, b) => b.sessionCount - a.sessionCount || b.lastSeenAt - a.lastSeenAt);
}

/** The person who wears the heart: the first of the ranking, if shared at least twice. */
export function favoriteOf(people: readonly Person[]): string | null {
  const first = people[0];
  return first && first.sessionCount >= FAVORITE_MIN_SESSIONS ? first.accountId : null;
}

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Days since Monday, so « Mardi » always means this week's Tuesday. */
function daysIntoWeek(time: number): number {
  return (new Date(time).getDay() + 6) % 7;
}

function plural(count: number, unit: string): string {
  return `Il y a ${count} ${unit}${count > 1 && !unit.endsWith("s") ? "s" : ""}`;
}

/** « Aujourd'hui », « Hier », « Mardi » (this week), « Il y a 3 jours », « Il y a 2 semaines », « Il y a 3 mois ». */
export function relativeDay(time: number, now: number): string {
  const days = Math.max(0, Math.round((startOfDay(now) - startOfDay(time)) / DAY_MS));
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  if (days <= daysIntoWeek(now)) return WEEKDAYS[new Date(time).getDay()] ?? plural(days, "jour");
  if (days < 7) return plural(days, "jour");
  if (days < 30) return plural(Math.floor(days / 7), "semaine");
  if (days < 365) return plural(Math.floor(days / 30), "mois");
  return plural(Math.floor(days / 365), "an");
}

type TitleRef = { id: number; type: "movie" | "tv" };

const sameTitle = (session: SessionSummary, title: TitleRef) =>
  session.catalog?.id === title.id && session.catalog.type === title.type;

/** Two séances of the same catalog title (never two séances of pasted links). */
export const isSameTitle = (a: SessionSummary, b: SessionSummary) => (a.catalog ? sameTitle(b, a.catalog) : false);

/** The séance still under way for this catalog title (the latest), to go back to rather than start another. */
export function seanceOfTitle(sessions: readonly SessionSummary[], title: TitleRef): SessionSummary | null {
  return latestUnfinished(sessions.filter((session) => sameTitle(session, title)));
}

/** « S1 · É3 avec Inès », « Film 2 sur 3 avec Léo et Inès », « S1 · É3 · rien que toi pour l'instant »: where a séance is, and with whom. */
export function whereAndWho(session: SessionSummary): string {
  const where = isFilms(session) ? queuePlace(session) : (session.episode.label ?? "");
  const who = session.participants.length ? companionsLabel(session) : "· rien que toi pour l'instant";
  const line = `${where} ${who}`.replace(/^ ·? ?/, "");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

type EpisodeRef = { season: number; episode: number };

/** « S2 · É5 » read back into numbers; null for a label typed by hand or none. */
function episodeOfLabel(label: string | undefined): EpisodeRef | null {
  const match = /^S(\d+) · É(\d+)$/.exec(label ?? "");
  return match ? { season: Number(match[1]), episode: Number(match[2]) } : null;
}

const isAfter = (a: EpisodeRef, b: EpisodeRef) =>
  a.season > b.season || (a.season === b.season && a.episode > b.episode);

/**
 * When the episode picked is not the one the séance is on: it is still the
 * same series, so resuming is still offered, and said so. Empty otherwise.
 */
export function chosenEpisodeNote(session: SessionSummary, chosen: { season?: number; episode?: number }): string {
  const current = episodeOfLabel(session.episode.label);
  if (!current || chosen.season === undefined || chosen.episode === undefined) return "";
  const picked = { season: chosen.season, episode: chosen.episode };
  if (picked.season === current.season && picked.episode === current.episode) return "";
  const pickedLabel = catalogEpisodeLabel(picked.season, picked.episode);
  return isAfter(picked, current)
    ? `${pickedLabel} vient après : c'est la même série. Reprenez la séance à ${session.episode.label}, les épisodes suivants s'enchaînent.`
    : `La séance est déjà à ${session.episode.label}, plus loin que ${pickedLabel}.`;
}

/**
 * Each title once, by its most recent séance (give them most recent first):
 * older séances of the same film stay in the history, not on « Ce soir ».
 */
export function onePerTitle(sessions: readonly SessionSummary[]): SessionSummary[] {
  const seen = new Set<string>();
  return sessions.filter((session) => {
    if (!session.catalog) return true;
    const key = `${session.catalog.type}:${session.catalog.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
