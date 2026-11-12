import type { CatalogRef } from "@annamour/protocol";
import { describe, expect, it, vi } from "vitest";
import { fromIntroDb, fromSkipDb, fromTheIntroDb, type SkipFetch, SkipSources } from "../src/catalog/skip-sources.ts";
import { Tmdb, type TmdbFetch } from "../src/catalog/tmdb.ts";
import { SkipService } from "../src/services/skip-service.ts";
import { CatalogCacheRepository } from "../src/storage/catalog-cache-repository.ts";
import { openDatabase } from "../src/storage/database.ts";
import { media, testStore } from "./helpers.ts";

// What each database answered for Breaking Bad S1E1 (TMDB 1396, IMDb tt0903747), on 12 November 2026.
const THE_INTRO_DB = {
  tvdb_id: 81189,
  type: "tv",
  season: 1,
  episode: 1,
  group_duration_ms: 3500192,
  intro: [{ start_ms: 228671, end_ms: 246465, confidence: 0.68, submission_count: 25 }],
  credits: [{ start_ms: 3432825, end_ms: null, confidence: 0.7, submission_count: 11 }],
};
const INTRO_DB = {
  imdb_id: "tt0903747",
  intro: null,
  outro: { start_sec: 3431, end_sec: 3500, start_ms: 3431000, end_ms: 3500000, confidence: 1 },
  no_intro: true,
};
const SKIP_DB = {
  imdb_id: "tt0903747",
  segments: {
    intro: { start_ms: 229500, end_ms: 246500, match: "exact", confidence: 0.9 },
    outro: { start_ms: 3434000, end_ms: 3500000, match: "exact", confidence: 0.9 },
  },
};

describe("the skip databases' answers", () => {
  it("read TheIntroDB's intro and credits, and the length of the copy it timed", () => {
    expect(fromTheIntroDb(THE_INTRO_DB)).toEqual({
      source: "theintrodb",
      confidence: 0.68,
      introStart: 228.671,
      introEnd: 246.465,
      creditsStart: 3432.825,
      referenceDuration: 3500.192,
    });
    expect(fromTheIntroDb({ intro: [{ start_ms: null, end_ms: 38000 }] })).toMatchObject({
      introStart: 0,
      introEnd: 38,
    });
    expect(fromTheIntroDb({ error: "no submissions" })).toBeNull();
  });

  it("read IntroDB's and SkipDB's intro and outro, but not a time SkipDB could not fit to our copy", () => {
    expect(fromIntroDb(INTRO_DB)).toEqual({ source: "introdb", confidence: 1, creditsStart: 3431 });
    expect(fromSkipDb(SKIP_DB)).toEqual({
      source: "skipdb",
      confidence: 0.9,
      introStart: 229.5,
      introEnd: 246.5,
      creditsStart: 3434,
    });
    const misfit = { segments: { intro: null, outro: { start_ms: 100, match: "out-of-range", confidence: 1 } } };
    expect(fromSkipDb(misfit)).toBeNull();
    expect(fromIntroDb("nope")).toBeNull();
  });
});

function setup(answers: Record<string, unknown>, tmdbAnswers: Record<string, unknown> = {}) {
  const asked: string[] = [];
  const fetch: SkipFetch = async (url) => {
    asked.push(url);
    const host = new URL(url).host;
    const answer = answers[host];
    return answer === undefined ? { status: 404, body: "" } : { status: 200, body: JSON.stringify(answer) };
  };
  const cache = new CatalogCacheRepository(openDatabase(":memory:"));
  const tmdbFetch: TmdbFetch = async (path) => {
    const answer = tmdbAnswers[path.split("?")[0] ?? ""];
    return answer === undefined ? { status: 404, body: "{}" } : { status: 200, body: JSON.stringify(answer) };
  };
  const now = () => 1000;
  const sources = new SkipSources({ fetch, cache, now });
  const tmdb = new Tmdb({ fetch: tmdbFetch, cache, now });
  return { asked, sources, tmdb };
}

const BREAKING_BAD = { name: "Breaking Bad", id: 1396, external_ids: { imdb_id: "tt0903747" } };
const episodeOne: CatalogRef = { id: 7, type: "tv", title: "Breaking Bad", season: 1, episode: 1, tmdbId: 1396 };

describe("an episode's intro and credits", () => {
  it("are looked up in every database, then kept: asked once", async () => {
    const { asked, sources, tmdb } = setup(
      { "api.theintrodb.org": THE_INTRO_DB, "api.introdb.app": INTRO_DB, "api.skipdb.tv": SKIP_DB },
      { "tv/1396": BREAKING_BAD },
    );
    const skips = new SkipService({ store: testStore().store, tmdb, sources });
    // The intro from SkipDB (0.9, IntroDB knows none), the credits from IntroDB (1, the most sure).
    expect(await skips.lookUp(episodeOne, 3500)).toEqual({ introStart: 229.5, introEnd: 246.5, creditsStart: 3431 });
    expect(asked).toHaveLength(3);
    expect(asked.find((url) => url.includes("skipdb"))).toContain("duration=3500");
    await skips.lookUp(episodeOne, 3500);
    expect(asked).toHaveLength(3);
  });

  it("are given to the séance, which shows them to everyone", async () => {
    const { sources, tmdb } = setup({ "api.skipdb.tv": SKIP_DB }, { "tv/1396": BREAKING_BAD });
    const { store } = testStore();
    const room = store.create("Breaking Bad", { ...media, duration: 3500 }, 0, { catalog: episodeOne });
    await new SkipService({ store, tmdb, sources }).prepare(room.code);
    expect(room.snapshot().episodes[0]?.skips).toEqual({ introStart: 229.5, introEnd: 246.5, creditsStart: 3434 });
  });

  it("are not looked up without TMDB, and a source that fails is asked again later", async () => {
    const { store } = testStore();
    const room = store.create("Breaking Bad", media, 0, { catalog: episodeOne });
    const offline = setup({});
    await new SkipService({ store, tmdb: undefined, sources: offline.sources }).prepare(room.code);
    expect(offline.asked).toHaveLength(0);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = new SkipSources({
      fetch: () => Promise.reject(new Error("offline")),
      cache: new CatalogCacheRepository(openDatabase(":memory:")),
      now: () => 0,
    });
    expect(await failing.markers({ type: "movie", tmdbId: 27205, imdbId: "tt1375666" })).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
