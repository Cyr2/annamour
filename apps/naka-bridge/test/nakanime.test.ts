import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nakanimeCall } from "../src/allowlist.ts";
import { type BridgeDeps, handleBridgeRequest, type NakaCaller, type NakanimeCaller } from "../src/bridge.ts";
import { CallBudget } from "../src/budget.ts";
import { MediaGate } from "../src/media-gate.ts";
import { isPlaylistRequest, pickSearch, pickSources } from "../src/nakanime-reading.ts";

/** What Nakanime's app read on its catalog and episode pages (recorded on 2026-11-19, trimmed). */
const reads: string[] = JSON.parse(readFileSync(new URL("./fixtures/nakanime-reads.json", import.meta.url), "utf8"));

const PLAYER = "https://vidmoly.org/embed-k9m927ql2k8t.html";
const naka: NakaCaller = {
  call: async () => ({ status: 200, body: "{}" }),
  fetchMedia: async () => ({ status: 200, body: "" }),
};

function fakeNakanime() {
  const calls: string[] = [];
  const answer = (call: string) => {
    calls.push(call);
    return Promise.resolve({ status: 200, body: JSON.stringify({ call }) });
  };
  const nakanime: NakanimeCaller = {
    search: (query) => answer(`search ${query}`),
    title: (id, slug) => answer(`title ${id} ${slug}`),
    sources: (id, season, episode) => answer(`sources ${id} ${season} ${episode}`),
    resolve: (player) => answer(`resolve ${player.href}`),
  };
  return { nakanime, calls };
}

function deps(nakanime: NakanimeCaller | undefined, budget = new CallBudget({ max: 5, windowMs: 60_000 })): BridgeDeps {
  return { secret: "s3cret", naka, nakanime, budget, media: new MediaGate(), now: () => 1000 };
}

const get = (target: string, secret = "s3cret") => ({ method: "GET", target, secret });
const resolve = (url: string) => `/nakanime/resolve?url=${encodeURIComponent(url)}`;

describe("which Nakanime reads the bridge makes", () => {
  it("allows a search, an anime's page, an episode's sources and a player", () => {
    expect(nakanimeCall("/nakanime/search?q=Frieren")).toEqual({ kind: "search", query: "Frieren" });
    expect(nakanimeCall("/nakanime/title?id=17&slug=frieren")).toEqual({ kind: "title", id: 17, slug: "frieren" });
    expect(nakanimeCall("/nakanime/sources?id=17&season=2&episode=29")).toEqual({
      kind: "sources",
      id: 17,
      season: 2,
      episode: 29,
    });
    expect(nakanimeCall(resolve(PLAYER))).toMatchObject({ kind: "resolve", player: new URL(PLAYER) });
  });

  it("refuses anything else: other pages, other players, odd parameters", () => {
    expect(nakanimeCall("/nakanime/comments?id=17")).toBeNull();
    expect(nakanimeCall("/nakanime/search?q=x")).toBeNull();
    expect(nakanimeCall("/nakanime/title?id=17&slug=../admin")).toBeNull();
    expect(nakanimeCall("/nakanime/title?id=0&slug=frieren")).toBeNull();
    expect(nakanimeCall("/nakanime/sources?id=17&season=1")).toBeNull();
    expect(nakanimeCall(resolve("https://evil.test/embed.html"))).toBeNull();
    expect(nakanimeCall(resolve("http://vidmoly.org/embed-x.html"))).toBeNull();
    expect(nakanimeCall("/nakanime/resolve?url=nope")).toBeNull();
  });
});

describe("a Nakanime request to the bridge", () => {
  it("is read in the browser when it carries the secret", async () => {
    const { nakanime, calls } = fakeNakanime();
    for (const target of [
      "/nakanime/search?q=Frieren",
      "/nakanime/title?id=17&slug=frieren",
      "/nakanime/sources?id=17&season=1&episode=1",
      resolve(PLAYER),
    ]) {
      expect((await handleBridgeRequest(get(target), deps(nakanime))).status).toBe(200);
    }
    expect(calls).toEqual(["search Frieren", "title 17 frieren", "sources 17 1 1", `resolve ${PLAYER}`]);
  });

  it("is refused without the secret, or when Nakanime is not set up", async () => {
    const { nakanime, calls } = fakeNakanime();
    expect((await handleBridgeRequest(get("/nakanime/search?q=Frieren", "nope"), deps(nakanime))).status).toBe(401);
    expect((await handleBridgeRequest(get("/nakanime/search?q=Frieren"), deps(undefined))).status).toBe(404);
    expect((await handleBridgeRequest(get("/nakanime/profile"), deps(nakanime))).status).toBe(404);
    expect(calls).toEqual([]);
  });

  it("shares the minute's budget with Naka: both sites together stay gentle", async () => {
    const { nakanime, calls } = fakeNakanime();
    const shared = deps(nakanime, new CallBudget({ max: 2, windowMs: 60_000 }));
    expect((await handleBridgeRequest(get("/naka/browse/search?q=Dune"), shared)).status).toBe(200);
    expect((await handleBridgeRequest(get("/nakanime/search?q=Frieren"), shared)).status).toBe(200);
    expect((await handleBridgeRequest(get("/nakanime/search?q=Frieren"), shared)).status).toBe(429);
    expect(calls).toHaveLength(1);
  });

  it("answers 502 when the browser cannot reach Nakanime", async () => {
    const failing: NakanimeCaller = {
      search: () => Promise.reject(new Error("browser closed")),
      title: () => Promise.reject(new Error("browser closed")),
      sources: () => Promise.reject(new Error("browser closed")),
      resolve: () => Promise.reject(new Error("browser closed")),
    };
    expect((await handleBridgeRequest(get("/nakanime/search?q=Frieren"), deps(failing))).status).toBe(502);
  });
});

describe("reading what Nakanime's app decrypted", () => {
  it("finds the search answer among everything the catalog page read", () => {
    const found = pickSearch(reads);
    expect(JSON.parse(found ?? "{}").data[0]).toMatchObject({
      id: "16",
      title: "One Piece",
      languages: ["VF", "VOSTFR"],
    });
  });

  it("finds an episode's sources, each a player page with its version", () => {
    const sources = JSON.parse(pickSources(reads) ?? "[]");
    expect(sources[0]).toMatchObject({ host: "vidmoly", language: "VOSTFR", episodeId: 11749 });
    expect(sources.some((source: { language: string }) => source.language === "VF")).toBe(true);
  });

  it("finds nothing when the app has not read it yet", () => {
    expect(pickSearch(["not json", "[]", '{"data":[]}'])).toBeNull();
    expect(pickSources(["[]", '[{"id":1}]', "{"])).toBeNull();
  });

  it("keeps the first playlist a player asks for, not its scripts or segments", () => {
    expect(isPlaylistRequest("https://prx-1.vmpx.online/hls2/01/x_,n,l,.urlset/master.m3u8?t=a")).toBe(true);
    expect(isPlaylistRequest("https://vidmoly.org/static/player.js")).toBe(false);
    expect(isPlaylistRequest("https://prx-1.vmpx.online/hls2/01/x_n/seg-1-v1-a1.ts")).toBe(false);
    expect(isPlaylistRequest("not a url")).toBe(false);
  });
});
