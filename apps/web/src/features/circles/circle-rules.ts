import {
  type Circle,
  type Participant,
  type SessionSummary,
  sortWatchlist,
  splitWatchlist,
  twinCircles,
  type WatchlistItem,
} from "@annamour/protocol";
import { joinNames } from "../../lib/format.ts";
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

/** One pair of circles, whichever comes first: what « Garder les deux » remembers. */
export function pairKey(a: string, b: string): string {
  return [a, b].sort().join("+");
}

/** The two circles of the same people « Nous » offers to reunite, unless I chose to keep them apart. */
export function offeredReunion(circles: readonly Circle[], keptApart: readonly string[]): [Circle, Circle] | null {
  return twinCircles(circles).find(([a, b]) => !keptApart.includes(pairKey(a.id, b.id))) ?? null;
}

/** Another circle of exactly the same people, for « Réunir avec… »; null when there is none. */
export function twinOf(circle: Circle, circles: readonly Circle[]): Circle | null {
  const pair = twinCircles(circles).find(([a, b]) => a.id === circle.id || b.id === circle.id);
  if (!pair) return null;
  return pair[0].id === circle.id ? pair[1] : pair[0];
}

/** A reunion is told for two weeks: a device signed in later is not greeted with old news. */
const REUNION_NEWS_MS = 14 * 24 * 60 * 60 * 1000;

/** What marks a reunion as told on this device. */
export const reunionKey = (circle: Pick<Circle, "id" | "reunitedBy">) => `${circle.id}@${circle.reunitedBy?.at ?? 0}`;

/** The circles someone else recently reunited, not told yet on this device (« Darius a réuni vos deux cercles »). */
export function untoldReunions(circles: readonly Circle[], me: string, told: readonly string[], now: number): Circle[] {
  return circles.filter(
    (circle) =>
      circle.reunitedBy !== undefined &&
      circle.reunitedBy.accountId !== me &&
      now - circle.reunitedBy.at <= REUNION_NEWS_MS &&
      !told.includes(reunionKey(circle)),
  );
}
