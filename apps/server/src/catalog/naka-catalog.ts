import type { CatalogEpisode, CatalogTitle, PlayCatalogRequest } from "@annamour/protocol";
import { z } from "zod";
import { CatalogAccountError, CatalogBusyError, CatalogUnreachableError, NoVideoError } from "../errors.ts";

/*
 * Naka (naka.cx) as a catalog. Its API sits behind Cloudflare, so the calls go
 * through naka-bridge, a browser on the server's network; this file only
 * knows Naka's answers and turns them into the catalog's shapes.
 */

export const NAKA_ORIGIN = "https://naka.cx";
const POSTER_BASE = "https://image.tmdb.org/t/p/w342";

export interface BridgeAnswer {
  status: number;
  body: string;
}
/** Calls a Naka API path (e.g. `browse/search?q=Dune`) through naka-bridge. */
export type BridgeFetcher = (apiPath: string) => Promise<BridgeAnswer>;

export interface Catalog {
  search(query: string): Promise<CatalogTitle[]>;
  season(id: number, season: number): Promise<CatalogEpisode[]>;
  /** The title's HLS master playlist, with a fresh token. */
  videoUrl(request: PlayCatalogRequest): Promise<URL>;
}

const NakaTitle = z.object({
  id: z.number().int().positive(),
  mediaType: z.enum(["movie", "tv"]),
  title: z.string(),
  releaseDate: z.string().nullish(),
  firstAirDate: z.string().nullish(),
  posterPath: z.string().nullish(),
  runtime: z.number().nullish(),
  numberOfSeasons: z.number().nullish(),
});
const NakaSearch = z.object({ data: z.array(z.unknown()) });

const NakaEpisode = z.object({
  episodeNumber: z.number().int().positive().optional(),
  episode_number: z.number().int().positive().optional(),
  name: z.string().nullish(),
  title: z.string().nullish(),
});
const NakaSources = z.object({ sources: z.array(z.object({ url: z.string(), isHls: z.boolean().optional() })) });

function yearOf(date: string | null | undefined): number | undefined {
  const year = Number.parseInt(date ?? "", 10);
  return Number.isFinite(year) ? year : undefined;
}

export function toCatalogTitle(raw: unknown): CatalogTitle | null {
  const parsed = NakaTitle.safeParse(raw);
  if (!parsed.success) return null;
  const t = parsed.data;
  const title: CatalogTitle = { id: t.id, type: t.mediaType, title: t.title };
  const year = yearOf(t.releaseDate ?? t.firstAirDate);
  if (year !== undefined) title.year = year;
  if (t.posterPath) title.posterUrl = `${POSTER_BASE}${t.posterPath}`;
  if (t.mediaType === "movie" && t.runtime) title.runtime = t.runtime;
  if (t.mediaType === "tv" && t.numberOfSeasons) title.seasons = t.numberOfSeasons;
  return title;
}

/** A season's episodes, wherever Naka puts the list (the array itself, `episodes` or `data`). */
function episodeList(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (typeof body !== "object" || body === null) return [];
  const record = body as Record<string, unknown>;
  for (const key of ["episodes", "data"]) {
    const value = record[key];
    if (Array.isArray(value) || (typeof value === "object" && value !== null)) return episodeList(value);
  }
  return [];
}

export function toCatalogEpisodes(body: unknown): CatalogEpisode[] {
  return episodeList(body).flatMap((raw) => {
    const parsed = NakaEpisode.safeParse(raw);
    const number = parsed.success ? (parsed.data.episodeNumber ?? parsed.data.episode_number) : undefined;
    if (!parsed.success || number === undefined) return [];
    const title = parsed.data.name ?? parsed.data.title;
    return [title ? { number, title } : { number }];
  });
}

export class NakaCatalog implements Catalog {
  private readonly fetch: BridgeFetcher;

  constructor(fetch: BridgeFetcher) {
    this.fetch = fetch;
  }

  async search(query: string): Promise<CatalogTitle[]> {
    const body = NakaSearch.safeParse(await this.json(`browse/search?q=${encodeURIComponent(query)}`));
    if (!body.success) throw new CatalogUnreachableError();
    return body.data.data.flatMap((raw) => toCatalogTitle(raw) ?? []);
  }

  async season(id: number, season: number): Promise<CatalogEpisode[]> {
    return toCatalogEpisodes(await this.json(`browse/${id}/season/${season}`));
  }

  async videoUrl({ id, type, season, episode }: PlayCatalogRequest): Promise<URL> {
    const query = new URLSearchParams({ type });
    if (season !== undefined && episode !== undefined) {
      query.set("season", String(season));
      query.set("episode", String(episode));
    }
    const body = NakaSources.safeParse(await this.json(`streaming/sources/${id}?${query}`));
    const source = body.success ? body.data.sources.find((s) => s.isHls !== false) : undefined;
    if (!source) throw new NoVideoError();
    return new URL(source.url, NAKA_ORIGIN);
  }

  /** Calls the bridge and reads Naka's JSON, turning its failures into what the person can do. */
  private async json(apiPath: string): Promise<unknown> {
    let answer: BridgeAnswer;
    try {
      answer = await this.fetch(apiPath);
    } catch {
      throw new CatalogUnreachableError();
    }
    // Naka answers 400 « No sources found » for a title without a video yet.
    if (answer.status === 400 || answer.status === 404) throw new NoVideoError();
    if (answer.status === 401 || answer.status === 403) throw new CatalogAccountError();
    if (answer.status === 429) throw new CatalogBusyError();
    if (answer.status !== 200) throw new CatalogUnreachableError();
    try {
      return JSON.parse(answer.body);
    } catch {
      throw new CatalogUnreachableError();
    }
  }
}

/** The bridge over HTTP, on the Docker network, with its shared secret. */
export function bridgeFetcher(baseUrl: string, secret: string, timeoutMs = 95_000): BridgeFetcher {
  return async (apiPath) => {
    const response = await fetch(new URL(`/naka/${apiPath}`, baseUrl), {
      headers: { "x-bridge-secret": secret },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: response.status, body: await response.text() };
  };
}
