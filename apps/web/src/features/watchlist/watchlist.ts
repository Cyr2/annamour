import type { AddToWatchlistRequest, Participant, WatchlistItem } from "@annamour/protocol";
import { create } from "zustand";
import { errorMessage } from "../../api/http.ts";
import * as api from "../../api/watchlist.ts";

/*
 * « Notre liste » (GET /api/me/watchlist), shared by the tab, the
 * home row and the TV. Votes, « Vu » and removals show at once and are put
 * back if the server refuses.
 */

export type WatchlistStatus = "idle" | "loading" | "ready" | "error";

export interface WatchlistState {
  status: WatchlistStatus;
  items: WatchlistItem[];
  error: string | null;
}

const initialState: WatchlistState = { status: "idle", items: [], error: null };

export const useWatchlist = create<WatchlistState>()(() => initialState);

let inFlight: Promise<void> | null = null;

async function fetchIntoStore(): Promise<void> {
  if (useWatchlist.getState().status !== "ready") useWatchlist.setState({ status: "loading", error: null });
  try {
    useWatchlist.setState({ status: "ready", items: await api.fetchWatchlist(), error: null });
  } catch (error) {
    if (useWatchlist.getState().status !== "ready")
      useWatchlist.setState({ status: "error", error: errorMessage(error) });
  }
}

/** Loads (or refreshes) the list; concurrent calls share one request. */
export function loadWatchlist(): Promise<void> {
  inFlight ??= fetchIntoStore().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function resetWatchlist(): void {
  useWatchlist.setState(initialState);
}

/** Adds a title, then refreshes: the server may have merged it with the one already there. */
export async function addTitle(request: AddToWatchlistRequest): Promise<void> {
  try {
    await api.addToWatchlist(request);
  } catch (error) {
    throw new Error(errorMessage(error));
  }
  await loadWatchlist();
}

/** Applies `change` at once; puts the list back and throws the message to show if `save` fails. */
async function optimistic(change: (items: WatchlistItem[]) => WatchlistItem[], save: () => Promise<void>) {
  const before = useWatchlist.getState().items;
  useWatchlist.setState({ items: change(before) });
  try {
    await save();
  } catch (error) {
    useWatchlist.setState({ items: before });
    throw new Error(errorMessage(error));
  }
}

const updateItem = (id: string, update: (item: WatchlistItem) => WatchlistItem) => (items: WatchlistItem[]) =>
  items.map((item) => (item.id === id ? update(item) : item));

/** « J'ai envie » / « Moi aussi », or taking it back. */
export function toggleWant(id: string, me: string, want: boolean): Promise<void> {
  return optimistic(
    updateItem(id, (item) => ({
      ...item,
      wantedBy: want ? [...new Set([...item.wantedBy, me])] : item.wantedBy.filter((who) => who !== me),
    })),
    () => api.setWant(id, want),
  );
}

/** « C'est vu » (by `by`, so the sheet says who at once) or « Pas encore vu ». */
export function markWatched(id: string, watched: boolean, by?: Participant, now = Date.now()): Promise<void> {
  return optimistic(
    updateItem(id, (item) => {
      const { watchedAt: _at, watchedBy: _by, watchedInSeance: _inSeance, ...rest } = item;
      if (!watched) return rest;
      return by ? { ...rest, watchedAt: now, watchedBy: by } : { ...rest, watchedAt: now };
    }),
    () => api.setWatched(id, watched),
  );
}

/** « Retirer de la liste »: gone for everyone it was shared with. */
export function removeItem(id: string): Promise<void> {
  return optimistic(
    (items) => items.filter((item) => item.id !== id),
    () => api.removeFromWatchlist(id),
  );
}
