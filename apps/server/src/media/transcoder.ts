import { access, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AudioSegmentEncoder, SegmentEncoder } from "./ffmpeg.ts";
import { type Rung, segmentFile } from "./ladder.ts";
import type { SegmentSource } from "./segment-source.ts";

/*
 * Makes a film's lighter tracks just ahead of where it is watched, the way
 * Plex and Jellyfin transcode on the fly, but segment by segment: each source
 * segment is encoded on its own, so a seek simply asks for another segment
 * first, nothing restarts. The segment someone waits for goes first, then the
 * next ten minutes. Files live until the séance has been over for a while.
 *
 * A video track makes every lighter rung from one source segment; an audio
 * track makes the lighter audio of one language, from a source segment and
 * its neighbours (kept on disk, they are small).
 */

interface TrackBase {
  code: string;
  episode: number;
  /** Absolute URLs of the source's segments, in order. */
  segments: readonly string[];
}

export interface VideoTrack extends TrackBase {
  kind: "video";
  rungs: readonly Rung[];
}

export interface AudioTrack extends TrackBase {
  kind: "audio";
  /** The lighter track's name, its folder and playlist (e.g. "lo-a0"). */
  name: string;
}

export type Track = VideoTrack | AudioTrack;

export interface TranscoderOptions {
  /** Where encoded segments are kept (a persistent volume). */
  dir: string;
  source: SegmentSource;
  encode: SegmentEncoder;
  encodeAudio?: AudioSegmentEncoder;
  /** ffmpeg processes at once. */
  workers?: number;
  /** Segments prepared ahead of the one being watched (60 × 10 s = 10 min). */
  ahead?: number;
  /** How long a request waits for its segment before the player is told to retry. */
  waitMs?: number;
  /** Pause before trying a failed segment again, growing with each attempt. */
  retryDelayMs?: number;
  log?: (message: string) => void;
}

const NOW = 0;
const AHEAD = 1;
const MAX_ATTEMPTS = 4;
const REPORT_EVERY = 30;

interface Job {
  track: Track;
  index: number;
  priority: number;
  attempts: number;
  done: Promise<boolean>;
  settle: (ok: boolean) => void;
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/** The files one source segment becomes, by name (a rung's, or the audio track's). */
function outputNames(track: Track): string[] {
  return track.kind === "video" ? track.rungs.map((rung) => rung.name) : [track.name];
}

const extension = (track: Track) => (track.kind === "video" ? "ts" : "aac");
const trackId = (track: Track) => `${track.code}/${track.episode}/${track.kind === "video" ? "video" : track.name}`;

export class Transcoder {
  private readonly options: Required<Omit<TranscoderOptions, "encodeAudio">> & Pick<TranscoderOptions, "encodeAudio">;
  private readonly jobs = new Map<string, Job>();
  private readonly pending: Job[] = [];
  private running = 0;
  private encoded = 0;
  private encodeMs = 0;
  /** Requests answered « retry » because their segment was not ready: should stay near 0. */
  private late = 0;

  constructor(options: TranscoderOptions) {
    this.options = { workers: 2, ahead: 60, waitMs: 9000, retryDelayMs: 3000, log: console.info, ...options };
  }

  /** Lighter audio can be made (an audio encoder is set). */
  get makesAudio(): boolean {
    return this.options.encodeAudio !== undefined;
  }

  /** Where one of a track's outputs is kept for a segment. */
  path(track: Track, output: string, index: number): string {
    return join(this.options.dir, track.code, String(track.episode), output, segmentFile(index, extension(track)));
  }

  /**
   * The output's segment, once encoded: encoded first if needed, then the
   * ones after it. Null when it is not ready in time; the player asks again.
   */
  async segment(track: Track, output: string, index: number): Promise<string | null> {
    if (index < 0 || index >= track.segments.length || !outputNames(track).includes(output)) return null;
    const path = this.path(track, output, index);
    if (await exists(path)) {
      this.prepareFrom(track, index + 1);
      return path;
    }
    const job = this.enqueue(track, index, NOW);
    this.prepareFrom(track, index + 1);
    const ready = await Promise.race([job.done, delay(this.options.waitMs).then(() => false)]);
    if (!ready) this.late++;
    return ready ? path : null;
  }

  /** Makes this segment first and waits for it however long it takes: true once made, false if it cannot be. */
  async ensure(track: Track, index: number): Promise<boolean> {
    if (await this.isReady(track, index)) return true;
    return this.enqueue(track, index, NOW).done;
  }

  /** Every output of this segment is encoded. */
  async isReady(track: Track, index: number): Promise<boolean> {
    const ready = await Promise.all(outputNames(track).map((name) => exists(this.path(track, name, index))));
    return ready.every(Boolean);
  }

  /** Prepares the next minutes from `index` (where the séance is), dropping what a seek left behind. */
  prepareFrom(track: Track, index: number): void {
    const end = Math.min(track.segments.length, index + this.options.ahead);
    const id = trackId(track);
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const job = this.pending[i];
      if (job && trackId(job.track) === id && job.priority === AHEAD && (job.index < index || job.index >= end)) {
        this.pending.splice(i, 1);
        this.forget(job, false);
      }
    }
    for (let i = Math.max(0, index); i < end; i++) this.enqueue(track, i, AHEAD);
  }

  /** Deletes the files of every séance `keep` no longer wants. */
  async sweep(keep: (code: string) => boolean): Promise<void> {
    const codes = await readdir(this.options.dir).catch(() => []);
    await Promise.all(
      codes.filter((code) => !keep(code)).map((code) => rm(join(this.options.dir, code), { recursive: true })),
    );
  }

  private enqueue(track: Track, index: number, priority: number): Job {
    const id = `${trackId(track)}/${index}`;
    const known = this.jobs.get(id);
    if (known) {
      known.priority = Math.min(known.priority, priority);
      return known;
    }
    let settle: (ok: boolean) => void = () => {};
    const done = new Promise<boolean>((resolve) => {
      settle = resolve;
    });
    const job: Job = { track, index, priority, attempts: 0, done, settle };
    this.jobs.set(id, job);
    this.pending.push(job);
    this.pump();
    return job;
  }

  private pump(): void {
    while (this.running < this.options.workers && this.pending.length > 0) {
      this.pending.sort((a, b) => a.priority - b.priority || a.index - b.index);
      const job = this.pending.shift();
      if (!job) return;
      this.running++;
      void this.run(job).finally(() => {
        this.running--;
        this.pump();
      });
    }
  }

  private async run(job: Job): Promise<void> {
    try {
      await this.make(job.track, job.index);
      this.forget(job, true);
    } catch (error) {
      job.attempts++;
      if (job.attempts >= MAX_ATTEMPTS) {
        this.options.log(`Segment ${trackId(job.track)}#${job.index} abandoned: ${String(error)}`);
        this.forget(job, false);
        return;
      }
      // Most failures are the source's budget or a drop: try again a little later.
      setTimeout(() => {
        this.pending.push(job);
        this.pump();
      }, this.options.retryDelayMs * job.attempts);
    }
  }

  /** Makes one segment's missing outputs, each written in place only once complete. */
  private async make(track: Track, index: number): Promise<void> {
    const outputs = outputNames(track).map((name) => ({ name, path: this.path(track, name, index) }));
    const missing = (await Promise.all(outputs.map(async (o) => ((await exists(o.path)) ? [] : [o])))).flat();
    if (missing.length === 0) return;
    await Promise.all(missing.map((output) => mkdir(join(output.path, ".."), { recursive: true })));
    const started = performance.now();
    if (track.kind === "video") await this.makeVideo(track, index, missing);
    else await this.makeAudio(track, index, missing[0]?.path ?? "");
    await Promise.all(missing.map((output) => rename(`${output.path}.part`, output.path)));
    this.report(performance.now() - started);
  }

  private async makeVideo(track: VideoTrack, index: number, missing: Array<{ name: string; path: string }>) {
    const source = track.segments[index];
    if (source === undefined) throw new Error(`No source segment ${index}`);
    const input = join(this.options.dir, track.code, String(track.episode), `source-${segmentFile(index)}`);
    await writeFile(input, await this.options.source(new URL(source)));
    try {
      const outputs = missing.flatMap(({ name, path }) => {
        const rung = track.rungs.find((candidate) => candidate.name === name);
        return rung ? [{ rung, path: `${path}.part` }] : [];
      });
      await this.options.encode(input, outputs);
    } finally {
      await rm(input, { force: true });
    }
  }

  private async makeAudio(track: AudioTrack, index: number, path: string) {
    const encodeAudio = this.options.encodeAudio;
    if (!encodeAudio) throw new Error("No audio encoder");
    const [previous, current, next] = await Promise.all([
      this.sourceAudio(track, index - 1),
      this.sourceAudio(track, index),
      this.sourceAudio(track, index + 1),
    ]);
    if (!current) throw new Error(`No source segment ${index}`);
    const work = await mkdtemp(join(tmpdir(), "annamour-audio-"));
    try {
      await writeFile(`${path}.part`, await encodeAudio({ previous, current, next }, work));
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }

  /** A source audio segment, downloaded once and kept with the séance (they are small); undefined past the ends. */
  private async sourceAudio(track: AudioTrack, index: number): Promise<Uint8Array | undefined> {
    const url = track.segments[index];
    if (url === undefined) return undefined;
    const cached = join(
      this.options.dir,
      track.code,
      String(track.episode),
      `source-${track.name}`,
      segmentFile(index, "aac"),
    );
    if (await exists(cached)) return readFile(cached);
    const bytes = await this.options.source(new URL(url));
    await mkdir(join(cached, ".."), { recursive: true });
    await writeFile(`${cached}.part`, bytes);
    await rename(`${cached}.part`, cached);
    return bytes;
  }

  /** Tells the server log how fast encoding goes, to size the workers. */
  private report(ms: number): void {
    this.encoded++;
    this.encodeMs += ms;
    if (this.encoded % REPORT_EVERY !== 0) return;
    const average = Math.round(this.encodeMs / this.encoded);
    this.options.log(
      `Lighter qualities: ${this.encoded} segments encoded, ${average} ms each on average, ${this.late} not ready in time for a player`,
    );
  }

  private forget(job: Job, ok: boolean): void {
    this.jobs.delete(`${trackId(job.track)}/${job.index}`);
    job.settle(ok);
  }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
