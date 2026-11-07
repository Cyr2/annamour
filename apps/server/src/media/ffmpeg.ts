import { spawn } from "node:child_process";
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
    "-preset",
    "veryfast",
    "-tune",
    "film",
    "-profile:v",
    "high",
    "-level:v",
    "3.0",
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

export const ffmpegEncoder: SegmentEncoder = (input, outputs) =>
  new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", encodeArguments(input, outputs), { stdio: ["ignore", "ignore", "pipe"] });
    let errors = "";
    child.stderr.on("data", (chunk: Buffer) => {
      errors = (errors + chunk.toString()).slice(-2000);
    });
    child.on("error", (cause) => reject(new EncodeError(`ffmpeg could not start: ${cause.message}`)));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new EncodeError(`ffmpeg exited ${code}: ${errors}`))));
  });

/** True when ffmpeg is installed: without it, séances simply keep their single quality. */
export function ffmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}
