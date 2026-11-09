import { z } from "zod/mini";
import { Participant } from "./api.ts";
import { CatalogTitle } from "./catalog.ts";

/*
 * The shared watchlist, « Notre liste »: titles someone wants to watch
 * with others. There are no friend lists in Annamour: an item is shared with
 * people its author already watched séances with (or all of them), and
 * everyone it is shared with sees it, can say « J'ai envie », start it or
 * remove it.
 */

/** People an item can be shared with besides its author: a séance holds 8 people at most. */
export const WATCHLIST_SHARE_MAX = 7;

export const WatchlistItem = z.object({
  id: z.string(),
  title: CatalogTitle,
  addedBy: Participant,
  addedAt: z.number(),
  /** Set once watched: the item then sits in « Déjà vus ». */
  watchedAt: z.optional(z.number()),
  /** Watched: a séance reached the end of it (otherwise someone marked it by hand). */
  watchedInSeance: z.optional(z.boolean()),
  /** Watched in a séance: that séance's people (absent when someone marked it « vu » by hand). */
  watchedWith: z.optional(z.array(Participant)),
  /** Watched by hand: who said « C'est vu » (absent for marks older than this field). */
  watchedBy: z.optional(Participant),
  /** Everyone the item is shared with, its author included. */
  sharedWith: z.array(Participant),
  /** Account ids of those who said « J'ai envie ». */
  wantedBy: z.array(z.string()),
  /** The circle it belongs to; absent for a title shared the older way (people or « Tout le monde »). */
  circleId: z.optional(z.string()),
});
export type WatchlistItem = z.infer<typeof WatchlistItem>;

export const WatchlistResponse = z.object({ items: z.array(WatchlistItem) });
export type WatchlistResponse = z.infer<typeof WatchlistResponse>;

export const AddToWatchlistRequest = z.object({
  title: CatalogTitle,
  /** « Tout le monde » (everyone I watched with), or the chosen people. */
  shareWith: z.union([
    z.literal("everyone"),
    z.array(z.string()).check(z.minLength(1), z.maxLength(WATCHLIST_SHARE_MAX)),
  ]),
  /** The author says « J'ai envie » too. */
  want: z.boolean(),
  /** The circle it goes to: everyone in it sees it (then `shareWith` is not used). */
  circleId: z.optional(z.string()),
});
export type AddToWatchlistRequest = z.infer<typeof AddToWatchlistRequest>;

export const AddToWatchlistResponse = z.object({ id: z.string() });
export type AddToWatchlistResponse = z.infer<typeof AddToWatchlistResponse>;
export const WatchlistWantRequest = z.object({ want: z.boolean() });
export const WatchlistWatchedRequest = z.object({ watched: z.boolean() });

export const WATCHLIST_API = {
  list: "/api/me/watchlist",
  item: "/api/me/watchlist/:id",
  want: "/api/me/watchlist/:id/want",
  watched: "/api/me/watchlist/:id/watched",
} as const;

export type WatchlistSort = "wants" | "recent";

/** « Le plus d'envies » (ties: the newest first), or « Ajouté récemment ». */
export function sortWatchlist(items: readonly WatchlistItem[], sort: WatchlistSort): WatchlistItem[] {
  return [...items].sort(
    (a, b) => (sort === "wants" ? b.wantedBy.length - a.wantedBy.length : 0) || b.addedAt - a.addedAt,
  );
}

/** The items shared with `accountId`; all of them for « Tout le monde » (null). */
export function watchlistWith(items: readonly WatchlistItem[], accountId: string | null): readonly WatchlistItem[] {
  if (accountId === null) return items;
  return items.filter((item) => item.sharedWith.some((person) => person.accountId === accountId));
}

/** « À voir » then « Déjà vus » (the most recently watched first). */
export function splitWatchlist(items: readonly WatchlistItem[]): {
  toWatch: WatchlistItem[];
  watched: WatchlistItem[];
} {
  const toWatch: WatchlistItem[] = [];
  const watched: WatchlistItem[] = [];
  for (const item of items) (item.watchedAt === undefined ? toWatch : watched).push(item);
  watched.sort((a, b) => (b.watchedAt ?? 0) - (a.watchedAt ?? 0));
  return { toWatch, watched };
}

/** The same film or series, whoever added it: a title is in a list once. */
export function catalogKey(title: Pick<CatalogTitle, "type" | "id">): string {
  return `${title.type}:${title.id}`;
}
