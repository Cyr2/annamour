import {
  type CatalogEpisode,
  CatalogLanguage,
  type CatalogSeasonQuery,
  type CatalogSeasonResponse,
  type CatalogTitle,
  type PlayCatalogRequest,
  preferredLanguage,
} from "@annamour/protocol";
import { z } from "zod";
import { CatalogBusyError, NoVideoError } from "../errors.ts";
import type { CatalogCacheRepository } from "../storage/catalog-cache-repository.ts";
import { type BridgeFetcher, bridgeJson, type Catalog } from "./naka-catalog.ts";

/*
 * Nakanime (nakanime.tv) as a catalog of anime. Like Naka it sits behind
 * Cloudflare, so naka-bridge reads it in its browser; this file only knows
 * Nakanime's answers and turns them into the catalog's shapes.
 */

const SITE = "Nakanime";
/** An anime's page (seasons, episodes, versions) changes rarely: one read a day at most. */
export const TITLE_CACHE_MS = 24 * 60 * 60 * 1000;
/** Player pages tried before giving up: each one costs a call of the bridge's budget. */
const MAX_PLAYERS_TRIED = 3;
const TMDB_POSTER = /^https:\/\/image\.tmdb\.org\/t\/p\/[a-z0-9]+(\/[A-Za-z0-9_-]+\.(?:jpg|png))$/;
const POSTER_BASE = "https://image.tmdb.org/t/p/w342";

const Languages = z
  .array(z.string())
  .nullish()
  .transform((all) => (all ?? []).flatMap((language) => CatalogLanguage.safeParse(language).data ?? []));

const SearchItem = z.object({
  id: z.union([z.number(), z.string().regex(/^\d{1,9}$/)]).transform(Number),
  slug: z.string().regex(/^[a-z0-9-]{1,120}$/),
  title: z.string(),
  format: z.string().nullish(),
  season_year: z.number().nullish(),
  languages: Languages,
  poster_url: z.string().nullish(),
});
const Search = z.object({ data: z.array(z.unknown()) });

const Episode = z.object({
  id: z.number().int().positive(),
  number: z.number().int().positive(),
  title: z.string().nullish(),
  seasonId: z.number().nullish(),
  isFiller: z.boolean().nullish(),
  hasSources: z.boolean().nullish(),
  languages: Languages,
});
const AnimeData = z.object({
  anime: z.object({
    id: z.number(),
    seasons: z.array(z.object({ id: z.number(), number: z.number().int().positive() })),
    episodesList: z.array(Episode),
  }),
});
type AnimeData = z.infer<typeof AnimeData>["anime"];
type AnimeEpisode = z.infer<typeof Episode>;

const Source = z.object({
  url: z.string(),
  host: z.string(),
  language: z.string(),
  episodeId: z.number().nullish(),
});
type Source = z.infer<typeof Source>;
const Resolved = z.object({ url: z.string() });

/** TMDB's posters, in the size the catalog serves: the only kind a séance keeps. */
function catalogPoster(url: string | null | undefined): string | undefined {
  const path = TMDB_POSTER.exec(url ?? "")?.[1];
  return path ? `${POSTER_BASE}${path}` : undefined;
}

export function toNakanimeTitle(raw: unknown): CatalogTitle | null {
  const parsed = SearchItem.safeParse(raw);
  if (!parsed.success || parsed.data.id <= 0) return null;
  const item = parsed.data;
  const title: CatalogTitle = {
    id: item.id,
    type: item.format === "MOVIE" ? "movie" : "tv",
    title: item.title,
    source: "nakanime",
    slug: item.slug,
    languages: item.languages,
  };
  if (item.season_year) title.year = item.season_year;
  const poster = catalogPoster(item.poster_url);
  if (poster) title.posterUrl = poster;
  return title;
}

/** The episodes of one season that can be played, numbered as Nakanime does (across seasons). */
export function seasonEpisodes(anime: AnimeData, season: number): CatalogEpisode[] {
  const seasonId = anime.seasons.find((s) => s.number === season)?.id;
  return anime.episodesList
    .filter((episode) => episode.hasSources !== false && (episode.seasonId ?? seasonId) === seasonId)
    .map(({ number, title, languages, isFiller }) => ({
      number,
      ...(title ? { title } : {}),
      languages,
      ...(isFiller ? { filler: true } : {}),
    }));
}

/** The episode a request is about, and its season's number (a film is its first playable episode). */
export function findEpisode(
  anime: AnimeData,
  request: Pick<PlayCatalogRequest, "type" | "season" | "episode">,
): { episode: AnimeEpisode; season: number } | null {
  const seasonOf = (episode: AnimeEpisode) => anime.seasons.find((s) => s.id === episode.seasonId)?.number ?? 1;
  const playable = anime.episodesList.filter((episode) => episode.hasSources !== false);
  const episode =
    request.type === "movie"
      ? playable[0]
      : playable.find((e) => e.number === request.episode && seasonOf(e) === request.season);
  return episode ? { episode, season: seasonOf(episode) } : null;
}

/** The player pages to try: the version asked for first, Vidmoly before others (the only one checked live). */
export function sourceOrder(sources: readonly Source[], language: CatalogLanguage): Source[] {
  const rank = (source: Source) => (source.language === language ? 0 : 2) + (source.host === "vidmoly" ? 0 : 1);
  return [...sources].sort((a, b) => rank(a) - rank(b));
}

export interface NakanimeCatalogOptions {
  fetch: BridgeFetcher;
  cache?: CatalogCacheRepository | undefined;
  now: () => number;
}

export class NakanimeCatalog implements Catalog {
  private readonly options: NakanimeCatalogOptions;

  constructor(options: NakanimeCatalogOptions) {
    this.options = options;
  }

  async search(query: string): Promise<CatalogTitle[]> {
    const body = Search.safeParse(await this.json(`search?q=${encodeURIComponent(query)}`));
    return body.success ? body.data.data.flatMap((raw) => toNakanimeTitle(raw) ?? []) : [];
  }

  async season(id: number, season: number, query: CatalogSeasonQuery = {}): Promise<CatalogSeasonResponse> {
    const anime = await this.anime(id, query.slug);
    return { episodes: seasonEpisodes(anime, season), seasons: Math.max(1, anime.seasons.length) };
  }

  /** The episode's HLS playlist: the version asked for (VF by default), another one if its players all fail. */
  async videoUrl(request: PlayCatalogRequest): Promise<URL> {
    const found = findEpisode(await this.anime(request.id, request.slug), request);
    if (!found) throw new NoVideoError(SITE);
    const { episode, season } = found;
    const sources = z
      .array(Source)
      .safeParse(await this.json(`sources?id=${request.id}&season=${season}&episode=${episode.number}`));
    // The page shows another episode's sources when the address is not the episode's own.
    const own = (sources.data ?? []).filter((source) => (source.episodeId ?? episode.id) === episode.id);
    const language = request.language ?? preferredLanguage(episode.languages);
    for (const source of sourceOrder(own, language).slice(0, MAX_PLAYERS_TRIED)) {
      const url = await this.resolve(source.url);
      if (url) return url;
    }
    throw new NoVideoError(SITE);
  }

  /** The playlist a player page opens, or null when it does not (a removed video, a player that changed). */
  private async resolve(player: string): Promise<URL | null> {
    try {
      const resolved = Resolved.safeParse(await this.json(`resolve?url=${encodeURIComponent(player)}`));
      return resolved.success && URL.canParse(resolved.data.url) ? new URL(resolved.data.url) : null;
    } catch (error) {
      // Out of budget: trying the next player would only fail the same way.
      if (error instanceof CatalogBusyError) throw error;
      return null;
    }
  }

  /** The anime's page data, read at most once a day. */
  private async anime(id: number, slug: string | undefined): Promise<AnimeData> {
    if (slug === undefined) throw new NoVideoError(SITE);
    const { cache, now } = this.options;
    const key = `nakanime:title:${id}`;
    const kept = cache?.get(key, now() - TITLE_CACHE_MS);
    const parsed = AnimeData.safeParse(kept ? JSON.parse(kept) : await this.json(`title?id=${id}&slug=${slug}`));
    if (!parsed.success) throw new NoVideoError(SITE);
    if (!kept) cache?.put(key, JSON.stringify({ anime: parsed.data.anime }), now());
    return parsed.data.anime;
  }

  private json(path: string): Promise<unknown> {
    return bridgeJson(this.options.fetch, path, SITE);
  }
}
