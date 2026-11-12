/*
 * « Pour vous ce soir »: what a group could watch together, from each person's
 * tastes. Pure: the server gathers the titles (TMDB) and the signals (avis,
 * wishes, séances finished), these functions do the reckoning.
 *
 * 1. Each person's taste is a profile: the genres, decades and languages of
 *    what they loved (much), liked, wanted or finished (a little), minus those
 *    of what they found bof or did not like.
 * 2. Candidates come from what the group liked (TMDB's recommendations from
 *    those titles: its « seeds ») and from the group's list.
 * 3. Each candidate gets a match per person: how close it is to their profile,
 *    how well it is rated, how many of the group's favourites lead to it, and a
 *    lift when they said « J'en ai envie ».
 * 4. The group's score spares the least keen: part average, part minimum.
 * 5. The final pick is varied (maximal marginal relevance): not ten thrillers.
 */

/** A title as the engine sees it: a key and what it is made of. */
export interface TasteTitle {
  /** « movie:157336 » (TMDB's numbers). */
  key: string;
  /** TMDB genre ids. */
  genres: readonly number[];
  /** Original language (« fr », « en »…). */
  language?: string;
  year?: number;
  voteAverage?: number;
  voteCount?: number;
}

export type TasteSignal = "loved" | "liked" | "watched" | "wants" | "meh" | "disliked";

/** How much each signal says of a person's taste; negative ones push away. */
export const SIGNAL_WEIGHTS: Record<TasteSignal, number> = {
  loved: 3,
  liked: 1.5,
  wants: 1,
  watched: 0.5,
  meh: -0.5,
  disliked: -3,
};

/** How much each kind of feature counts: the genre says the most. */
const FEATURE_WEIGHTS = { genre: 1, decade: 0.35, language: 0.35 } as const;

export type Profile = ReadonlyMap<string, number>;

/** The features a title is made of, each with its weight: « g:53 », « d:2010 », « l:en ». */
export function featuresOf(title: TasteTitle): Map<string, number> {
  const features = new Map<string, number>();
  for (const genre of title.genres) features.set(`g:${genre}`, FEATURE_WEIGHTS.genre);
  if (title.year !== undefined) features.set(`d:${Math.floor(title.year / 10) * 10}`, FEATURE_WEIGHTS.decade);
  if (title.language) features.set(`l:${title.language}`, FEATURE_WEIGHTS.language);
  return features;
}

function normalized(vector: Map<string, number>): Map<string, number> {
  const length = Math.hypot(...vector.values());
  if (length === 0) return vector;
  return new Map([...vector].map(([feature, value]) => [feature, value / length]));
}

/** A person's taste, from what they said of titles: a direction in the space of features. */
export function tasteProfile(signals: readonly { title: TasteTitle; signal: TasteSignal }[]): Profile {
  const profile = new Map<string, number>();
  for (const { title, signal } of signals) {
    for (const [feature, weight] of featuresOf(title))
      profile.set(feature, (profile.get(feature) ?? 0) + weight * SIGNAL_WEIGHTS[signal]);
  }
  return normalized(profile);
}

/** How close a title is to a taste, from -1 (all it dislikes) to 1 (all it loves); 0 for an empty taste. */
export function affinity(profile: Profile, title: TasteTitle): number {
  let dot = 0;
  for (const [feature, value] of normalized(featuresOf(title))) dot += value * (profile.get(feature) ?? 0);
  return Math.max(-1, Math.min(1, dot));
}

/** Votes a title needs before its own average outweighs the usual one. */
const VOTES_FOR_TRUST = 200;
/** The average a title gets with no votes yet. */
const USUAL_AVERAGE = 6.5;

/** How well rated, 0 to 1: TMDB's average, pulled to the usual one while it has few votes. */
export function quality(title: Pick<TasteTitle, "voteAverage" | "voteCount">): number {
  const votes = title.voteCount ?? 0;
  const average = title.voteAverage ?? USUAL_AVERAGE;
  return (votes * average + VOTES_FOR_TRUST * USUAL_AVERAGE) / (votes + VOTES_FOR_TRUST) / 10;
}

export interface TastePerson {
  accountId: string;
  profile: Profile;
}

export interface TasteCandidate {
  title: TasteTitle;
  /** Keys of the group's titles TMDB recommends it from. */
  seeds: readonly string[];
  /** Who said « J'en ai envie » of it (when it is in the group's list). */
  wantedBy: readonly string[];
}

export interface RankedTitle {
  key: string;
  /** Each person's match, 0 to 100. */
  matches: { accountId: string; match: number }[];
  score: number;
  seeds: readonly string[];
  /** Genres the title has and every person's taste leans to. */
  sharedGenres: number[];
}

const MATCH_WEIGHTS = { affinity: 0.6, quality: 0.25, support: 0.15 } as const;
/** « J'en ai envie » lifts that person's match by this much (the rest of the way, at most). */
const WANT_LIFT = 0.3;
/** Seeds after which more of them add nothing. */
const SEEDS_FOR_FULL_SUPPORT = 3;

function personMatch(person: TastePerson, candidate: TasteCandidate): number {
  const support = Math.min(1, candidate.seeds.length / SEEDS_FOR_FULL_SUPPORT);
  const close = (affinity(person.profile, candidate.title) + 1) / 2;
  const base =
    MATCH_WEIGHTS.affinity * close + MATCH_WEIGHTS.quality * quality(candidate.title) + MATCH_WEIGHTS.support * support;
  return candidate.wantedBy.includes(person.accountId) ? base + (1 - base) * WANT_LIFT : base;
}

/** The group's score: mostly the average, but the least keen weighs too, so nobody is left out. */
export function groupScore(matches: readonly number[]): number {
  if (matches.length === 0) return 0;
  const mean = matches.reduce((sum, match) => sum + match, 0) / matches.length;
  return 0.6 * mean + 0.4 * Math.min(...matches);
}

function sharedGenres(people: readonly TastePerson[], title: TasteTitle): number[] {
  return title.genres.filter((genre) => people.every((person) => (person.profile.get(`g:${genre}`) ?? 0) > 0));
}

/** How alike two titles are, 0 to 1 (their features' cosine). */
export function similarity(a: TasteTitle, b: TasteTitle): number {
  const left = normalized(featuresOf(a));
  let dot = 0;
  for (const [feature, value] of normalized(featuresOf(b))) dot += value * (left.get(feature) ?? 0);
  return dot;
}

/** Relevance against variety in the final pick: 1 would ignore variety. */
const RELEVANCE = 0.75;

/** Picks `limit` of the ranked titles, each time the best one not too like those already picked. */
function diversify(ranked: (RankedTitle & { title: TasteTitle })[], limit: number): RankedTitle[] {
  const left = [...ranked];
  const picked: (RankedTitle & { title: TasteTitle })[] = [];
  while (picked.length < limit && left.length > 0) {
    let best = 0;
    let bestValue = -Infinity;
    left.forEach((candidate, index) => {
      const closest = Math.max(0, ...picked.map((chosen) => similarity(chosen.title, candidate.title)));
      const value = RELEVANCE * candidate.score - (1 - RELEVANCE) * closest;
      if (value > bestValue) [best, bestValue] = [index, value];
    });
    const [chosen] = left.splice(best, 1);
    if (chosen) picked.push(chosen);
  }
  return picked.map(({ title: _title, ...rest }) => rest);
}

/**
 * What the group could watch tonight, best first and varied: every candidate not
 * excluded (seen by someone, or disliked) gets each person's match, then the
 * group's score.
 */
export function rankForGroup(
  people: readonly TastePerson[],
  candidates: readonly TasteCandidate[],
  excluded: ReadonlySet<string>,
  limit: number,
): RankedTitle[] {
  if (people.length === 0) return [];
  const ranked = candidates
    .filter((candidate) => !excluded.has(candidate.title.key))
    .map((candidate) => {
      const matches = people.map((person) => ({
        accountId: person.accountId,
        match: personMatch(person, candidate),
      }));
      return {
        key: candidate.title.key,
        title: candidate.title,
        matches: matches.map(({ accountId, match }) => ({ accountId, match: Math.round(match * 100) })),
        score: groupScore(matches.map(({ match }) => match)),
        seeds: candidate.seeds,
        sharedGenres: sharedGenres(people, candidate.title),
      };
    })
    .sort((a, b) => b.score - a.score);
  return diversify(ranked, limit);
}

/** Merges candidates met several times (from several seeds, or in the list too). */
export function mergeCandidates(candidates: readonly TasteCandidate[]): TasteCandidate[] {
  const byKey = new Map<string, TasteCandidate>();
  for (const candidate of candidates) {
    const known = byKey.get(candidate.title.key);
    byKey.set(
      candidate.title.key,
      known
        ? {
            title: known.title,
            seeds: [...new Set([...known.seeds, ...candidate.seeds])],
            wantedBy: [...new Set([...known.wantedBy, ...candidate.wantedBy])],
          }
        : candidate,
    );
  }
  return [...byKey.values()];
}
