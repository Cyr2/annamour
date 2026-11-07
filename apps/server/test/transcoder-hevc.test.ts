import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioSegments } from "../src/media/ffmpeg.ts";
import { HEVC_HIGH_RUNGS, HEVC_RUNGS } from "../src/media/hevc.ts";
import type { HevcChecker, HevcEncoder } from "../src/media/hevc-ffmpeg.ts";
import { RUNGS } from "../src/media/ladder.ts";
import { type AudioTrack, type HevcTrack, Transcoder, type TranscoderOptions } from "../src/media/transcoder.ts";
import { hevcInit, hevcMp4 } from "./mp4-fixtures.ts";

const segments = (count: number, kind: string) =>
  Array.from({ length: count }, (_, i) => `https://cdn.test/${kind}-${i}.ts`);

const hevcTrack = (count = 20): HevcTrack => ({
  kind: "hevc",
  part: "low",
  code: "ABCD",
  episode: 0,
  segments: segments(count, "video"),
  rungs: HEVC_RUNGS,
});

let dir: string;
let fetched: string[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "annamour-hevc-"));
  fetched = [];
});

/** Writes one fragmented MP4 per rung, its fragment at the segment's place on the clock. */
const encodeHevc =
  (level = 90): HevcEncoder =>
  async (input, outputs) => {
    const index = Number(/(\d{5})\.ts$/.exec(input)?.[1] ?? 0);
    for (const output of outputs) writeFileSync(output.path, hevcMp4(index * 900_900, level));
  };

const check: HevcChecker = async () => ({ frameRate: 23.976 });

function transcoder(
  hevc: Partial<NonNullable<TranscoderOptions["hevc"]>> = {},
  overrides: Partial<TranscoderOptions> = {},
) {
  return new Transcoder({
    dir,
    source: async (url) => {
      fetched.push(url.href);
      return new TextEncoder().encode(url.pathname);
    },
    encode: async (_input, outputs) => {
      for (const output of outputs) writeFileSync(output.path, "h264");
    },
    encodeAudio: async ({ current }) => current,
    hevc: {
      encode: encodeHevc(),
      check,
      encodeAudio: async ({ current }) => new Uint8Array([...hevcMp4(current.length)]),
      ...hevc,
    },
    workers: 1,
    ahead: 2,
    waitMs: 2000,
    retryDelayMs: 1,
    log: () => {},
    ...overrides,
  });
}

describe("making the HEVC rungs (Apple only)", () => {
  it("keeps each rung's init once, and only the fragments in each segment", async () => {
    const t = transcoder();
    const path = await t.segment(hevcTrack(), "h360", 3);
    expect(path).toBe(join(dir, "ABCD", "0", "h360", "00003.m4s"));
    const init = await t.init(hevcTrack(), "h360");
    expect(init?.bytes).toEqual(hevcInit());
    expect(init?.frameRate).toBe(23.976);
    expect(readFileSync(path ?? "")[4]).toBe("m".charCodeAt(0)); // starts with a moof box
    expect(existsSync(join(dir, "ABCD", "0", "h234", "00003.m4s"))).toBe(true);
  });

  it("refuses a segment whose init differs from the rung's, without trying again", async () => {
    const log = vi.fn();
    const first = transcoder({}, { log, ahead: 0 });
    await first.segment(hevcTrack(), "h360", 0);
    const changed = transcoder({ encode: encodeHevc(93) }, { log, ahead: 0 });
    expect(await changed.ensure(hevcTrack(), 1)).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/abandoned: Mp4Error: Init changed/));
    expect(fetched.filter((url) => url.endsWith("video-1.ts"))).toHaveLength(1);
  });

  it("never keeps a segment that failed Safari's checks", async () => {
    const t = transcoder({
      check: async () => {
        throw new Error("HEVC segment does not start on a key frame");
      },
    });
    expect(await t.ensure(hevcTrack(), 0)).toBe(false);
    expect(existsSync(join(dir, "ABCD", "0", "h360", "00000.m4s"))).toBe(false);
    expect(await t.init(hevcTrack(), "h360")).toBeNull();
  });

  it("makes the fMP4 audio from the same downloaded source segments as the lighter audio", async () => {
    const t = transcoder();
    const audio = (name: string, extra: Partial<AudioTrack> = {}): AudioTrack => ({
      kind: "audio",
      code: "ABCD",
      episode: 0,
      name,
      segments: segments(3, "audio"),
      ...extra,
    });
    await t.segment(audio("lo-a0"), "lo-a0", 1);
    const before = fetched.length;
    const path = await t.segment(audio("h-a0", { container: "fmp4", sourceOf: "lo-a0" }), "h-a0", 1);
    expect(path).toBe(join(dir, "ABCD", "0", "h-a0", "00001.m4s"));
    expect(fetched).toHaveLength(before);
    expect(await t.init(audio("h-a0", { container: "fmp4" }), "h-a0")).not.toBeNull();
  });

  it("prepares HEVC only behind the H.264 rungs, which never wait for it", async () => {
    const t = transcoder({}, { ahead: 3 });
    t.prepareFrom(hevcTrack(), 0);
    t.prepareFrom({ kind: "video", code: "ABCD", episode: 0, segments: segments(20, "video"), rungs: RUNGS }, 10);
    await vi.waitFor(() => expect(fetched).toHaveLength(6));
    // The first HEVC job had already started; then the three H.264 segments, then HEVC again.
    expect(fetched.slice(1, 4)).toEqual(["video-10", "video-11", "video-12"].map((s) => `https://cdn.test/${s}.ts`));
  });

  it("runs one x265 at a time, so the H.264 rungs always keep a worker of their own", async () => {
    const running = { hevc: 0, most: 0 };
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const t = transcoder(
      {
        encode: async (input, outputs) => {
          running.hevc++;
          running.most = Math.max(running.most, running.hevc);
          await gate;
          running.hevc--;
          await encodeHevc()(input, outputs);
        },
      },
      { workers: 3, ahead: 4 },
    );
    const high: HevcTrack = { ...hevcTrack(), part: "high", rungs: HEVC_HIGH_RUNGS };
    t.prepareFrom(hevcTrack(), 0);
    t.prepareFrom(high, 0);
    await vi.waitFor(() => expect(running.hevc).toBe(1));
    // HEVC holds one worker; a player waiting for H.264 is served at once by another.
    const h264 = { kind: "video", code: "ABCD", episode: 0, segments: segments(20, "video"), rungs: RUNGS } as const;
    expect(await t.segment(h264, "q360", 5)).toBe(join(dir, "ABCD", "0", "q360", "00005.ts"));
    expect(running.most).toBe(1);
    release();
    await vi.waitFor(() => expect(existsSync(join(dir, "ABCD", "0", "h720", "00003.m4s"))).toBe(true));
    expect(running.most).toBe(1);
  });

  it("serves a player waiting for H.264 before one waiting for HEVC", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const t = transcoder(
      {},
      {
        ahead: 0,
        encode: async (_input, outputs) => {
          await gate;
          for (const output of outputs) writeFileSync(output.path, "h264");
        },
      },
    );
    const h264 = { kind: "video", code: "ABCD", episode: 0, segments: segments(20, "video"), rungs: RUNGS } as const;
    // A first job holds the only worker, so both requests queue up behind it.
    void t.segment(h264, "q360", 0);
    await vi.waitFor(() => expect(fetched).toHaveLength(1));
    const hevc = t.segment(hevcTrack(), "h360", 7);
    const video = t.segment(h264, "q360", 9);
    await new Promise((resolve) => setTimeout(resolve, 50));
    release();
    await Promise.all([hevc, video]);
    expect(fetched.indexOf("https://cdn.test/video-9.ts")).toBeLessThan(
      fetched.lastIndexOf("https://cdn.test/video-7.ts"),
    );
  });

  it("repackages the source's sound for the higher rungs, from that one source segment", async () => {
    const sourceAudio = vi.fn(async ({ current, previous, next }: AudioSegments) => {
      expect([previous, next]).toEqual([undefined, undefined]);
      return hevcMp4(current.length);
    });
    const t = transcoder({ sourceAudio }, { ahead: 0 });
    expect(t.makesFullHevc).toBe(true);
    const track: AudioTrack = {
      ...{ kind: "audio", code: "ABCD", episode: 0, name: "hs-a0", container: "fmp4", sound: "source" },
      ...{ sourceOf: "lo-a0", segments: segments(3, "audio") },
    };
    expect(await t.segment(track, "hs-a0", 1)).toBe(join(dir, "ABCD", "0", "hs-a0", "00001.m4s"));
    expect(sourceAudio).toHaveBeenCalledOnce();
    expect(fetched).toEqual(["https://cdn.test/audio-1.ts"]);
    expect(transcoder().makesFullHevc).toBe(false);
  });

  it("says how long HEVC segments take in the speed line", async () => {
    const log = vi.fn();
    const t = transcoder({}, { log, ahead: 30 });
    t.prepareFrom(hevcTrack(40), 0);
    await vi.waitFor(
      () => expect(log).toHaveBeenCalledWith(expect.stringMatching(/\(HEVC: 30 segments, \d+ ms each\)/)),
      { timeout: 5000 },
    );
  });

  it("makes no HEVC without its encoder", async () => {
    const t = new Transcoder({
      dir,
      source: async () => new Uint8Array(),
      encode: async () => {},
      log: () => {},
      retryDelayMs: 1,
    });
    expect(t.makesHevc).toBe(false);
    expect(await t.ensure(hevcTrack(), 0)).toBe(false);
  });
});
