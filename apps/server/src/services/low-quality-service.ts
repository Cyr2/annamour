import type { PrepStatus } from "@annamour/protocol";
import {
  audioRenditions,
  type Rung,
  rungNamed,
  rungPlaylist,
  rungsFor,
  segmentAt,
  segmentDurations,
  segmentSources,
  sourceVariant,
  withLowQualities,
} from "../media/ladder.ts";
import { probeTimeline, type TimelineProbe } from "../media/timeline-probe.ts";
import type { Film, Transcoder } from "../media/transcoder.ts";
import type { RoomStore } from "../room-store.ts";

/** A minute ready from the séance's position: enough to start, encoding then runs ~15× ahead of playback. */
export const PREP_TARGET_SECONDS = 60;
/** Encoded files are kept this long after a séance was last watched, then deleted. */
export const KEEP_AFTER_LAST_USE_MS = 6 * 60 * 60 * 1000;
const SEGMENT_FILE = /^(\d{5})\.ts$/;

interface FilmPlan {
  film: Film;
  master: string;
  sourcePlaylist: string;
}

export interface LowQualityServiceOptions {
  store: RoomStore;
  transcoder: Transcoder | undefined;
  now: () => number;
  /** Logs how each film's source audio lines up with its video, once. */
  probe?: TimelineProbe;
}

/**
 * Offers each séance's film in lighter qualities too (see media/), for
 * whoever watches on a weak link. Without a transcoder (no ffmpeg), séances
 * keep their single source quality and nothing here changes anything.
 */
export class LowQualityService {
  private readonly store: RoomStore;
  private readonly transcoder: Transcoder | undefined;
  private readonly now: () => number;
  private readonly plans = new Map<string, FilmPlan | null>();
  private readonly lastUse = new Map<string, number>();
  private readonly probe: TimelineProbe | undefined;

  constructor({ store, transcoder, now, probe }: LowQualityServiceOptions) {
    this.store = store;
    this.transcoder = transcoder;
    this.now = now;
    this.probe = probe;
  }

  /** The master with our rungs, or a rung's playlist; undefined to serve the stored playlist as is. */
  playlist(code: string, episode: number, file: string): string | undefined {
    const plan = this.plan(code, episode);
    if (!plan) return undefined;
    const rung = rungNamed(file.replace(/\.m3u8$/, ""));
    if (file === "master.m3u8" || (rung && plan.film.rungs.includes(rung))) {
      this.prepareWhereWatched(plan);
      return rung ? rungPlaylist(plan.sourcePlaylist, rung) : plan.master;
    }
    return undefined;
  }

  /** A rung's segment file: its path once encoded, null if not ready yet, undefined if it does not exist. */
  async segment(code: string, episode: number, rungName: string, file: string): Promise<string | null | undefined> {
    const plan = this.plan(code, episode);
    const rung: Rung | undefined = rungNamed(rungName);
    const index = SEGMENT_FILE.exec(file)?.[1];
    if (!plan || !rung || !plan.film.rungs.includes(rung) || index === undefined) return undefined;
    this.lastUse.set(code, this.now());
    return this.transcoder?.segment(plan.film, rung, Number(index));
  }

  /**
   * How much of the séance's lighter qualities is ready from where it is, and
   * starts preparing them: the salon asks before anyone presses play, so the
   * film starts at once instead of waiting on its first segments.
   */
  async prep(code: string): Promise<PrepStatus | undefined> {
    const room = this.store.get(code);
    if (!room) return undefined;
    const plan = this.plan(code, room.currentEpisode.id);
    if (!plan || !this.transcoder) return { available: false, readySeconds: 0, targetSeconds: PREP_TARGET_SECONDS };
    const start = this.prepareWhereWatched(plan);
    const durations = segmentDurations(plan.sourcePlaylist);
    // Near the end of the film, what is left is all there is to prepare.
    const target = Math.min(
      PREP_TARGET_SECONDS,
      durations.slice(start).reduce((sum, d) => sum + d, 0),
    );
    let readySeconds = 0;
    for (let index = start; readySeconds < target && index < durations.length; index++) {
      if (!(await this.transcoder.isReady(plan.film, index))) break;
      readySeconds += durations[index] ?? 0;
    }
    return { available: true, readySeconds: Math.min(readySeconds, target), targetSeconds: target };
  }

  /** Deletes the encoded files of séances nobody has watched for a while. */
  async sweep(): Promise<void> {
    const now = this.now();
    for (const [code, at] of this.lastUse) if (now - at > KEEP_AFTER_LAST_USE_MS) this.forget(code);
    await this.transcoder?.sweep((code) => this.lastUse.has(code));
  }

  private forget(code: string): void {
    this.lastUse.delete(code);
    for (const key of this.plans.keys()) if (key.startsWith(`${code}/`)) this.plans.delete(key);
  }

  /** Starts encoding where the séance is, so the lighter qualities are ready before anyone asks. Returns that segment. */
  private prepareWhereWatched(plan: FilmPlan): number {
    this.lastUse.set(plan.film.code, this.now());
    const start = this.startIndex(plan);
    this.transcoder?.prepareFrom(plan.film, start);
    return start;
  }

  /** The segment the séance is on (its start when this episode is not the one playing). */
  private startIndex({ film, sourcePlaylist }: FilmPlan): number {
    const room = this.store.get(film.code);
    const current = room?.currentEpisode.id === film.episode;
    return segmentAt(sourcePlaylist, current ? (room?.positionAt(this.now()) ?? 0) : 0);
  }

  private plan(code: string, episode: number): FilmPlan | undefined {
    if (!this.transcoder) return undefined;
    const key = `${code}/${episode}`;
    if (!this.plans.has(key)) this.plans.set(key, this.makePlan(code, episode));
    return this.plans.get(key) ?? undefined;
  }

  private makePlan(code: string, episode: number): FilmPlan | null {
    const playlists = this.store.get(code)?.episodeById(episode)?.imported.playlists;
    const master = playlists?.get("master.m3u8");
    const source = master ? sourceVariant(master) : undefined;
    const sourcePlaylist = source ? playlists?.get(source.uri) : undefined;
    if (!master || !source || !sourcePlaylist) return null;
    const rungs = rungsFor(source, sourcePlaylist);
    if (rungs.length === 0) return null;
    this.probeOnce(master, sourcePlaylist, (uri) => playlists?.get(uri));
    return {
      film: { code, episode, segments: segmentSources(sourcePlaylist), rungs },
      master: withLowQualities(master, source, rungs),
      sourcePlaylist,
    };
  }

  /** Logs how the source's audio lines up with its video (see media/timeline-probe.ts), when it has separate audio. */
  private probeOnce(master: string, sourcePlaylist: string, playlist: (uri: string) => string | undefined): void {
    const audioUri = audioRenditions(master)[0];
    const audioPlaylist = audioUri ? playlist(audioUri) : undefined;
    if (!this.probe || !audioPlaylist) return;
    const [video] = segmentSources(sourcePlaylist).slice(1, 2);
    const [first, second] = segmentSources(audioPlaylist).slice(1, 3);
    if (!video || !first || !second) return;
    const segments = {
      video,
      videoDuration: segmentDurations(sourcePlaylist)[1] ?? 10,
      audio: [first, second] as const,
      audioDuration: segmentDurations(audioPlaylist)[1] ?? 10,
    };
    probeTimeline(this.probe, segments).catch((error: unknown) =>
      this.probe?.log(`Source timeline probe failed: ${String(error)}`),
    );
  }
}
