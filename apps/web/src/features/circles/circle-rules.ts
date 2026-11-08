import {
  type Circle,
  type Participant,
  type SessionSummary,
  sortWatchlist,
  splitWatchlist,
  type WatchlistItem,
} from "@annamour/protocol";
import { joinNames, plural } from "../../lib/format.ts";
import { latestUnfinished, relativeDay } from "../sessions/session-rules.ts";

/* What « Ce soir » and « Notre liste » show for a circle (null: all of them). */

type Entry = { circleId?: string } & ({ participants: Participant[] } | { sharedWith: Participant[] });

const peopleOf = (entry: Entry) => ("participants" in entry ? entry.participants : entry.sharedWith);

/**
 * Whether a séance or title belongs to a circle. One made before circles
 * existed has none: it goes with any circle holding someone it was shared or
 * watched with, and a séance watched alone with every circle, so nothing
 * vanishes from a list the day circles arrive.
 */
function belongsTo(entry: Entry, circle: Circle, me: string): boolean {
  if (entry.circleId) return entry.circleId === circle.id;
  const others = peopleOf(entry).filter((person) => person.accountId !== me);
  return others.length === 0 || others.some((person) => circle.members.some((m) => m.accountId === person.accountId));
}

/** The séances or titles of one circle; everything for « Tout » (null). */
export function ofCircle<T extends Entry>(list: readonly T[], circle: Circle | null, me: string): T[] {
  return circle === null ? [...list] : list.filter((entry) => belongsTo(entry, circle, me));
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

/** Watched together within this long, a circle's thread is drawn taut; after, it sags. */
const CLOSE_MS = 14 * 24 * 60 * 60 * 1000;

export function isCloseCircle(circle: Pick<Circle, "lastUsedAt">, now: number): boolean {
  return circle.lastUsedAt !== undefined && now - circle.lastUsedAt <= CLOSE_MS;
}

/** « Les potes du jeudi », or just the others' first names (« Léo et Inès ») where a chip has little room. */
export function circleShortName(circle: Pick<Circle, "name" | "members">, me: string): string {
  return circle.name ?? joinNames(circle.members.filter((p) => p.accountId !== me).map((p) => p.name));
}

/** « 12 soirées · la dernière hier », « 1 soirée · la dernière il y a 2 semaines », or just the count. */
export function eveningsLine(circle: Pick<Circle, "evenings" | "lastUsedAt">, now: number): string {
  const count = plural(circle.evenings, "soirée");
  if (circle.lastUsedAt === undefined) return count;
  const when = relativeDay(circle.lastUsedAt, now).toLowerCase();
  return `${count} · la dernière ${/^\d/.test(when) ? `il y a ${when}` : when}`;
}
