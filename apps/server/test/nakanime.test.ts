import { readFileSync } from "node:fs";
import { API, CATALOG_API, type CatalogTitle } from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { CatalogSources } from "../src/catalog/catalog-sources.ts";
import type { BridgeAnswer, Catalog } from "../src/catalog/naka-catalog.ts";
import {
  findEpisode,
  NakanimeCatalog,
  seasonEpisodes,
  sourceOrder,
  toNakanimeTitle,
} from "../src/catalog/nakanime-catalog.ts";
import { FetchError, type StreamFetcher, type TextFetcher } from "../src/safe-fetch.ts";
import { linkExpiry, relayedPlaylist, segmentAt } from "../src/services/relay-service.ts";
import { jsonRequest, sessionCookieOf, testApp } from "./helpers.ts";
import { required } from "./required.ts";

/** Nakanime's answers as its app read them (recorded on 2026-11-19, trimmed): One Piece's search, Frieren's page, an episode's sources. */
const recorded = JSON.parse(readFileSync(new URL("./fixtures/nakanime.json", import.meta.url), "utf8"));
const FRIEREN_VF = "https://vidmoly.org/embed-k9m927ql2k8t.html";
const FRIEREN_VF_2 = "https://vidmoly.org/embed-ghiwo10inca9.html";
const SIGNED_AT = 1_795_122_394;
const CDN = "https://prx-1566-ant-r.vmpx.online/hls2/01/01755/k9m927ql2k8t";
const signed = (token: string, signedAt: number) => `t=${token}&s=${signedAt}&e=43200`;
const master = (token: string, signedAt = SIGNED_AT) => `${CDN}_,n,l,.urlset/master.m3u8?${signed(token, signedAt)}`;
const segment = (n: number, token: string, signedAt = SIGNED_AT) =>
  `${CDN}_n/seg-${n}-v1-a1.ts?${signed(token, signedAt)}`;

/** Vidmoly's CDN: a master with one 1080p variant of two segments, signed like the master asked for. */
const fetchText: TextFetcher = async (url) => {
  const token = url.searchParams.get("t") ?? "";
  const signedAt = Number(url.searchParams.get("s"));
  if (url.pathname.endsWith("master.m3u8"))
    return `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=3195550,RESOLUTION=1920x1080\n${CDN}_n/index-v1-a1.m3u8?${signed(token, signedAt)}`;
  if (url.pathname.endsWith("index-v1-a1.m3u8"))
    return `#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\n${segment(1, token, signedAt)}\n#EXTINF:10,\n${segment(2, token, signedAt)}\n#EXT-X-ENDLIST`;
  throw new FetchError("not found", 404);
};

interface BridgeScript {
  /** Player pages that open no video. */
  dead?: string[];
  /** The token the next resolved playlist is signed with, and when. */
  token?: { value: string; signedAt?: number };
  search?: BridgeAnswer;
}

function fakeBridge(script: BridgeScript = {}) {
  const calls: string[] = [];
  const ok = (body: unknown): BridgeAnswer => ({ status: 200, body: JSON.stringify(body) });
  const fetch = async (path: string): Promise<BridgeAnswer> => {
    calls.push(path);
    if (path.startsWith("search?")) return script.search ?? ok(recorded.search);
    if (path === "title?id=17&slug=frieren") return ok(recorded.anime);
    if (path.startsWith("sources?id=17&season=1&episode=1")) return ok(recorded.sources);
    if (path.startsWith("resolve?")) {
      const player = new URLSearchParams(path.slice(8)).get("url") ?? "";
      if (script.dead?.includes(player)) return { status: 404, body: "{}" };
      return ok({ url: master(script.token?.value ?? "fresh", script.token?.signedAt) });
    }
    return { status: 404, body: "{}" };
  };
  return { fetch, calls };
}

const naka: Catalog = {
  search: async () => [{ id: 543, type: "movie", title: "Interstellar" }],
  season: async () => ({ episodes: [] }),
  videoUrl: async () => new URL("https://cdn.example/master.m3u8"),
};

function setup(script: BridgeScript = {}, fetchStream?: StreamFetcher) {
  const bridge = fakeBridge(script);
  const clock = { now: SIGNED_AT * 1000 };
  const { app, services } = testApp({
    fetchText,
    now: () => clock.now,
    catalog: naka,
    nakanimeFetch: bridge.fetch,
    ...(fetchStream ? { fetchStream } : {}),
  });
  async function signedIn() {
    const response = await app.request(API.createAccount, jsonRequest("POST", { name: "Darius", color: "peach" }));
    return sessionCookieOf(response);
  }
  return { app, services, bridge, clock, signedIn };
}

const FRIEREN_E1 = {
  id: 17,
  type: "tv",
  title: "Frieren",
  source: "nakanime",
  slug: "frieren",
  season: 1,
  episode: 1,
} as const;

async function playFrieren(context: ReturnType<typeof setup>, request: object = FRIEREN_E1) {
  const cookie = await context.signedIn();
  const response = await context.app.request(CATALOG_API.play, jsonRequest("POST", request, { cookie }));
  const body = (await response.json()) as { code: string; error?: string };
  return { response, body, code: body.code };
}

describe("Nakanime's titles", () => {
  it("are anime with their versions, their page name and TMDB's poster in the catalog's size", () => {
    const [onePiece, , film] = recorded.search.data.map(toNakanimeTitle);
    expect(onePiece).toEqual({
      id: 16,
      type: "tv",
      title: "One Piece",
      source: "nakanime",
      slug: "one-piece",
      languages: ["VF", "VOSTFR"],
      year: 1999,
      posterUrl: "https://image.tmdb.org/t/p/w342/oag7edI9flSMawmNySEiSEJAbrf.jpg",
    });
    expect(film).toMatchObject({ type: "movie", source: "nakanime" });
  });

  it("drop what cannot be read, and posters from anywhere but TMDB", () => {
    expect(toNakanimeTitle({ id: "x", slug: "a" })).toBeNull();
    const item = { id: "5", slug: "x", title: "X", poster_url: "https://evil.test/p.jpg", languages: ["MULTI"] };
    expect(toNakanimeTitle(item)).toEqual({
      id: 5,
      type: "tv",
      title: "X",
      source: "nakanime",
      slug: "x",
      languages: [],
    });
  });

  it("list a season's playable episodes, numbered across seasons as Nakanime does", () => {
    const { anime } = recorded.anime;
    const second = seasonEpisodes(anime, 2);
    expect(second[0]).toEqual({ number: 29, title: "Allez, reprenons la route", languages: ["VF", "VOSTFR"] });
    expect(second).toHaveLength(10);
    expect(seasonEpisodes(anime, 1)).toHaveLength(28);
    expect(seasonEpisodes(anime, 3)).toEqual([]);
  });

  it("find the episode asked for, and a film's only one", () => {
    const { anime } = recorded.anime;
    expect(findEpisode(anime, { type: "tv", season: 2, episode: 29 })).toMatchObject({ season: 2 });
    expect(findEpisode(anime, { type: "tv", season: 1, episode: 29 })).toBeNull();
    expect(findEpisode(anime, { type: "movie" })).toMatchObject({ season: 1, episode: { number: 1 } });
  });

  it("try the players of the version asked for first, Vidmoly before others", () => {
    const order = sourceOrder(recorded.sources, "VF").map((s) => `${s.host}:${s.language}`);
    expect(order).toEqual(["vidmoly:VF", "vidmoly:VF", "voe:VF", "vidmoly:VOSTFR", "vidmoly:VOSTFR", "voe:VOSTFR"]);
  });
});

describe("one search for Naka and Nakanime", () => {
  it("shows what both found, Naka's first, each with where it comes from", async () => {
    const context = setup();
    const cookie = await context.signedIn();
    const response = await context.app.request(`${CATALOG_API.search}?q=One Piece`, { headers: { cookie } });
    const { titles } = (await response.json()) as { titles: CatalogTitle[] };
    expect(titles.map((t) => `${t.source ?? "naka"}:${t.title}`)).toEqual([
      "naka:Interstellar",
      "nakanime:One Piece",
      "nakanime:One Piece : Kai",
      "nakanime:One Piece, film 1 : Le Film",
    ]);
  });

  it("still shows Naka's titles when Nakanime fails", async () => {
    const context = setup({ search: { status: 503, body: "{}" } });
    const cookie = await context.signedIn();
    const response = await context.app.request(`${CATALOG_API.search}?q=Inter`, { headers: { cookie } });
    expect(await response.json()).toEqual({ titles: [{ id: 543, type: "movie", title: "Interstellar" }] });
  });

  it("does not wait for a source too slow to answer", async () => {
    const slow: Catalog = { ...naka, search: () => new Promise(() => undefined) };
    const sources = new CatalogSources({ naka, nakanime: slow }, 10);
    expect(await sources.search("Inter")).toHaveLength(1);
  });

  it("says why when every source fails", async () => {
    const failing: Catalog = { ...naka, search: () => Promise.reject(new Error("down")) };
    await expect(new CatalogSources({ naka: failing }).search("x")).rejects.toThrow("down");
    await expect(new CatalogSources({}).videoUrl({ id: 1, type: "movie", title: "X" })).rejects.toThrow(
      /colle le lien/,
    );
  });
});

describe("an anime's episodes", () => {
  it("are read once a day from its page, with how many seasons it has", async () => {
    const context = setup();
    const cookie = await context.signedIn();
    const season = (n: number) =>
      context.app.request(`/api/catalog/17/seasons/${n}?source=nakanime&slug=frieren`, { headers: { cookie } });
    const body = (await (await season(2)).json()) as { seasons: number; episodes: { number: number }[] };
    expect(body.seasons).toBe(2);
    expect(body.episodes[0]?.number).toBe(29);
    await season(1);
    expect(context.bridge.calls).toEqual(["title?id=17&slug=frieren"]);
    context.clock.now += 25 * 60 * 60 * 1000;
    await season(1);
    expect(context.bridge.calls).toHaveLength(2);
  });

  it("refuse a page name that is not one", async () => {
    const context = setup();
    const cookie = await context.signedIn();
    const response = await context.app.request("/api/catalog/17/seasons/1?source=nakanime&slug=../x", {
      headers: { cookie },
    });
    expect(response.status).toBe(400);
  });
});

describe("watching an anime episode", () => {
  it("plays it in VF by default, named with its version", async () => {
    const context = setup();
    const { response, code } = await playFrieren(context, { ...FRIEREN_E1, language: "VF" });
    expect(response.status).toBe(201);
    expect(context.bridge.calls.slice(1)).toEqual([
      "sources?id=17&season=1&episode=1",
      `resolve?url=${encodeURIComponent(FRIEREN_VF)}`,
    ]);
    const room = required(context.services.store.get(code), "the séance");
    expect(room.snapshot().episodes[0]?.label).toBe("S1 · É1 · VF");
  });

  it("tries the next player of the same version when one opens no video", async () => {
    const context = setup({ dead: [FRIEREN_VF] });
    const { response } = await playFrieren(context);
    expect(response.status).toBe(201);
    expect(context.bridge.calls.at(-1)).toBe(`resolve?url=${encodeURIComponent(FRIEREN_VF_2)}`);
  });

  it("says plainly when no player has the video", async () => {
    const dead = recorded.sources.map((s: { url: string }) => s.url);
    const context = setup({ dead });
    const { response, body } = await playFrieren(context);
    expect(response.status).toBe(404);
    expect(body).toEqual({ error: expect.stringMatching(/pas encore de vidéo sur Nakanime/) });
    // Three players at most: each one costs the bridge a call.
    expect(context.bridge.calls.filter((c) => c.startsWith("resolve"))).toHaveLength(3);
  });
});

describe("Nakanime's video through the server", () => {
  const streamed = (bytes: string, status = 200) =>
    new Response(bytes, { status, headers: { "content-type": "video/mp2t", "x-secret": "no" } });

  function relayed(fetchStream: StreamFetcher, script: BridgeScript = {}) {
    const context = setup(script, fetchStream);
    return { context, played: playFrieren(context) };
  }

  it("gives the players our links for its segments, never the source's", async () => {
    const { context, played } = relayed(async () => streamed("ts"));
    const { code } = await played;
    const playlist = await (await context.app.request(`/api/rooms/${code}/e/0/hls/p0.m3u8`)).text();
    expect(playlist).toContain(`/api/rooms/${code}/e/0/relay/p0.m3u8/0`);
    expect(playlist).toContain(`/api/rooms/${code}/e/0/relay/p0.m3u8/1`);
    expect(playlist).not.toContain("vmpx.online");
  });

  it("passes a segment on as it comes, asking only for what its playlist lists", async () => {
    const asked: string[] = [];
    const { context, played } = relayed(async (url, range) => {
      asked.push(`${url.href} ${range ?? ""}`);
      return streamed("segment-bytes");
    });
    const { code } = await played;
    const response = await context.app.request(`/api/rooms/${code}/e/0/relay/p0.m3u8/1`, {
      headers: { range: "bytes=0-99" },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("segment-bytes");
    expect(response.headers.get("content-type")).toBe("video/mp2t");
    expect(response.headers.get("x-secret")).toBeNull();
    expect(asked).toEqual([`${segment(2, "fresh")} bytes=0-99`]);
    expect((await context.app.request(`/api/rooms/${code}/e/0/relay/p0.m3u8/2`)).status).toBe(404);
    expect((await context.app.request(`/api/rooms/${code}/e/0/relay/master.m3u8/0`)).status).toBe(404);
    expect((await context.app.request(`/api/rooms/${code}/e/0/relay/p0.m3u8/x`)).status).toBe(404);
  });

  it("relays nothing of a séance from a pasted link", async () => {
    const context = setup({}, async () => streamed("x"));
    const created = await context.app.request("/api/rooms", jsonRequest("POST", { url: master("pasted") }));
    const { code } = (await created.json()) as { code: string };
    const playlist = await (await context.app.request(`/api/rooms/${code}/e/0/hls/p0.m3u8`)).text();
    expect(playlist).toContain("vmpx.online");
    expect((await context.app.request(`/api/rooms/${code}/e/0/relay/p0.m3u8/0`)).status).toBe(404);
  });

  it("renews the links before they expire, and keeps the new ones", async () => {
    const token = { value: "first" };
    const asked: string[] = [];
    const { context, played } = relayed(
      async (url) => {
        asked.push(url.searchParams.get("t") ?? "");
        return streamed("ts");
      },
      { token },
    );
    const { code } = await played;
    // Nakanime signs the new links when it gives them.
    context.clock.now += 12 * 60 * 60 * 1000 - 10 * 60 * 1000;
    Object.assign(token, { value: "renewed", signedAt: context.clock.now / 1000 });
    await context.app.request(`/api/rooms/${code}/e/0/relay/p0.m3u8/0`);
    await context.app.request(`/api/rooms/${code}/e/0/relay/p0.m3u8/1`);
    expect(asked).toEqual(["renewed", "renewed"]);
    expect(context.bridge.calls.filter((c) => c.startsWith("resolve"))).toHaveLength(2);
  });

  it("renews the links once the source refuses them, then fetches again", async () => {
    const token = { value: "first" };
    const { context, played } = relayed(
      async (url) => {
        if (url.searchParams.get("t") === "first") throw new FetchError("expired", 403);
        return streamed("ts");
      },
      { token },
    );
    const { code } = await played;
    token.value = "renewed";
    const response = await context.app.request(`/api/rooms/${code}/e/0/relay/p0.m3u8/0`);
    expect(await response.text()).toBe("ts");
  });

  it("answers 502 when the source fails, so the player tries again", async () => {
    const { context, played } = relayed(async () => {
      throw new FetchError("down", 500);
    });
    const { code } = await played;
    expect((await context.app.request(`/api/rooms/${code}/e/0/relay/p0.m3u8/0`)).status).toBe(502);
  });

  it("renews a refused link for the lighter qualities too, made from the same segments", async () => {
    const token = { value: "first" };
    const { context, played } = relayed(async () => streamed("ts"), { token });
    await played;
    token.value = "renewed";
    const fetched: string[] = [];
    const source = context.services.relay.renewingSource(async (url) => {
      fetched.push(url.searchParams.get("t") ?? "");
      if (url.searchParams.get("t") === "first") throw new FetchError("expired", 403);
      return new Uint8Array([1]);
    });
    expect(await source(new URL(segment(1, "first")))).toEqual(new Uint8Array([1]));
    expect(fetched).toEqual(["first", "renewed"]);
    // A link no Nakanime séance lists is not renewed: its refusal stands.
    await expect(source(new URL("https://elsewhere.test/a.ts?t=first"))).rejects.toThrow("expired");
  });
});

describe("the relay's rules", () => {
  it("number the source's segments and leave the rest as is", () => {
    const text = "#EXTM3U\n#EXTINF:10,\nhttps://cdn.test/a.ts\n#EXTINF:10,\nhttps://cdn.test/b.ts\n#EXT-X-ENDLIST";
    expect(relayedPlaylist(text, "/r")).toBe("#EXTM3U\n#EXTINF:10,\n/r/0\n#EXTINF:10,\n/r/1\n#EXT-X-ENDLIST");
    expect(segmentAt(text, 1)?.href).toBe("https://cdn.test/b.ts");
    expect(segmentAt(text, 2)).toBeUndefined();
    expect(relayedPlaylist("#EXTM3U\np0.m3u8", "/r")).toBe("#EXTM3U\np0.m3u8");
  });

  it("read when a signed link expires", () => {
    expect(linkExpiry(new URL(segment(1, "x")))).toBe((SIGNED_AT + 43200) * 1000);
    expect(linkExpiry(new URL("https://cdn.test/a.ts"))).toBeUndefined();
  });
});

describe("a Nakanime catalog alone", () => {
  it("finds nothing in an answer it cannot read", async () => {
    const catalog = new NakanimeCatalog({ fetch: async () => ({ status: 200, body: "{}" }), now: () => 0 });
    expect(await catalog.search("x")).toEqual([]);
    await expect(catalog.season(1, 1)).rejects.toThrow(/Nakanime/);
  });
});
