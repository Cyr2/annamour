import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Transcoder } from "../src/media/transcoder.ts";
import { FetchError, type TextFetcher } from "../src/safe-fetch.ts";
import { IN_USE_MS, KEEP_AFTER_LAST_USE_MS } from "../src/services/low-quality-service.ts";
import { testApp } from "./helpers.ts";

const MASTER = "https://cdn.example/film/master.m3u8";
const fetchText: TextFetcher = async (url) => {
  if (url.href === MASTER)
    return '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.640028,mp4a.40.2"\nv/index.m3u8';
  if (url.href === "https://cdn.example/film/v/index.m3u8") return "#EXTM3U\n#EXTINF:10,\ns0.ts\n#EXT-X-ENDLIST";
  throw new FetchError("not found", 404);
};

const MINUTE = 60 * 1000;

function setup(mediaMaxBytes?: number) {
  const dir = mkdtempSync(join(tmpdir(), "annamour-storage-"));
  let encodes = 0;
  const transcoder = new Transcoder({
    dir,
    source: async () => new Uint8Array([1]),
    encode: async (_input, outputs) => {
      for (const output of outputs) writeFileSync(output.path, "video");
      encodes++;
    },
    ahead: 1,
    log: () => {},
  });
  const clock = { now: 0 };
  // Spied before the services are made: they keep the logger they were given.
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const { app, services } = testApp({
    fetchText,
    transcoder,
    now: () => clock.now,
    ...(mediaMaxBytes ? { mediaMaxBytes } : {}),
  });
  /** A séance opened now, its first segment encoded, plus an init file of `bytes`. */
  const watch = async (bytes = 0) => {
    const created = await app.request("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: MASTER, title: "Film" }),
    });
    const { code } = (await created.json()) as { code: string };
    const before = encodes;
    await expect.poll(() => encodes).toBe(before + 1);
    writeFileSync(join(dir, code, "0", "q234", "init.mp4"), "x".repeat(bytes));
    return code;
  };
  return { dir, clock, watch, sweep: () => services.lowQualities.sweep(), log };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the lighter qualities kept on disk", () => {
  it("go with séances nobody has watched for six hours, and stay whole, init files included, until then", async () => {
    const { dir, clock, watch, sweep } = setup();
    await watch();
    clock.now = KEEP_AFTER_LAST_USE_MS / 2;
    const recent = await watch();
    clock.now = KEEP_AFTER_LAST_USE_MS + 1;
    await sweep();
    expect(readdirSync(dir)).toEqual([recent]);
    expect(readdirSync(join(dir, recent, "0", "q234")).toSorted()).toEqual(["00000.ts", "init.mp4"]);
  });

  it("past the cap, lose the séances watched longest ago first, whole", async () => {
    const { dir, clock, watch, sweep, log } = setup(1000);
    await watch(400);
    clock.now = 10 * MINUTE;
    const older = await watch(400);
    clock.now = IN_USE_MS + 20 * MINUTE;
    const watched = await watch(400);
    await sweep();
    expect(readdirSync(dir).toSorted()).toEqual([older, watched].toSorted());
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/for 2 séance\(s\).*1 older séance\(s\) deleted/));
  });

  it("never lose a séance being watched, even over the cap", async () => {
    const { dir, clock, watch, sweep } = setup(500);
    const first = await watch(400);
    clock.now = 5 * MINUTE;
    const second = await watch(400);
    await sweep();
    expect(readdirSync(dir).toSorted()).toEqual([first, second].toSorted());
  });

  it("are reported in the server log at each sweep, with the cap", async () => {
    const { watch, sweep, log } = setup();
    await watch();
    await sweep();
    expect(log).toHaveBeenCalledWith("Lighter qualities on disk: 0.0 GB for 1 séance(s), cap 50.0 GB");
  });
});
