import {
  type Rung,
  rungNamed,
  rungPlaylist,
  rungsFor,
  segmentAt,
  segmentSources,
  sourceVariant,
  withLowQualities,
} from "../media/ladder.ts";
import type { Film, Transcoder } from "../media/transcoder.ts";
import type { RoomStore } from "../room-store.ts";

/** Encoded files are kept this long after a séance was last watched, then deleted. */
export const KEEP_AFTER_LAST_USE_MS = 6 * 60 * 60 * 1000;
const SEGMENT_FILE = /^(\d{5})\.ts$/;

interface FilmPlan {
  film: Film;
  master: string;
  sourcePlaylist: string;
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

  constructor({ store, transcoder, now }: { store: RoomStore; transcoder: Transcoder | undefined; now: () => number }) {
    this.store = store;
    this.transcoder = transcoder;
    this.now = now;
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

  /** Starts encoding where the séance is, so the lighter qualities are ready before anyone asks. */
  private prepareWhereWatched({ film, sourcePlaylist }: FilmPlan): void {
    this.lastUse.set(film.code, this.now());
    const room = this.store.get(film.code);
    const current = room?.currentEpisode.id === film.episode;
    const position = current ? (room?.positionAt(this.now()) ?? 0) : 0;
    this.transcoder?.prepareFrom(film, segmentAt(sourcePlaylist, position));
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
    return {
      film: { code, episode, segments: segmentSources(sourcePlaylist), rungs },
      master: withLowQualities(master, source, rungs),
      sourcePlaylist,
    };
  }
}
