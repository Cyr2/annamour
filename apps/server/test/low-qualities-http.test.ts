import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Transcoder } from "../src/media/transcoder.ts";
import { FetchError, type TextFetcher } from "../src/safe-fetch.ts";
import { testApp } from "./helpers.ts";

const MASTER = "https://cdn.example/film/master.m3u8";
const fetchText: TextFetcher = async (url) => {
  if (url.href === MASTER)
    return [
      "#EXTM3U",
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="Français",URI="a/fr.m3u8"',
      '#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.640028,mp4a.40.2",AUDIO="a"',
      "v/index.m3u8",
    ].join("\n");
  if (url.href === "https://cdn.example/film/v/index.m3u8")
    return "#EXTM3U\n#EXTINF:10,\ns0.ts\n#EXTINF:10,\ns1.ts\n#EXT-X-ENDLIST";
  if (url.href === "https://cdn.example/film/a/fr.m3u8")
    return "#EXTM3U\n#EXTINF:10,\na0.aac\n#EXTINF:10,\na1.aac\n#EXTINF:10,\na2.aac\n#EXT-X-ENDLIST";
  throw new FetchError("not found", 404);
};

function setup(withTranscoder = true, ahead = 0, lighterAudio = false) {
  const dir = mkdtempSync(join(tmpdir(), "annamour-http-"));
  let slow = false;
  let audioFails = false;
  let encodes = 0;
  const probeLog = vi.fn();
  const transcoder = new Transcoder({
    dir,
    source: async () => new Uint8Array([1]),
    encode: async (_input, outputs) => {
      encodes++;
      if (slow) await new Promise((resolve) => setTimeout(resolve, 200));
      for (const output of outputs) writeFileSync(output.path, "video");
    },
    ...(lighterAudio
      ? {
          encodeAudio: async () => {
            if (audioFails) throw new Error("Audio segment is neither ADTS nor MPEG-TS");
            return new TextEncoder().encode("light audio");
          },
        }
      : {}),
    workers: 1,
    ahead,
    waitMs: 50,
    retryDelayMs: 1,
    log: () => {},
  });
  const timelineProbe = { source: async () => new Uint8Array(10), firstTimestamp: async () => 1.4, log: probeLog };
  const { app } = testApp({ fetchText, ...(withTranscoder ? { transcoder, timelineProbe } : {}) });
  const create = async () => {
    const created = await app.request("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: MASTER, title: "Film" }),
    });
    return ((await created.json()) as { code: string }).code;
  };
  return {
    app,
    create,
    slowDown: () => (slow = true),
    failAudio: () => (audioFails = true),
    dir,
    encodes: () => encodes,
    probeLog,
  };
}

describe("a séance's lighter qualities", () => {
  it("start being made as soon as the séance is created, before anyone opens it", async () => {
    const { create, encodes } = setup(true, 60);
    await create();
    await expect.poll(encodes, { timeout: 2000 }).toBe(2);
  });

  it("come with a lighter audio in each language for the lightest rungs, once it proved to work", async () => {
    const { app, create } = setup(true, 0, true);
    const code = await create();
    const fetchMaster = async () => (await app.request(`/api/rooms/${code}/e/0/hls/master.m3u8`)).text();
    await expect.poll(fetchMaster, { timeout: 2000 }).toContain('GROUP-ID="a-lo"');
    const master = await fetchMaster();
    expect(master).toContain('GROUP-ID="a-lo",NAME="Français",URI="lo-a0.m3u8"');
    expect(master).toMatch(/RESOLUTION=416x234[^\n]*AUDIO="a-lo"/);
    const playlist = await (await app.request(`/api/rooms/${code}/e/0/hls/lo-a0.m3u8`)).text();
    expect(playlist).toContain("lo-a0/00002.aac");
    // Like a player, ask again while it is being made.
    const fetchSegment = () => app.request(`/api/rooms/${code}/e/0/hls/lo-a0/00001.aac`);
    await expect.poll(async () => (await fetchSegment()).status, { timeout: 2000 }).toBe(200);
    const segment = await fetchSegment();
    expect(segment.headers.get("content-type")).toBe("audio/aac");
    expect(await segment.text()).toBe("light audio");
    expect((await app.request(`/api/rooms/${code}/e/0/hls/lo-a0/00001.ts`)).status).toBe(404);
  });

  it("never announce a lighter audio that could not be made: the lightest rungs keep the source's sound", async () => {
    const { app, create, failAudio } = setup(true, 0, true);
    failAudio();
    const code = await create();
    const master = async () => (await app.request(`/api/rooms/${code}/e/0/hls/master.m3u8`)).text();
    await master();
    // Give the check its time (it retries a few times before giving up).
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await master()).not.toContain("a-lo");
    expect(await master()).toMatch(/RESOLUTION=416x234[^\n]*AUDIO="a"/);
    expect((await app.request(`/api/rooms/${code}/e/0/hls/lo-a0.m3u8`)).status).toBe(404);
  });

  it("get a queued episode ready to start, lighter audio included, before anyone moves on to it", async () => {
    const { app, create, dir } = setup(true, 0, true);
    const code = await create();
    const added = await app.request(`/api/rooms/${code}/episodes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: MASTER, label: "É2" }),
    });
    expect(added.status).toBe(201);
    const ready = (path: string) => existsSync(join(dir, code, "1", path));
    await expect.poll(() => ready("q480/00001.ts") && ready("lo-a0/00000.aac"), { timeout: 3000 }).toBe(true);
  });

  it("are only ready once the lighter audio is too", async () => {
    const { app, create } = setup(true, 60, true);
    const code = await create();
    const prep = async () => (await (await app.request(`/api/rooms/${code}/prep`)).json()) as Record<string, number>;
    // The video is 20 s long, its audio 30 s: the shorter decides.
    await expect.poll(async () => (await prep()).readySeconds, { timeout: 2000 }).toBe(20);
  });

  it("log once how the source's audio lines up with its video", async () => {
    const { app, create, probeLog } = setup();
    const code = await create();
    await app.request(`/api/rooms/${code}/e/0/hls/master.m3u8`);
    await app.request(`/api/rooms/${code}/prep`);
    // Two lines, once per film: the timeline, then what the audio file really is.
    await expect.poll(() => probeLog.mock.calls.length).toBe(2);
    expect(probeLog.mock.calls[0]?.[0]).toMatch(/^Source timeline: video segment starts at 1.400 s/);
    expect(probeLog.mock.calls[1]?.[0]).toMatch(/^Source audio file: starts with /);
  });

  it("are listed in its master, before the source's quality", async () => {
    const { app, create } = setup();
    const code = await create();
    const master = await (await app.request(`/api/rooms/${code}/e/0/hls/master.m3u8`)).text();
    expect(master.indexOf("q480.m3u8")).toBeLessThan(master.indexOf("p1.m3u8"));
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
    // Like a player: ask again while it is being made (the test's wait is short, CI machines are slow).
    const fetchSegment = () => app.request(`/api/rooms/${code}/e/0/hls/q480/00001.ts`);
    await expect.poll(async () => (await fetchSegment()).status, { timeout: 3000 }).toBe(200);
    const segment = await fetchSegment();
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
