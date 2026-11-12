import { z } from "zod/mini";
import { Participant } from "./api.ts";
import { CatalogMediaType, CatalogTitle } from "./catalog.ts";

/*
 * « Ton avis »: once a film or a series is watched, each person says how they
 * found it, and the people they watch with see it. One avis per person and
 * title, changed at will; it also feeds the suggestions of a circle.
 */

export const RATINGS = ["loved", "liked", "meh", "disliked"] as const;
export const Rating = z.enum(RATINGS);
export type Rating = z.infer<typeof Rating>;

/** How each avis reads: its face, its word, and what it says of someone (« Annou a adoré »). */
export const RATING_WORDS: Record<Rating, { emoji: string; label: string; said: string }> = {
  loved: { emoji: "😍", label: "Adoré", said: "a adoré" },
  liked: { emoji: "🙂", label: "Aimé", said: "a aimé" },
  meh: { emoji: "😐", label: "Bof", said: "a trouvé ça bof" },
  disliked: { emoji: "🙅", label: "Pas pour moi", said: "n'a pas aimé" },
};

export const TitleRating = z.object({
  by: Participant,
  title: CatalogTitle,
  rating: Rating,
  ratedAt: z.number(),
});
export type TitleRating = z.infer<typeof TitleRating>;

/** Mine and those of the people I watch with (my circles, my séances). */
export const RatingsResponse = z.object({ ratings: z.array(TitleRating) });
export type RatingsResponse = z.infer<typeof RatingsResponse>;

export const RateRequest = z.object({ title: CatalogTitle, rating: Rating });
export type RateRequest = z.infer<typeof RateRequest>;

/** The title an avis is taken back from: `/api/me/ratings/movie/543`. */
export const RatedTitleParams = z.object({
  type: CatalogMediaType,
  id: z.coerce.number().check(z.int(), z.positive()),
});

export const RATINGS_API = {
  list: "/api/me/ratings",
  item: "/api/me/ratings/:type/:id",
} as const;

const sameTitle = (rating: TitleRating, title: Pick<CatalogTitle, "type" | "id">) =>
  rating.title.type === title.type && rating.title.id === title.id;

/** The avis given on this title, mine first, then the most recent. */
export function ratingsOf(
  ratings: readonly TitleRating[],
  title: Pick<CatalogTitle, "type" | "id">,
  me: string,
): TitleRating[] {
  return ratings
    .filter((rating) => sameTitle(rating, title))
    .sort((a, b) => Number(b.by.accountId === me) - Number(a.by.accountId === me) || b.ratedAt - a.ratedAt);
}

/** My avis on this title, if I gave one. */
export function myRating(
  ratings: readonly TitleRating[],
  title: Pick<CatalogTitle, "type" | "id">,
  me: string,
): Rating | undefined {
  return ratings.find((rating) => rating.by.accountId === me && sameTitle(rating, title))?.rating;
}
