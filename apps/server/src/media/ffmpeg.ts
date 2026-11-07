import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { audioContainer, cut, joinBytes, overlapped, splitAdts } from "./adts.ts";
import type { Rung } from "./ladder.ts";

/** Makes the lighter rungs of one source segment. */
export type SegmentEncoder = (input: string, outputs: ReadonlyArray<{ rung: Rung; path: string }>) => Promise<void>;

export class EncodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncodeError";
  }
}

/** Each segment starts on a key frame, then one every 2 s (Apple's spec), wherever the clock starts. */
export const KEY_FRAMES = "expr:if(isnan(prev_forced_t),1,gte(t,prev_forced_t+2))";
/** Threads per ffmpeg: a few encodes run side by side on the server. */
const THREADS = "4";

/** The ffmpeg arguments: one decode, split and scaled per rung, timestamps kept so rungs line up with the source. */
export function encodeArguments(input: string, outputs: ReadonlyArray<{ rung: Rung; path: string }>): string[] {
  const labels = outputs.map((_, i) => `v${i}`);
  const split = `[0:v]split=${outputs.length}${labels.map((label) => `[${label}in]`).join("")}`;
  const scales = outputs.map(({ rung }, i) => `[v${i}in]scale=-2:${rung.height}[v${i}]`);
  const perOutput = outputs.flatMap(({ rung, path }, i) => [
    "-map",
    `[v${i}]`,
    // Muxed audio, if any, is copied; separate audio renditions stay with the source.
    "-map",
    "0:a?",
    "-c:a",
    "copy",
    "-c:v",
    "libx264",
    // ~5–10 % fewer bits than veryfast for the same picture, still ~10× faster than playback here;
    // no "-tune film": its lighter deblocking shows as blocks at these bitrates.
    "-preset",
    "faster",
    "-profile:v",
    "high",
    "-level:v",
    rung.level,
    "-pix_fmt",
    "yuv420p",
    "-crf",
    String(rung.crf),
    "-maxrate",
    `${rung.maxrateKbps}k`,
    "-bufsize",
    `${rung.bufsizeKbps}k`,
    "-sc_threshold",
    "0",
    "-force_key_frames",
    KEY_FRAMES,
    "-threads",
    THREADS,
    "-muxdelay",
    "0",
    "-muxpreload",
    "0",
    "-f",
    "mpegts",
    path,
  ]);
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-copyts",
    "-i",
    input,
    "-filter_complex",
    [split, ...scales].join(";"),
    ...perOutput,
  ];
}

export function ffmpeg(args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let errors = "";
    child.stderr.on("data", (chunk: Buffer) => {
      errors = (errors + chunk.toString()).slice(-2000);
    });
    child.on("error", (cause) => reject(new EncodeError(`ffmpeg could not start: ${cause.message}`)));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new EncodeError(`ffmpeg exited ${code}: ${errors}`))));
  });
}

export const ffmpegEncoder: SegmentEncoder = (input, outputs) => ffmpeg(encodeArguments(input, outputs));

/** The lighter audio of the low rungs: AAC-LC, the profile every player decodes (HE-AAC frames would not line up). */
export const LOW_AUDIO_KBPS = 64;

/** One packed-audio segment, with its neighbours when they exist, for its lighter re-encode. */
export interface AudioSegments {
  previous?: Uint8Array | undefined;
  current: Uint8Array;
  next?: Uint8Array | undefined;
}

/** Re-encodes one packed-audio segment lighter, frame for frame on the source's timing (see adts.ts). */
export type AudioSegmentEncoder = (segments: AudioSegments, workDir: string) => Promise<Uint8Array>;

export const QUIET = ["-hide_banner", "-loglevel", "error", "-y"];

/**
 * A source audio segment as ADTS frames. Packed ADTS is split as is; an
 * MPEG-TS audio segment (what Naka's `.aac` files turned out to be) has its
 * AAC frames copied out, untouched, along with where it starts on the clock.
 */
async function sourceFrames(bytes: Uint8Array, workDir: string, name: string) {
  const container = audioContainer(bytes);
  if (container === "adts") return { container, segment: splitAdts(bytes), start: undefined };
  if (container === "other") throw new EncodeError("Audio segment is neither ADTS nor MPEG-TS");
  const [ts, adts] = [join(workDir, `${name}.ts`), join(workDir, `${name}.adts`)];
  await writeFile(ts, bytes);
  await ffmpeg([...QUIET, "-f", "mpegts", "-i", ts, "-map", "0:a:0", "-c:a", "copy", "-f", "adts", adts]);
  return { container, segment: splitAdts(await readFile(adts)), start: await firstTimestamp(ts) };
}

/**
 * The lighter AAC frames of one source audio segment, cut on its sample grid
 * (see adts.ts), with what is needed to put them back on its clock.
 */
export async function lighterAudioFrames({ previous, current, next }: AudioSegments, workDir: string) {
  const source = await sourceFrames(current, workDir, "current");
  const neighbour = async (bytes: Uint8Array | undefined, name: string) =>
    bytes ? (await sourceFrames(bytes, workDir, name)).segment.frames : [];
  const input = overlapped(source.segment.frames, await neighbour(previous, "previous"), await neighbour(next, "next"));
  const [inFile, outFile] = [join(workDir, "in.aac"), join(workDir, "out.aac")];
  await writeFile(inFile, joinBytes(input.frames));
  await ffmpeg([
    ...QUIET,
    "-f",
    "aac",
    "-i",
    inFile,
    "-c:a",
    "aac",
    "-b:a",
    `${LOW_AUDIO_KBPS}k`,
    "-f",
    "adts",
    outFile,
  ]);
  return { frames: cut(splitAdts(await readFile(outFile)).frames, input), source };
}

export const ffmpegAudioEncoder: AudioSegmentEncoder = async (segments, workDir) => {
  const { frames, source } = await lighterAudioFrames(segments, workDir);
  // Packed audio: the source's timestamp tag, if it has one, goes back in front.
  if (source.container === "adts") return joinBytes([source.segment.id3, ...frames]);
  return asTransportStream(frames, source.start, workDir);
};

/** The lighter frames back in MPEG-TS, starting at the very instant the source segment does. */
async function asTransportStream(frames: Uint8Array[], start: number | undefined, workDir: string) {
  if (start === undefined) throw new EncodeError("Audio segment has no timestamp to keep");
  const [adts, ts] = [join(workDir, "light.aac"), join(workDir, "light.ts")];
  await writeFile(adts, joinBytes(frames));
  await ffmpeg([
    ...[...QUIET, "-f", "aac", "-i", adts, "-c:a", "copy"],
    // Several AAC frames per PES packet (ffmpeg groups audio up to its mux delay): one frame per PES
    // would wrap each ~170-byte frame in two 188-byte TS packets and double the size. mpegts_copyts
    // keeps that delay from shifting the timestamps, which must stay the source's.
    ...["-output_ts_offset", start.toFixed(6), "-mpegts_copyts", "1", "-muxpreload", "0", "-f", "mpegts", ts],
  ]);
  return new Uint8Array(await readFile(ts));
}

/** When a media file's first packet plays (seconds), as ffprobe reads it; undefined if it cannot. */
export function firstTimestamp(file: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const args = ["-v", "error", "-show_entries", "packet=pts_time", "-read_intervals", "%+#1", "-of", "csv=p=0", file];
    const child = spawn("ffprobe", args, { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.on("error", () => resolve(undefined));
    child.on("close", () => {
      const value = Number.parseFloat(out);
      resolve(Number.isFinite(value) ? value : undefined);
    });
  });
}

/** What ffprobe says a media file is (container, codec, rate, channels), for the server log. */
export function describeMedia(file: string): Promise<string> {
  return new Promise((resolve) => {
    const entries = "format=format_name:stream=codec_type,codec_name,sample_rate,channels";
    const child = spawn("ffprobe", ["-v", "error", "-show_entries", entries, "-of", "compact=p=0", file], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.on("error", () => resolve("ffprobe unavailable"));
    child.on("close", () => resolve(out.trim().replace(/\s+/g, " ") || "unreadable"));
  });
}

/** True when ffmpeg is installed: without it, séances simply keep their single quality. */
export function ffmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}
