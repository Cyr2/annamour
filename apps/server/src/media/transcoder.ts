import { access, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SegmentEncoder } from "./ffmpeg.ts";
import { type Rung, segmentFile } from "./ladder.ts";
import type { SegmentSource } from "./segment-source.ts";

/*
 * Makes a film's lighter rungs just ahead of where it is watched, the way
 * Plex and Jellyfin transcode on the fly, but segment by segment: each source
 * segment is encoded on its own, so a seek simply asks for another segment
 * first, nothing restarts. The segment someone waits for goes first, then the
 * next ten minutes. Files live until the séance has been over for a while.
 */

/** One episode of one séance, with what its rungs are made from. */
export interface Film {
  code: string;
  episode: number;
  /** Absolute URLs of the source's segments, in order. */
  segments: readonly string[];
  rungs: readonly Rung[];
}

export interface TranscoderOptions {
  /** Where encoded segments are kept (a persistent volume). */
  dir: string;
  source: SegmentSource;
  encode: SegmentEncoder;
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
  film: Film;
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

export class Transcoder {
  private readonly options: Required<TranscoderOptions>;
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

  /** Where a rung's segment is kept. */
  path(film: Pick<Film, "code" | "episode">, rung: Rung, index: number): string {
    return join(this.options.dir, film.code, String(film.episode), rung.name, segmentFile(index));
  }

  /**
   * The rung's segment, once encoded: encoded first if needed, then the ones
   * after it. Null when it is not ready in time; the player asks again.
   */
  async segment(film: Film, rung: Rung, index: number): Promise<string | null> {
    if (index < 0 || index >= film.segments.length) return null;
    const path = this.path(film, rung, index);
    if (await exists(path)) {
      this.prepareFrom(film, index + 1);
      return path;
    }
    const job = this.enqueue(film, index, NOW);
    this.prepareFrom(film, index + 1);
    const ready = await Promise.race([job.done, delay(this.options.waitMs).then(() => false)]);
    if (!ready) this.late++;
    return ready ? path : null;
  }

  /** Every rung of this segment is encoded. */
  async isReady(film: Film, index: number): Promise<boolean> {
    const ready = await Promise.all(film.rungs.map((rung) => exists(this.path(film, rung, index))));
    return ready.every(Boolean);
  }

  /** Prepares the next minutes from `index` (where the séance is), dropping what a seek left behind. */
  prepareFrom(film: Film, index: number): void {
    const end = Math.min(film.segments.length, index + this.options.ahead);
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const job = this.pending[i];
      if (job && sameFilm(job.film, film) && job.priority === AHEAD && (job.index < index || job.index >= end)) {
        this.pending.splice(i, 1);
        this.forget(job, false);
      }
    }
    for (let i = Math.max(0, index); i < end; i++) this.enqueue(film, i, AHEAD);
  }

  /** Deletes the files of every séance `keep` no longer wants. */
  async sweep(keep: (code: string) => boolean): Promise<void> {
    const codes = await readdir(this.options.dir).catch(() => []);
    await Promise.all(
      codes.filter((code) => !keep(code)).map((code) => rm(join(this.options.dir, code), { recursive: true })),
    );
  }

  private enqueue(film: Film, index: number, priority: number): Job {
    const id = jobId(film, index);
    const known = this.jobs.get(id);
    if (known) {
      known.priority = Math.min(known.priority, priority);
      return known;
    }
    let settle: (ok: boolean) => void = () => {};
    const done = new Promise<boolean>((resolve) => {
      settle = resolve;
    });
    const job: Job = { film, index, priority, attempts: 0, done, settle };
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
      await this.make(job.film, job.index);
      this.forget(job, true);
    } catch (error) {
      job.attempts++;
      if (job.attempts >= MAX_ATTEMPTS) {
        this.options.log(`Segment ${job.film.code}/${job.film.episode}#${job.index} abandoned: ${String(error)}`);
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

  /** Downloads one source segment and encodes every rung from it, written in place only once complete. */
  private async make(film: Film, index: number): Promise<void> {
    const outputs = film.rungs.map((rung) => ({ rung, path: this.path(film, rung, index) }));
    const missing = (
      await Promise.all(outputs.map(async (output) => ((await exists(output.path)) ? [] : [output])))
    ).flat();
    if (missing.length === 0) return;
    const source = film.segments[index];
    if (source === undefined) throw new Error(`No source segment ${index}`);
    await Promise.all(missing.map((output) => mkdir(join(output.path, ".."), { recursive: true })));
    const input = join(this.options.dir, film.code, String(film.episode), `source-${segmentFile(index)}`);
    await writeFile(input, await this.options.source(new URL(source)));
    const started = performance.now();
    try {
      await this.options.encode(
        input,
        missing.map((output) => ({ rung: output.rung, path: `${output.path}.part` })),
      );
      await Promise.all(missing.map((output) => rename(`${output.path}.part`, output.path)));
    } finally {
      await rm(input, { force: true });
    }
    this.report(performance.now() - started);
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
    this.jobs.delete(jobId(job.film, job.index));
    job.settle(ok);
  }
}

const sameFilm = (a: Film, b: Film) => a.code === b.code && a.episode === b.episode;
const jobId = (film: Film, index: number) => `${film.code}/${film.episode}/${index}`;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
