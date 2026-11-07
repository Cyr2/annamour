import { z } from "zod/mini";

/*
 * The catalog: films and series the server can find by name and turn into a
 * séance, so nobody has to dig a .m3u8 link out of a browser. The server
 * talks to the source; the PWA only sees these shapes.
 */

export const CatalogMediaType = z.enum(["movie", "tv"]);
export type CatalogMediaType = z.infer<typeof CatalogMediaType>;

const CatalogId = z.number().check(z.int(), z.positive());
const Positive = z.number().check(z.int(), z.positive());

export const CatalogTitle = z.object({
  id: CatalogId,
  type: CatalogMediaType,
  title: z.string(),
  year: z.optional(z.number()),
  posterUrl: z.optional(z.url({ protocol: /^https$/ })),
  /** Minutes, for films. */
  runtime: z.optional(z.number()),
  /** Seasons, for series. */
  seasons: z.optional(z.number()),
});
export type CatalogTitle = z.infer<typeof CatalogTitle>;

export const CATALOG_QUERY_MAX = 80;
export const CatalogQuery = z.string().check(z.trim(), z.minLength(2), z.maxLength(CATALOG_QUERY_MAX));

export const CatalogSearchResponse = z.object({ titles: z.array(CatalogTitle) });
export type CatalogSearchResponse = z.infer<typeof CatalogSearchResponse>;

export const CatalogEpisode = z.object({ number: Positive, title: z.optional(z.string()) });
export type CatalogEpisode = z.infer<typeof CatalogEpisode>;
export const CatalogSeasonResponse = z.object({ episodes: z.array(CatalogEpisode) });
export type CatalogSeasonResponse = z.infer<typeof CatalogSeasonResponse>;

/** Starts a séance on a film, or on one episode of a series (season and episode then required). */
export const PlayCatalogRequest = z
  .object({
    id: CatalogId,
    type: CatalogMediaType,
    title: z.string().check(z.trim(), z.minLength(1), z.maxLength(120)),
    season: z.optional(Positive),
    episode: z.optional(Positive),
  })
  .check(
    z.refine((r) => {
      const hasEpisode = r.season !== undefined && r.episode !== undefined;
      const hasNone = r.season === undefined && r.episode === undefined;
      return r.type === "movie" ? hasNone : hasEpisode;
    }, "a series needs its season and episode, a film neither"),
  );
export type PlayCatalogRequest = z.infer<typeof PlayCatalogRequest>;

/** « S2 · É5 »: how an episode is named on its séance. */
export function catalogEpisodeLabel(season: number, episode: number): string {
  return `S${season} · É${episode}`;
}

/** The séance's name: the film's title, or the series' title followed by its episode. */
export function catalogSessionTitle(request: PlayCatalogRequest): string {
  const { title, season, episode } = request;
  return season !== undefined && episode !== undefined ? `${title} · ${catalogEpisodeLabel(season, episode)}` : title;
}

export const CATALOG_API = {
  search: "/api/catalog/search",
  season: "/api/catalog/:id/seasons/:season",
  play: "/api/catalog/play",
} as const;
