import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { joinBytes, splitAdts } from "../src/media/adts.ts";
import { ffmpegAudioEncoder, ffmpegAvailable, ffmpegEncoder } from "../src/media/ffmpeg.ts";
import { RUNGS } from "../src/media/ladder.ts";

/*
 * The real thing, where ffmpeg is installed (the Docker image, CI runners):
 * a rung encoded from a lone source segment must start at the same instant as
 * that segment, or players would stutter when switching quality.
 */
const installed = await ffmpegAvailable();

/** When the first audio packet of a file plays (seconds). */
function firstVideoTimeOf(file: string): number {
  const out = execFileSync("ffprobe", [
    ...["-v", "error", "-select_streams", "a:0", "-show_entries", "packet=pts_time"],
    ...["-read_intervals", "%+#1", "-of", "csv=p=0", file],
  ]);
  return Number.parseFloat(out.toString());
}

function firstVideoTime(file: string): number {
  const out = execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "packet=pts_time",
    "-read_intervals",
    "%+#1",
    "-of",
    "csv=p=0",
    file,
  ]);
  return Number.parseFloat(out.toString());
}

describe.skipIf(!installed)("encoding a real segment", () => {
  it("makes every rung on the source segment's own timestamps", async () => {
    const dir = mkdtempSync(join(tmpdir(), "annamour-ffmpeg-"));
    const source = join(dir, "source.ts");
    // A 720p segment that, like the 2nd of a film, starts 10 s in.
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=1280x720:rate=24",
      "-t",
      "4",
      "-c:v",
      "libx264",
      "-g",
      "48",
      "-output_ts_offset",
      "10",
      "-f",
      "mpegts",
      source,
    ]);
    const outputs = RUNGS.map((rung) => ({ rung, path: join(dir, `${rung.name}.ts`) }));
    await ffmpegEncoder(source, outputs);
    for (const output of outputs) expect(firstVideoTime(output.path)).toBeCloseTo(firstVideoTime(source), 1);
    // Four rungs on a 2-core CI runner take a few seconds; the server has many more cores.
  }, 60_000);
});

/** Decodes an ADTS stream (or anything ffmpeg reads, given its input format) to mono 16-bit samples. */
function decode(file: string, format = "aac"): Int16Array {
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-f", format, "-i", file, "-ac", "1", "-f", "s16le", "-"], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
}

/** How many AAC frames an MPEG-TS audio segment holds. */
function tsFrames(file: string): number {
  const adts = execFileSync("ffmpeg", ["-v", "error", "-f", "mpegts", "-i", file, "-c:a", "copy", "-f", "adts", "-"]);
  return splitAdts(new Uint8Array(adts)).frames.length;
}

describe.skipIf(!installed)("making a real MPEG-TS audio segment lighter (what Naka's `.aac` files may be)", () => {
  it("keeps the source's timestamp and frames, and plays at its very time between its neighbours", async () => {
    const dir = mkdtempSync(join(tmpdir(), "annamour-tsaudio-"));
    const noise = "anoisesrc=color=white:seed=11:amplitude=0.5:sample_rate=48000:duration=32";
    // Cut like a CDN would: 10 s audio-only MPEG-TS segments on one continuous clock.
    execFileSync("ffmpeg", [
      ...["-v", "error", "-f", "lavfi", "-i", noise, "-ac", "2", "-c:a", "aac", "-b:a", "128k"],
      ...["-f", "segment", "-segment_time", "10", "-segment_format", "mpegts", join(dir, "seg%d.ts")],
    ]);
    const segment = (i: number) => new Uint8Array(readFileSync(join(dir, `seg${i}.ts`)));

    const lighter = await ffmpegAudioEncoder({ previous: segment(0), current: segment(1), next: segment(2) }, dir);
    const lighterFile = join(dir, "lighter.ts");
    writeFileSync(lighterFile, lighter);

    const sourceStart = firstVideoTimeOf(join(dir, "seg1.ts"));
    expect(firstVideoTimeOf(lighterFile)).toBeCloseTo(sourceStart, 3);
    expect(tsFrames(lighterFile)).toBe(tsFrames(join(dir, "seg1.ts")));
    // Lighter for real: ~64 kb/s of AAC, with the MPEG-TS wrapping kept small (frames grouped per PES).
    // One frame per PES once doubled it to ~150 kb/s, heavier than the source it replaced.
    const seconds = (tsFrames(lighterFile) * 1024) / 48_000;
    expect((lighter.byteLength * 8) / seconds / 1000).toBeLessThan(95);

    const played = join(dir, "played.ts");
    writeFileSync(played, joinBytes([segment(0), lighter, segment(2)]));
    const original = join(dir, "original.ts");
    writeFileSync(original, joinBytes([segment(0), segment(1), segment(2)]));
    const expected = decode(original, "mpegts");
    const heard = decode(played, "mpegts");
    const start = Math.round((sourceStart - firstVideoTimeOf(join(dir, "seg0.ts"))) * 48_000);
    const lags = [start + 2048, start + 240_000, start + 470_000].map((at) => bestLag(expected, heard, at));
    expect(
      lags.map(Math.abs).every((lag) => lag <= 16),
      `lags ${lags.join(", ")}`,
    ).toBe(true);
  }, 60_000);
});

/** The lag (in samples) at which `heard` best matches `expected` around `at`. */
function bestLag(expected: Int16Array, heard: Int16Array, at: number, window = 4800, range = 2048): number {
  let best = { lag: 0, score: Number.NEGATIVE_INFINITY };
  for (let lag = -range; lag <= range; lag++) {
    let score = 0;
    for (let i = 0; i < window; i++) score += (expected[at + i] ?? 0) * (heard[at + i + lag] ?? 0);
    if (score > best.score) best = { lag, score };
  }
  return best.lag;
}

describe.skipIf(!installed)("making a real packed-audio segment lighter", () => {
  it("plays at exactly the source's time between two source segments, with the same frames", async () => {
    const dir = mkdtempSync(join(tmpdir(), "annamour-audio-"));
    const sourceFile = join(dir, "source.aac");
    // White noise: it matches itself at a single lag only (a tone repeats, and so would its match).
    const chirp = "anoisesrc=color=white:seed=7:amplitude=0.5:sample_rate=48000:duration=32";
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      chirp,
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-f",
      "adts",
      sourceFile,
    ]);
    // Cut like Naka's: 469 frames of 1024 samples (10.005 s at 48 kHz) per segment.
    const frames = splitAdts(readFileSync(sourceFile)).frames;
    const [previous, current, next] = [0, 1, 2].map((i) => joinBytes(frames.slice(i * 469, (i + 1) * 469)));
    if (!previous || !current || !next) throw new Error("segments");

    const lighter = await ffmpegAudioEncoder({ previous, current, next }, dir);
    expect(splitAdts(lighter).frames).toHaveLength(469);

    const played = join(dir, "played.aac");
    writeFileSync(played, joinBytes([previous, lighter, next]));
    const expected = decode(join(dir, "source.aac"));
    const heard = decode(played);
    const start = 469 * 1024;
    // Its start, middle and end: all in place, so no shift and no drift across the segment.
    const lags = [start + 1024, start + 469 * 512, start + 469 * 1024 - 6000].map((at) => bestLag(expected, heard, at));
    expect(
      lags.map(Math.abs).every((lag) => lag <= 16),
      `lags ${lags.join(", ")}`,
    ).toBe(true);
  }, 60_000);
});
