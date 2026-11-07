import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { HevcChecker } from "../src/media/hevc-ffmpeg.ts";
import { Transcoder } from "../src/media/transcoder.ts";
import { FetchError, type TextFetcher } from "../src/safe-fetch.ts";
import { testApp } from "./helpers.ts";
import { hevcMp4 } from "./mp4-fixtures.ts";

const MASTER = "https://cdn.example/film/master.m3u8";
const fetchText: TextFetcher = async (url) => {
  if (url.href === MASTER)
    return [
      "#EXTM3U",
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="Français",DEFAULT=YES,LANGUAGE="fr",URI="a/fr.m3u8"',
      '#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.640028,mp4a.40.2",AUDIO="a"',
      "v/index.m3u8",
    ].join("\n");
  if (url.href === "https://cdn.example/film/v/index.m3u8")
    return "#EXTM3U\n#EXTINF:10,\ns0.ts\n#EXTINF:10,\ns1.ts\n#EXT-X-ENDLIST";
  if (url.href === "https://cdn.example/film/a/fr.m3u8")
    return "#EXTM3U\n#EXTINF:10,\na0.aac\n#EXTINF:10,\na1.aac\n#EXT-X-ENDLIST";
  throw new FetchError("not found", 404);
};

const IPAD =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const CHROME = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

function setup({ hevc = true, check }: { hevc?: boolean; check?: HevcChecker } = {}) {
  const log = vi.fn();
  const transcoder = new Transcoder({
    dir: mkdtempSync(join(tmpdir(), "annamour-hevc-http-")),
    source: async () => new Uint8Array([1]),
    encode: async (_input, outputs) => {
      for (const output of outputs) writeFileSync(output.path, "h264");
    },
    encodeAudio: async () => new TextEncoder().encode("light audio"),
    ...(hevc
      ? {
          hevc: {
            encode: async (_input, outputs) => {
              for (const output of outputs) writeFileSync(output.path, hevcMp4(0));
            },
            check: check ?? (async () => ({ frameRate: 23.976 })),
            encodeAudio: async () => hevcMp4(0),
          },
        }
      : {}),
    workers: 1,
    ahead: 0,
    waitMs: 1000,
    retryDelayMs: 1,
    log: () => {},
  });
  const { app, services } = testApp({ fetchText, transcoder });
  // The service's own log: what an operator reads to know whether HEVC is offered.
  Object.assign(services.lowQualities, { log });
  const create = async () => {
    const created = await app.request("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: MASTER, title: "Film" }),
    });
    return ((await created.json()) as { code: string }).code;
  };
  const get = (path: string, userAgent: string) => app.request(path, { headers: { "user-agent": userAgent } });
  return { create, get, log };
}

describe("the HEVC rungs", () => {
  it("are offered to an iPad once real segments passed their checks, with what Safari needs", async () => {
    const { create, get } = setup();
    const code = await create();
    await get(`/api/rooms/${code}/prep`, IPAD);
    const master = async () => (await get(`/api/rooms/${code}/e/0/hls/master.m3u8`, IPAD)).text();
    await expect.poll(master, { timeout: 3000 }).toContain("h360.m3u8");
    const text = await master();
    expect(text).toContain('CODECS="hvc1.1.6.L90.B0,mp4a.40.2",FRAME-RATE=23.976,VIDEO-RANGE=SDR,AUDIO="a-hevc"');
    expect(text).toContain('GROUP-ID="a-hevc",NAME="Français",DEFAULT=YES,LANGUAGE="fr",URI="h-a0.m3u8"');
    expect(text).toContain("RESOLUTION=416x234");
  });

  it("are never shown to a browser playing through hls.js", async () => {
    const { create, get } = setup();
    const code = await create();
    await get(`/api/rooms/${code}/prep`, IPAD);
    const ipadMaster = async () => (await get(`/api/rooms/${code}/e/0/hls/master.m3u8`, IPAD)).text();
    await expect.poll(ipadMaster, { timeout: 3000 }).toContain("h360.m3u8");
    expect(await (await get(`/api/rooms/${code}/e/0/hls/master.m3u8`, CHROME)).text()).not.toContain("hvc1");
  });

  it("serve their playlists, init and fMP4 segments", async () => {
    const { create, get } = setup();
    const code = await create();
    await get(`/api/rooms/${code}/prep`, IPAD);
    await expect
      .poll(async () => (await get(`/api/rooms/${code}/e/0/hls/master.m3u8`, IPAD)).text(), { timeout: 3000 })
      .toContain("h360.m3u8");
    const playlist = await (await get(`/api/rooms/${code}/e/0/hls/h360.m3u8`, IPAD)).text();
    expect(playlist).toContain('#EXT-X-MAP:URI="h360/init.mp4"');
    const init = await get(`/api/rooms/${code}/e/0/hls/h360/init.mp4`, IPAD);
    expect(init.status).toBe(200);
    expect(init.headers.get("content-type")).toBe("video/mp4");
    const segment = await get(`/api/rooms/${code}/e/0/hls/h360/00000.m4s`, IPAD);
    expect(segment.headers.get("content-type")).toBe("video/mp4");
    expect((await get(`/api/rooms/${code}/e/0/hls/h-a0.m3u8`, IPAD)).status).toBe(200);
    expect((await get(`/api/rooms/${code}/e/0/hls/h360/00000.ts`, IPAD)).status).toBe(404);
    expect((await get(`/api/rooms/${code}/e/0/hls/q360/init.mp4`, IPAD)).status).toBe(404);
  });

  it("are never offered when their segments fail Safari's checks, and the log says so", async () => {
    const { create, get, log } = setup({
      check: async () => {
        throw new Error('HEVC segment tagged "hev1", not hvc1');
      },
    });
    const code = await create();
    await get(`/api/rooms/${code}/prep`, IPAD);
    await expect.poll(() => log.mock.calls.flat().join("\n"), { timeout: 3000 }).toContain("HEVC not offered");
    expect(await (await get(`/api/rooms/${code}/e/0/hls/master.m3u8`, IPAD)).text()).not.toContain("hvc1");
    expect((await get(`/api/rooms/${code}/e/0/hls/h360.m3u8`, IPAD)).status).toBe(404);
  });

  it("do not exist when HEVC is switched off", async () => {
    const { create, get } = setup({ hevc: false });
    const code = await create();
    await get(`/api/rooms/${code}/prep`, IPAD);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await (await get(`/api/rooms/${code}/e/0/hls/master.m3u8`, IPAD)).text()).not.toContain("hvc1");
  });
});
