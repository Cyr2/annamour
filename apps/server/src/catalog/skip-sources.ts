import type { CatalogMediaType, SourceMarkers } from "@annamour/protocol";
import { z } from "zod";
import type { CatalogCacheRepository } from "../storage/catalog-cache-repository.ts";

/*
 * Public databases of intro and end-credits times (« Passer l'intro »):
 * TheIntroDB (series, by TMDB id), IntroDB and SkipDB (films and series, by
 * IMDb id). Read without a key; each answer is kept a month (a week when it
 * knows nothing), so a séance asks each source once per episode.
 */

const FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISSING_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Sources that give no confidence of their own. */
const DEFAULT_CONFIDENCE = 0.6;

export interface SkipAnswer {
  status: number;
  body: string;
}
export type SkipFetch = (url: string) => Promise<SkipAnswer>;

export const skipFetcher: SkipFetch = async (url) => {
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  return { status: response.status, body: await response.text() };
};

/** What a title's intro and credits are looked up by. */
export interface SkipTarget {
  type: CatalogMediaType;
  tmdbId: number;
  imdbId?: string;
  season?: number;
  episode?: number;
  /** Our copy's length (s): SkipDB shifts its times onto it. */
  duration?: number;
}

const seconds = (ms: number | null | undefined) => (typeof ms === "number" ? ms / 1000 : undefined);
const defined = (value: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
const Kept = z.object({ markers: z.array(z.record(z.string(), z.unknown())) });
const Marker = z.object({
  source: z.string(),
  confidence: z.number(),
  introStart: z.number().optional(),
  introEnd: z.number().optional(),
  creditsStart: z.number().optional(),
  referenceDuration: z.number().optional(),
});

const Segment = z.object({
  start_ms: z.number().nullish(),
  end_ms: z.number().nullish(),
  confidence: z.number().optional(),
  match: z.string().optional(),
});
const Segments = z.array(Segment).nullish();

/** TheIntroDB v4: `intro` and `credits` lists, with the reference copy's length. */
export function fromTheIntroDb(body: unknown): SourceMarkers | null {
  const parsed = z
    .object({ group_duration_ms: z.number().nullish(), intro: Segments, credits: Segments })
    .safeParse(body);
  if (!parsed.success) return null;
  const intro = parsed.data.intro?.find((segment) => (segment.end_ms ?? 0) > 0);
  const credits = parsed.data.credits?.find((segment) => (segment.start_ms ?? 0) > 0);
  if (!intro && !credits) return null;
  return Marker.parse(
    defined({
      source: "theintrodb",
      confidence: Math.min(intro?.confidence ?? DEFAULT_CONFIDENCE, credits?.confidence ?? DEFAULT_CONFIDENCE),
      introStart: intro ? (seconds(intro.start_ms) ?? 0) : undefined,
      introEnd: seconds(intro?.end_ms),
      creditsStart: seconds(credits?.start_ms),
      referenceDuration: seconds(parsed.data.group_duration_ms),
    }),
  );
}

/** IntroDB and SkipDB: an `intro` and an `outro` (SkipDB under `segments`, shifted onto our length). */
function fromIntroAndOutro(source: string, body: unknown): SourceMarkers | null {
  const shape = z.object({ intro: Segment.nullish(), outro: Segment.nullish() });
  const root = z.record(z.string(), z.unknown()).safeParse(body);
  if (!root.success) return null;
  const parsed = shape.safeParse(root.data.segments ?? root.data);
  if (!parsed.success) return null;
  // A time SkipDB could not fit onto our copy's length is no use to us.
  const usable = (segment: z.infer<typeof Segment> | null | undefined) =>
    segment && segment.match !== "out-of-range" ? segment : undefined;
  const intro = usable(parsed.data.intro);
  const outro = usable(parsed.data.outro);
  if (!intro?.end_ms && !outro?.start_ms) return null;
  return Marker.parse(
    defined({
      source,
      confidence: Math.min(intro?.confidence ?? 1, outro?.confidence ?? 1, 1),
      introStart: intro?.end_ms ? (seconds(intro.start_ms) ?? 0) : undefined,
      introEnd: seconds(intro?.end_ms),
      creditsStart: seconds(outro?.start_ms),
    }),
  );
}

export const fromIntroDb = (body: unknown) => fromIntroAndOutro("introdb", body);
export const fromSkipDb = (body: unknown) => fromIntroAndOutro("skipdb", body);

function urlsFor(
  target: SkipTarget,
): { source: string; url: string; parse: (body: unknown) => SourceMarkers | null }[] {
  const episode = target.type === "tv" && target.season !== undefined && target.episode !== undefined;
  const where: Record<string, string> = episode
    ? { season: String(target.season), episode: String(target.episode) }
    : {};
  const urls = [
    {
      source: "theintrodb",
      url: `https://api.theintrodb.org/v4/media?${new URLSearchParams({ tmdb_id: String(target.tmdbId), ...where })}`,
      parse: fromTheIntroDb,
    },
  ];
  if (!target.imdbId) return urls;
  const imdb: Record<string, string> = { imdb_id: target.imdbId, ...where };
  urls.push({
    source: "introdb",
    url: `https://api.introdb.app/segments?${new URLSearchParams(episode ? imdb : { ...imdb, is_movie: "true" })}`,
    parse: fromIntroDb,
  });
  const duration: Record<string, string> = target.duration ? { duration: String(Math.round(target.duration)) } : {};
  urls.push({
    source: "skipdb",
    url: `https://api.skipdb.tv/api/segments?${new URLSearchParams({ ...imdb, ...duration })}`,
    parse: fromSkipDb,
  });
  return urls;
}

export interface SkipSourcesOptions {
  fetch: SkipFetch;
  cache: CatalogCacheRepository;
  now: () => number;
}

/** Asks every source that may know this title, through the cache. A failed call is not kept. */
export class SkipSources {
  private readonly options: SkipSourcesOptions;

  constructor(options: SkipSourcesOptions) {
    this.options = options;
  }

  async markers(target: SkipTarget): Promise<SourceMarkers[]> {
    const found = await Promise.all(urlsFor(target).map((source) => this.ask(source)));
    return found.flat();
  }

  private async ask(source: ReturnType<typeof urlsFor>[number]): Promise<SourceMarkers[]> {
    const { cache, now } = this.options;
    const key = `skip:${source.url}`;
    const kept = cache.get(key, now() - FOUND_TTL_MS);
    if (kept !== undefined) {
      const markers = this.parseKept(kept);
      // Times found hold a month; « nothing known » only a week, then the source is asked again.
      if (markers.length > 0 || cache.get(key, now() - MISSING_TTL_MS) !== undefined) return markers;
    }
    try {
      const answer = await this.options.fetch(source.url);
      // 404: the source does not know this title (kept, as « nothing »); anything else is tried again later.
      if (answer.status !== 200 && answer.status !== 404) return [];
      const markers = answer.status === 200 ? source.parse(JSON.parse(answer.body)) : null;
      cache.put(key, JSON.stringify({ markers: markers ? [markers] : [] }), now());
      return markers ? [markers] : [];
    } catch (error) {
      console.warn("Skip times unreachable at", source.source, error instanceof Error ? error.message : error);
      return [];
    }
  }

  private parseKept(body: string): SourceMarkers[] {
    const parsed = Kept.safeParse(JSON.parse(body));
    if (!parsed.success) return [];
    return parsed.data.markers.flatMap((raw) => {
      const marker = Marker.safeParse(raw);
      return marker.success ? [marker.data] : [];
    });
  }
}
