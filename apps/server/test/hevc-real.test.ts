import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ffmpegAvailable } from "../src/media/ffmpeg.ts";
import {
  firstDecodeTime,
  HEVC_HIGH_RUNGS,
  HEVC_RUNGS,
  type HevcRung,
  hevcCodecs,
  splitMp4,
} from "../src/media/hevc.ts";
import {
  checkHevcSegment,
  ffmpegHevcEncoder,
  firstVideoFrame,
  fmp4AudioEncoder,
  fmp4SourceAudio,
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

async function encodeAll(dir: string, source: string, name: string, rungs: readonly HevcRung[]) {
  const outputs = rungs.map((rung) => ({ rung, path: join(dir, `${name}-${rung.name}.mp4`) }));
  const started = performance.now();
  await ffmpegHevcEncoder(source, outputs);
  const ms = Math.round(performance.now() - started);
  // In the CI log: how long the HEVC rungs take for SECONDS of video on this machine.
  console.info(
    `HEVC rungs (${rungs.map((r) => r.name).join(", ")}): ${ms} ms for ${SECONDS} s of 720p, ${(ms / SECONDS / 1000).toFixed(2)} s per second of film`,
  );
  return outputs.map((output) => ({ ...output, mp4: new Uint8Array(readFileSync(output.path)) }));
}

/** The CODECS each rung must declare: Main profile at its pinned level; x265 adds its constraint flags (e.g. ".90"). */
const CODECS: Record<HevcRung["level"], RegExp> = {
  30: /^hvc1\.1\.6\.L90(\.[0-9A-F]{2})*$/,
  31: /^hvc1\.1\.6\.L93(\.[0-9A-F]{2})*$/,
};

const LADDERS = [
  { ladder: "lowest rungs (Safari's own player)", rungs: HEVC_RUNGS },
  { ladder: "higher rungs of the complete ladder (our iPad player)", rungs: HEVC_HIGH_RUNGS },
];

describe.skipIf(!installed)("real HEVC segments, the way Safari and hls.js need them", () => {
  // A 2-core CI runner takes a while on the 720p rung: the timeout leaves it room.
  it.each(LADDERS)(
    "$ladder: hvc1, a key frame at the source's instant, one init, on one clock",
    async ({ rungs }) => {
      const dir = mkdtempSync(join(tmpdir(), "annamour-hevc-real-"));
      const first = sourceSegment(dir, "first", 10);
      const second = sourceSegment(dir, "second", 10 + SECONDS);
      const [a, b] = [await encodeAll(dir, first, "a", rungs), await encodeAll(dir, second, "b", rungs)];
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
        expect(hevcCodecs(one.init), output.rung.name).toMatch(CODECS[output.rung.level]);
        // On one clock: the second segment's decode time is the first's plus its duration (90 kHz).
        const gap = (firstDecodeTime(two.segment) ?? 0) - (firstDecodeTime(one.segment) ?? 0);
        expect(Math.abs(gap - SECONDS * 90_000), `${output.rung.name} tfdt`).toBeLessThan(90_000 / FPS);
        // Within the rung's cap (what the master declares, before its audio).
        const kbps = (one.segment.length * 8) / SECONDS / 1000;
        expect(kbps, `${output.rung.name} bitrate`).toBeLessThan(output.rung.maxrateKbps * 1.1);
      }
    },
    600_000,
  );
});

/** How many AAC frames (packets) an audio file holds, whatever its container. */
function aacFrames(file: string): number {
  const out = execFileSync("ffprobe", [
    ...["-v", "error", "-select_streams", "a:0", "-count_packets"],
    ...["-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", file],
  ]);
  return Number.parseInt(out.toString(), 10);
}

function firstAudioTime(file: string): number {
  const out = execFileSync("ffprobe", [
    ...["-v", "error", "-select_streams", "a:0", "-show_entries", "packet=pts_time"],
    ...["-read_intervals", "%+#1", "-of", "csv=p=0", file],
  ]);
  return Number.parseFloat(out.toString());
}

/** Each AAC packet's size, header left out (MP4 stores none; ADTS adds 7 bytes, or 9 with a CRC). */
function payloadSizes(file: string, header: number): number[] {
  const out = execFileSync("ffprobe", [
    ...["-v", "error", "-select_streams", "a:0", "-show_entries", "packet=size", "-of", "csv=p=0", file],
  ]);
  return out
    .toString()
    .trim()
    .split(/\s+/)
    .map((size) => Number(size) - header);
}

describe.skipIf(!installed)("the HEVC rungs' audio, in fMP4", () => {
  function sourceAudio() {
    const dir = mkdtempSync(join(tmpdir(), "annamour-hevc-audio-"));
    const noise = "anoisesrc=color=white:seed=3:amplitude=0.5:sample_rate=48000:duration=32";
    execFileSync("ffmpeg", [
      ...[...QUIET, "-f", "lavfi", "-i", noise, "-ac", "2", "-c:a", "aac", "-b:a", "128k"],
      ...["-f", "segment", "-segment_time", "10", "-segment_format", "mpegts", join(dir, "seg%d.ts")],
    ]);
    const segment = (i: number) => new Uint8Array(readFileSync(join(dir, `seg${i}.ts`)));
    return { dir, segment, source: join(dir, "seg1.ts") };
  }

  /** On the source segment's clock: same first instant, same `tfdt`, same number of frames. */
  function expectOnSourceClock(mp4: Uint8Array, file: string, source: string) {
    writeFileSync(file, mp4);
    const sourceStart = firstAudioTime(source);
    expect(Math.abs(firstAudioTime(file) - sourceStart)).toBeLessThan(0.002);
    const { segment: fragments } = splitMp4(mp4);
    expect(Math.abs((firstDecodeTime(fragments) ?? 0) / 48_000 - sourceStart)).toBeLessThan(0.002);
    expect(aacFrames(file)).toBe(aacFrames(source));
  }

  it("the lighter one starts at the source audio segment's instant, with the same frames", async () => {
    const { dir, segment, source } = sourceAudio();
    const mp4 = await fmp4AudioEncoder({ previous: segment(0), current: segment(1), next: segment(2) }, dir);
    expectOnSourceClock(mp4, join(dir, "audio.mp4"), source);
  }, 120_000);

  it("the source's own one (higher rungs) is the source's frames untouched, on its clock", async () => {
    const { dir, segment, source } = sourceAudio();
    const mp4 = await fmp4SourceAudio({ current: segment(1) }, dir);
    const file = join(dir, "source-audio.mp4");
    expectOnSourceClock(mp4, file, source);
    // Repackaged, not re-encoded: every frame keeps its size, ADTS header aside.
    expect(payloadSizes(file, 0)).toEqual(payloadSizes(source, 7));
  }, 120_000);
});
