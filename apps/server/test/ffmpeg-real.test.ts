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
  });
});

/** Decodes an ADTS stream to mono 16-bit samples, as a player would play it. */
function decode(file: string): Int16Array {
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-f", "aac", "-i", file, "-ac", "1", "-f", "s16le", "-"], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
}

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
    // A rising tone in each ear: any shift in time shows as a clear lag.
    const chirp = "aevalsrc=sin(2*PI*(200+300*t)*t)|sin(2*PI*(300+200*t)*t):s=48000:d=32";
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
    for (const at of [start + 1024, start + 469 * 512, start + 469 * 1024 - 6000]) {
      expect(Math.abs(bestLag(expected, heard, at))).toBeLessThanOrEqual(16);
    }
  }, 60_000);
});
