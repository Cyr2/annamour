import type { CatalogMediaType } from "@annamour/protocol";
import { z } from "zod";
import type { CatalogCacheRepository } from "../storage/catalog-cache-repository.ts";

/*
 * TMDB (themoviedb.org): what Naka does not say of a title — its synopsis,
 * rating, genres, people, trailer, and the titles it is like. One call per
 * title (details, credits, videos and recommendations together), kept a week.
 */

const API = "https://api.themoviedb.org/3/";
const POSTER_BASE = "https://image.tmdb.org/t/p/w342";
const TITLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FIND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LIST_TTL_MS = 24 * 60 * 60 * 1000;
/** Calls to TMDB at once: well within what it allows, and gentle on the server. */
const PARALLEL_CALLS = 4;
const CAST_SHOWN = 4;

export interface TmdbAnswer {
  status: number;
  body: string;
}
/** Calls a TMDB API path (e.g. `movie/157336?language=fr-FR`). */
export type TmdbFetch = (path: string) => Promise<TmdbAnswer>;

export function tmdbFetcher(token: string): TmdbFetch {
  return async (path) => {
    const response = await fetch(new URL(path, API), {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    return { status: response.status, body: await response.text() };
  };
}

export const TmdbBrief = z.object({
  tmdbId: z.number(),
  type: z.enum(["movie", "tv"]),
  title: z.string(),
  genreIds: z.array(z.number()),
  language: z.string().optional(),
  year: z.number().optional(),
  voteAverage: z.number().optional(),
  voteCount: z.number().optional(),
  posterUrl: z.string().optional(),
  /** « 2026-03-04 »: a film not out yet is not suggested. */
  releaseDate: z.string().optional(),
});
export type TmdbBrief = z.infer<typeof TmdbBrief>;

export const TmdbTitle = z.object({
  ...TmdbBrief.shape,
  overview: z.string().optional(),
  tagline: z.string().optional(),
  genres: z.array(z.object({ id: z.number(), name: z.string() })),
  runtime: z.number().optional(),
  seasons: z.number().optional(),
  directors: z.array(z.string()),
  directorIds: z.array(z.number()),
  cast: z.array(z.string()),
  castIds: z.array(z.number()),
  keywordIds: z.array(z.number()),
  /** The saga it belongs to. */
  collectionId: z.number().optional(),
  /** IMDb's id (« tt0903747 »), which IntroDB and SkipDB know titles by. */
  imdbId: z.string().optional(),
  trailerUrl: z.string().optional(),
  recommendations: z.array(TmdbBrief),
});
export type TmdbTitle = z.infer<typeof TmdbTitle>;

const Raw = z.record(z.string(), z.unknown());
const RawList = z.object({ results: z.array(Raw).catch([]) }).catch({ results: [] });
const RawPerson = z.object({ id: z.number().optional(), name: z.string(), job: z.string().optional() });
const RawKeywords = z
  .object({
    keywords: z.array(z.object({ id: z.number() })).optional(),
    results: z.array(z.object({ id: z.number() })).optional(),
  })
  .catch({});
const RawVideo = z.object({ site: z.string(), key: z.string(), type: z.string(), iso_639_1: z.string().nullish() });

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const yearOf = (value: unknown) => number(Number.parseInt(text(value) ?? "", 10));
/** Leaves out the keys whose value is undefined (the zod schemas want them absent). */
const defined = (value: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));

function briefOf(raw: Record<string, unknown>, fallbackType: CatalogMediaType): TmdbBrief | null {
  const type = raw.media_type === "movie" || raw.media_type === "tv" ? raw.media_type : fallbackType;
  const tmdbId = number(raw.id);
  const title = text(raw.title) ?? text(raw.name);
  if (tmdbId === undefined || title === undefined) return null;
  const poster = text(raw.poster_path);
  const brief = TmdbBrief.safeParse(
    defined({
      tmdbId,
      type,
      title,
      genreIds: z.array(z.number()).catch([]).parse(raw.genre_ids),
      language: text(raw.original_language),
      year: yearOf(raw.release_date ?? raw.first_air_date),
      voteAverage: number(raw.vote_average),
      voteCount: number(raw.vote_count),
      posterUrl: poster ? `${POSTER_BASE}${poster}` : undefined,
      releaseDate: text(raw.release_date) ?? text(raw.first_air_date),
    }),
  );
  return brief.success ? brief.data : null;
}

function trailerOf(raw: Record<string, unknown>): string | undefined {
  const videos = z.array(RawVideo).catch([]).parse(RawList.parse(raw.videos).results);
  const trailers = videos.filter((video) => video.site === "YouTube" && video.type === "Trailer");
  const trailer = trailers.find((video) => video.iso_639_1 === "fr") ?? trailers[0];
  return trailer ? `https://www.youtube.com/watch?v=${encodeURIComponent(trailer.key)}` : undefined;
}

function peopleOf(raw: Record<string, unknown>) {
  const credits = z
    .object({ cast: z.array(RawPerson).catch([]), crew: z.array(RawPerson).catch([]) })
    .catch({ cast: [], crew: [] })
    .parse(raw.credits);
  const creators = z.array(RawPerson).catch([]).parse(raw.created_by);
  const makers = [...credits.crew.filter((person) => person.job === "Director"), ...creators]
    .filter((person, index, all) => all.findIndex((other) => other.name === person.name) === index)
    .slice(0, 2);
  const cast = credits.cast.slice(0, CAST_SHOWN);
  const ids = (people: z.infer<typeof RawPerson>[]) => people.flatMap((person) => person.id ?? []);
  return {
    directors: makers.map((person) => person.name),
    directorIds: ids(makers),
    cast: cast.map((person) => person.name),
    castIds: ids(cast),
  };
}

/** IMDb's id, from `external_ids` (or the film's own `imdb_id`). */
function imdbIdOf(raw: Record<string, unknown>): string | undefined {
  const external = Raw.catch({}).parse(raw.external_ids ?? {});
  const id = text(external.imdb_id) ?? text(raw.imdb_id);
  return id && /^tt\d+$/.test(id) ? id : undefined;
}

/** Films list their keywords under `keywords`, series under `results`. */
function keywordIdsOf(raw: Record<string, unknown>): number[] {
  const keywords = RawKeywords.parse(raw.keywords);
  return (keywords.keywords ?? keywords.results ?? []).map((keyword) => keyword.id);
}

/** A title's details as TMDB answers them (`append_to_response=credits,videos,recommendations`). */
export function toTmdbTitle(raw: unknown, type: CatalogMediaType): TmdbTitle | null {
  const parsed = Raw.safeParse(raw);
  if (!parsed.success) return null;
  const brief = briefOf(parsed.data, type);
  if (!brief) return null;
  const genres = z
    .array(z.object({ id: z.number(), name: z.string() }))
    .catch([])
    .parse(parsed.data.genres);
  const title = TmdbTitle.safeParse(
    defined({
      ...brief,
      type,
      genreIds: genres.map((genre) => genre.id),
      genres,
      overview: text(parsed.data.overview),
      tagline: text(parsed.data.tagline),
      runtime: number(parsed.data.runtime),
      seasons: number(parsed.data.number_of_seasons),
      ...peopleOf(parsed.data),
      keywordIds: keywordIdsOf(parsed.data),
      imdbId: imdbIdOf(parsed.data),
      collectionId: number(Raw.catch({}).parse(parsed.data.belongs_to_collection ?? {}).id),
      trailerUrl: trailerOf(parsed.data),
      recommendations: RawList.parse(parsed.data.recommendations).results.flatMap((r) => briefOf(r, type) ?? []),
    }),
  );
  return title.success ? title.data : null;
}

/** Lets at most `size` calls run together; the others wait their turn. */
class Gate {
  private running = 0;
  private readonly waiting: (() => void)[] = [];
  constructor(private readonly size: number) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.running >= this.size) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.running++;
    try {
      return await work();
    } finally {
      this.running--;
      this.waiting.shift()?.();
    }
  }
}

export interface TmdbOptions {
  fetch: TmdbFetch;
  cache: CatalogCacheRepository;
  now: () => number;
}

/** TMDB, read through the cache. A failed call answers null and is not kept: the next one tries again. */
export class Tmdb {
  private readonly options: TmdbOptions;
  private readonly gate = new Gate(PARALLEL_CALLS);

  constructor(options: TmdbOptions) {
    this.options = options;
  }

  /** A title's details, or null when TMDB does not know it or cannot be reached. */
  async title(type: CatalogMediaType, tmdbId: number): Promise<TmdbTitle | null> {
    const key = `tmdb:title:${type}:${tmdbId}`;
    const kept = this.kept(key, TITLE_TTL_MS, TmdbTitle);
    if (kept) return kept;
    const path = `${type}/${tmdbId}?language=fr-FR&include_video_language=fr,en&append_to_response=credits,keywords,videos,recommendations,external_ids`;
    const body = await this.call(path);
    const title = body === null ? null : toTmdbTitle(body, type);
    if (title) this.keep(key, title);
    return title;
  }

  /**
   * A list of titles, kept a day: `discover/movie?with_genres=53|18…` (titles like
   * a taste), `movie/top_rated` or `trending/all/week` (for a group that said little yet).
   */
  async list(path: string, type: CatalogMediaType): Promise<TmdbBrief[]> {
    const key = `tmdb:list:${path}`;
    const kept = this.kept(key, LIST_TTL_MS, z.array(TmdbBrief));
    if (kept) return kept;
    const body = await this.call(`${path}${path.includes("?") ? "&" : "?"}language=fr-FR`);
    if (body === null) return [];
    const briefs = RawList.parse(body).results.flatMap((raw) => briefOf(raw, type) ?? []);
    this.keep(key, briefs);
    return briefs;
  }

  /** TMDB's number for a title known only by its name (and year), or null. */
  async find(type: CatalogMediaType, title: string, year?: number): Promise<number | null> {
    const key = `tmdb:find:${type}:${title.toLowerCase()}:${year ?? ""}`;
    const kept = this.kept(key, FIND_TTL_MS, z.object({ tmdbId: z.number().nullable() }));
    if (kept) return kept.tmdbId;
    const query = new URLSearchParams({ query: title, language: "fr-FR" });
    if (year !== undefined) query.set(type === "movie" ? "year" : "first_air_date_year", String(year));
    const body = await this.call(`search/${type}?${query}`);
    if (body === null) return null;
    const tmdbId = RawList.parse(body).results.flatMap((raw) => briefOf(raw, type) ?? [])[0]?.tmdbId ?? null;
    this.keep(key, { tmdbId });
    return tmdbId;
  }

  private kept<T>(key: string, ttl: number, schema: z.ZodType<T>): T | undefined {
    const body = this.options.cache.get(key, this.options.now() - ttl);
    if (body === undefined) return undefined;
    const parsed = schema.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data : undefined;
  }

  private keep(key: string, value: unknown): void {
    this.options.cache.put(key, JSON.stringify(value), this.options.now());
  }

  private async call(path: string): Promise<unknown> {
    try {
      const answer = await this.gate.run(() => this.options.fetch(path));
      if (answer.status !== 200) {
        if (answer.status !== 404) console.warn("TMDB answered", answer.status, "to", path.split("?")[0]);
        return null;
      }
      return JSON.parse(answer.body);
    } catch (error) {
      console.warn("TMDB unreachable", error instanceof Error ? error.message : error);
      return null;
    }
  }
}
