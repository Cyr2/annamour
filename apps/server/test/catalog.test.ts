import { API, CATALOG_API, type CreateAccountResponse } from "@annamour/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type BridgeAnswer, bridgeFetcher, NakaCatalog, toCatalogEpisodes } from "../src/catalog/naka-catalog.ts";
import { ConfigError, loadConfig } from "../src/config.ts";
import type { TextFetcher } from "../src/safe-fetch.ts";
import { jsonRequest, sessionCookieOf, testApp } from "./helpers.ts";

const INTERSTELLAR = {
  id: 543,
  tmdbId: 157336,
  mediaType: "movie",
  title: "Interstellar",
  releaseDate: "2014-11-05",
  posterPath: "/poster.jpg",
  runtime: 169,
  numberOfSeasons: null,
};
const EUPHORIA = { id: 91, mediaType: "tv", title: "Euphoria", firstAirDate: "2019-06-16", numberOfSeasons: 3 };
const SOURCES = {
  sources: [{ url: "/api/v1/r2/movies/157336-unr8i/master.m3u8?token=t&exp=1", isHls: true }],
  contentId: 543,
};

/** A bridge that answers from a table of Naka API paths, and remembers what was asked. */
function fakeBridge(answers: Record<string, BridgeAnswer | unknown>) {
  const calls: string[] = [];
  const fetch = async (apiPath: string): Promise<BridgeAnswer> => {
    calls.push(apiPath);
    const answer = answers[apiPath];
    if (answer === undefined) return { status: 500, body: "" };
    if (typeof answer === "object" && answer !== null && "status" in answer && "body" in answer) {
      return answer as BridgeAnswer;
    }
    return { status: 200, body: JSON.stringify(answer) };
  };
  return { fetch, calls };
}

describe("the Naka catalog", () => {
  it("turns a search into titles with their year, poster and length", async () => {
    const { fetch } = fakeBridge({ "browse/search?q=inter": { data: [INTERSTELLAR, EUPHORIA, { broken: true }] } });
    expect(await new NakaCatalog(fetch).search("inter")).toEqual([
      {
        id: 543,
        type: "movie",
        title: "Interstellar",
        year: 2014,
        posterUrl: "https://image.tmdb.org/t/p/w342/poster.jpg",
        runtime: 169,
      },
      { id: 91, type: "tv", title: "Euphoria", year: 2019, seasons: 3 },
    ]);
  });

  it("asks for a film's sources and returns its playlist on naka.cx", async () => {
    const { fetch, calls } = fakeBridge({ "streaming/sources/543?type=movie": SOURCES });
    const url = await new NakaCatalog(fetch).videoUrl({ id: 543, type: "movie", title: "Interstellar" });
    expect(url.href).toBe("https://naka.cx/api/v1/r2/movies/157336-unr8i/master.m3u8?token=t&exp=1");
    expect(calls).toEqual(["streaming/sources/543?type=movie"]);
  });

  it("asks for one episode of a series", async () => {
    const { fetch, calls } = fakeBridge({ "streaming/sources/91?type=tv&season=2&episode=5": SOURCES });
    await new NakaCatalog(fetch).videoUrl({ id: 91, type: "tv", title: "Euphoria", season: 2, episode: 5 });
    expect(calls).toEqual(["streaming/sources/91?type=tv&season=2&episode=5"]);
  });

  it("lists a season's episodes", async () => {
    const episodes = [{ episodeNumber: 1, name: "Pilote" }, { episodeNumber: 2 }];
    const { fetch } = fakeBridge({ "browse/91/season/1": { episodes } });
    expect(await new NakaCatalog(fetch).season(91, 1)).toEqual([{ number: 1, title: "Pilote" }, { number: 2 }]);
  });

  it("finds the episodes wherever Naka puts them", () => {
    const one = [{ episode_number: 1, title: "Un" }];
    expect(toCatalogEpisodes(one)).toEqual([{ number: 1, title: "Un" }]);
    expect(toCatalogEpisodes({ data: { episodes: one } })).toEqual([{ number: 1, title: "Un" }]);
    expect(toCatalogEpisodes({ data: one })).toHaveLength(1);
    expect(toCatalogEpisodes({ other: 1 })).toEqual([]);
    expect(toCatalogEpisodes("nope")).toEqual([]);
    expect(toCatalogEpisodes([{ name: "sans numéro" }])).toEqual([]);
  });

  it("says when a title has no video yet", async () => {
    const noSource = { status: 400, body: '{"message":"No sources found"}' };
    const play = { id: 1, type: "movie" as const, title: "X" };
    await expect(
      new NakaCatalog(fakeBridge({ "streaming/sources/1?type=movie": noSource }).fetch).videoUrl(play),
    ).rejects.toThrow(/pas encore de vidéo/);
    await expect(
      new NakaCatalog(fakeBridge({ "streaming/sources/1?type=movie": { sources: [] } }).fetch).videoUrl(play),
    ).rejects.toThrow(/pas encore de vidéo/);
  });

  it("tells what to do when Naka refuses, is busy or answers nonsense", async () => {
    const answer = (status: number, body = "{}") => new NakaCatalog(async () => ({ status, body })).search("dune");
    await expect(answer(401)).rejects.toThrow(/NAKA_TOKEN/);
    await expect(answer(429)).rejects.toThrow(/dans une minute/);
    await expect(answer(503)).rejects.toThrow(/Naka ne répond pas/);
    await expect(answer(200, "<html>")).rejects.toThrow(/Naka ne répond pas/);
    await expect(answer(200, '{"unexpected":true}')).rejects.toThrow(/Naka ne répond pas/);
    const down = new NakaCatalog(() => Promise.reject(new Error("ECONNREFUSED")));
    await expect(down.search("dune")).rejects.toThrow(/Naka ne répond pas/);
  });
});

describe("the bridge over HTTP", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the Naka path with the shared secret", async () => {
    const fetch = vi.fn(async () => new Response('{"data":[]}', { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const answer = await bridgeFetcher("http://naka-bridge:3000", "s3cret")("browse/search?q=dune");
    expect(answer).toEqual({ status: 200, body: '{"data":[]}' });
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe("http://naka-bridge:3000/naka/browse/search?q=dune");
    expect(init.headers).toEqual({ "x-bridge-secret": "s3cret" });
  });
});

describe("the bridge settings", () => {
  it("are optional, but go together", () => {
    expect(loadConfig({}).nakaBridge).toBeUndefined();
    expect(loadConfig({ NAKA_BRIDGE_URL: "http://naka-bridge:3000", NAKA_BRIDGE_SECRET: "s" }).nakaBridge).toEqual({
      url: "http://naka-bridge:3000",
      secret: "s",
    });
    expect(() => loadConfig({ NAKA_BRIDGE_URL: "http://naka-bridge:3000" })).toThrow(ConfigError);
  });
});

const fetchText: TextFetcher = async () => "#EXTM3U\n#EXTINF:120,\ns0.ts\n#EXT-X-ENDLIST";

function setup(answers: Record<string, unknown> = {}, withCatalog = true) {
  const bridge = fakeBridge(answers);
  const clock = { now: 1_000_000 };
  const { app } = testApp({
    fetchText,
    now: () => clock.now,
    ...(withCatalog ? { catalog: new NakaCatalog(bridge.fetch) } : {}),
  });
  async function signedIn() {
    const response = await app.request(API.createAccount, jsonRequest("POST", { name: "Darius", color: "peach" }));
    const { account } = (await response.json()) as CreateAccountResponse;
    return { id: account.id, cookie: sessionCookieOf(response) };
  }
  return { app, bridge, clock, signedIn };
}

describe("searching the catalog from the PWA", () => {
  it("is for signed-in people only", async () => {
    const { app } = setup();
    expect((await app.request(`${CATALOG_API.search}?q=dune`)).status).toBe(401);
  });

  it("answers the titles, and remembers a search for a while", async () => {
    const { app, bridge, clock, signedIn } = setup({ "browse/search?q=Inter": { data: [INTERSTELLAR] } });
    const { cookie } = await signedIn();
    const search = () => app.request(`${CATALOG_API.search}?q=Inter`, { headers: { cookie } });
    const response = await search();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ titles: [{ id: 543, title: "Interstellar" }] });
    await search();
    expect(bridge.calls).toHaveLength(1);
    clock.now += 11 * 60 * 1000;
    await search();
    expect(bridge.calls).toHaveLength(2);
  });

  it("asks for two letters at least", async () => {
    const { app, signedIn } = setup();
    const { cookie } = await signedIn();
    const response = await app.request(`${CATALOG_API.search}?q=a`, { headers: { cookie } });
    expect(response.status).toBe(400);
  });

  it("says to paste a link when no catalog is set up", async () => {
    const { app, signedIn } = setup({}, false);
    const { cookie } = await signedIn();
    const response = await app.request(`${CATALOG_API.search}?q=dune`, { headers: { cookie } });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: expect.stringMatching(/colle le lien/) });
  });

  it("slows down someone searching too fast", async () => {
    const { app, signedIn } = setup({ "browse/search?q=dune": { data: [] } });
    const { cookie } = await signedIn();
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      statuses.push((await app.request(`${CATALOG_API.search}?q=dune`, { headers: { cookie } })).status);
    }
    expect(statuses.at(-1)).toBe(429);
  });

  it("lists a season's episodes", async () => {
    const { app, signedIn } = setup({ "browse/91/season/2": { episodes: [{ episodeNumber: 1 }] } });
    const { cookie } = await signedIn();
    const response = await app.request("/api/catalog/91/seasons/2", { headers: { cookie } });
    expect(await response.json()).toEqual({ episodes: [{ number: 1 }] });
    expect((await app.request("/api/catalog/91/seasons/zero", { headers: { cookie } })).status).toBe(400);
  });
});

describe("starting a séance from the catalog", () => {
  it("imports the title's video and names the séance after it", async () => {
    const { app, signedIn } = setup({ "streaming/sources/91?type=tv&season=1&episode=3": SOURCES });
    const { cookie } = await signedIn();
    const play = { id: 91, type: "tv", title: "Euphoria", season: 1, episode: 3 };
    const response = await app.request(CATALOG_API.play, jsonRequest("POST", play, { cookie }));
    expect(response.status).toBe(201);
    const { code } = (await response.json()) as { code: string };
    const room = await (await app.request(`/api/rooms/${code}`)).json();
    expect(room).toMatchObject({ media: { title: "Euphoria · S1 · É3", duration: 120 } });
  });

  it("refuses a series without its episode", async () => {
    const { app, signedIn } = setup();
    const { cookie } = await signedIn();
    const play = { id: 91, type: "tv", title: "Euphoria" };
    expect((await app.request(CATALOG_API.play, jsonRequest("POST", play, { cookie }))).status).toBe(400);
  });
});
