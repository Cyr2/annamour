import {
  type AddCatalogEpisodeRequest,
  type CatalogEpisode,
  type CatalogTitle,
  catalogLabel,
  type PlayCatalogRequest,
} from "@annamour/protocol";
import { type Catalog, isCatalogPoster } from "../catalog/naka-catalog.ts";
import { CatalogUnavailableError } from "../errors.ts";
import type { Room } from "../rooms.ts";
import type { RoomService } from "./room-service.ts";

/** A search is answered from memory for this long: typing again costs Naka nothing. */
export const SEARCH_CACHE_MS = 10 * 60 * 1000;
const SEARCH_CACHE_SIZE = 200;

export interface CatalogServiceOptions {
  /** Absent when no catalog is configured: the PWA then only takes links. */
  catalog: Catalog | undefined;
  rooms: RoomService;
  now: () => number;
}

/** The request as kept with the séance: its poster only when the catalog serves it. */
function withTrustedPoster(request: PlayCatalogRequest): PlayCatalogRequest {
  if (request.posterUrl === undefined || isCatalogPoster(request.posterUrl)) return request;
  const { posterUrl: _untrusted, ...rest } = request;
  return rest;
}

/** Finds films and series by name and opens a séance on one, without pasting a link. */
export class CatalogService {
  private readonly options: CatalogServiceOptions;
  private readonly searches = new Map<string, { at: number; titles: CatalogTitle[] }>();

  constructor(options: CatalogServiceOptions) {
    this.options = options;
  }

  async search(query: string): Promise<CatalogTitle[]> {
    const catalog = this.catalog();
    const key = query.toLocaleLowerCase("fr");
    const now = this.options.now();
    const cached = this.searches.get(key);
    if (cached && now - cached.at < SEARCH_CACHE_MS) return cached.titles;
    const titles = await catalog.search(query);
    if (this.searches.size >= SEARCH_CACHE_SIZE) this.searches.clear();
    this.searches.set(key, { at: now, titles });
    return titles;
  }

  season(id: number, season: number): Promise<CatalogEpisode[]> {
    return this.catalog().season(id, season);
  }

  /**
   * Gets the title's video link, then imports it like a pasted link. A series
   * episode makes a séance named after the series, its episode labelled « S1 · É1 »,
   * so the episodes queued after it read « Euphoria · S1 · É2 ».
   */
  async play(request: PlayCatalogRequest, accountId: string | undefined): Promise<Room> {
    const url = await this.catalog().videoUrl(request);
    const label = request.type === "tv" ? catalogLabel(request) : undefined;
    return this.options.rooms.create(url, request.title, accountId, { label, catalog: withTrustedPoster(request) });
  }

  /** Queues a catalog title after a séance's episodes: the next one of its series, or another film. */
  async addEpisode(code: string, request: AddCatalogEpisodeRequest): Promise<number> {
    const { rooms } = this.options;
    rooms.roomAcceptingEpisode(code);
    // The device only names who added it: the title keeps nothing of it.
    const { clientId, ...title } = request;
    const url = await this.catalog().videoUrl(title);
    return rooms.addEpisode(code, url, catalogLabel(title), withTrustedPoster(title), clientId);
  }

  private catalog(): Catalog {
    const { catalog } = this.options;
    if (!catalog) throw new CatalogUnavailableError();
    return catalog;
  }
}
