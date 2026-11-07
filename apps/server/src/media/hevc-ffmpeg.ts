import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { joinBytes } from "./adts.ts";
import { id3Timestamp } from "./audio-timeline.ts";
import {
  type AudioSegmentEncoder,
  type AudioSegments,
  EncodeError,
  ffmpeg,
  KEY_FRAMES,
  lighterAudioFrames,
  QUIET,
  sourceFrames,
} from "./ffmpeg.ts";
import type { HevcRung } from "./hevc.ts";

/** Makes the HEVC rungs of one source segment, each as one fragmented MP4 (init + fragments). */
export type HevcEncoder = (input: string, outputs: ReadonlyArray<{ rung: HevcRung; path: string }>) => Promise<void>;

/** Checks one HEVC MP4 made from `source` the way Safari needs it; returns its frame rate. */
export type HevcChecker = (source: string, output: string) => Promise<{ frameRate: number }>;

/** Fragmented MP4 whose `tfdt` is the source's own clock (no edit list, no shift to zero). */
const FRAGMENTED_MP4 = [
  ...["-use_editlist", "0", "-avoid_negative_ts", "disabled"],
  ...["-movflags", "+frag_keyframe+empty_moov+default_base_moof+frag_discont+skip_sidx+skip_trailer", "-f", "mp4"],
];

/**
 * x265 for segments encoded on their own: an IDR at each one's start then every 2 s (forced by
 * ffmpeg; no scene cuts, closed GOPs), parameter sets only in the init (`hvc1`, what Apple
 * requires), no version SEI (so every segment's init is byte-identical), a pinned level, and
 * bounded threads and lookahead so a few run side by side in little memory.
 */
function x265Params(rung: HevcRung): string {
  return [
    `vbv-maxrate=${rung.maxrateKbps}`,
    `vbv-bufsize=${rung.bufsizeKbps}`,
    `level-idc=${rung.level}`,
    "keyint=600:min-keyint=1:scenecut=0:open-gop=0",
    "repeat-headers=0:info=0",
    "pools=4:frame-threads=2:rc-lookahead=10",
    "log-level=error",
  ].join(":");
}

export function hevcArguments(input: string, outputs: ReadonlyArray<{ rung: HevcRung; path: string }>): string[] {
  const split = `[0:v]split=${outputs.length}${outputs.map((_, i) => `[h${i}in]`).join("")}`;
  const scales = outputs.map(({ rung }, i) => `[h${i}in]scale=-2:${rung.height}[h${i}]`);
  const perOutput = outputs.flatMap(({ rung, path }, i) => [
    ...["-map", `[h${i}]`, "-an", "-fps_mode", "passthrough"],
    ...["-c:v", "libx265", "-preset", "superfast", "-tag:v", "hvc1", "-profile:v", "main", "-pix_fmt", "yuv420p"],
    ...["-crf", String(rung.crf), "-x265-params", x265Params(rung), "-force_key_frames", KEY_FRAMES],
    ...["-video_track_timescale", "90000", ...FRAGMENTED_MP4, path],
  ]);
  return [...QUIET, "-copyts", "-i", input, "-filter_complex", [split, ...scales].join(";"), ...perOutput];
}

/** x265 runs in the background: the OS gives the H.264 encodes the CPU first. */
export const ffmpegHevcEncoder: HevcEncoder = (input, outputs) =>
  ffmpeg(hevcArguments(input, outputs), { background: true });

type SourceAudio = Awaited<ReturnType<typeof sourceFrames>>;

/** The lighter audio (see ffmpeg.ts) in fragmented MP4, its `tfdt` at the source segment's start. */
export async function fmp4AudioEncoder(segments: AudioSegments, workDir: string): Promise<Uint8Array> {
  const { frames, source } = await lighterAudioFrames(segments, workDir);
  return fmp4Audio(frames, source, workDir);
}

/**
 * The source's own audio, frames untouched, repackaged in fragmented MP4 on
 * its clock: the sound of the complete HEVC ladder's higher rungs, as good as
 * the H.264 source's, for no encoding at all.
 */
export const fmp4SourceAudio: AudioSegmentEncoder = async ({ current }, workDir) => {
  const source = await sourceFrames(current, workDir, "current");
  return fmp4Audio(source.segment.frames, source, workDir);
};

async function fmp4Audio(frames: Uint8Array[], source: SourceAudio, workDir: string): Promise<Uint8Array> {
  const start = source.container === "mpegts" ? source.start : id3Timestamp(source.segment.id3);
  if (start === undefined) throw new EncodeError("Audio segment has no timestamp to keep");
  const [adts, mp4] = [join(workDir, "fmp4.aac"), join(workDir, "fmp4.mp4")];
  await writeFile(adts, joinBytes(frames));
  await ffmpeg([
    // MP4 stores AAC without ADTS headers: the bitstream filter strips them (frames unchanged).
    ...[...QUIET, "-f", "aac", "-i", adts, "-c:a", "copy", "-bsf:a", "aac_adtstoasc"],
    ...["-output_ts_offset", start.toFixed(6), ...FRAGMENTED_MP4, mp4],
  ]);
  return new Uint8Array(await readFile(mp4));
}

/* ---------- checking what Safari will get ---------- */

interface FirstVideoFrame {
  pts: number;
  keyFrame: boolean;
  tag: string;
  frameRate: number;
}

function ffprobeJson(args: readonly string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", ["-v", "error", ...args, "-of", "json"], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.on("error", (cause) => reject(new EncodeError(`ffprobe could not start: ${cause.message}`)));
    child.on("close", () => {
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new EncodeError("ffprobe gave no readable answer"));
      }
    });
  });
}

const rate = (fraction: string | undefined) => {
  const [num, den] = (fraction ?? "").split("/").map(Number);
  return num && den ? num / den : 0;
};

/** The first video frame of a file, as a player sees it: when it shows, whether it is a key frame. */
export async function firstVideoFrame(file: string): Promise<FirstVideoFrame> {
  const probed = (await ffprobeJson([
    ...["-select_streams", "v:0", "-read_intervals", "%+#1"],
    ...["-show_entries", "stream=codec_tag_string,avg_frame_rate,r_frame_rate:frame=pts_time,key_frame", file],
  ])) as {
    streams?: Array<{ codec_tag_string?: string; avg_frame_rate?: string; r_frame_rate?: string }>;
    frames?: Array<{ pts_time?: string; key_frame?: number }>;
  };
  const stream = probed.streams?.[0];
  const frame = probed.frames?.[0];
  return {
    pts: Number(frame?.pts_time),
    keyFrame: frame?.key_frame === 1,
    tag: stream?.codec_tag_string ?? "",
    frameRate: rate(stream?.avg_frame_rate) || rate(stream?.r_frame_rate),
  };
}

/** Refuses an HEVC segment Safari would choke on: not `hvc1`, not starting on a key frame, or off the source's clock. */
export const checkHevcSegment: HevcChecker = async (source, output) => {
  const [from, made] = await Promise.all([firstVideoFrame(source), firstVideoFrame(output)]);
  if (made.tag !== "hvc1") throw new EncodeError(`HEVC segment tagged "${made.tag}", not hvc1`);
  if (!made.keyFrame) throw new EncodeError("HEVC segment does not start on a key frame");
  const frame = 1 / (made.frameRate || 24);
  if (!Number.isFinite(made.pts) || Math.abs(made.pts - from.pts) > frame) {
    throw new EncodeError(`HEVC segment starts at ${made.pts} s, its source at ${from.pts} s`);
  }
  return { frameRate: made.frameRate };
};

/** True when ffmpeg can encode HEVC (built with libx265): without it, no HEVC rung is offered. */
export function x265Available(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-encoders"], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.on("error", () => resolve(false));
    child.on("close", () => resolve(out.includes("libx265")));
  });
}
