import {
  type CatalogMediaType,
  type CatalogTitle,
  catalogKey,
  type Participant,
  type RankedTitle,
  type SignalOn,
  type SuggestionWhy,
  type TastePerson,
  type TasteTitle,
  tasteProfile,
} from "@annamour/protocol";
import type { TmdbBrief, TmdbTitle } from "../catalog/tmdb.ts";
import { TMDB_GENRES } from "../catalog/tmdb-genres.ts";
import type { CircleSignals } from "./taste-signals.ts";

/*
 * The steps of « Pour vous ce soir » between the circle's signals and TMDB's
 * titles: no calls here, only the reckoning around the protocol's rules.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** How strongly the group's love for a title makes it a seed. */
const SEED_STRENGTH: Partial<Record<string, number>> = { loved: 3, liked: 1.5, wants: 1 };
const SEEDS = 10;
/** Explicit avis under which a circle is « just starting »: the best rated and the trending help. */
export const FEW_AVIS = 5;

export const keyOf = (type: CatalogMediaType, tmdbId: number) => `${type}:${tmdbId}`;

/** A TMDB title as the engine sees it; a brief (from a list) has no keywords nor people yet. */
export function tasteOf(title: TmdbBrief | TmdbTitle): TasteTitle {
  const full = "keywordIds" in title ? title : undefined;
  return {
    key: keyOf(title.type, title.tmdbId),
    kind: title.type,
    genres: title.genreIds,
    ...(full ? { keywords: full.keywordIds, directors: full.directorIds, cast: full.castIds } : {}),
    ...(full?.collectionId !== undefined ? { collection: full.collectionId } : {}),
    ...(title.language ? { language: title.language } : {}),
    ...(title.year !== undefined ? { year: title.year } : {}),
    ...(title.voteAverage !== undefined ? { voteAverage: title.voteAverage } : {}),
    ...(title.voteCount !== undefined ? { voteCount: title.voteCount } : {}),
  };
}

/** TMDB's key of a title the circle spoke of, once resolved. */
export function tmdbKeyOf(title: CatalogTitle, resolved: ReadonlyMap<string, TmdbTitle>): string | undefined {
  const found = resolved.get(catalogKey(title));
  return found ? keyOf(found.type, found.tmdbId) : undefined;
}

/** Each person's taste, from their signals on the titles TMDB knows, and their « Pas pour nous ». */
export function peopleOf(
  signals: CircleSignals,
  resolved: ReadonlyMap<string, TmdbTitle>,
  dismissed: readonly { title: TmdbTitle; accountId: string }[],
  idf: ReadonlyMap<number, number>,
  now: number,
): TastePerson[] {
  return signals.members.map((member) => {
    const said: SignalOn[] = signals.signals.flatMap((s) => {
      const found = s.accountId === member.accountId ? resolved.get(catalogKey(s.title)) : undefined;
      if (!found) return [];
      return [{ title: tasteOf(found), signal: s.signal, ...(s.at ? { ageDays: (now - s.at) / DAY_MS } : {}) }];
    });
    const refused = dismissed
      .filter((d) => d.accountId === member.accountId)
      .map((d) => ({ title: tasteOf(d.title), signal: "dismissed" as const }));
    return { accountId: member.accountId, profile: tasteProfile([...said, ...refused], idf) };
  });
}

/** The titles the group loves most, which TMDB's recommendations start from, with how much. */
export function seedsOf(
  signals: CircleSignals,
  resolved: ReadonlyMap<string, TmdbTitle>,
): { title: TmdbTitle; weight: number }[] {
  const strength = new Map<string, number>();
  for (const { title, signal } of signals.signals) {
    const key = catalogKey(title);
    strength.set(key, (strength.get(key) ?? 0) + (SEED_STRENGTH[signal] ?? 0));
  }
  return [...strength]
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, SEEDS)
    .flatMap(([key, weight]) => {
      const title = resolved.get(key);
      return title ? [{ title, weight }] : [];
    });
}

/**
 * Left out: what the circle watched together or has under way, what someone
 * did not like, found bof or dismissed, and what everyone already gave an avis
 * on. A title only some of them saw and liked stays: a fine idea for the others.
 */
export function excludedOf(
  signals: CircleSignals,
  resolved: ReadonlyMap<string, TmdbTitle>,
  dismissedKeys: readonly string[],
): Set<string> {
  const excluded = new Set(dismissedKeys);
  for (const title of signals.started) {
    const key = tmdbKeyOf(title, resolved);
    if (key) excluded.add(key);
  }
  const raters = new Map<string, Set<string>>();
  for (const { accountId, title, signal } of signals.signals) {
    const key = tmdbKeyOf(title, resolved);
    if (!key || signal === "wants") continue;
    if (signal === "watched" || signal === "disliked" || signal === "meh") excluded.add(key);
    else raters.set(key, (raters.get(key) ?? new Set()).add(accountId));
  }
  for (const [key, people] of raters) if (people.size >= signals.members.length) excluded.add(key);
  return excluded;
}

/** The genres and keywords the whole group leans to most, for TMDB's « discover ». */
export function discoverPath(people: readonly TastePerson[], kind: CatalogMediaType): string | null {
  const summed = new Map<string, number>();
  for (const person of people)
    for (const [feature, value] of person.profile.positive) summed.set(feature, (summed.get(feature) ?? 0) + value);
  const top = (prefix: string, count: number) =>
    [...summed]
      .filter(([feature]) => feature.startsWith(prefix))
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([feature]) => feature.slice(prefix.length));
  const genres = top("g:", 2);
  const keywords = top("k:", 3);
  if (genres.length === 0 && keywords.length === 0) return null;
  const query = new URLSearchParams({
    sort_by: "vote_average.desc",
    "vote_count.gte": kind === "movie" ? "200" : "50",
  });
  if (genres.length) query.set("with_genres", genres.join("|"));
  if (keywords.length) query.set("with_keywords", keywords.join("|"));
  return `discover/${kind}?${query}`;
}

/** Not out yet on `now`: a film announced is not something to watch tonight. */
export function unreleased(title: Pick<TmdbBrief, "releaseDate">, now: number): boolean {
  const date = title.releaseDate ? Date.parse(title.releaseDate) : Number.NaN;
  return Number.isFinite(date) && date > now;
}

const ACCLAIMED = { average: 7.5, votes: 500 } as const;

export interface ReasonContext {
  members: readonly Participant[];
  signals: CircleSignals["signals"];
  resolved: ReadonlyMap<string, TmdbTitle>;
  /** The full details of the candidate, when read. */
  full: TmdbTitle | undefined;
  brief: TmdbBrief | undefined;
  wantedBy: readonly string[];
}

/** The people who said `kind` of this title. */
function whoSaid(entry: RankedTitle, kind: "loved" | "liked", context: ReasonContext): Participant[] {
  const ids = context.signals
    .filter((s) => s.signal === kind && tmdbKeyOf(s.title, context.resolved) === entry.key)
    .map((s) => s.accountId);
  return context.members.filter((member) => ids.includes(member.accountId));
}

/** What draws the group, said in words: « Du David Fincher », or its genre. */
function drawOf(entry: RankedTitle, full: TmdbTitle | undefined): SuggestionWhy | undefined {
  const [family, id] = entry.strongest?.split(":") ?? [];
  if (family === "p" && full) {
    const name = full.directors[full.directorIds.indexOf(Number(id))];
    if (name) return { kind: "director", name };
  }
  const genre = family === "g" ? TMDB_GENRES[Number(id)] : undefined;
  return genre ? { kind: "genres", genres: [genre] } : undefined;
}

/**
 * Why a title is suggested, the most telling first: wished for, loved by some
 * of them, in the line of a favourite, the director or genre that draws them,
 * then how well rated it is.
 */
export function reasonsOf(entry: RankedTitle, context: ReasonContext): SuggestionWhy[] {
  const reasons: SuggestionWhy[] = [];
  const wanting = context.members.filter((member) => context.wantedBy.includes(member.accountId));
  if (wanting.length) reasons.push({ kind: "wants", people: wanting });
  for (const kind of ["loved", "liked"] as const) {
    const people = whoSaid(entry, kind, context);
    if (people.length) reasons.push({ kind, people });
  }
  const names = new Map([...context.resolved.values()].map((title) => [keyOf(title.type, title.tmdbId), title.title]));
  const seed = entry.seeds.map((key) => names.get(key)).find((name) => name !== undefined);
  if (seed) reasons.push({ kind: "because", titles: [seed] });
  const draw = drawOf(entry, context.full);
  if (draw) reasons.push(draw);
  const rated = context.full ?? context.brief;
  if ((rated?.voteAverage ?? 0) >= ACCLAIMED.average && (rated?.voteCount ?? 0) >= ACCLAIMED.votes)
    reasons.push({ kind: "acclaimed", voteAverage: Math.round((rated?.voteAverage ?? 0) * 10) / 10 });
  return reasons;
}
