import {
  type Circle,
  type Participant,
  type SessionSummary,
  sortWatchlist,
  splitWatchlist,
  type WatchlistItem,
} from "@annamour/protocol";
import { joinNames } from "../../lib/format.ts";
import { latestUnfinished, seanceOfTitle } from "../sessions/session-rules.ts";

/* What « Ce soir » and « Notre liste » show for a circle (null: all of them). */

type Entry = { circleId?: string } & ({ participants: Participant[] } | { sharedWith: Participant[] });

const peopleOf = (entry: Entry) => ("participants" in entry ? entry.participants : entry.sharedWith);

/**
 * Whether a séance or title belongs to a circle. One made before circles
 * existed has none: it goes with any circle holding someone it was shared or
 * watched with, so nothing vanishes from a list the day circles arrive. A title
 * kept for myself alone follows every circle; a séance watched alone has no
 * circle on purpose (the server gives one as soon as someone joins), so it
 * shows on « Tout » only.
 */
function belongsTo(entry: Entry, circle: Circle, me: string): boolean {
  if (entry.circleId) return entry.circleId === circle.id;
  const others = peopleOf(entry).filter((person) => person.accountId !== me);
  if (others.length === 0) return !("participants" in entry);
  return others.some((person) => circle.members.some((m) => m.accountId === person.accountId));
}

/** The séances or titles of one circle; everything for « Tout » (null). */
export function ofCircle<T extends Entry>(list: readonly T[], circle: Circle | null, me: string): T[] {
  return circle === null ? [...list] : list.filter((entry) => belongsTo(entry, circle, me));
}

/**
 * The séances a new one for `circleId` would sit beside: that circle's, or for
 * « Quelqu'un d'autre » (null) those of no circle. A circle not loaded yet
 * is matched by its id alone.
 */
export function seancesFor(
  sessions: readonly SessionSummary[],
  circleId: string | null,
  circles: readonly Circle[],
  me: string,
): SessionSummary[] {
  if (circleId === null) return sessions.filter((session) => !session.circleId);
  const circle = circles.find((c) => c.id === circleId);
  return circle ? ofCircle(sessions, circle, me) : sessions.filter((session) => session.circleId === circleId);
}

interface Target {
  circleId: string | null;
  sessions: readonly SessionSummary[];
  circles: readonly Circle[];
  me: string;
}

/** The séance under way for this title in the circle aimed at, to reopen rather than start a second one. */
export function seanceToResume(title: { id: number; type: "movie" | "tv" }, target: Target): SessionSummary | null {
  return seanceOfTitle(seancesFor(target.sessions, target.circleId, target.circles, target.me), title);
}

/** « N séances » of a circle on « Nous »: the very ones « Séances » lists for it, once my séances are loaded. */
export function seanceCount(circle: Circle, sessions: readonly SessionSummary[] | null, me: string): number {
  return sessions === null ? circle.evenings : ofCircle(sessions, circle, me).length;
}

export type TonightPick =
  | { kind: "resume"; session: SessionSummary }
  | { kind: "title"; item: WatchlistItem }
  | { kind: "nothing" };

/**
 * The one thing « On regarde ? » offers: the séance left unfinished most
 * recently in this circle, else the title of its list most wanted.
 */
export function tonightPick(
  sessions: readonly SessionSummary[],
  items: readonly WatchlistItem[],
  circle: Circle | null,
  me: string,
): TonightPick {
  const session = latestUnfinished(ofCircle(sessions, circle, me));
  if (session) return { kind: "resume", session };
  const [item] = sortWatchlist(splitWatchlist(ofCircle(items, circle, me)).toWatch, "wants");
  return item ? { kind: "title", item } : { kind: "nothing" };
}

/** Watched together within the week, a circle's thread is drawn taut on « Nous »; after, it sags. */
const CLOSE_MS = 7 * 24 * 60 * 60 * 1000;

export function isCloseCircle(circle: Pick<Circle, "lastUsedAt">, now: number): boolean {
  return circle.lastUsedAt !== undefined && now - circle.lastUsedAt <= CLOSE_MS;
}

/** « Les potes du jeudi », or just the others' first names (« Léo et Inès ») where a chip has little room. */
export function circleShortName(circle: Pick<Circle, "name" | "members">, me: string): string {
  return circle.name ?? joinNames(circle.members.filter((p) => p.accountId !== me).map((p) => p.name));
}

/** The ids with one moved a step up (-1) or down (+1), for « Monter » and « Descendre »; unchanged at the ends. */
export function moveId(ids: readonly string[], id: string, delta: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}
