import { describe, expect, it, vi } from "vitest";
import { id3Timestamp } from "../src/media/audio-timeline.ts";
import { probeTimeline } from "../src/media/timeline-probe.ts";

const OWNER = "com.apple.streaming.transportStreamTimestamp";

function syncsafe(value: number): number[] {
  return [(value >> 21) & 0x7f, (value >> 14) & 0x7f, (value >> 7) & 0x7f, value & 0x7f];
}

/** A packed-audio segment's head: an ID3 tag with Apple's timestamp frame, then ADTS bytes. */
function packedAudio(pts90k: number, version = 4): Uint8Array {
  const pts = [0, 0, 0, Math.floor(pts90k / 2 ** 32) & 1, ...[24, 16, 8, 0].map((s) => (pts90k >>> s) & 0xff)];
  const body = [...new TextEncoder().encode(OWNER), 0, ...pts];
  const size = version >= 4 ? syncsafe(body.length) : [0, 0, 0, body.length];
  const frame = [...new TextEncoder().encode("PRIV"), ...size, 0, 0, ...body];
  return new Uint8Array([0x49, 0x44, 0x33, version, 0, 0, ...syncsafe(frame.length), ...frame, 0xff, 0xf1]);
}

describe("where a packed-audio segment starts", () => {
  it("reads Apple's timestamp from its ID3 tag", () => {
    expect(id3Timestamp(packedAudio(900_000))).toBe(10);
    expect(id3Timestamp(packedAudio(126_000, 3))).toBeCloseTo(1.4);
  });

  it("keeps the 33rd bit of the clock", () => {
    expect(id3Timestamp(packedAudio(2 ** 32 + 90_000))).toBeCloseTo(2 ** 32 / 90_000 + 1);
  });

  it("finds nothing without an ID3 tag, or without Apple's frame", () => {
    expect(id3Timestamp(new Uint8Array([0xff, 0xf1, 0x50, 0x80]))).toBeUndefined();
    const other = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]);
    expect(id3Timestamp(other)).toBeUndefined();
    const truncated = packedAudio(900_000).subarray(0, 40);
    expect(id3Timestamp(truncated)).toBeUndefined();
  });
});

describe("the source timeline, in the server log", () => {
  it("says where audio and video start, and the audio's bitrate", async () => {
    const log = vi.fn();
    const files: Record<string, Uint8Array> = {
      "https://cdn.test/v1.ts": new Uint8Array(3_750_000),
      "https://cdn.test/a1.aac": packedAudio(900_480),
      "https://cdn.test/a2.aac": packedAudio(1_800_960),
    };
    await probeTimeline(
      { source: async (url) => files[url.href] ?? new Uint8Array(), firstTimestamp: async () => 11.41, log },
      {
        video: "https://cdn.test/v1.ts",
        videoDuration: 10,
        audio: ["https://cdn.test/a1.aac", "https://cdn.test/a2.aac"],
        audioDuration: 10,
      },
    );
    expect(log).toHaveBeenCalledWith(
      "Source timeline: video segment starts at 11.410 s (3000 kb/s), audio ID3 timestamps 10.005 then 20.011 s, audio 0 kb/s",
    );
    // And what the audio file really is, its first bytes included.
    expect(log).toHaveBeenCalledWith(
      "Source audio file: starts with 4944330400000000003f5052, not described, first timestamp 11.410 s",
    );
  });

  it("describes the audio file with ffprobe when it can", async () => {
    const log = vi.fn();
    await probeTimeline(
      {
        source: async () => new Uint8Array([0x47, 0x40, 0x11]),
        firstTimestamp: async () => undefined,
        describe: async () => "format_name=mpegts",
        log,
      },
      {
        video: "https://cdn.test/v.ts",
        videoDuration: 10,
        audio: ["https://cdn.test/a.aac", "https://cdn.test/b.aac"],
        audioDuration: 10,
      },
    );
    expect(log).toHaveBeenLastCalledWith(
      "Source audio file: starts with 474011, format_name=mpegts, first timestamp none s",
    );
  });
});
