import { z } from "zod/mini";
import { Participant } from "./api.ts";
import { CatalogTitle } from "./catalog.ts";
import type { Rating, TitleRating } from "./ratings.ts";
import { catalogKey, type WatchlistItem } from "./watchlist.ts";

/** Why a title is suggested, as the shelf says it. */
export const SuggestionWhy = z.union([
  /** « Parce que vous avez adoré Verity »: the group's titles TMDB recommends it from. */
  z.object({ kind: z.literal("because"), titles: z.array(z.string()) }),
  /** « Thriller, vos genres »: genres every taste leans to. */
  z.object({ kind: z.literal("genres"), genres: z.array(z.string()) }),
  /** « Du David Fincher »: a director every taste leans to. */
  z.object({ kind: z.literal("director"), name: z.string() }),
  z.object({ kind: z.literal("wants"), people: z.array(Participant) }),
  z.object({ kind: z.enum(["loved", "liked"]), people: z.array(Participant) }),
  /** « Très bien noté : 8,1 ». */
  z.object({ kind: z.literal("acclaimed"), voteAverage: z.number() }),
]);
export type SuggestionWhy = z.infer<typeof SuggestionWhy>;

export const GroupSuggestion = z.object({
  title: CatalogTitle,
  /** The circle's list item, when the title is in it. */
  itemId: z.optional(z.string()),
  /** Suits everyone's taste well: « Pile pour vous deux ». No numbers per person: they set people apart. */
  perfect: z.boolean(),
  /** Why, the most telling first: a card says the first, its sheet all of them. */
  reasons: z.array(SuggestionWhy),
});
export type GroupSuggestion = z.infer<typeof GroupSuggestion>;

export const SuggestionsResponse = z.object({ suggestions: z.array(GroupSuggestion) });
export type SuggestionsResponse = z.infer<typeof SuggestionsResponse>;

/** « Pas pour nous »: the title leaves the circle's suggestions for a while. */
export const DismissSuggestionRequest = z.object({
  type: z.enum(["movie", "tv"]),
  tmdbId: z.number().check(z.int(), z.positive()),
});
export type DismissSuggestionRequest = z.infer<typeof DismissSuggestionRequest>;

export const SUGGESTIONS_API = {
  circle: "/api/me/circles/:id/suggestions",
  dismiss: "/api/me/circles/:id/suggestions/dismiss",
} as const;

/*
 * « Pour ce soir »: what a circle could watch together, read only from what
 * its people already said: the titles of its list they want, and those some
 * of them loved or liked elsewhere and the others have not seen. Every
 * suggestion carries its reasons, so the screen says why it is there.
 */

/** Suggestions shown at most: a shelf, not a catalogue. */
export const SUGGESTIONS_MAX = 10;

const WEIGHTS = { wants: 2, loved: 3, liked: 1, meh: -1 } as const;

export type SuggestionReason =
  | { kind: "wants"; people: Participant[] }
  | { kind: "loved" | "liked"; people: Participant[] };

export interface Suggestion {
  title: CatalogTitle;
  /** The circle's list item, when the title is in it. */
  itemId?: string;
  reasons: SuggestionReason[];
  score: number;
}

export interface CircleTaste {
  /** The circle's people, me included. */
  members: readonly Participant[];
  /** The circle's list. */
  items: readonly WatchlistItem[];
  /** The avis of its people (others' avis are ignored). */
  ratings: readonly TitleRating[];
  /** Titles (catalogKey) the circle already watched to the end in a séance. */
  watched: ReadonlySet<string>;
}

interface Candidate {
  title: CatalogTitle;
  itemId?: string;
  wants: Participant[];
  ratings: { by: Participant; rating: Rating }[];
}

function candidates({ members, items, ratings }: CircleTaste): Map<string, Candidate> {
  const memberIds = new Set(members.map((member) => member.accountId));
  const byKey = new Map<string, Candidate>();
  const candidateOf = (title: CatalogTitle) => {
    const key = catalogKey(title);
    const known = byKey.get(key) ?? { title, wants: [], ratings: [] };
    byKey.set(key, known);
    return known;
  };
  for (const item of items) {
    if (item.watchedAt !== undefined) continue;
    const candidate = candidateOf(item.title);
    candidate.itemId = item.id;
    candidate.wants = members.filter((member) => item.wantedBy.includes(member.accountId));
  }
  for (const rating of ratings) {
    if (memberIds.has(rating.by.accountId)) candidateOf(rating.title).ratings.push(rating);
  }
  return byKey;
}

/** Already seen by everyone of the circle, together or each on their side: nothing to suggest. */
function seenByAll(candidate: Candidate, members: readonly Participant[]): boolean {
  return members.every((member) => candidate.ratings.some((rating) => rating.by.accountId === member.accountId));
}

function reasonsOf(candidate: Candidate): SuggestionReason[] {
  const ratedAs = (rating: Rating) => candidate.ratings.filter((r) => r.rating === rating).map((r) => r.by);
  const reasons: SuggestionReason[] = [];
  if (candidate.wants.length) reasons.push({ kind: "wants", people: candidate.wants });
  for (const kind of ["loved", "liked"] as const) {
    const people = ratedAs(kind);
    if (people.length) reasons.push({ kind, people });
  }
  return reasons;
}

function scoreOf(candidate: Candidate): number {
  const rated = (rating: Rating) => candidate.ratings.filter((r) => r.rating === rating).length;
  return (
    candidate.wants.length * WEIGHTS.wants +
    rated("loved") * WEIGHTS.loved +
    rated("liked") * WEIGHTS.liked +
    rated("meh") * WEIGHTS.meh
  );
}

/**
 * What the circle could watch tonight, the most wanted and loved first. A title
 * someone of the circle did not like, one everyone already saw, or one the circle
 * watched together is left out.
 */
export function suggestForCircle(taste: CircleTaste): Suggestion[] {
  if (taste.members.length < 2) return [];
  const suggestions: Suggestion[] = [];
  for (const [key, candidate] of candidates(taste)) {
    if (taste.watched.has(key) || seenByAll(candidate, taste.members)) continue;
    if (candidate.ratings.some((rating) => rating.rating === "disliked")) continue;
    const score = scoreOf(candidate);
    if (score <= 0) continue;
    suggestions.push({
      title: candidate.title,
      ...(candidate.itemId ? { itemId: candidate.itemId } : {}),
      reasons: reasonsOf(candidate),
      score,
    });
  }
  return suggestions.sort((a, b) => b.score - a.score).slice(0, SUGGESTIONS_MAX);
}
