import {
  API,
  apiPath,
  CATALOG_API,
  type CatalogTitle,
  CIRCLES_API,
  type CircleList,
  type CreateAccountResponse,
  RATINGS_API,
  SUGGESTIONS_API,
  type SuggestionsResponse,
  type TitleDetailsResponse,
  WATCHLIST_API,
} from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import type { Catalog } from "../src/catalog/naka-catalog.ts";
import type { TmdbFetch } from "../src/catalog/tmdb.ts";
import { jsonRequest, media, sessionCookieOf, testApp } from "./helpers.ts";
import { GONE_GIRL } from "./tmdb.test.ts";

// TMDB, as far as these tests go: two films the couple loved, and what TMDB recommends from them.
const brief = (id: number, title: string, genres: number[], extra: object = {}) => ({
  id,
  media_type: "movie",
  title,
  genre_ids: genres,
  original_language: "en",
  release_date: "2015-01-01",
  vote_average: 7,
  vote_count: 3000,
  ...extra,
});
const PRISONERS = brief(146233, "Prisoners", [18, 53, 80], { vote_average: 8.1, vote_count: 12000 });
const ZODIAC = brief(1949, "Zodiac", [80, 9648, 53]);
const NOTTING_HILL = brief(509, "Coup de foudre à Notting Hill", [35, 10749, 18]);
const SE7EN = {
  ...brief(807, "Seven", [80, 9648, 53]),
  genres: [{ id: 80, name: "Crime" }],
  recommendations: { results: [PRISONERS, ZODIAC] },
};
const GONE = { ...GONE_GIRL, recommendations: { results: [PRISONERS, NOTTING_HILL] } };
const TMDB: Record<string, unknown> = {
  "movie/807": SE7EN,
  "movie/210577": GONE,
  "movie/146233": { ...PRISONERS, genres: [{ id: 53, name: "Thriller" }] },
  "movie/509": { ...NOTTING_HILL, genres: [] },
  "search/movie": { results: [{ id: 210577, title: "Gone Girl" }] },
};
const tmdbFetch: TmdbFetch = async (path) => {
  const answer = TMDB[path.split("?")[0] ?? ""];
  return answer === undefined ? { status: 404, body: "{}" } : { status: 200, body: JSON.stringify(answer) };
};

/** Naka has Prisoners and Notting Hill, not Zodiac. */
const naka: Catalog = {
  search: async (query) =>
    [
      { id: 900, type: "movie", title: "Prisoners", tmdbId: 146233 },
      { id: 901, type: "movie", title: "Coup de foudre à Notting Hill", tmdbId: 509 },
    ].filter((title) => title.title.toLowerCase().includes(query.toLowerCase())) as CatalogTitle[],
  season: async () => [],
  videoUrl: async () => new URL("https://cdn.example/master.m3u8"),
};

const film = (id: number, title: string, tmdbId: number) => ({ id, type: "movie", title, tmdbId }) as const;

async function setup(withTmdb = true) {
  const { app, services } = testApp({ now: () => 1000, catalog: naka, ...(withTmdb ? { tmdbFetch } : {}) });
  async function account(name: string) {
    const response = await app.request(API.createAccount, jsonRequest("POST", { name, color: "peach" }));
    const { account } = (await response.json()) as CreateAccountResponse;
    return { id: account.id, cookie: sessionCookieOf(response) };
  }
  const darius = await account("Darius");
  const anna = await account("Anna");
  const room = services.store.create("Rien", media, 1000);
  for (const id of [darius.id, anna.id]) services.history.recordParticipation(room.code, id);
  const circles = (await (
    await app.request(CIRCLES_API.list, { headers: { cookie: darius.cookie } })
  ).json()) as CircleList;
  const circleId = circles.circles[0]?.id ?? "";
  const rate = (cookie: string, title: object, rating: string) =>
    app.request(RATINGS_API.list, jsonRequest("PUT", { title, rating }, { cookie }));
  const suggestions = async (cookie = darius.cookie, id = circleId) => {
    const response = await app.request(apiPath(SUGGESTIONS_API.circle, { id }), { headers: { cookie } });
    return {
      status: response.status,
      list: response.ok ? ((await response.json()) as SuggestionsResponse).suggestions : [],
    };
  };
  return { app, darius, anna, circleId, rate, suggestions };
}

describe("« Pour vous ce soir »", () => {
  it("suggests what TMDB recommends from both their favourites, that Naka has, with each one's match", async () => {
    const { darius, anna, rate, suggestions } = await setup();
    await rate(darius.cookie, film(10, "Seven", 807), "loved");
    // Anna's avis was given before titles kept their TMDB number: it is found by its name.
    await rate(anna.cookie, { id: 11, type: "movie", title: "Gone Girl", year: 2014 }, "loved");

    const { list } = await suggestions();
    const titles = list.map((s) => s.title.title);
    expect(titles[0]).toBe("Prisoners");
    expect(titles).not.toContain("Zodiac");
    const [prisoners] = list;
    expect(prisoners?.title).toMatchObject({ id: 900, tmdbId: 146233 });
    expect(prisoners?.matches.map((m) => m.by.name)).toEqual(["Darius", "Anna"]);
    const because = prisoners?.reasons.find((reason) => reason.kind === "because");
    expect(because && "titles" in because ? [...because.titles].sort() : []).toEqual(["Gone Girl", "Seven"]);
    expect(prisoners?.reasons).toContainEqual({ kind: "acclaimed", voteAverage: 8.1 });
    // Each loved one the other has not seen is a fine idea too.
    expect(list.find((s) => s.title.title === "Gone Girl")).toBeUndefined();
  });

  it("leaves out what one of them did not like, and what both already rated", async () => {
    const { darius, anna, rate, suggestions } = await setup();
    await rate(darius.cookie, film(10, "Seven", 807), "loved");
    await rate(anna.cookie, film(12, "Prisoners", 146233), "disliked");
    expect((await suggestions()).list.map((s) => s.title.title)).not.toContain("Prisoners");
  });

  it("lifts a title of the circle's list someone wants", async () => {
    const { app, darius, anna, circleId, rate, suggestions } = await setup();
    await rate(darius.cookie, film(10, "Seven", 807), "loved");
    const title = { id: 901, type: "movie", title: "Coup de foudre à Notting Hill", tmdbId: 509 };
    await app.request(
      WATCHLIST_API.list,
      jsonRequest("POST", { title, shareWith: "everyone", want: true, circleId }, { cookie: anna.cookie }),
    );
    const notting = (await suggestions()).list.find((s) => s.title.tmdbId === 509);
    expect(notting?.itemId).toBeDefined();
    expect(notting?.reasons[0]).toMatchObject({ kind: "wants", people: [{ name: "Anna" }] });
  });

  it("is only for the circle's people", async () => {
    const { app, suggestions } = await setup();
    const response = await app.request(API.createAccount, jsonRequest("POST", { name: "Léo", color: "mint" }));
    expect((await suggestions(sessionCookieOf(response))).status).toBe(404);
  });

  it("comes from the list alone without TMDB", async () => {
    const { app, anna, circleId, suggestions } = await setup(false);
    const title = { id: 901, type: "movie", title: "Coup de foudre à Notting Hill" };
    await app.request(
      WATCHLIST_API.list,
      jsonRequest("POST", { title, shareWith: "everyone", want: true, circleId }, { cookie: anna.cookie }),
    );
    const [only] = (await suggestions()).list;
    expect(only).toMatchObject({ matches: [], reasons: [{ kind: "wants" }] });
  });
});

describe("a title's details", () => {
  it("tell its synopsis, rating, genres, people and trailer", async () => {
    const { app, darius } = await setup();
    const response = await app.request(`${CATALOG_API.details}?type=movie&title=Gone%20Girl&year=2014`, {
      headers: { cookie: darius.cookie },
    });
    const { details } = (await response.json()) as TitleDetailsResponse;
    expect(details).toMatchObject({
      tmdbId: 210577,
      genres: ["Drame", "Thriller"],
      voteAverage: 7.9,
      directors: ["David Fincher"],
      trailerUrl: "https://www.youtube.com/watch?v=fr-trailer",
    });
    expect(details?.overview).toContain("disparaît");
  });

  it("are none without TMDB, and refuse a query that is not one", async () => {
    const { app, darius } = await setup(false);
    const ask = (query: string) =>
      app.request(`${CATALOG_API.details}?${query}`, { headers: { cookie: darius.cookie } });
    expect(await (await ask("type=movie&title=Dune")).json()).toEqual({ details: null });
    expect((await ask("type=book&title=Dune")).status).toBe(400);
  });
});
