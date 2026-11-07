import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ffmpegAvailable, ffmpegEncoder } from "../src/media/ffmpeg.ts";
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
