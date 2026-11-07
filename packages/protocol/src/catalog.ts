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

/** A film, or one episode of a series, from the catalog: what an episode of a séance was made from. */
export const CatalogRef = PlayCatalogRequest;
export type CatalogRef = PlayCatalogRequest;

/** Adds a catalog title to a séance's queue: the next episode of its series, or another film. */
export const AddCatalogEpisodeRequest = PlayCatalogRequest;
export type AddCatalogEpisodeRequest = PlayCatalogRequest;

/** Episode labels are at most this long (see EpisodeLabel). */
const EPISODE_LABEL_MAX = 40;

/** « S2 · É5 »: how an episode is named on its séance. */
export function catalogEpisodeLabel(season: number, episode: number): string {
  return `S${season} · É${episode}`;
}

/**
 * How a catalog title is named in a séance, whose episodes read « séance · episode »:
 * a series episode by « S2 · É5 » (the séance carries the series' name), a film by its own title.
 */
export function catalogLabel(ref: CatalogRef): string {
  const { season, episode, title } = ref;
  if (season !== undefined && episode !== undefined) return catalogEpisodeLabel(season, episode);
  return title.length > EPISODE_LABEL_MAX ? `${title.slice(0, EPISODE_LABEL_MAX - 1)}…` : title;
}

/**
 * The episode that follows `last` in its series: the next one of its season when
 * the season has it (`seasonEpisodes`), else the first of the next season.
 * Null for a film: nothing follows it.
 */
export function nextCatalogEpisode(last: CatalogRef, seasonEpisodes: readonly number[]): CatalogRef | null {
  if (last.type !== "tv" || last.season === undefined || last.episode === undefined) return null;
  const following = last.episode + 1;
  return seasonEpisodes.includes(following)
    ? { ...last, episode: following }
    : { ...last, season: last.season + 1, episode: 1 };
}

export const CATALOG_API = {
  search: "/api/catalog/search",
  season: "/api/catalog/:id/seasons/:season",
  play: "/api/catalog/play",
  addEpisode: "/api/catalog/rooms/:code/episodes",
} as const;
