import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { FetchError, type TextFetcher } from "../src/safe-fetch.ts";
import { testApp, testServices } from "./helpers.ts";

const MASTER = "https://cdn.example/movie/master.m3u8";
const okFetch: TextFetcher = async (url) => {
  if (url.href === MASTER) return "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nv/playlist.m3u8";
  if (url.href.endsWith("/v/playlist.m3u8")) return "#EXTM3U\n#EXTINF:10,\ns0.ts\n#EXT-X-ENDLIST";
  if (url.href.endsWith("/subs_fre.vtt")) return "WEBVTT\n\n00:01.000 --> 00:02.000\nSalut";
  throw new FetchError("not found", 404);
};

function post(app: ReturnType<typeof createApp>, body: string, ip = "203.0.113.7") {
  return app.request("/api/rooms", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${ip}, 10.0.0.1` },
    body,
  });
}

async function errorOf(response: Response): Promise<string> {
  return ((await response.json()) as { error: string }).error;
}

describe("creating a room: what the person is told", () => {
  it("rejects a body that is not JSON", async () => {
    const app = testApp({ fetchText: okFetch }).app;
    const response = await post(app, "{oops");
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toMatch(/m3u8/);
  });

  it("explains an unreachable link and a link that is not a video", async () => {
    const notFound: TextFetcher = async () => {
      throw new FetchError("gone", 404);
    };
    const notHls: TextFetcher = async () => "<html>login</html>";
    const unreachable = await post(testApp({ fetchText: notFound }).app, JSON.stringify({ url: MASTER }));
    expect(unreachable.status).toBe(422);
    expect(await errorOf(unreachable)).toBe("Impossible d'ouvrir ce lien.");

    const notVideo = await post(testApp({ fetchText: notHls }).app, JSON.stringify({ url: MASTER }));
    expect(notVideo.status).toBe(422);
    expect(await errorOf(notVideo)).toBe("Ce lien ne mène pas à une vidéo lisible.");
  });

  it("does not hide unexpected failures", async () => {
    const broken: TextFetcher = async () => {
      throw new TypeError("bug");
    };
    const response = await post(testApp({ fetchText: broken }).app, JSON.stringify({ url: MASTER }));
    expect(response.status).toBe(500);
  });

  it("limits how many rooms one address can create per minute", async () => {
    let now = 0;
    const app = testApp({ fetchText: okFetch, now: () => now }).app;
    for (let i = 0; i < 10; i++) expect((await post(app, JSON.stringify({ url: MASTER }))).status).toBe(201);
    const limited = await post(app, JSON.stringify({ url: MASTER }));
    expect(limited.status).toBe(429);
    expect((await post(app, JSON.stringify({ url: MASTER }), "198.51.100.2")).status).toBe(201);
    now = 61_000;
    expect((await post(app, JSON.stringify({ url: MASTER }))).status).toBe(201);
  });
});

describe("room files", () => {
  it("serves subtitles and answers 404 for anything unknown", async () => {
    const app = testApp({ fetchText: okFetch }).app;
    const { code } = (await (await post(app, JSON.stringify({ url: MASTER }))).json()) as { code: string };

    const subs = await app.request(`/api/rooms/${code}/subs/subs_fre.vtt`);
    expect(subs.headers.get("content-type")).toContain("text/vtt");
    expect(await subs.text()).toContain("Salut");

    expect((await app.request(`/api/rooms/${code}/subs/subs_eng.vtt`)).status).toBe(404);
    expect((await app.request(`/api/rooms/${code}/hls/p9.m3u8`)).status).toBe(404);
    expect((await app.request("/api/rooms/abcd")).status).toBe(404);
    expect((await app.request("/api/nothing")).status).toBe(404);
  });
});

describe("serving the built app", () => {
  let dist: string;

  beforeAll(async () => {
    dist = await mkdtemp(join(tmpdir(), "annamour-dist-"));
    await mkdir(join(dist, "assets"));
    await writeFile(join(dist, "index.html"), "<!doctype html><title>Annamour</title>");
    await writeFile(join(dist, "assets", "app.js"), "console.info('hi')");
  });

  afterAll(() => rm(dist, { recursive: true, force: true }));

  it("caches hashed assets forever and falls back to the app for client routes", async () => {
    const app = createApp(testServices(), { webDist: dist });

    const asset = await app.request("/assets/app.js");
    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toContain("immutable");

    const route = await app.request("/s/YWEK");
    expect(route.status).toBe(200);
    expect(route.headers.get("cache-control")).toBe("no-cache");
    expect(await route.text()).toContain("<title>Annamour</title>");

    expect((await app.request("/api/health")).status).toBe(200);
  });
});
