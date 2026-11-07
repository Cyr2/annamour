import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { splitAdts } from "../src/media/adts.ts";
import { ffmpegAvailable } from "../src/media/ffmpeg.ts";
import { firstDecodeTime, HEVC_RUNGS, hevcCodecs, splitMp4 } from "../src/media/hevc.ts";
import {
  checkHevcSegment,
  ffmpegHevcEncoder,
  firstVideoFrame,
  fmp4AudioEncoder,
  x265Available,
} from "../src/media/hevc-ffmpeg.ts";

/*
 * The real thing, where ffmpeg has libx265 (CI runners, the Docker image):
 * what Safari needs from our HEVC rungs, checked on actual encodes. Safari
 * itself is not here; these are the rules it is known to enforce.
 */
const installed = (await ffmpegAvailable()) && (await x265Available());

const QUIET = ["-v", "error", "-y"];
const SECONDS = 4;
const FPS = 24;

/** A 720p H.264 MPEG-TS source segment of SECONDS, starting `offset` s into the film. */
function sourceSegment(dir: string, name: string, offset: number): string {
  const file = join(dir, `${name}.ts`);
  execFileSync("ffmpeg", [
    ...[...QUIET, "-f", "lavfi", "-i", `testsrc2=size=1280x720:rate=${FPS}`, "-t", String(SECONDS)],
    ...["-c:v", "libx264", "-g", String(FPS * 2), "-output_ts_offset", String(offset), "-f", "mpegts", file],
  ]);
  return file;
}

async function encodeAll(dir: string, source: string, name: string) {
  const outputs = HEVC_RUNGS.map((rung) => ({ rung, path: join(dir, `${name}-${rung.name}.mp4`) }));
  const started = performance.now();
  await ffmpegHevcEncoder(source, outputs);
  const ms = Math.round(performance.now() - started);
  // In the CI log: how long the HEVC rungs take for SECONDS of video on this machine.
  console.info(`HEVC rungs (${HEVC_RUNGS.map((r) => r.name).join(", ")}): ${ms} ms for ${SECONDS} s of 720p`);
  return outputs.map((output) => ({ ...output, mp4: new Uint8Array(readFileSync(output.path)) }));
}

describe.skipIf(!installed)("real HEVC segments, the way Safari needs them", () => {
  it("are hvc1, start on a key frame at the source's instant, share one init and follow on", async () => {
    const dir = mkdtempSync(join(tmpdir(), "annamour-hevc-real-"));
    const first = sourceSegment(dir, "first", 10);
    const second = sourceSegment(dir, "second", 10 + SECONDS);
    const [a, b] = [await encodeAll(dir, first, "a"), await encodeAll(dir, second, "b")];
    // Where the source really starts: ffmpeg's MPEG-TS muxer adds its own 1.4 s to the offset.
    const sourceStart = (await firstVideoFrame(first)).pts;

    for (const [i, output] of a.entries()) {
      const next = b[i];
      if (!next) throw new Error("second encode");
      const frame = await firstVideoFrame(output.path);
      expect(frame.tag, output.rung.name).toBe("hvc1");
      expect(frame.keyFrame, output.rung.name).toBe(true);
      expect(Math.abs(frame.pts - sourceStart), output.rung.name).toBeLessThan(1 / FPS);
      expect((await checkHevcSegment(first, output.path)).frameRate).toBeCloseTo(FPS, 1);
      await checkHevcSegment(second, next.path);

      const [one, two] = [splitMp4(output.mp4), splitMp4(next.mp4)];
      // Safari reads the init once, then every segment with it.
      expect(Buffer.from(two.init).equals(Buffer.from(one.init)), `${output.rung.name} init`).toBe(true);
      expect(hevcCodecs(one.init)).toMatch(/^hvc1\.1\.6\.L\d+\.B0$/);
      // On one clock: the second segment's decode time is the first's plus its duration (90 kHz).
      const gap = (firstDecodeTime(two.segment) ?? 0) - (firstDecodeTime(one.segment) ?? 0);
      expect(Math.abs(gap - SECONDS * 90_000), `${output.rung.name} tfdt`).toBeLessThan(90_000 / FPS);
      // Within the rung's cap (what the master declares, before its audio).
      const kbps = (one.segment.length * 8) / SECONDS / 1000;
      expect(kbps, `${output.rung.name} bitrate`).toBeLessThan(output.rung.maxrateKbps * 1.1);
    }
  }, 240_000);
});

/** How many AAC frames an audio file holds (copied out as ADTS). */
function aacFrames(file: string, format: string): number {
  const adts = execFileSync("ffmpeg", ["-v", "error", "-f", format, "-i", file, "-c:a", "copy", "-f", "adts", "-"]);
  return splitAdts(new Uint8Array(adts)).frames.length;
}

function firstAudioTime(file: string): number {
  const out = execFileSync("ffprobe", [
    ...["-v", "error", "-select_streams", "a:0", "-show_entries", "packet=pts_time"],
    ...["-read_intervals", "%+#1", "-of", "csv=p=0", file],
  ]);
  return Number.parseFloat(out.toString());
}

describe.skipIf(!installed)("the HEVC rungs' audio, in fMP4", () => {
  it("starts at the source audio segment's instant, with the same frames", async () => {
    const dir = mkdtempSync(join(tmpdir(), "annamour-hevc-audio-"));
    const noise = "anoisesrc=color=white:seed=3:amplitude=0.5:sample_rate=48000:duration=32";
    execFileSync("ffmpeg", [
      ...[...QUIET, "-f", "lavfi", "-i", noise, "-ac", "2", "-c:a", "aac", "-b:a", "128k"],
      ...["-f", "segment", "-segment_time", "10", "-segment_format", "mpegts", join(dir, "seg%d.ts")],
    ]);
    const segment = (i: number) => new Uint8Array(readFileSync(join(dir, `seg${i}.ts`)));
    const mp4 = await fmp4AudioEncoder({ previous: segment(0), current: segment(1), next: segment(2) }, dir);
    const file = join(dir, "audio.mp4");
    writeFileSync(file, mp4);

    const sourceStart = firstAudioTime(join(dir, "seg1.ts"));
    expect(Math.abs(firstAudioTime(file) - sourceStart)).toBeLessThan(0.002);
    const { segment: fragments } = splitMp4(mp4);
    expect(Math.abs((firstDecodeTime(fragments) ?? 0) / 48_000 - sourceStart)).toBeLessThan(0.002);
    expect(aacFrames(file, "mp4")).toBe(aacFrames(join(dir, "seg1.ts"), "mpegts"));
  }, 120_000);
});
