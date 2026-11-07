import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Transcoder } from "../src/media/transcoder.ts";
import { FetchError, type TextFetcher } from "../src/safe-fetch.ts";
import { testApp } from "./helpers.ts";

const MASTER = "https://cdn.example/film/master.m3u8";
const fetchText: TextFetcher = async (url) => {
  if (url.href === MASTER)
    return '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.640028,mp4a.40.2"\nv/index.m3u8';
  if (url.href === "https://cdn.example/film/v/index.m3u8")
    return "#EXTM3U\n#EXTINF:10,\ns0.ts\n#EXTINF:10,\ns1.ts\n#EXT-X-ENDLIST";
  throw new FetchError("not found", 404);
};

function setup(withTranscoder = true, ahead = 0) {
  const dir = mkdtempSync(join(tmpdir(), "annamour-http-"));
  let slow = false;
  const transcoder = new Transcoder({
    dir,
    source: async () => new Uint8Array([1]),
    encode: async (_input, outputs) => {
      if (slow) await new Promise((resolve) => setTimeout(resolve, 200));
      for (const output of outputs) writeFileSync(output.path, "video");
    },
    workers: 1,
    ahead,
    waitMs: 50,
    log: () => {},
  });
  const { app } = testApp({ fetchText, ...(withTranscoder ? { transcoder } : {}) });
  const create = async () => {
    const created = await app.request("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: MASTER, title: "Film" }),
    });
    return ((await created.json()) as { code: string }).code;
  };
  return { app, create, slowDown: () => (slow = true) };
}

describe("a séance's lighter qualities", () => {
  it("are listed in its master, before the source's quality", async () => {
    const { app, create } = setup();
    const code = await create();
    const master = await (await app.request(`/api/rooms/${code}/e/0/hls/master.m3u8`)).text();
    expect(master.indexOf("q480.m3u8")).toBeLessThan(master.indexOf("p0.m3u8"));
    expect(master).toContain("q360.m3u8");
  });

  it("each have a playlist on the source's segments", async () => {
    const { app, create } = setup();
    const code = await create();
    const playlist = await (await app.request(`/api/rooms/${code}/e/0/hls/q360.m3u8`)).text();
    expect(playlist).toContain("q360/00001.ts");
  });

  it("serve an encoded segment as video", async () => {
    const { app, create } = setup();
    const code = await create();
    const segment = await app.request(`/api/rooms/${code}/e/0/hls/q480/00001.ts`);
    expect(segment.status).toBe(200);
    expect(segment.headers.get("content-type")).toBe("video/mp2t");
    expect(await segment.text()).toBe("video");
  });

  it("ask the player to retry while a segment is still being made", async () => {
    const { app, create, slowDown } = setup();
    const code = await create();
    slowDown();
    const segment = await app.request(`/api/rooms/${code}/e/0/hls/q480/00000.ts`);
    expect(segment.status).toBe(503);
    expect(segment.headers.get("retry-after")).toBe("2");
  });

  it("refuse what does not exist", async () => {
    const { app, create } = setup();
    const code = await create();
    for (const path of ["q480/00009.ts", "q720/00000.ts", "q480/evil.ts", "p0/00000.ts"]) {
      const status = (await app.request(`/api/rooms/${code}/e/0/hls/${path}`)).status;
      expect([404, 503], path).toContain(status);
    }
    expect((await app.request(`/api/rooms/${code}/e/x/hls/q480/00000.ts`)).status).toBe(404);
    expect((await app.request(`/api/rooms/${code}/e/0/hls/q720/00000.ts`)).status).toBe(404);
  });

  it("tell the salon how ready they are, and start being made as soon as it asks", async () => {
    const { app, create } = setup(true, 60);
    const code = await create();
    const prep = async () => (await (await app.request(`/api/rooms/${code}/prep`)).json()) as Record<string, unknown>;
    // The whole film is 20 s here: that is all there is to prepare.
    expect(await prep()).toMatchObject({ available: true, targetSeconds: 20 });
    await expect.poll(async () => (await prep()).readySeconds, { timeout: 2000 }).toBe(20);
  });

  it("say there is nothing to prepare without ffmpeg, and that an unknown séance does not exist", async () => {
    const { app, create } = setup(false);
    const code = await create();
    const status = await (await app.request(`/api/rooms/${code}/prep`)).json();
    expect(status).toEqual({ available: false, readySeconds: 0, targetSeconds: 60 });
    expect((await app.request("/api/rooms/ZZZZ/prep")).status).toBe(404);
  });

  it("are not offered without ffmpeg: the master stays the source's", async () => {
    const { app, create } = setup(false);
    const code = await create();
    const master = await (await app.request(`/api/rooms/${code}/e/0/hls/master.m3u8`)).text();
    expect(master).not.toContain("q480");
    expect((await app.request(`/api/rooms/${code}/e/0/hls/q480/00000.ts`)).status).toBe(404);
  });
});
