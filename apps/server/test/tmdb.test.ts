import { describe, expect, it, vi } from "vitest";
import { Tmdb, type TmdbFetch, toTmdbTitle } from "../src/catalog/tmdb.ts";
import { CatalogCacheRepository } from "../src/storage/catalog-cache-repository.ts";
import { openDatabase } from "../src/storage/database.ts";
import { GONE_GIRL } from "./tmdb-fixtures.ts";

function setup(answers: Record<string, unknown>) {
  const calls: string[] = [];
  const fetch: TmdbFetch = async (path) => {
    calls.push(path);
    const answer = answers[path.split("?")[0] ?? ""];
    return answer === undefined ? { status: 404, body: "{}" } : { status: 200, body: JSON.stringify(answer) };
  };
  const cache = new CatalogCacheRepository(openDatabase(":memory:"));
  const clock = { now: 1000 };
  return { tmdb: new Tmdb({ fetch, cache, now: () => clock.now }), calls, clock, cache };
}

describe("TMDB", () => {
  it("reads a film's synopsis, rating, people, French trailer and recommendations", () => {
    const title = toTmdbTitle(GONE_GIRL, "movie");
    expect(title).toMatchObject({
      tmdbId: 210577,
      type: "movie",
      title: "Gone Girl",
      genreIds: [18, 53],
      year: 2014,
      runtime: 149,
      directors: ["David Fincher"],
      cast: ["Ben Affleck", "Rosamund Pike", "Neil Patrick Harris"],
      trailerUrl: "https://www.youtube.com/watch?v=fr-trailer",
      posterUrl: "https://image.tmdb.org/t/p/w342/gone.jpg",
    });
    expect(title?.recommendations.map((r) => r.title)).toEqual(["Prisoners"]);
  });

  it("names a series' creators and counts its seasons", () => {
    const series = {
      id: 1,
      name: "Anne",
      first_air_date: "2017-03-19",
      number_of_seasons: 3,
      created_by: [{ name: "Moira Walley-Beckett" }],
    };
    expect(toTmdbTitle(series, "tv")).toMatchObject({
      title: "Anne",
      year: 2017,
      seasons: 3,
      directors: ["Moira Walley-Beckett"],
    });
    expect(toTmdbTitle({ nope: true }, "tv")).toBeNull();
    expect(toTmdbTitle("nope", "tv")).toBeNull();
  });

  it("asks once a week for a title, and remembers a search", async () => {
    const { tmdb, calls, clock } = setup({
      "movie/210577": GONE_GIRL,
      "search/movie": { results: [{ id: 210577, title: "Gone Girl" }] },
    });
    expect((await tmdb.title("movie", 210577))?.title).toBe("Gone Girl");
    await tmdb.title("movie", 210577);
    expect(await tmdb.find("movie", "Gone Girl", 2014)).toBe(210577);
    expect(await tmdb.find("movie", "gone girl", 2014)).toBe(210577);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("year=2014");
    clock.now += 8 * 24 * 60 * 60 * 1000;
    await tmdb.title("movie", 210577);
    expect(calls).toHaveLength(3);
  });

  it("answers nothing for an unknown title, and tries again after a failure", async () => {
    const { tmdb, calls } = setup({});
    expect(await tmdb.title("movie", 1)).toBeNull();
    expect(await tmdb.find("tv", "Inconnu")).toBeNull();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const down = new Tmdb({
      fetch: () => Promise.reject(new Error("offline")),
      cache: new CatalogCacheRepository(openDatabase(":memory:")),
      now: () => 0,
    });
    expect(await down.title("movie", 2)).toBeNull();
    const busy = new Tmdb({
      fetch: async () => ({ status: 429, body: "" }),
      cache: new CatalogCacheRepository(openDatabase(":memory:")),
      now: () => 0,
    });
    expect(await busy.find("movie", "Dune")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
    expect(calls).toHaveLength(2);
  });

  it("forgets what was fetched long ago", () => {
    const { cache } = setup({});
    cache.put("a", "{}", 10);
    cache.prune(20);
    expect(cache.get("a", 0)).toBeUndefined();
  });
});
