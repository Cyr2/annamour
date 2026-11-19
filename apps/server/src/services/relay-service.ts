import type { CatalogRef } from "@annamour/protocol";
import type { Catalog } from "../catalog/naka-catalog.ts";
import { importHls } from "../hls.ts";
import type { SegmentSource } from "../media/segment-source.ts";
import type { RoomStore } from "../room-store.ts";
import type { Episode } from "../rooms.ts";
import { FetchError, type StreamFetcher, type TextFetcher } from "../safe-fetch.ts";

/*
 * Nakanime's videos go through the server, never stored: their links are
 * signed for 12 hours (and maybe for the server's address), so the players
 * get each segment from us, and we renew the links when they run out.
 */

/** Links are renewed this long before they expire, so a segment never starts on a dying link. */
export const RENEW_BEFORE_MS = 15 * 60 * 1000;

function isUriLine(line: string): boolean {
  return line.length > 0 && !line.startsWith("#");
}

/** Only segment links leave through the relay; the master's own names (p0.m3u8…) stay ours. */
function isRemote(line: string): boolean {
  return /^https?:\/\//.test(line);
}

/** The playlist as the players get it: each segment at `<base>/<n>`, its n-th line in the source. */
export function relayedPlaylist(text: string, base: string): string {
  let index = 0;
  return text
    .split("\n")
    .map((line) => (isUriLine(line) && isRemote(line) ? `${base}/${index++}` : line))
    .join("\n");
}

/** The source's link for the n-th segment of a playlist. */
export function segmentAt(text: string, index: number): URL | undefined {
  const line = text.split("\n").filter((l) => isUriLine(l) && isRemote(l))[index];
  return line !== undefined && URL.canParse(line) ? new URL(line) : undefined;
}

/** When a signed link stops working: `s` (signed at, in seconds) plus `e` (its life); undefined when unsigned. */
export function linkExpiry(url: URL): number | undefined {
  const signedAt = Number(url.searchParams.get("s"));
  const life = Number(url.searchParams.get("e"));
  return signedAt > 0 && life > 0 ? (signedAt + life) * 1000 : undefined;
}

export function isRelayed(catalog: CatalogRef | undefined): boolean {
  return catalog?.source === "nakanime";
}

function isRefused(error: unknown): boolean {
  return error instanceof FetchError && (error.status === 401 || error.status === 403 || error.status === 410);
}

export interface RelayServiceOptions {
  store: RoomStore;
  /** Absent when Nakanime is not set up: no link can be renewed, the old ones are still tried. */
  catalog: Pick<Catalog, "videoUrl"> | undefined;
  fetchText: TextFetcher;
  fetchStream: StreamFetcher;
  now: () => number;
}

export class RelayService {
  private readonly options: RelayServiceOptions;
  /** One renewal per episode at a time, however many segments ask for it. */
  private readonly renewing = new Map<string, Promise<void>>();

  constructor(options: RelayServiceOptions) {
    this.options = options;
  }

  /** The playlist to serve: a relayed episode's segments point to us, any other's are left as they are. */
  playlist(code: string, episodeId: number, file: string): string | undefined {
    const episode = this.options.store.get(code)?.episodeById(episodeId);
    const text = episode?.imported.playlists.get(file);
    if (!episode || text === undefined || !isRelayed(episode.catalog)) return text;
    return relayedPlaylist(text, `/api/rooms/${code}/e/${episodeId}/relay/${file}`);
  }

  /**
   * The n-th segment of a relayed episode's playlist, from its source, as it
   * arrives. Only links its own playlist lists are fetched: nobody can make the
   * server fetch anything else. Undefined when there is no such segment.
   */
  async segment(code: string, episodeId: number, file: string, index: number, range?: string) {
    const url = await this.freshSegment(code, episodeId, file, index);
    if (!url) return undefined;
    try {
      return await this.options.fetchStream(url, range);
    } catch (error) {
      if (!isRefused(error)) throw error;
      await this.renew(code, episodeId);
      const renewed = this.segmentUrl(code, episodeId, file, index);
      return renewed ? this.options.fetchStream(renewed, range) : undefined;
    }
  }

  /**
   * For the lighter qualities, made from the same segments: a refused link is
   * renewed with its episode's, then fetched again.
   */
  renewingSource(source: SegmentSource): SegmentSource {
    return async (url) => {
      try {
        return await source(url);
      } catch (error) {
        const listing = isRefused(error) ? this.options.store.findListing(url.pathname) : undefined;
        if (!listing || !isRelayed(listing.episode.catalog)) throw error;
        await this.renew(listing.code, listing.episode.id);
        const fresh = this.samePath(listing.episode, url.pathname);
        if (!fresh) throw error;
        return source(fresh);
      }
    };
  }

  private async freshSegment(code: string, episodeId: number, file: string, index: number) {
    const url = this.segmentUrl(code, episodeId, file, index);
    const expiry = url ? linkExpiry(url) : undefined;
    if (expiry === undefined || this.options.now() < expiry - RENEW_BEFORE_MS) return url;
    await this.renew(code, episodeId);
    return this.segmentUrl(code, episodeId, file, index);
  }

  private segmentUrl(code: string, episodeId: number, file: string, index: number): URL | undefined {
    const episode = this.options.store.get(code)?.episodeById(episodeId);
    if (!episode || !isRelayed(episode.catalog)) return undefined;
    const text = episode.imported.playlists.get(file);
    return text === undefined ? undefined : segmentAt(text, index);
  }

  /** The renewed link of the segment at `path` (paths stay, only hosts and signatures change). */
  private samePath(episode: Episode, path: string): URL | undefined {
    for (const text of episode.imported.playlists.values()) {
      const line = text.split("\n").find((l) => isRemote(l) && URL.canParse(l) && new URL(l).pathname === path);
      if (line) return new URL(line);
    }
    return undefined;
  }

  /** Asks Nakanime for the episode's video again and keeps its new playlists. */
  private renew(code: string, episodeId: number): Promise<void> {
    const key = `${code}/${episodeId}`;
    const running = this.renewing.get(key);
    if (running) return running;
    const work = this.fetchAgain(code, episodeId).finally(() => this.renewing.delete(key));
    this.renewing.set(key, work);
    return work;
  }

  private async fetchAgain(code: string, episodeId: number): Promise<void> {
    const { store, catalog, fetchText } = this.options;
    const ref = store.get(code)?.episodeById(episodeId)?.catalog;
    if (!catalog || !ref) return;
    const imported = await importHls(await catalog.videoUrl(ref), fetchText);
    store.replaceEpisodeMedia(code, episodeId, imported);
    console.info(`Nakanime links renewed for ${code}/${episodeId}`);
  }
}
