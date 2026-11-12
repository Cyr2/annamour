import type { CatalogTitle, Participant, Rating, TitleRating } from "@annamour/protocol";
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

/**
 * Gives, changes or (with null) takes back my avis at once, and puts the
 * previous one back if the server refuses (throwing the message to show).
 */
export async function setMyRating(me: Participant, title: CatalogTitle, rating: Rating | null): Promise<void> {
  const before = useRatings.getState().ratings;
  const others = before.filter((existing) => !isMine(existing, me.accountId, title));
  const mine = rating ? [{ by: me, title, rating, ratedAt: Date.now() }] : [];
  useRatings.setState({ ratings: [...mine, ...others] });
  try {
    await (rating ? api.rateTitle(title, rating) : api.unrateTitle(title));
  } catch (error) {
    useRatings.setState({ ratings: before });
    throw new Error(errorMessage(error));
  }
}
