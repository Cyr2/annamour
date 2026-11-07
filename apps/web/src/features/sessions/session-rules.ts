import { type BubbleColor, episodeTitle, type SessionSummary } from "@annamour/protocol";
import { formatClock, formatDuration, joinNames } from "../../lib/format.ts";

/* What the sessions history means: finished or not, how far, with whom, and when, in French. */

/** The credits roll: a session stopped in its last minute counts as watched. */
export const FINISHED_MARGIN_SECONDS = 60;
/** The heart only means something once you have watched together more than once. */
export const FAVORITE_MIN_SESSIONS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"] as const;

/** « The Bear · S2 · É5 »: the séance, and the episode it is on when it has a name. */
export function sessionTitle(session: SessionSummary): string {
  return episodeTitle(session.title, session.episode.label);
}

/** The home card's kicker: « Reprendre », or « Reprendre · épisode 5 » for a séance of several episodes. */
export function resumeKicker(session: SessionSummary): string {
  return session.episode.count > 1 ? `Reprendre · épisode ${session.episode.index + 1}` : "Reprendre";
}

export function isFinished(session: SessionSummary): boolean {
  return session.duration !== undefined && session.position >= session.duration - FINISHED_MARGIN_SECONDS;
}

/** 0 to 1, or null when the length of the video is unknown. */
export function progressOf(session: SessionSummary): number | null {
  if (!session.duration) return null;
  return Math.min(1, Math.max(0, session.position / session.duration));
}

/** « Arrêtés à 1:12:40 · reste 58 min », or « Terminé ». */
export function stopLabel(session: SessionSummary): string {
  if (isFinished(session)) return "Terminé";
  const stoppedAt = `Arrêtés à ${formatClock(session.position)}`;
  return session.duration === undefined ? stoppedAt : `${stoppedAt} · ${remainingLabel(session)}`;
}

/** « reste 58 min », or an empty string when the length is unknown. */
export function remainingLabel(session: SessionSummary): string {
  if (session.duration === undefined) return "";
  return `reste ${formatDuration(Math.max(0, session.duration - session.position))}`;
}

/** « avec Anna et Léo », or « Rien que toi pour l'instant » before anyone with an account joined. */
export function companionsLabel(session: SessionSummary): string {
  const names = session.participants.map((participant) => participant.name);
  return names.length ? `avec ${joinNames(names)}` : "Rien que toi pour l'instant";
}

/** The home card's line: « Il y a 3 jours avec Anna · reste 58 min ». */
export function resumeLine(session: SessionSummary, now: number): string {
  const when = relativeDay(session.lastUsedAt, now);
  const names = session.participants.map((participant) => participant.name);
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
