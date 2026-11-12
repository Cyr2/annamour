/*
 * « Pour vous ce soir »: what a group could watch together, from each person's
 * tastes. Pure: the server gathers the titles (TMDB) and the signals (avis,
 * wishes, séances finished, « Pas pour nous »), these functions do the reckoning.
 *
 * 1. A title is made of families of features — TMDB keywords (weighted by how
 *    rare they are), genres, director, lead actors, language, decade, film or
 *    series — each family scaled to the same length, then weighted.
 * 2. A person's taste is two profiles (Rocchio): what they loved, liked,
 *    wanted or finished, and apart, what they did not like. The second weighs
 *    less, so one « pas aimé » does not undo a genre they love. Old avis and old
 *    wishes count a little less; with few avis the taste stays cautious.
 * 3. Each candidate gets a match per person: closeness to their taste, how well
 *    rated it is, how strongly the group's favourites lead to it, and a lift when
 *    they want it.
 * 4. A title that suits someone poorly is left out (no one sits through
 *    something for the others); among the rest, disagreement costs.
 * 5. The final pick is varied (maximal marginal relevance), one per saga.
 */

export type TasteKind = "movie" | "tv";

/** A title as the engine sees it: a key and what it is made of (TMDB's numbers). */
export interface TasteTitle {
  /** « movie:157336 ». */
  key: string;
  kind: TasteKind;
  genres: readonly number[];
  keywords?: readonly number[];
  directors?: readonly number[];
  /** Lead actors, in billing order. */
  cast?: readonly number[];
  language?: string;
  year?: number;
  voteAverage?: number;
  voteCount?: number;
  /** The saga it belongs to (TMDB collection). */
  collection?: number;
}

export type TasteSignal = "loved" | "liked" | "wants" | "watched" | "meh" | "disliked" | "dismissed";

/** How much each signal says of a person's taste; negative ones go to the « not for me » profile. */
export const SIGNAL_WEIGHTS: Record<TasteSignal, number> = {
  loved: 3,
  liked: 1.5,
  wants: 1,
  watched: 0.5,
  meh: -0.5,
  disliked: -2,
  dismissed: -0.5,
};

/** Days after which a signal counts half: tastes in film are steady, wishes fade fast. */
const HALF_LIFE_DAYS: Partial<Record<TasteSignal, number>> = {
  loved: 548,
  liked: 548,
  meh: 548,
  disliked: 548,
  wants: 120,
};

const FAMILY_WEIGHTS = { k: 1, g: 0.8, p: 0.6, c: 0.25, l: 0.35, d: 0.2, t: 0.15 } as const;
type Family = keyof typeof FAMILY_WEIGHTS;
const FAMILIES: readonly Family[] = ["k", "g", "p", "c", "l", "d", "t"];
const KEYWORDS_KEPT = 15;
const LEAD_ACTORS = 3;

/** How rare each keyword is among `titles`: a keyword every title has says nothing. */
export function keywordIdf(titles: readonly TasteTitle[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const title of titles)
    for (const keyword of new Set(title.keywords)) counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
  return new Map([...counts].map(([keyword, count]) => [keyword, Math.log((titles.length + 1) / (count + 1)) + 1]));
}

function familyValues(title: TasteTitle, idf: ReadonlyMap<number, number>): Record<Family, [string, number][]> {
  const ones = (values: readonly (number | string)[]) => values.map((value): [string, number] => [String(value), 1]);
  return {
    k: (title.keywords ?? []).slice(0, KEYWORDS_KEPT).map((k) => [String(k), idf.get(k) ?? 1]),
    g: ones(title.genres),
    p: ones(title.directors ?? []),
    c: ones((title.cast ?? []).slice(0, LEAD_ACTORS)),
    l: ones(title.language ? [title.language] : []),
    d: ones(title.year !== undefined ? [Math.floor(title.year / 10) * 10] : []),
    t: ones([title.kind]),
  };
}

/** What a title is made of: « k:9748 », « g:53 », « p:7467 »…, each family scaled then weighted. */
export function featuresOf(title: TasteTitle, idf: ReadonlyMap<number, number> = new Map()): Map<string, number> {
  const features = new Map<string, number>();
  const families = familyValues(title, idf);
  for (const family of FAMILIES) {
    const values = families[family];
    const length = Math.hypot(...values.map(([, value]) => value));
    if (length === 0) continue;
    for (const [id, value] of values) features.set(`${family}:${id}`, (value / length) * FAMILY_WEIGHTS[family]);
  }
  return features;
}

function normalized(vector: ReadonlyMap<string, number>): Map<string, number> {
  const length = Math.hypot(...vector.values());
  if (length === 0) return new Map(vector);
  return new Map([...vector].map(([feature, value]) => [feature, value / length]));
}

function cosine(profile: ReadonlyMap<string, number>, features: ReadonlyMap<string, number>): number {
  let dot = 0;
  for (const [feature, value] of normalized(features)) dot += value * (profile.get(feature) ?? 0);
  return dot;
}

export interface Profile {
  positive: ReadonlyMap<string, number>;
  negative: ReadonlyMap<string, number>;
  /** How many signals it is made of: a taste read from few stays cautious. */
  signals: number;
}

export interface SignalOn {
  title: TasteTitle;
  signal: TasteSignal;
  /** How long ago it was given, in days (no fading when unknown). */
  ageDays?: number;
}

const fading = (signal: TasteSignal, ageDays: number | undefined) => {
  const halfLife = HALF_LIFE_DAYS[signal];
  return halfLife === undefined || ageDays === undefined ? 1 : 0.5 ** (Math.max(0, ageDays) / halfLife);
};

/** A person's taste: what draws them, and apart, what puts them off. */
export function tasteProfile(signals: readonly SignalOn[], idf: ReadonlyMap<number, number> = new Map()): Profile {
  const positive = new Map<string, number>();
  const negative = new Map<string, number>();
  for (const { title, signal, ageDays } of signals) {
    const weight = SIGNAL_WEIGHTS[signal] * fading(signal, ageDays);
    const target = weight > 0 ? positive : negative;
    for (const [feature, value] of featuresOf(title, idf))
      target.set(feature, (target.get(feature) ?? 0) + Math.abs(weight) * value);
  }
  return { positive: normalized(positive), negative: normalized(negative), signals: signals.length };
}

/** How far « not for me » pulls a title down against what draws them. */
const NEGATIVE_PULL = 0.4;
/** Signals at which a taste is trusted halfway; before, it leans to « neither ». */
const SIGNALS_FOR_TRUST = 8;

/** How close a title is to a taste, 0 to 1; 0.5 for a taste with nothing said yet. */
export function affinity(profile: Profile, title: TasteTitle, idf: ReadonlyMap<number, number> = new Map()): number {
  const features = featuresOf(title, idf);
  const raw = cosine(profile.positive, features) - NEGATIVE_PULL * cosine(profile.negative, features);
  const close = Math.max(0, Math.min(1, raw));
  const trust = profile.signals / (profile.signals + SIGNALS_FOR_TRUST);
  return trust * close + (1 - trust) * 0.5;
}

/** Votes a title needs before its own average outweighs the usual one: series get fewer votes. */
const VOTES_FOR_TRUST: Record<TasteKind, number> = { movie: 300, tv: 80 };
export const USUAL_AVERAGE = 6.5;

/** How well rated, 0 to 1: TMDB's average, pulled to the usual one while it has few votes. */
export function quality(title: TasteTitle, usualAverage = USUAL_AVERAGE): number {
  const votes = title.voteCount ?? 0;
  const average = title.voteAverage ?? usualAverage;
  const trust = VOTES_FOR_TRUST[title.kind];
  return (votes * average + trust * usualAverage) / (votes + trust) / 10;
}

export interface TastePerson {
  accountId: string;
  profile: Profile;
}

export interface Seed {
  /** The group's title TMDB recommends it from. */
  key: string;
  /** How much the group loves that title. */
  weight: number;
}

export interface TasteCandidate {
  title: TasteTitle;
  seeds: readonly Seed[];
  /** Who said « J'en ai envie » of it (when it is in the group's list). */
  wantedBy: readonly string[];
}

export interface RankedTitle {
  key: string;
  score: number;
  /** Each person's match, 0 to 1 (kept for the « Pile pour vous » badge, not shown as numbers). */
  matches: { accountId: string; match: number }[];
  /** The seeds it comes from, the strongest first. */
  seeds: string[];
  /** Everyone's match is high. */
  perfect: boolean;
  /** The feature (« p:7467 », « g:53 ») that draws the group most, to say why. */
  strongest?: string;
}

const MATCH_WEIGHTS = { affinity: 0.6, quality: 0.2, support: 0.2 } as const;
/** « J'en ai envie » lifts that person's match by this much of the rest of the way. */
const WANT_LIFT = 0.3;
/** A match below this for anyone leaves the title out. */
export const VETO = 0.3;
const PERFECT = 0.75;
const DISAGREEMENT_COST = 0.5;

export interface RankOptions {
  idf?: ReadonlyMap<number, number>;
  /** The candidates' usual TMDB average. */
  usualAverage?: number;
}

function personMatch(person: TastePerson, candidate: TasteCandidate, options: RankOptions): number {
  const support = 1 - Math.exp(-candidate.seeds.reduce((sum, seed) => sum + seed.weight, 0) / 2);
  const base =
    MATCH_WEIGHTS.affinity * affinity(person.profile, candidate.title, options.idf) +
    MATCH_WEIGHTS.quality * quality(candidate.title, options.usualAverage) +
    MATCH_WEIGHTS.support * support;
  return candidate.wantedBy.includes(person.accountId) ? base + (1 - base) * WANT_LIFT : base;
}

/** The group's score, or null when it suits someone too poorly: the average, minus their disagreement. */
export function groupScore(matches: readonly number[]): number | null {
  if (matches.length === 0 || Math.min(...matches) < VETO) return null;
  const mean = matches.reduce((sum, match) => sum + match, 0) / matches.length;
  return mean - DISAGREEMENT_COST * (Math.max(...matches) - Math.min(...matches));
}

/** The director or genre that draws the whole group most to this title. */
function strongestOf(people: readonly TastePerson[], title: TasteTitle, idf?: ReadonlyMap<number, number>) {
  let best: string | undefined;
  let bestValue = 0;
  for (const [feature, value] of featuresOf(title, idf)) {
    if (!feature.startsWith("p:") && !feature.startsWith("g:")) continue;
    const draw = Math.min(...people.map((person) => person.profile.positive.get(feature) ?? 0)) * value;
    if (draw > bestValue) [best, bestValue] = [feature, draw];
  }
  return best;
}

/** How alike two titles are, 0 to 1: the same saga counts as the same. */
export function similarity(a: TasteTitle, b: TasteTitle): number {
  if (a.collection !== undefined && a.collection === b.collection) return 1;
  const pick = (title: TasteTitle) => new Map([...featuresOf(title)].filter(([feature]) => /^[kgp]:/.test(feature)));
  return cosine(normalized(pick(a)), pick(b));
}

/** Relevance against variety in the final pick: 1 would ignore variety. */
const RELEVANCE = 0.7;

type Scored = RankedTitle & { title: TasteTitle };

/** Picks `limit` titles, each time the best one not too like those already picked, one per saga. */
function diversify(scored: Scored[], limit: number): RankedTitle[] {
  const left = [...scored];
  const picked: Scored[] = [];
  while (picked.length < limit && left.length > 0) {
    let best = -1;
    let bestValue = -Infinity;
    left.forEach((candidate, index) => {
      const saga = candidate.title.collection;
      if (saga !== undefined && picked.some((chosen) => chosen.title.collection === saga)) return;
      const closest = Math.max(0, ...picked.map((chosen) => similarity(chosen.title, candidate.title)));
      const value = RELEVANCE * candidate.score - (1 - RELEVANCE) * closest;
      if (value > bestValue) [best, bestValue] = [index, value];
    });
    if (best < 0) break;
    const [chosen] = left.splice(best, 1);
    if (chosen) picked.push(chosen);
  }
  return picked.map(({ title: _title, ...rest }) => rest);
}

function scoreOne(people: readonly TastePerson[], candidate: TasteCandidate, options: RankOptions): Scored | null {
  const matches = people.map((person) => ({
    accountId: person.accountId,
    match: personMatch(person, candidate, options),
  }));
  const score = groupScore(matches.map(({ match }) => match));
  if (score === null) return null;
  const strongest = strongestOf(people, candidate.title, options.idf);
  return {
    key: candidate.title.key,
    title: candidate.title,
    score,
    matches,
    seeds: [...candidate.seeds].sort((a, b) => b.weight - a.weight).map((seed) => seed.key),
    perfect: matches.every(({ match }) => match > PERFECT),
    ...(strongest ? { strongest } : {}),
  };
}

/**
 * What the group could watch tonight, best first and varied: every candidate
 * not excluded and that suits everyone well enough, scored for the group.
 */
export function rankForGroup(
  people: readonly TastePerson[],
  candidates: readonly TasteCandidate[],
  excluded: ReadonlySet<string>,
  limit: number,
  options: RankOptions = {},
): RankedTitle[] {
  if (people.length === 0) return [];
  const scored = candidates
    .filter((candidate) => !excluded.has(candidate.title.key))
    .flatMap((candidate) => scoreOne(people, candidate, options) ?? [])
    .sort((a, b) => b.score - a.score);
  return diversify(scored, limit);
}

/**
 * A first, cheap sort of many candidates known only roughly (no keywords nor
 * people yet): the ones worth reading in full. No veto here, on so little.
 */
export function preRank(
  people: readonly TastePerson[],
  candidates: readonly TasteCandidate[],
  excluded: ReadonlySet<string>,
  limit: number,
): TasteCandidate[] {
  const mean = (candidate: TasteCandidate) =>
    people.reduce((sum, person) => sum + personMatch(person, candidate, {}), 0) / Math.max(1, people.length);
  return candidates
    .filter((candidate) => !excluded.has(candidate.title.key))
    .map((candidate) => ({ candidate, value: mean(candidate) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

/** Merges candidates met several times (from several seeds, or in the list too). */
export function mergeCandidates(candidates: readonly TasteCandidate[]): TasteCandidate[] {
  const byKey = new Map<string, TasteCandidate>();
  for (const candidate of candidates) {
    const known = byKey.get(candidate.title.key);
    if (!known) {
      byKey.set(candidate.title.key, candidate);
      continue;
    }
    const seeds = new Map(known.seeds.map((seed) => [seed.key, seed.weight]));
    for (const seed of candidate.seeds) seeds.set(seed.key, Math.max(seeds.get(seed.key) ?? 0, seed.weight));
    byKey.set(candidate.title.key, {
      title: known.title,
      seeds: [...seeds].map(([key, weight]) => ({ key, weight })),
      wantedBy: [...new Set([...known.wantedBy, ...candidate.wantedBy])],
    });
  }
  return [...byKey.values()];
}
