import {
  type AddToWatchlistRequest,
  AddToWatchlistResponse,
  apiPath,
  WATCHLIST_API,
  type WatchlistItem,
  WatchlistResponse,
} from "@annamour/protocol";
import { z } from "zod/mini";
import { request } from "./http.ts";

/* « Notre liste »: the shared watchlist of the signed-in person. */

/** Writes answer 204: there is nothing to read back. */
const Ignored = z.unknown();
const GONE = { 404: "Ce titre n'est plus dans ta liste." };

export async function fetchWatchlist(): Promise<WatchlistItem[]> {
  const { items } = await request(WatchlistResponse, WATCHLIST_API.list);
  return items;
}

/** Adds a title (or shares the one already there); returns its id. */
export async function addToWatchlist(body: AddToWatchlistRequest): Promise<string> {
  const { id } = await request(AddToWatchlistResponse, WATCHLIST_API.list, { body });
  return id;
}

export async function setWant(id: string, want: boolean): Promise<void> {
  await request(Ignored, apiPath(WATCHLIST_API.want, { id }), { method: "PATCH", body: { want }, messages: GONE });
}

export async function setWatched(id: string, watched: boolean): Promise<void> {
  await request(Ignored, apiPath(WATCHLIST_API.watched, { id }), {
    method: "PATCH",
    body: { watched },
    messages: GONE,
  });
}

export async function removeFromWatchlist(id: string): Promise<void> {
  await request(Ignored, apiPath(WATCHLIST_API.item, { id }), { method: "DELETE", messages: GONE });
}
