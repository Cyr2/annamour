import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cut, joinBytes, overlapped, splitAdts } from "./adts.ts";
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
const KEY_FRAMES = "expr:if(isnan(prev_forced_t),1,gte(t,prev_forced_t+2))";
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

function ffmpeg(args: readonly string[]): Promise<void> {
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

export const ffmpegAudioEncoder: AudioSegmentEncoder = async ({ previous, current, next }, workDir) => {
  const source = splitAdts(current);
  const neighbour = (bytes: Uint8Array | undefined) => (bytes ? splitAdts(bytes).frames : []);
  const input = overlapped(source.frames, neighbour(previous), neighbour(next));
  const [inFile, outFile] = [join(workDir, "in.aac"), join(workDir, "out.aac")];
  await writeFile(inFile, joinBytes(input.frames));
  await ffmpeg([
    ...["-hide_banner", "-loglevel", "error", "-y", "-f", "aac", "-i", inFile],
    ...["-c:a", "aac", "-b:a", `${LOW_AUDIO_KBPS}k`, "-f", "adts", outFile],
  ]);
  const encoded = splitAdts(await readFile(outFile)).frames;
  // The source's timestamp tag, if it has one, goes back in front: the timing is the source's.
  return joinBytes([source.id3, ...cut(encoded, input)]);
};

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
