import type { PrepStatus } from "@annamour/protocol";
import {
  audioRenditions,
  type LightAudio,
  lightAudioFor,
  rungPlaylist,
  rungsFor,
  segmentAt,
  segmentDurations,
  segmentSources,
  sourceVariant,
  withLowQualities,
} from "../media/ladder.ts";
import { BYTES_PER_GB, formatGb, roomsToEvict } from "../media/storage-cap.ts";
import { probeTimeline, type TimelineProbe } from "../media/timeline-probe.ts";
import type { AudioTrack, Track, Transcoder, VideoTrack } from "../media/transcoder.ts";
import type { RoomStore } from "../room-store.ts";

/** A minute ready from the séance's position: enough to start, encoding then runs far ahead of playback. */
export const PREP_TARGET_SECONDS = 60;
/** The next episode's first minute (6 segments of 10 s), made ahead so it starts at once. */
const NEXT_EPISODE_SEGMENTS = 6;
/** Encoded files are kept this long after a séance was last watched, then deleted. */
export const KEEP_AFTER_LAST_USE_MS = 6 * 60 * 60 * 1000;
/** A séance watched this recently is never deleted to stay under the disk cap (a pause is not the end). */
export const IN_USE_MS = 60 * 60 * 1000;
/** The disk cap when none is configured (MEDIA_MAX_GB). */
const DEFAULT_MAX_BYTES = 50 * BYTES_PER_GB;
const SEGMENT_FILE = /^(\d{5})\.(ts|aac)$/;

/** A lighter track and the source playlist it follows (same segments, same durations). */
interface Planned<T extends Track> {
  track: T;
  playlist: string;
}

/**
 * Whether the lighter audio is offered. It is only announced once a real
 * segment of the film was made lighter: a source format we cannot handle must
 * never leave the lightest rungs without sound.
 */
type LightAudioState = "none" | "unchecked" | "checking" | "offered" | "refused";

interface FilmPlan {
  /** The master without, then with, the lighter audio group. */
  masters: { plain: string; withLightAudio: string };
  video: Planned<VideoTrack>;
  /** The lighter audio of each language, by track name; empty when the source's audio cannot be made lighter. */
  audio: Map<string, Planned<AudioTrack>>;
  /** Prepared from the start: the language players pick when nobody chose. */
  defaultAudio: Planned<AudioTrack> | undefined;
  lightAudio: LightAudioState;
}

export interface LowQualityServiceOptions {
  store: RoomStore;
  transcoder: Transcoder | undefined;
  now: () => number;
  /** Logs how each film's source audio lines up with its video, once. */
  probe?: TimelineProbe;
  /** What every séance's lighter qualities may take on disk together, before the oldest go. */
  maxBytes?: number;
  log?: (message: string) => void;
}

/**
 * Offers each séance's film in lighter qualities too (see media/), for
 * whoever watches on a weak link: lighter video rungs, and for the lightest
 * ones a lighter audio in every language. Without a transcoder (no ffmpeg),
 * séances keep their single source quality and nothing here changes anything.
 */
export class LowQualityService {
  private readonly store: RoomStore;
  private readonly transcoder: Transcoder | undefined;
  private readonly now: () => number;
  private readonly plans = new Map<string, FilmPlan | null>();
  private readonly lastUse = new Map<string, number>();
  private readonly probe: TimelineProbe | undefined;
  private readonly maxBytes: number;
  private readonly log: (message: string) => void;

  constructor({
    store,
    transcoder,
    now,
    probe,
    maxBytes = DEFAULT_MAX_BYTES,
    log = console.info,
  }: LowQualityServiceOptions) {
    this.store = store;
    this.transcoder = transcoder;
    this.now = now;
    this.probe = probe;
    this.maxBytes = maxBytes;
    this.log = log;
  }

  /** The master with our tracks, or one of our tracks' playlists; undefined to serve the stored playlist as is. */
  playlist(code: string, episode: number, file: string): string | undefined {
    const plan = this.plan(code, episode);
    if (!plan) return undefined;
    if (file === "master.m3u8") {
      this.prepareWhereWatched(plan);
      return plan.lightAudio === "offered" ? plan.masters.withLightAudio : plan.masters.plain;
    }
    const name = file.replace(/\.m3u8$/, "");
    const planned = this.planned(plan, name);
    if (!planned) return undefined;
    this.prepare(planned);
    return rungPlaylist(planned.playlist, name, planned.track.kind === "video" ? "ts" : "aac");
  }

  /** One of our segments: its path once encoded, null if not ready yet, undefined if it does not exist. */
  async segment(code: string, episode: number, name: string, file: string): Promise<string | null | undefined> {
    const plan = this.plan(code, episode);
    const planned = plan ? this.planned(plan, name) : undefined;
    const match = SEGMENT_FILE.exec(file);
    if (!planned || !match || match[2] !== (planned.track.kind === "video" ? "ts" : "aac")) return undefined;
    this.lastUse.set(code, this.now());
    return this.transcoder?.segment(planned.track, name, Number(match[1]));
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
    this.prepareWhereWatched(plan);
    const audio = plan.lightAudio === "offered" && plan.defaultAudio ? [plan.defaultAudio] : [];
    const tracks = [plan.video, ...audio];
    const ready = await Promise.all(tracks.map((planned) => this.readiness(planned)));
    // Near the end of the film, what is left is all there is to prepare.
    const target = Math.min(...ready.map((r) => r.target));
    const readySeconds = Math.min(...ready.map((r) => r.ready), target);
    return { available: true, readySeconds, targetSeconds: target };
  }

  /**
   * Deletes the encoded files of séances nobody has watched for a while, then
   * of the least recently watched ones while all of them take more than the cap.
   */
  async sweep(): Promise<void> {
    const now = this.now();
    for (const [code, at] of this.lastUse) if (now - at > KEEP_AFTER_LAST_USE_MS) this.forget(code);
    await this.transcoder?.sweep((code) => this.lastUse.has(code));
    await this.keepUnderCap(now);
  }

  /** Whole séances go, never part of one: a séance kept is always complete (its init files included). */
  private async keepUnderCap(now: number): Promise<void> {
    if (!this.transcoder) return;
    const rooms = [...(await this.transcoder.usage())].map(([code, bytes]) => {
      const lastUse = this.lastUse.get(code) ?? 0;
      return { code, bytes, lastUse, inUse: now - lastUse < IN_USE_MS };
    });
    const evicted = roomsToEvict(rooms, this.maxBytes);
    for (const code of evicted) this.forget(code);
    if (evicted.length > 0) await this.transcoder.sweep((code) => this.lastUse.has(code));
    const kept = rooms.filter((room) => !evicted.includes(room.code));
    const total = kept.reduce((sum, room) => sum + room.bytes, 0);
    const deleted = evicted.length > 0 ? `, ${evicted.length} older séance(s) deleted to stay under it` : "";
    this.log(
      `Lighter qualities on disk: ${formatGb(total)} for ${kept.length} séance(s), cap ${formatGb(this.maxBytes)}${deleted}`,
    );
  }

  private forget(code: string): void {
    this.lastUse.delete(code);
    for (const key of this.plans.keys()) if (key.startsWith(`${code}/`)) this.plans.delete(key);
  }

  /** Our video rung or lighter audio track of that name. */
  private planned(plan: FilmPlan, name: string): Planned<Track> | undefined {
    if (plan.video.track.rungs.some((rung) => rung.name === name)) return plan.video;
    return plan.lightAudio === "offered" ? plan.audio.get(name) : undefined;
  }

  /** Seconds encoded in a row from where the séance is, up to a minute (or what is left). */
  private async readiness({ track, playlist }: Planned<Track>): Promise<{ ready: number; target: number }> {
    const start = this.startIndex(track, playlist);
    const durations = segmentDurations(playlist);
    const target = Math.min(
      PREP_TARGET_SECONDS,
      durations.slice(start).reduce((sum, d) => sum + d, 0),
    );
    let ready = 0;
    for (let index = start; ready < target && index < durations.length; index++) {
      if (!(await this.transcoder?.isReady(track, index))) break;
      ready += durations[index] ?? 0;
    }
    return { ready, target };
  }

  /** Starts encoding the video and the default lighter audio where the séance is, before anyone asks. */
  private prepareWhereWatched(plan: FilmPlan): void {
    this.prepare(plan.video);
    if (plan.lightAudio === "unchecked") this.checkLightAudio(plan);
    if (plan.lightAudio === "offered" && plan.defaultAudio) this.prepare(plan.defaultAudio);
    const { code, episode } = plan.video.track;
    if (this.store.get(code)?.currentEpisode.id === episode) this.prepareNext(code);
  }

  /**
   * Gets the queued next episode ready to start, behind what is being watched:
   * its first minute, and its lighter audio checked, so moving on to it (the
   * end-of-episode countdown, or « Épisode suivant ») starts at once.
   */
  prepareNext(code: string): void {
    const next = this.store.get(code)?.nextEpisode;
    const plan = next ? this.plan(code, next.id) : undefined;
    if (!plan || !this.transcoder) return;
    this.lastUse.set(code, this.now());
    this.transcoder.prepareLater(plan.video.track, NEXT_EPISODE_SEGMENTS);
    if (plan.lightAudio === "unchecked") this.checkLightAudio(plan, { later: true });
    if (plan.lightAudio === "offered" && plan.defaultAudio) {
      this.transcoder.prepareLater(plan.defaultAudio.track, NEXT_EPISODE_SEGMENTS);
    }
  }

  /** Makes one real segment of the default language lighter; only then is the lighter audio announced. */
  private checkLightAudio(plan: FilmPlan, { later = false } = {}): void {
    const planned = plan.defaultAudio;
    if (!planned || !this.transcoder) return;
    plan.lightAudio = "checking";
    const { track, playlist } = planned;
    void this.transcoder.ensure(track, this.startIndex(track, playlist), { later }).then((made) => {
      plan.lightAudio = made ? "offered" : "refused";
      if (made && later) this.transcoder?.prepareLater(track, NEXT_EPISODE_SEGMENTS);
      else if (made) this.prepare(planned);
      else
        this.log(
          `Lighter audio not offered for ${track.code}/${track.episode}: its source audio could not be made lighter`,
        );
    });
  }

  private prepare({ track, playlist }: Planned<Track>): void {
    this.lastUse.set(track.code, this.now());
    this.transcoder?.prepareFrom(track, this.startIndex(track, playlist));
  }

  /** The track's segment where the séance is (its start when this episode is not the one playing). */
  private startIndex(track: Track, playlist: string): number {
    const room = this.store.get(track.code);
    const current = room?.currentEpisode.id === track.episode;
    return segmentAt(playlist, current ? (room?.positionAt(this.now()) ?? 0) : 0);
  }

  private plan(code: string, episode: number): FilmPlan | undefined {
    if (!this.transcoder) return undefined;
    const key = `${code}/${episode}`;
    if (!this.plans.has(key)) this.plans.set(key, this.makePlan(code, episode));
    return this.plans.get(key) ?? undefined;
  }

  private makePlan(code: string, episode: number): FilmPlan | null {
    const playlists = this.store.get(code)?.episodeById(episode)?.imported.playlists;
    const playlistOf = (uri: string) => playlists?.get(uri);
    const master = playlistOf("master.m3u8");
    const source = master ? sourceVariant(master) : undefined;
    const sourcePlaylist = source ? playlistOf(source.uri) : undefined;
    if (!master || !source || !sourcePlaylist) return null;
    const rungs = rungsFor(source, sourcePlaylist);
    if (rungs.length === 0) return null;
    this.probeOnce(master, sourcePlaylist, playlistOf);
    const lightAudio = this.transcoder?.makesAudio ? lightAudioFor(master, source, playlistOf) : undefined;
    const audio = lightAudio ? audioTracks(code, episode, lightAudio, playlistOf) : new Map();
    const defaultName = lightAudio?.renditions.find((r) => r.isDefault)?.name ?? lightAudio?.renditions[0]?.name;
    return {
      masters: {
        plain: withLowQualities(master, source, rungs),
        withLightAudio: withLowQualities(master, source, rungs, lightAudio),
      },
      lightAudio: lightAudio && defaultName ? "unchecked" : "none",
      video: {
        track: { kind: "video", code, episode, segments: segmentSources(sourcePlaylist), rungs },
        playlist: sourcePlaylist,
      },
      audio,
      defaultAudio: defaultName ? audio.get(defaultName) : undefined,
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

function audioTracks(
  code: string,
  episode: number,
  lightAudio: LightAudio,
  playlist: (uri: string) => string | undefined,
): Map<string, Planned<AudioTrack>> {
  return new Map(
    lightAudio.renditions.flatMap(({ name, sourceUri }) => {
      const source = playlist(sourceUri);
      if (!source) return [];
      const track: AudioTrack = { kind: "audio", code, episode, name, segments: segmentSources(source) };
      return [[name, { track, playlist: source }] as const];
    }),
  );
}
