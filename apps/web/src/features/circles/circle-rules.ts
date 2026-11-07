import {
  type Circle,
  type Participant,
  type SessionSummary,
  sortWatchlist,
  splitWatchlist,
  type WatchlistItem,
} from "@annamour/protocol";
import { latestUnfinished } from "../sessions/session-rules.ts";

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

/** Which part of « Notre liste » is shown. */
export type ListState = "to-watch" | "ongoing" | "watched";
