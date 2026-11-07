import { access, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { AudioSegmentEncoder, SegmentEncoder } from "./ffmpeg.ts";
import { type HevcRung, Mp4Error, splitMp4 } from "./hevc.ts";
import type { HevcChecker, HevcEncoder } from "./hevc-ffmpeg.ts";
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
 * its neighbours (kept on disk, they are small). HEVC tracks (Apple only)
 * make fragmented MP4: an init per rung, then one media segment per source
 * segment; they are prepared after the H.264 ones, which never wait for them.
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

export interface HevcTrack extends TrackBase {
  kind: "hevc";
  rungs: readonly HevcRung[];
}

export interface AudioTrack extends TrackBase {
  kind: "audio";
  /** The lighter track's name, its folder and playlist (e.g. "lo-a0"). */
  name: string;
  /** "fmp4" for the HEVC rungs' audio; packed like the source otherwise. */
  container?: "fmp4";
  /** Whose downloaded source segments to reuse (the same language's other lighter track). */
  sourceOf?: string;
}

export type Track = VideoTrack | HevcTrack | AudioTrack;

export interface TranscoderOptions {
  /** Where encoded segments are kept (a persistent volume). */
  dir: string;
  source: SegmentSource;
  encode: SegmentEncoder;
  encodeAudio?: AudioSegmentEncoder;
  /** HEVC (Apple only): the rungs' encoder, its check, and the fMP4 audio. All three, or no HEVC. */
  hevc?: { encode: HevcEncoder; check: HevcChecker; encodeAudio: AudioSegmentEncoder };
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
/**
 * What must never hold back what is watched now: the next episode's start,
 * HEVC preparation, checks made ahead. Done once what is watched now is covered.
 */
const LATER = 2;
const MAX_ATTEMPTS = 4;
const REPORT_EVERY = 30;
/** The init segment of a fragmented-MP4 rung or audio track, and what was learnt when it was made. */
export const INIT_FILE = "init.mp4";
const INFO_FILE = "info.json";

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
  return track.kind === "audio" ? [track.name] : track.rungs.map((rung) => rung.name);
}

const isFragmented = (track: Track) => track.kind === "hevc" || (track.kind === "audio" && track.container === "fmp4");
const extension = (track: Track) => (isFragmented(track) ? "m4s" : track.kind === "video" ? "ts" : "aac");
const trackId = (track: Track) => `${track.code}/${track.episode}/${track.kind === "audio" ? track.name : track.kind}`;
/** Preparing ahead: HEVC work only once the H.264 tracks are served. */
const aheadPriority = (track: Track) => (isFragmented(track) ? LATER : AHEAD);

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, i) => byte === b[i]);

export class Transcoder {
  private readonly options: Required<Omit<TranscoderOptions, "encodeAudio" | "hevc">> &
    Pick<TranscoderOptions, "encodeAudio" | "hevc">;
  private readonly jobs = new Map<string, Job>();
  private readonly pending: Job[] = [];
  private running = 0;
  private encoded = 0;
  private encodeMs = 0;
  private hevcEncoded = 0;
  private hevcMs = 0;
  /** Requests answered « retry » because their segment was not ready: should stay near 0. */
  private late = 0;

  constructor(options: TranscoderOptions) {
    this.options = { workers: 2, ahead: 60, waitMs: 9000, retryDelayMs: 3000, log: console.info, ...options };
  }

  /** Lighter audio can be made (an audio encoder is set). */
  get makesAudio(): boolean {
    return this.options.encodeAudio !== undefined;
  }

  /** HEVC rungs can be made (Apple only). */
  get makesHevc(): boolean {
    return this.options.hevc !== undefined;
  }

  /** Where one of a track's outputs is kept for a segment. */
  path(track: Track, output: string, index: number): string {
    return join(this.folder(track, output), segmentFile(index, extension(track)));
  }

  /** A fragmented-MP4 output's init segment, once made, with the frame rate measured then. */
  async init(track: Track, output: string): Promise<{ path: string; bytes: Uint8Array; frameRate?: number } | null> {
    const path = join(this.folder(track, output), INIT_FILE);
    if (!(await exists(path))) return null;
    const info = await readFile(join(this.folder(track, output), INFO_FILE), "utf8").catch(() => "{}");
    const { frameRate } = JSON.parse(info) as { frameRate?: number };
    return { path, bytes: new Uint8Array(await readFile(path)), ...(frameRate ? { frameRate } : {}) };
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
  async ensure(track: Track, index: number, { later = false } = {}): Promise<boolean> {
    if (await this.isReady(track, index)) return true;
    return this.enqueue(track, index, later ? LATER : NOW).done;
  }

  /** Every output of this segment is encoded. */
  async isReady(track: Track, index: number): Promise<boolean> {
    const ready = await Promise.all(outputNames(track).map((name) => exists(this.path(track, name, index))));
    return ready.every(Boolean);
  }

  /** Prepares the next minutes from `index` (where the séance is), dropping what a seek left behind. */
  /**
   * Prepares a track's first `count` segments after everything else: the next
   * episode, so moving on to it starts at once.
   */
  prepareLater(track: Track, count: number): void {
    for (let i = 0; i < Math.min(count, track.segments.length); i++) this.enqueue(track, i, LATER);
  }

  prepareFrom(track: Track, index: number): void {
    const end = Math.min(track.segments.length, index + this.options.ahead);
    const id = trackId(track);
    const priority = aheadPriority(track);
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const job = this.pending[i];
      if (job && trackId(job.track) === id && job.priority === priority && (job.index < index || job.index >= end)) {
        this.pending.splice(i, 1);
        this.forget(job, false);
      }
    }
    for (let i = Math.max(0, index); i < end; i++) this.enqueue(track, i, priority);
  }

  /** Deletes the files of every séance `keep` no longer wants. */
  async sweep(keep: (code: string) => boolean): Promise<void> {
    const codes = await readdir(this.options.dir).catch(() => []);
    await Promise.all(
      codes
        .filter((code) => !keep(code))
        // A segment being written meanwhile can make a folder non-empty again: retry, and never fail the sweep.
        .map((code) =>
          rm(join(this.options.dir, code), { recursive: true, force: true, maxRetries: 3 }).catch(() => {}),
        ),
    );
  }

  private folder(track: Track, output: string): string {
    return join(this.options.dir, track.code, String(track.episode), output);
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
      // A HEVC segment that breaks Safari's rules will break them again: no point retrying.
      if (job.attempts >= MAX_ATTEMPTS || error instanceof Mp4Error) {
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
    await Promise.all(missing.map((output) => mkdir(dirname(output.path), { recursive: true })));
    const started = performance.now();
    if (track.kind === "video") await this.makeVideo(track, index, missing);
    else if (track.kind === "hevc") await this.makeHevc(track, index, missing);
    else await this.makeAudio(track, index, missing[0]?.path ?? "");
    await Promise.all(missing.map((output) => rename(`${output.path}.part`, output.path)));
    this.report(performance.now() - started, track.kind === "hevc");
  }

  /** Downloads one source video segment for `work`, then lets it go. */
  private async withSource(track: Track, index: number, work: (input: string) => Promise<void>): Promise<void> {
    const source = track.segments[index];
    if (source === undefined) throw new Error(`No source segment ${index}`);
    const input = join(
      this.options.dir,
      track.code,
      String(track.episode),
      `source-${track.kind}-${segmentFile(index)}`,
    );
    await writeFile(input, await this.options.source(new URL(source)));
    try {
      await work(input);
    } finally {
      await rm(input, { force: true });
    }
  }

  private async makeVideo(track: VideoTrack, index: number, missing: Array<{ name: string; path: string }>) {
    await this.withSource(track, index, (input) => {
      const outputs = missing.flatMap(({ name, path }) => {
        const rung = track.rungs.find((candidate) => candidate.name === name);
        return rung ? [{ rung, path: `${path}.part` }] : [];
      });
      return this.options.encode(input, outputs);
    });
  }

  private async makeHevc(track: HevcTrack, index: number, missing: Array<{ name: string; path: string }>) {
    const hevc = this.options.hevc;
    if (!hevc) throw new Error("No HEVC encoder");
    await this.withSource(track, index, async (input) => {
      const outputs = missing.flatMap(({ name, path }) => {
        const rung = track.rungs.find((candidate) => candidate.name === name);
        return rung ? [{ rung, path: `${path}.mp4` }] : [];
      });
      try {
        await hevc.encode(input, outputs);
        for (const { path } of outputs) {
          const { frameRate } = await hevc.check(input, path);
          await this.storeFragmented(path.slice(0, -".mp4".length), new Uint8Array(await readFile(path)), frameRate);
        }
      } finally {
        await Promise.all(outputs.map(({ path }) => rm(path, { force: true })));
      }
    });
  }

  /**
   * Splits a fragmented MP4 into the segment (written as `path.part`) and the
   * init, kept once per output. Every segment's init must be the same bytes:
   * Safari reads the init once, then decodes every segment with it.
   */
  private async storeFragmented(path: string, mp4: Uint8Array, frameRate?: number): Promise<void> {
    const { init, segment } = splitMp4(mp4);
    const initPath = join(dirname(path), INIT_FILE);
    if (await exists(initPath)) {
      if (!sameBytes(new Uint8Array(await readFile(initPath)), init)) throw new Mp4Error(`Init changed in ${initPath}`);
    } else {
      await writeFile(`${initPath}.part`, init);
      await rename(`${initPath}.part`, initPath);
      if (frameRate) await writeFile(join(dirname(path), INFO_FILE), JSON.stringify({ frameRate }));
    }
    await writeFile(`${path}.part`, segment);
  }

  private async makeAudio(track: AudioTrack, index: number, path: string) {
    const fragmented = track.container === "fmp4";
    const encodeAudio = fragmented ? this.options.hevc?.encodeAudio : this.options.encodeAudio;
    if (!encodeAudio) throw new Error("No audio encoder");
    const [previous, current, next] = await Promise.all([
      this.sourceAudio(track, index - 1),
      this.sourceAudio(track, index),
      this.sourceAudio(track, index + 1),
    ]);
    if (!current) throw new Error(`No source segment ${index}`);
    const work = await mkdtemp(join(tmpdir(), "annamour-audio-"));
    try {
      const encoded = await encodeAudio({ previous, current, next }, work);
      if (fragmented) await this.storeFragmented(path, encoded);
      else await writeFile(`${path}.part`, encoded);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }

  /** A source audio segment, downloaded once and kept with the séance (they are small); undefined past the ends. */
  private async sourceAudio(track: AudioTrack, index: number): Promise<Uint8Array | undefined> {
    const url = track.segments[index];
    if (url === undefined) return undefined;
    const folder = `source-${track.sourceOf ?? track.name}`;
    const cached = join(this.options.dir, track.code, String(track.episode), folder, segmentFile(index, "aac"));
    if (await exists(cached)) return readFile(cached);
    const bytes = await this.options.source(new URL(url));
    await mkdir(dirname(cached), { recursive: true });
    await writeFile(`${cached}.part`, bytes);
    await rename(`${cached}.part`, cached);
    return bytes;
  }

  /** Tells the server log how fast encoding goes, to size the workers. */
  private report(ms: number, hevc: boolean): void {
    this.encoded++;
    this.encodeMs += ms;
    if (hevc) {
      this.hevcEncoded++;
      this.hevcMs += ms;
    }
    if (this.encoded % REPORT_EVERY !== 0) return;
    const average = Math.round(this.encodeMs / this.encoded);
    const hevcPart = this.hevcEncoded
      ? ` (HEVC: ${this.hevcEncoded} segments, ${Math.round(this.hevcMs / this.hevcEncoded)} ms each)`
      : "";
    this.options.log(
      `Lighter qualities: ${this.encoded} segments encoded, ${average} ms each on average${hevcPart}, ${this.late} not ready in time for a player`,
    );
  }

  private forget(job: Job, ok: boolean): void {
    this.jobs.delete(`${trackId(job.track)}/${job.index}`);
    job.settle(ok);
  }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
