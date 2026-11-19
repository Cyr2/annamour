import { z } from "zod/mini";

/*
 * The catalog: films and series the server can find by name and turn into a
 * séance, so nobody has to dig a .m3u8 link out of a browser. The server
 * talks to the source; the PWA only sees these shapes.
 */

export const CatalogMediaType = z.enum(["movie", "tv"]);
export type CatalogMediaType = z.infer<typeof CatalogMediaType>;

export const CatalogId = z.number().check(z.int(), z.positive());
const Positive = z.number().check(z.int(), z.positive());

/** Where a title comes from: Naka (films and series) or Nakanime (anime). Absent on titles kept before: Naka. */
export const CatalogSource = z.enum(["naka", "nakanime"]);
export type CatalogSource = z.infer<typeof CatalogSource>;

/** An anime's versions on Nakanime: dubbed in French, or in Japanese with French subtitles. */
export const CatalogLanguage = z.enum(["VF", "VOSTFR"]);
export type CatalogLanguage = z.infer<typeof CatalogLanguage>;

/** Nakanime names its pages after a slug (`/anime/17/frieren`). */
export const CatalogSlug = z.string().check(z.regex(/^[a-z0-9-]{1,120}$/));

/** The version picked when none is asked for: VF when the episode has it, else VOSTFR. */
export function preferredLanguage(available: readonly CatalogLanguage[] | undefined): CatalogLanguage {
  return available === undefined || available.length === 0 || available.includes("VF") ? "VF" : "VOSTFR";
}

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
  /** The same title at TMDB, where its synopsis, rating and kin are read (absent for titles kept before). */
  tmdbId: z.optional(Positive),
  source: z.optional(CatalogSource),
  slug: z.optional(CatalogSlug),
  languages: z.optional(z.array(CatalogLanguage)),
});
export type CatalogTitle = z.infer<typeof CatalogTitle>;

export const CATALOG_QUERY_MAX = 80;
export const CatalogQuery = z.string().check(z.trim(), z.minLength(2), z.maxLength(CATALOG_QUERY_MAX));

export const CatalogSearchResponse = z.object({ titles: z.array(CatalogTitle) });
export type CatalogSearchResponse = z.infer<typeof CatalogSearchResponse>;

export const CatalogEpisode = z.object({
  number: Positive,
  title: z.optional(z.string()),
  /** Nakanime: the versions this episode has, and whether it is filler (« hors-série »). */
  languages: z.optional(z.array(CatalogLanguage)),
  filler: z.optional(z.boolean()),
});
export type CatalogEpisode = z.infer<typeof CatalogEpisode>;
/** `?source=nakanime&slug=frieren` on a season: Nakanime's page is found by its slug. Naka needs neither. */
export const CatalogSeasonQuery = z.object({ source: z.optional(CatalogSource), slug: z.optional(CatalogSlug) });
export type CatalogSeasonQuery = z.infer<typeof CatalogSeasonQuery>;
export const CatalogSeasonResponse = z.object({
  episodes: z.array(CatalogEpisode),
  /** Nakanime tells how many seasons the anime has with its episodes (its search does not). */
  seasons: z.optional(Positive),
});
export type CatalogSeasonResponse = z.infer<typeof CatalogSeasonResponse>;

/** Starts a séance on a film, or on one episode of a series (season and episode then required). */
export const PlayCatalogRequest = z
  .object({
    id: CatalogId,
    type: CatalogMediaType,
    title: z.string().check(z.trim(), z.minLength(1), z.maxLength(120)),
    season: z.optional(Positive),
    episode: z.optional(Positive),
    /** The title's poster, kept with the séance so « On reprend » can show it (the server keeps only the catalog's own). */
    posterUrl: z.optional(z.url({ protocol: /^https$/ })),
    /** The title at TMDB: where its intro and credits are looked up without guessing by name. */
    tmdbId: z.optional(Positive),
    source: z.optional(CatalogSource),
    /** Nakanime only: the title's page name, and the version to play (VF by default). */
    slug: z.optional(CatalogSlug),
    language: z.optional(CatalogLanguage),
  })
  .check(
    z.refine((r) => {
      const hasEpisode = r.season !== undefined && r.episode !== undefined;
      const hasNone = r.season === undefined && r.episode === undefined;
      return r.type === "movie" ? hasNone : hasEpisode;
    }, "a series needs its season and episode, a film neither"),
    z.refine((r) => r.source !== "nakanime" || r.slug !== undefined, "a Nakanime title needs its slug"),
  );
export type PlayCatalogRequest = z.infer<typeof PlayCatalogRequest>;

/** A film, or one episode of a series, from the catalog: what an episode of a séance was made from. */
export const CatalogRef = PlayCatalogRequest;
export type CatalogRef = PlayCatalogRequest;

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
  const { season, episode, title, language } = ref;
  // An anime says its version too (« S1 · É3 · VF »).
  if (season !== undefined && episode !== undefined) {
    const label = catalogEpisodeLabel(season, episode);
    return language ? `${label} · ${language}` : label;
  }
  return title.length > EPISODE_LABEL_MAX ? `${title.slice(0, EPISODE_LABEL_MAX - 1)}…` : title;
}

/**
 * The episode that follows `last` in its series: the next one of its season when
 * the season has it (`seasonEpisodes`), else the first of the next season.
 * Nakanime numbers an anime's episodes across seasons (season 2 starts at 29):
 * there the next season goes on with the next number. Null for a film.
 */
export function nextCatalogEpisode(last: CatalogRef, seasonEpisodes: readonly number[]): CatalogRef | null {
  if (last.type !== "tv" || last.season === undefined || last.episode === undefined) return null;
  const following = last.episode + 1;
  if (seasonEpisodes.includes(following)) return { ...last, episode: following };
  return { ...last, season: last.season + 1, episode: last.source === "nakanime" ? following : 1 };
}

export const CATALOG_API = {
  search: "/api/catalog/search",
  season: "/api/catalog/:id/seasons/:season",
  play: "/api/catalog/play",
  addEpisode: "/api/catalog/rooms/:code/episodes",
  /** `?type=movie&title=Verity&year=2025[&tmdbId=…]`: what TMDB says of a title. */
  details: "/api/catalog/details",
} as const;

/** What a title's sheet tells of it, from TMDB. */
export const TitleDetails = z.object({
  tmdbId: Positive,
  overview: z.optional(z.string()),
  tagline: z.optional(z.string()),
  genres: z.array(z.string()),
  /** TMDB's average out of 10, and from how many votes. */
  voteAverage: z.optional(z.number()),
  voteCount: z.optional(z.number()),
  /** Minutes, for films. */
  runtime: z.optional(z.number()),
  seasons: z.optional(z.number()),
  year: z.optional(z.number()),
  directors: z.array(z.string()),
  /** The first few actors, in billing order. */
  cast: z.array(z.string()),
  trailerUrl: z.optional(z.url({ protocol: /^https$/ })),
});
export type TitleDetails = z.infer<typeof TitleDetails>;

/** Null when TMDB is not set up, or does not know the title. */
export const TitleDetailsResponse = z.object({ details: z.nullable(TitleDetails) });
export type TitleDetailsResponse = z.infer<typeof TitleDetailsResponse>;

export const TitleDetailsQuery = z.object({
  type: CatalogMediaType,
  title: z.string().check(z.trim(), z.minLength(1), z.maxLength(200)),
  year: z.optional(z.coerce.number().check(z.int(), z.positive())),
  tmdbId: z.optional(z.coerce.number().check(z.int(), z.positive())),
});
export type TitleDetailsQuery = z.infer<typeof TitleDetailsQuery>;
