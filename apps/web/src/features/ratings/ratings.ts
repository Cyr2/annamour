import { type CatalogTitle, catalogKey, type Participant, type Rating, type TitleRating } from "@annamour/protocol";
import { create } from "zustand";
import { errorMessage } from "../../api/http.ts";
import * as api from "../../api/ratings.ts";

/*
 * « Ton avis »: mine and those of the people I watch with (GET /api/me/ratings),
 * shared by a title's sheet, the end of a film and the suggestions.
 */

export interface RatingsState {
  status: "idle" | "loading" | "ready" | "error";
  ratings: TitleRating[];
}

export const useRatings = create<RatingsState>()(() => ({ status: "idle", ratings: [] }));

let inFlight: Promise<void> | null = null;

/** Loads (or refreshes) the avis; concurrent calls share one request. */
export function loadRatings(): Promise<void> {
  inFlight ??= (async () => {
    if (useRatings.getState().status !== "ready") useRatings.setState({ status: "loading" });
    try {
      useRatings.setState({ status: "ready", ratings: await api.fetchRatings() });
    } catch {
      // The avis stay out of sight rather than in the way: the rest of the screen still works.
      if (useRatings.getState().status !== "ready") useRatings.setState({ status: "error" });
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

const isMine = (rating: TitleRating, me: string, title: Pick<CatalogTitle, "type" | "id">) =>
  rating.by.accountId === me && rating.title.type === title.type && rating.title.id === title.id;

/** The last change asked per title: an older answer arriving late must not undo a newer choice. */
const latest = new Map<string, number>();
let changes = 0;

/**
 * Gives, changes or (with null) takes back my avis at once, and puts the
 * previous one back if the server refuses (throwing the message to show).
 */
export async function setMyRating(me: Participant, title: CatalogTitle, rating: Rating | null): Promise<void> {
  const key = catalogKey(title);
  const change = ++changes;
  latest.set(key, change);
  const before = useRatings.getState().ratings.find((existing) => isMine(existing, me.accountId, title));
  const mineNow = (mine: TitleRating | undefined) => {
    const others = useRatings.getState().ratings.filter((existing) => !isMine(existing, me.accountId, title));
    useRatings.setState({ ratings: mine ? [mine, ...others] : others });
  };
  mineNow(rating ? { by: me, title, rating, ratedAt: Date.now() } : undefined);
  try {
    await (rating ? api.rateTitle(title, rating) : api.unrateTitle(title));
  } catch (error) {
    if (latest.get(key) === change) mineNow(before);
    throw new Error(errorMessage(error));
  }
}
