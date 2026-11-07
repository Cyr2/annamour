import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SegmentEncoder } from "../src/media/ffmpeg.ts";
import { RUNGS } from "../src/media/ladder.ts";
import { Transcoder, type TranscoderOptions, type VideoTrack } from "../src/media/transcoder.ts";

const Q480 = "q480";
const Q360 = "q360";

const film = (segments = 100): VideoTrack => ({
  kind: "video",
  code: "ABCD",
  episode: 0,
  segments: Array.from({ length: segments }, (_, i) => `https://cdn.test/seg-${i}.ts`),
  rungs: RUNGS,
});

const indexOf = (url: string) => Number(/seg-(\d+)/.exec(url)?.[1]);

/** Writes each output, like ffmpeg, from what the source segment held. */
const encode: SegmentEncoder = async (input, outputs) => {
  const source = readFileSync(input, "utf8");
  for (const output of outputs) writeFileSync(output.path, `${output.rung.name}:${source}`);
};

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "annamour-media-"));
});

/** A transcoder whose source records what it fetched, and drops the first `failures` requests. */
function transcoder(overrides: Partial<TranscoderOptions> = {}, failures = 0) {
  const fetched: string[] = [];
  let failing = failures;
  const t = new Transcoder({
    dir,
    source: async (url) => {
      fetched.push(url.href);
      if (failing > 0) {
        failing--;
        throw new Error("dropped");
      }
      return new TextEncoder().encode(url.pathname);
    },
    encode,
    workers: 1,
    ahead: 3,
    waitMs: 2000,
    retryDelayMs: 5,
    log: () => {},
    ...overrides,
  });
  return { t, fetched };
}

describe("making a film's lighter qualities", () => {
  it("encodes the segment asked for, in every rung, from its source segment", async () => {
    const { t, fetched } = transcoder();
    const path = await t.segment(film(), Q480, 7);
    expect(path).toBe(join(dir, "ABCD", "0", "q480", "00007.ts"));
    expect(readFileSync(path ?? "", "utf8")).toBe("q480:/seg-7.ts");
    expect(readFileSync(join(dir, "ABCD", "0", "q360", "00007.ts"), "utf8")).toBe("q360:/seg-7.ts");
    expect(fetched[0]).toBe("https://cdn.test/seg-7.ts");
  });

  it("then prepares the next minutes, without being asked", async () => {
    const { t, fetched } = transcoder();
    await t.segment(film(), Q480, 7);
    await vi.waitFor(() => expect(fetched.map(indexOf)).toEqual([7, 8, 9, 10]));
  });

  it("serves what is already encoded without downloading it again", async () => {
    const { t, fetched } = transcoder({ ahead: 0 });
    await t.segment(film(), Q480, 2);
    expect(await t.segment(film(), Q360, 2)).toBe(join(dir, "ABCD", "0", "q360", "00002.ts"));
    expect(fetched).toHaveLength(1);
  });

  it("after a seek, prepares from the new place and drops what was queued behind", async () => {
    const { t, fetched } = transcoder({ ahead: 50 });
    t.prepareFrom(film(), 0);
    await t.segment(film(), Q480, 80);
    await vi.waitFor(() => expect(fetched.map(indexOf)).toContain(99));
    // Only what was already being made from the old place went on; the rest started at the seek.
    expect(fetched.map(indexOf).filter((index) => index < 80).length).toBeLessThanOrEqual(1);
  });

  it("tries again when the source drops, and tells the player to retry meanwhile", async () => {
    const { t } = transcoder({ ahead: 0, waitMs: 1 }, 1);
    expect(await t.segment(film(), Q480, 4)).toBeNull();
    await vi.waitFor(async () => expect(await t.segment(film(), Q480, 4)).not.toBeNull());
  });

  it("gives up on a segment that keeps failing, and says so", async () => {
    const log = vi.fn();
    const { t, fetched } = transcoder({ ahead: 0, waitMs: 5000, log }, 99);
    expect(await t.segment(film(), Q480, 1)).toBeNull();
    expect(fetched).toHaveLength(4);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("abandoned"));
  });

  it("refuses a segment the film does not have", async () => {
    const { t } = transcoder();
    expect(await t.segment(film(3), Q480, 3)).toBeNull();
    expect(await t.segment(film(3), Q480, -1)).toBeNull();
  });

  it("reports its speed in the server log", async () => {
    const log = vi.fn();
    const { t } = transcoder({ ahead: 40, log });
    t.prepareFrom(film(), 0);
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith(expect.stringMatching(/30 segments encoded/)));
  });

  it("makes a language's lighter audio from each segment and its neighbours, downloading each once", async () => {
    const heard: string[] = [];
    const { t, fetched } = transcoder({
      ahead: 2,
      encodeAudio: async ({ previous, current, next }) => {
        const text = (bytes?: Uint8Array) => (bytes ? new TextDecoder().decode(bytes) : "-");
        heard.push(`${text(previous)}|${text(current)}|${text(next)}`);
        return new TextEncoder().encode(`light:${text(current)}`);
      },
    });
    const audio = {
      kind: "audio" as const,
      code: "ABCD",
      episode: 0,
      name: "lo-a0",
      segments: ["https://cdn.test/a0.aac", "https://cdn.test/a1.aac", "https://cdn.test/a2.aac"],
    };
    const path = await t.segment(audio, "lo-a0", 0);
    expect(path).toBe(join(dir, "ABCD", "0", "lo-a0", "00000.aac"));
    expect(readFileSync(path ?? "", "utf8")).toBe("light:/a0.aac");
    await vi.waitFor(() => expect(heard).toContain("/a1.aac|/a2.aac|-"));
    expect(heard[0]).toBe("-|/a0.aac|/a1.aac");
    expect(fetched.toSorted()).toEqual(audio.segments);
    expect(await t.segment(audio, "q480", 0)).toBeNull();
  });

  it("deletes the files of séances nobody watches any more", async () => {
    const { t } = transcoder({ ahead: 0 });
    await t.segment(film(), Q480, 0);
    await t.segment({ ...film(), code: "WXYZ" }, Q480, 0);
    await t.sweep((code) => code === "WXYZ");
    expect(readdirSync(dir)).toEqual(["WXYZ"]);
  });
});
