import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteFilm,
  downloadFilm,
  FILM_CACHE,
  filmBandwidth,
  isFilmDownloaded,
  NotEnoughSpaceError,
  onFilmsChanged,
} from "./film-cache.ts";

const ROOM = "https://annamour.test/api/rooms/ABCD/e/0/hls/";
const SRC = `${ROOM}master.m3u8`;
const CDN = "https://cdn.test/film/";

const PLAYLISTS: Record<string, string> = {
  "master.m3u8": `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="Français",URI="p0.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=3000000,AUDIO="a"
p1.m3u8`,
  "p0.m3u8": `#EXTM3U\n#EXTINF:10,\n${CDN}audio-0.aac\n#EXTINF:10,\n${CDN}audio-1.aac`,
  "p1.m3u8": `#EXTM3U\n#EXTINF:10,\n${CDN}video-0.ts\n#EXTINF:10,\n${CDN}video-1.ts\n#EXTINF:10,\n${CDN}video-2.ts`,
};

/** Cache Storage, in memory. */
class FakeCache {
  readonly files = new Map<string, Response>();
  async match(url: string) {
    return this.files.get(url)?.clone();
  }
  async put(url: string, response: Response) {
    this.files.set(url, response);
  }
  async delete(url: string) {
    return this.files.delete(url);
  }
}

let cache: FakeCache;
/** CDN files that fail this many more times before answering. */
let failures: Map<string, number>;
let fetched: string[];

function serve(url: string): Response {
  fetched.push(url);
  if (url.startsWith(ROOM)) return new Response(PLAYLISTS[url.slice(ROOM.length)] ?? "", { status: 200 });
  const left = failures.get(url) ?? 0;
  if (left > 0) {
    failures.set(url, left - 1);
    return new Response("", { status: 503 });
  }
  return new Response(new Uint8Array(1000), { status: 200 });
}

beforeEach(() => {
  cache = new FakeCache();
  failures = new Map();
  fetched = [];
  localStorage.clear();
  vi.stubGlobal("caches", { open: async (name: string) => (name === FILM_CACHE ? cache : new FakeCache()) });
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    if (init?.signal?.aborted) throw new DOMException("stopped", "AbortError");
    return serve(String(input));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const run = (signal = new AbortController().signal, onProgress = vi.fn()) =>
  downloadFilm(SRC, { signal, onProgress }).then(() => onProgress);

describe("downloading a film onto the device", () => {
  it("stores every video and audio file, then remembers the film is here", async () => {
    const changed = vi.fn();
    onFilmsChanged(changed);
    const onProgress = await run();
    expect([...cache.files.keys()].sort()).toEqual(
      ["audio-0.aac", "audio-1.aac", "video-0.ts", "video-1.ts", "video-2.ts"].map((f) => CDN + f),
    );
    expect(onProgress).toHaveBeenLastCalledWith({ done: 5, total: 5, bytes: 5000 });
    expect(isFilmDownloaded(SRC)).toBe(true);
    expect(changed).toHaveBeenCalled();
  });

  it("resumes where it stopped, without downloading again what is already stored", async () => {
    await cache.put(`${CDN}video-0.ts`, new Response("x", { headers: { "content-length": "1000" } }));
    const onProgress = await run();
    expect(fetched).not.toContain(`${CDN}video-0.ts`);
    expect(onProgress).toHaveBeenLastCalledWith({ done: 5, total: 5, bytes: 5000 });
  });

  it("retries a file the network dropped", async () => {
    vi.useFakeTimers();
    failures.set(`${CDN}video-1.ts`, 1);
    const done = run();
    await vi.runAllTimersAsync();
    await done;
    expect(cache.files.has(`${CDN}video-1.ts`)).toBe(true);
  });

  it("stops when asked, and the film is not counted as downloaded", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(run(controller.signal)).rejects.toBeDefined();
    expect(isFilmDownloaded(SRC)).toBe(false);
  });

  it("refuses to start when the film cannot fit on the device", async () => {
    vi.stubGlobal("navigator", { storage: { estimate: async () => ({ quota: 1000, usage: 900 }) } });
    await expect(
      downloadFilm(SRC, { signal: new AbortController().signal, expectedBytes: 5000, onProgress: vi.fn() }),
    ).rejects.toBeInstanceOf(NotEnoughSpaceError);
    expect(cache.files.size).toBe(0);
  });

  it("tells the film's bitrate from its master playlist", async () => {
    expect(await filmBandwidth(SRC)).toBe(3_000_000);
  });

  it("frees the space and forgets the film once deleted", async () => {
    await run();
    await deleteFilm(SRC);
    expect(cache.files.size).toBe(0);
    expect(isFilmDownloaded(SRC)).toBe(false);
  });
});
