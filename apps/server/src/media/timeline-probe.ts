import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { id3Timestamp } from "./audio-timeline.ts";
import type { SegmentSource } from "./segment-source.ts";

/*
 * Once per film, the server log says how the source's audio lines up with its
 * video: whether the packed audio carries its ID3 timestamp, where audio and
 * video start, and the audio's real bitrate. That is what re-encoding the
 * audio lighter has to respect.
 */

export interface TimelineProbe {
  source: SegmentSource;
  firstTimestamp: (file: string) => Promise<number | undefined>;
  log: (message: string) => void;
}

export interface ProbedSegments {
  video: string;
  videoDuration: number;
  /** Two consecutive audio segments of one rendition, and the first one's duration. */
  audio: readonly [string, string];
  audioDuration: number;
}

const kbps = (bytes: number, seconds: number) => Math.round((bytes * 8) / seconds / 1000);
const seconds = (value: number | undefined) => (value === undefined ? "none" : value.toFixed(3));

export async function probeTimeline({ source, firstTimestamp, log }: TimelineProbe, segments: ProbedSegments) {
  const [video, first, second] = await Promise.all([
    source(new URL(segments.video)),
    source(new URL(segments.audio[0])),
    source(new URL(segments.audio[1])),
  ]);
  const dir = await mkdtemp(join(tmpdir(), "annamour-probe-"));
  try {
    const file = join(dir, "video.ts");
    await writeFile(file, video);
    const videoStart = await firstTimestamp(file);
    const audioStarts = [id3Timestamp(first), id3Timestamp(second)];
    log(
      [
        "Source timeline:",
        `video segment starts at ${seconds(videoStart)} s (${kbps(video.byteLength, segments.videoDuration)} kb/s),`,
        `audio ID3 timestamps ${audioStarts.map(seconds).join(" then ")} s,`,
        `audio ${kbps(first.byteLength, segments.audioDuration)} kb/s`,
      ].join(" "),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
