import type { CatalogEpisode, CatalogTitle, PlayCatalogRequest } from "@annamour/protocol";
import { z } from "zod";
import {
  CatalogAccountError,
  CatalogBusyError,
  CatalogCaptchaError,
  CatalogUnreachableError,
  NoVideoError,
} from "../errors.ts";

/*
 * Naka (naka.cx) as a catalog. Its API sits behind Cloudflare, so the calls go
 * through naka-bridge, a browser on the server's network; this file only
 * knows Naka's answers and turns them into the catalog's shapes.
 */

export const NAKA_ORIGIN = "https://naka.cx";
const POSTER_BASE = "https://image.tmdb.org/t/p/w342";

/** A poster the catalog itself serves: the only kind a séance keeps, so no one can make the others load any image. */
export function isCatalogPoster(url: string): boolean {
  return url.startsWith(`${POSTER_BASE}/`);
}

export interface BridgeAnswer {
  status: number;
  body: string;
}
/** Calls a Naka API path (e.g. `browse/search?q=Dune`) through naka-bridge. */
export type BridgeFetcher = (apiPath: string) => Promise<BridgeAnswer>;

export interface Catalog {
  search(query: string): Promise<CatalogTitle[]>;
  season(id: number, season: number): Promise<CatalogEpisode[]>;
  /** The title's HLS master playlists with fresh tokens, the best first: the next one is tried if one fails. */
  videoUrls(request: PlayCatalogRequest): Promise<URL[]>;
  /** The team's favourites and the community's weekly choice, to add to « Pour vous ce soir ». */
  picks?(): Promise<CatalogPick[]>;
}

export interface CatalogPick {
  title: CatalogTitle;
  by: "team" | "community";
}

/** How deep a pick may sit in Naka's answers (`staffPicks[i].media`…): its shape was never seen answered. */
const PICK_DEPTH = 4;

/** Every title (with its TMDB id) found in a Naka answer, wherever it sits in it. */
export function titlesIn(value: unknown, depth = PICK_DEPTH): CatalogTitle[] {
  if (depth < 0 || typeof value !== "object" || value === null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => titlesIn(item, depth - 1));
  const title = toCatalogTitle(value);
  if (title?.tmdbId) return [title];
  return Object.values(value).flatMap((item) => titlesIn(item, depth - 1));
}

const NakaTitle = z.object({
  id: z.number().int().positive(),
  tmdbId: z.number().int().positive().nullish(),
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
  /** Naka V2: false for an episode without a video, unless it is `pending` (being put back online). */
  available: z.boolean().optional(),
  pending: z.boolean().optional(),
});
const NakaSource = z.object({
  url: z.string(),
  isHls: z.boolean().optional(),
  /** "encoded" is Naka's own copy; "voe-clone" and "darki-clone" live on hosts the bridge does not fetch. */
  type: z.string().optional(),
  /** "premium": the subscribers' copy, likely refused to the server's free account. */
  access: z.string().nullish(),
  maxQuality: z.string().nullish(),
});
const NakaSources = z.object({ sources: z.array(z.unknown()) });

/** Naka's own ranking of its qualities (its player's); a copy without one sits between 720p and 1080p. */
const QUALITY_RANK: Record<string, number> = {
  "4K": 50,
  "2K": 40,
  "1440p": 40,
  "1080p": 30,
  "720p": 20,
  "480p": 10,
  "360p": 5,
};
const UNKNOWN_QUALITY_RANK = 15;

/** The playlists we can play, the best first: Naka's own HLS copies, the free ones before the premium one. */
export function playableSources(sources: readonly unknown[]): string[] {
  const playable = sources.flatMap((raw) => {
    const parsed = NakaSource.safeParse(raw);
    if (!parsed.success) return [];
    const source = parsed.data;
    if (source.isHls === false || (source.type !== undefined && source.type !== "encoded")) return [];
    const rank = QUALITY_RANK[source.maxQuality ?? ""] ?? UNKNOWN_QUALITY_RANK;
    return [{ url: source.url, premium: source.access === "premium", rank }];
  });
  playable.sort((a, b) => Number(a.premium) - Number(b.premium) || b.rank - a.rank);
  return playable.map((source) => source.url);
}

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
  if (t.tmdbId) title.tmdbId = t.tmdbId;
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
    if (parsed.data.available === false && !parsed.data.pending) return [];
    const title = parsed.data.name ?? parsed.data.title;
    return [title ? { number, title } : { number }];
  });
}

let sourceFieldsLogged = false;

/**
 * Logs once which fields Naka's sources answer has (names only, no values: its
 * links carry tokens). Its own player skips intros: if the times are in there,
 * they fit Naka's copy exactly, better than any public database.
 */
function logSourceFields(raw: unknown): void {
  if (sourceFieldsLogged || typeof raw !== "object" || raw === null) return;
  sourceFieldsLogged = true;
  const top = Object.keys(raw);
  const sources = "sources" in raw && Array.isArray(raw.sources) ? raw.sources : [];
  const first = sources[0];
  const inSource = typeof first === "object" && first !== null ? Object.keys(first) : [];
  console.info("Naka sources fields:", top.join(", "), "| per source:", inSource.join(", "));
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

  async picks(): Promise<CatalogPick[]> {
    const [home, community] = await Promise.allSettled([this.json("browse/home"), this.json("community/choice")]);
    const staffPicks =
      home.status === "fulfilled" && typeof home.value === "object" && home.value !== null && "staffPicks" in home.value
        ? home.value.staffPicks
        : undefined;
    const team = titlesIn(staffPicks);
    const voted = community.status === "fulfilled" ? titlesIn(community.value) : [];
    console.info("Naka picks:", team.length, "from the team,", voted.length, "from the community");
    return [
      ...team.map((title) => ({ title, by: "team" as const })),
      ...voted.map((title) => ({ title, by: "community" as const })),
    ];
  }

  async videoUrls({ id, type, season, episode }: PlayCatalogRequest): Promise<URL[]> {
    const query = new URLSearchParams({ type });
    if (season !== undefined && episode !== undefined) {
      query.set("season", String(season));
      query.set("episode", String(episode));
    }
    const raw = await this.json(`streaming/sources/${id}?${query}`);
    logSourceFields(raw);
    const body = NakaSources.safeParse(raw);
    const urls = body.success ? playableSources(body.data.sources) : [];
    if (urls.length === 0) throw new NoVideoError();
    return urls.map((url) => new URL(url, NAKA_ORIGIN));
  }

  /** Calls the bridge and reads Naka's JSON, turning its failures into what the person can do. */
  private async json(apiPath: string): Promise<unknown> {
    let answer: BridgeAnswer;
    try {
      answer = await this.fetch(apiPath);
    } catch {
      throw new CatalogUnreachableError();
    }
    // Naka answers 400 « No sources found » for a title without a video yet, `mirror_pending` while putting one back.
    if (answer.status === 400 || answer.status === 404 || answer.body.includes("mirror_pending")) {
      throw new NoVideoError();
    }
    // Its check against robots (a proof of work in the browser), off today: the token is not to blame then.
    if (answer.status === 403 && answer.body.includes("CAPTCHA_REQUIRED")) throw new CatalogCaptchaError();
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

/** Whether the bridge can serve calls (its /health needs no secret). */
export function bridgeHealth(baseUrl: string): () => Promise<boolean> {
  return async () => (await fetch(new URL("/health", baseUrl), { signal: AbortSignal.timeout(15_000) })).ok;
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
