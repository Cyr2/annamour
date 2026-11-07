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
/** Safari's own player, as it fetches playlists and segments. */
const PLAYER = "AppleCoreMedia/1.0.0.22A3354 (iPad; U; CPU OS 18_0 like Mac OS X; fr_fr)";

function setup({ hevc = true, full = false, check }: { hevc?: boolean; full?: boolean; check?: HevcChecker } = {}) {
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
            ...(full ? { sourceAudio: async () => hevcMp4(0) } : {}),
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
    const master = async () => (await get(`/api/rooms/${code}/e/0/hls/master.m3u8`, PLAYER)).text();
    await expect.poll(master, { timeout: 3000 }).toContain("h360.m3u8");
    const text = await master();
    expect(text).toContain('CODECS="hvc1.1.6.L90.B0,mp4a.40.2",FRAME-RATE=23.976,VIDEO-RANGE=SDR,AUDIO="a-hevc"');
    expect(text).toContain('GROUP-ID="a-hevc",NAME="Français",DEFAULT=YES,LANGUAGE="fr",URI="h-a0.m3u8"');
    expect(text).toContain("RESOLUTION=416x234");
  });

  it("are never shown to a page playing through hls.js, even Safari's (the iPad's own-player choice)", async () => {
    const { create, get } = setup();
    const code = await create();
    await get(`/api/rooms/${code}/prep`, IPAD);
    const playerMaster = async () => (await get(`/api/rooms/${code}/e/0/hls/master.m3u8`, PLAYER)).text();
    await expect.poll(playerMaster, { timeout: 3000 }).toContain("h360.m3u8");
    for (const page of [CHROME, IPAD]) {
      expect(await (await get(`/api/rooms/${code}/e/0/hls/master.m3u8`, page)).text(), page).not.toContain("hvc1");
    }
  });

  it("serve their playlists, init and fMP4 segments", async () => {
    const { create, get } = setup();
    const code = await create();
    await get(`/api/rooms/${code}/prep`, IPAD);
    await expect
      .poll(async () => (await get(`/api/rooms/${code}/e/0/hls/master.m3u8`, PLAYER)).text(), { timeout: 3000 })
      .toContain("h360.m3u8");
    const playlist = await (await get(`/api/rooms/${code}/e/0/hls/h360.m3u8`, PLAYER)).text();
    expect(playlist).toContain('#EXT-X-MAP:URI="h360/init.mp4"');
    const init = await get(`/api/rooms/${code}/e/0/hls/h360/init.mp4`, PLAYER);
    expect(init.status).toBe(200);
    expect(init.headers.get("content-type")).toBe("video/mp4");
    const segment = await get(`/api/rooms/${code}/e/0/hls/h360/00000.m4s`, PLAYER);
    expect(segment.headers.get("content-type")).toBe("video/mp4");
    expect((await get(`/api/rooms/${code}/e/0/hls/h-a0.m3u8`, PLAYER)).status).toBe(200);
    expect((await get(`/api/rooms/${code}/e/0/hls/h360/00000.ts`, PLAYER)).status).toBe(404);
    expect((await get(`/api/rooms/${code}/e/0/hls/q360/init.mp4`, PLAYER)).status).toBe(404);
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
    expect(await (await get(`/api/rooms/${code}/e/0/hls/master.m3u8`, PLAYER)).text()).not.toContain("hvc1");
    expect((await get(`/api/rooms/${code}/e/0/hls/h360.m3u8`, PLAYER)).status).toBe(404);
  });

  it("do not exist when HEVC is switched off, whoever asks", async () => {
    const { create, get } = setup({ hevc: false });
    const code = await create();
    await get(`/api/rooms/${code}/prep?hevc=1`, IPAD);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await (await get(`/api/rooms/${code}/e/0/hls/master.m3u8?hevc=1`, IPAD)).text()).not.toContain("hvc1");
  });

  it("do not exist when HEVC is switched off", async () => {
    const { create, get } = setup({ hevc: false });
    const code = await create();
    await get(`/api/rooms/${code}/prep`, IPAD);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await (await get(`/api/rooms/${code}/e/0/hls/master.m3u8`, PLAYER)).text()).not.toContain("hvc1");
  });
});

describe("the complete HEVC ladder (our iPad player, HEVC_FULL=on)", () => {
  const LADDER = "?hevc=1";
  type Get = (path: string, userAgent: string) => Response | Promise<Response>;
  const ladderMaster = async (get: Get, code: string, userAgent = IPAD) =>
    (await get(`/api/rooms/${code}/e/0/hls/master.m3u8${LADDER}`, userAgent)).text();

  async function offered(options: Parameters<typeof setup>[0] = { full: true }) {
    const context = setup(options);
    const code = await context.create();
    await context.get(`/api/rooms/${code}/prep${LADDER}`, IPAD);
    return { ...context, code };
  }

  it("is given alone to our player on an iPad that asks, once both its parts passed their checks", async () => {
    const { get, log, code } = await offered();
    await expect.poll(() => ladderMaster(get, code), { timeout: 3000 }).toContain("h720.m3u8");
    const text = await ladderMaster(get, code);
    for (const name of ["h480", "h540", "h720", "h360", "h288", "h234"]) expect(text).toContain(`\n${name}.m3u8`);
    expect(text).not.toMatch(/avc1|q\d+\.m3u8|v\/index\.m3u8|a\/fr\.m3u8/);
    expect(text).toContain('GROUP-ID="a-hevc-src",NAME="Français",DEFAULT=YES,LANGUAGE="fr",URI="hs-a0.m3u8"');
    expect(text).toMatch(/RESOLUTION=1280x720,CODECS="hvc1\.1\.6\.L90\.B0,mp4a\.40\.2",[^\n]*AUDIO="a-hevc-src"/);
    expect(log.mock.calls.flat().join("\n")).toContain("HEVC offered to our iPad player (complete ladder)");
  });

  it("is never given to Chrome or the Android TV app, even asking, nor to a page that did not ask", async () => {
    const { get, code } = await offered();
    await expect.poll(() => ladderMaster(get, code), { timeout: 3000 }).toContain("h720.m3u8");
    expect(await ladderMaster(get, code, CHROME)).not.toContain("hvc1");
    expect(await (await get(`/api/rooms/${code}/e/0/hls/master.m3u8`, IPAD)).text()).not.toContain("hvc1");
    // Safari's own player keeps its H.264 ladder with the lowest HEVC rungs beside it.
    const player = await (await get(`/api/rooms/${code}/e/0/hls/master.m3u8`, PLAYER)).text();
    expect(player).toContain("h360.m3u8");
    expect(player).toContain("avc1");
    expect(player).not.toContain("h720.m3u8");
  });

  it("serves the higher rungs and the source's sound in fMP4", async () => {
    const { get, code } = await offered();
    await expect.poll(() => ladderMaster(get, code), { timeout: 3000 }).toContain("h720.m3u8");
    const playlist = await (await get(`/api/rooms/${code}/e/0/hls/h720.m3u8`, IPAD)).text();
    expect(playlist).toContain('#EXT-X-MAP:URI="h720/init.mp4"');
    expect((await get(`/api/rooms/${code}/e/0/hls/h720/init.mp4`, IPAD)).status).toBe(200);
    const segment = await get(`/api/rooms/${code}/e/0/hls/h720/00001.m4s`, IPAD);
    expect(segment.headers.get("content-type")).toBe("video/mp4");
    expect((await get(`/api/rooms/${code}/e/0/hls/hs-a0.m3u8`, IPAD)).status).toBe(200);
    expect((await get(`/api/rooms/${code}/e/0/hls/hs-a0/00000.m4s`, IPAD)).status).toBe(200);
  });

  it("keeps the H.264 ladder while its higher rungs fail their checks, and the log says so", async () => {
    const { get, log, code } = await offered({
      full: true,
      check: async (_source, output) => {
        if (output.includes("h720")) throw new Error("HEVC segment does not start on a key frame");
        return { frameRate: 23.976 };
      },
    });
    await expect
      .poll(() => log.mock.calls.flat().join("\n"), { timeout: 3000 })
      .toContain("HEVC not offered to our iPad player (complete ladder)");
    const text = await ladderMaster(get, code);
    expect(text).not.toContain("hvc1");
    expect(text).toContain("avc1");
    expect((await get(`/api/rooms/${code}/e/0/hls/h720.m3u8`, IPAD)).status).toBe(404);
  });

  it("does not exist without HEVC_FULL: the flag then changes nothing", async () => {
    const { get, code } = await offered({});
    await expect
      .poll(async () => (await get(`/api/rooms/${code}/e/0/hls/master.m3u8`, PLAYER)).text(), { timeout: 3000 })
      .toContain("h360.m3u8");
    expect(await ladderMaster(get, code)).not.toContain("hvc1");
  });
});
