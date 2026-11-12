import { type CatalogRef, chooseSkips, type SkipMarkers } from "@annamour/protocol";
import type { SkipSources } from "../catalog/skip-sources.ts";
import type { Tmdb } from "../catalog/tmdb.ts";
import type { RoomStore } from "../room-store.ts";

export interface SkipServiceOptions {
  store: RoomStore;
  /** Absent without TMDB: then nothing is looked up (the sources go by TMDB and IMDb ids). */
  tmdb: Tmdb | undefined;
  sources: SkipSources;
}

/**
 * « Passer l'intro » and the end credits' countdown: looks up, for each
 * episode of a séance made from the catalog, where its intro and credits are,
 * and gives them to the séance (every player then offers to skip them).
 */
export class SkipService {
  private readonly options: SkipServiceOptions;
  /** Episodes already looked up (or being), by « room:episode id »: once is enough. */
  private readonly asked = new Set<string>();

  constructor(options: SkipServiceOptions) {
    this.options = options;
  }

  /** Looks up the episodes of this séance not known yet; quietly does nothing when it cannot. */
  async prepare(code: string): Promise<void> {
    const room = this.options.store.get(code);
    if (!room || !this.options.tmdb) return;
    const waiting = room.episodesWithoutSkips().filter(({ id }) => !this.asked.has(`${code}:${id}`));
    await Promise.all(
      waiting.map(async ({ id, catalog, duration }) => {
        this.asked.add(`${code}:${id}`);
        const skips = await this.lookUp(catalog, duration);
        if (skips) room.setSkips(id, skips);
      }),
    );
  }

  /** Where a catalog title's intro and credits are on our copy, from the sources that fit it. */
  async lookUp(catalog: CatalogRef, duration: number | undefined): Promise<SkipMarkers | undefined> {
    const { tmdb, sources } = this.options;
    if (!tmdb) return undefined;
    const tmdbId = catalog.tmdbId ?? (await tmdb.find(catalog.type, catalog.title));
    if (tmdbId === null) return undefined;
    const title = await tmdb.title(catalog.type, tmdbId);
    const markers = await sources.markers({
      type: catalog.type,
      tmdbId,
      ...(title?.imdbId ? { imdbId: title.imdbId } : {}),
      ...(catalog.season !== undefined ? { season: catalog.season } : {}),
      ...(catalog.episode !== undefined ? { episode: catalog.episode } : {}),
      ...(duration !== undefined ? { duration } : {}),
    });
    return chooseSkips(markers, duration);
  }
}
