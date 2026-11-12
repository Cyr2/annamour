import { atCredits, type CatalogTitle, myRating, type RoomSnapshot } from "@annamour/protocol";
import { create } from "zustand";
import { titleToRate } from "../player/episode-rules.ts";
import type { WatchedTo } from "../sessions/finish-question.ts";
import { loadRatings, useRatings } from "./ratings.ts";

/*
 * « Ton avis ? » on the screen after leaving a film that was over (or a series
 * after its last queued episode): most people leave during the credits, before
 * the end screen ever shows, so the question comes to them there.
 */

export const useRateQuestion = create<{ title: CatalogTitle | null }>()(() => ({ title: null }));

export function dismissRateQuestion(): void {
  useRateQuestion.setState({ title: null });
}

/** What leaving the salon asks an avis on: the video watched to its credits, when it ends the film or the series. */
export function titleToRateOnLeave(room: RoomSnapshot, { episode, position }: WatchedTo): CatalogTitle | undefined {
  if (episode !== room.current) return undefined;
  const spot = { position, duration: room.media.duration, index: room.current, count: room.episodes.length };
  if (!room.finished && !atCredits(spot)) return undefined;
  const last = room.current + 1 >= room.episodes.length;
  return titleToRate(room, last ? "nothing-next" : "next-ready");
}

/** Asks « Ton avis ? » on this title, unless I already gave one. */
export async function askRatingIfNone(title: CatalogTitle, me: string): Promise<void> {
  await loadRatings();
  if (myRating(useRatings.getState().ratings, title, me) === undefined) useRateQuestion.setState({ title });
}
