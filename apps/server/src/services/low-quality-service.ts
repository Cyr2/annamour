import type { PrepStatus } from "@annamour/protocol";
import {
  FULL_LADDER_HEIGHT,
  fmp4Playlist,
  HEVC_HIGH_RUNGS,
  HEVC_RUNGS,
  HEVC_SOUND_KBPS,
  type HevcOffer,
  type HevcRung,
  type HevcSound,
  hevcAudio,
  hevcCodecs,
  hevcLadderMaster,
  withHevc,
} from "../media/hevc.ts";
import {
  audioRenditions,
  evenWidth,
  type LightAudio,
  lightAudioFor,
  rungPlaylist,
  rungsFor,
  type SourceVariant,
  segmentAt,
  segmentDurations,
  segmentSources,
  sourceAudioCodec,
  sourceVariant,
  withLowQualities,
} from "../media/ladder.ts";
import { probeTimeline, type TimelineProbe } from "../media/timeline-probe.ts";
import type { AudioTrack, HevcTrack, Track, Transcoder, VideoTrack } from "../media/transcoder.ts";
import type { RoomStore } from "../room-store.ts";

/** A minute ready from the séance's position: enough to start, encoding then runs far ahead of playback. */
export const PREP_TARGET_SECONDS = 60;
/** The next episode's first minute (6 segments of 10 s), made ahead so it starts at once. */
const NEXT_EPISODE_SEGMENTS = 6;
/** Encoded files are kept this long after a séance was last watched, then deleted. */
export const KEEP_AFTER_LAST_USE_MS = 6 * 60 * 60 * 1000;
const SEGMENT_FILE = /^(\d{5})\.(ts|aac|m4s)$/;
const INIT_FILE = "init.mp4";

/** A lighter track and the source playlist it follows (same segments, same durations). */
interface Planned<T extends Track> {
  track: T;
  playlist: string;
}

/**
 * Whether something extra is offered (the lighter audio, the HEVC rungs). It
 * is only announced once a real segment of the film was made and passed its
 * checks: a source we cannot handle must never leave a player without sound
 * or picture.
 */
type OfferState = "none" | "unchecked" | "checking" | "offered" | "refused";

/** A set of HEVC rungs and their fMP4 audio, checked and offered on its own. */
interface HevcPart {
  source: SourceVariant;
  video: Planned<HevcTrack>;
  audio: Map<string, Planned<AudioTrack>>;
  defaultAudio: Planned<AudioTrack>;
  /** The fMP4 audio group, as the master lists it. */
  sound: HevcOffer["audio"];
  /** Who it is for, in the log. */
  audience: string;
  state: Exclude<OfferState, "none">;
  /** Set once offered. */
  offer?: HevcOffer;
}

interface HevcPlan {
  /** 360p to 234p with the lighter audio: for Apple's own player, beside its H.264 ladder. */
  low: HevcPart;
  /** 480p to 720p with the source's audio (HEVC_FULL=on, 720p source): with `low`, the complete ladder. */
  high: HevcPart | undefined;
}

interface FilmPlan {
  /** The master without, then with, the lighter audio group. */
  masters: { plain: string; withLightAudio: string };
  video: Planned<VideoTrack>;
  /** The lighter audio of each language, by track name; empty when the source's audio cannot be made lighter. */
  audio: Map<string, Planned<AudioTrack>>;
  /** Prepared from the start: the language players pick when nobody chose. */
  defaultAudio: Planned<AudioTrack> | undefined;
  lightAudio: OfferState;
  hevc: HevcPlan | undefined;
}

/** Who is asking (see media/hevc.ts). */
export interface Asker {
  /** Apple's own player (AVPlayer): the only one shown the HEVC rungs. */
  apple?: boolean;
  /** A page on an iPhone, iPad or Mac: its native player may ask soon, so the HEVC rungs get checked. */
  appleDevice?: boolean;
  /**
   * Our hls.js player on an Apple device that decodes HEVC asked for the
   * complete HEVC ladder (`?hevc=1`): it gets that ladder alone, once checked.
   */
  hevcLadder?: boolean;
}

export interface LowQualityServiceOptions {
  store: RoomStore;
  transcoder: Transcoder | undefined;
  now: () => number;
  /** Logs how each film's source audio lines up with its video, once. */
  probe?: TimelineProbe;
  log?: (message: string) => void;
}

const isFragmented = (track: Track) => track.kind === "hevc" || (track.kind === "audio" && track.container === "fmp4");
const extensionOf = (track: Track) => (isFragmented(track) ? "m4s" : track.kind === "video" ? "ts" : "aac");

/**
 * Offers each séance's film in lighter qualities too (see media/), for
 * whoever watches on a weak link: lighter video rungs, a lighter audio in
 * every language for the lightest ones, HEVC rungs for Safari's own player,
 * and the complete HEVC ladder for our player on an iPad asking for it.
 * Without a transcoder (no ffmpeg), séances keep their single source quality
 * and nothing here changes anything.
 */
export class LowQualityService {
  private readonly store: RoomStore;
  private readonly transcoder: Transcoder | undefined;
  private readonly now: () => number;
  private readonly plans = new Map<string, FilmPlan | null>();
  private readonly lastUse = new Map<string, number>();
  private readonly probe: TimelineProbe | undefined;
  private readonly log: (message: string) => void;

  constructor({ store, transcoder, now, probe, log = console.info }: LowQualityServiceOptions) {
    this.store = store;
    this.transcoder = transcoder;
    this.now = now;
    this.probe = probe;
    this.log = log;
  }

  /** The master with our tracks, or one of our tracks' playlists; undefined to serve the stored playlist as is. */
  playlist(code: string, episode: number, file: string, asker: Asker = {}): string | undefined {
    const plan = this.plan(code, episode);
    if (!plan) return undefined;
    if (file === "master.m3u8") {
      this.prepareWhereWatched(plan, asker);
      return this.master(plan, asker);
    }
    const name = file.replace(/\.m3u8$/, "");
    const planned = this.planned(plan, name);
    if (!planned) return undefined;
    this.prepare(planned);
    if (isFragmented(planned.track)) return fmp4Playlist(planned.playlist, name);
    return rungPlaylist(planned.playlist, name, extensionOf(planned.track) === "ts" ? "ts" : "aac");
  }

  /** One of our segments (or a fMP4 init): its path once made, null if not ready yet, undefined if it does not exist. */
  async segment(code: string, episode: number, name: string, file: string): Promise<string | null | undefined> {
    const plan = this.plan(code, episode);
    const planned = plan ? this.planned(plan, name) : undefined;
    if (!planned) return undefined;
    if (file === INIT_FILE)
      return isFragmented(planned.track) ? (await this.transcoder?.init(planned.track, name))?.path : undefined;
    const match = SEGMENT_FILE.exec(file);
    if (!match || match[2] !== extensionOf(planned.track)) return undefined;
    this.lastUse.set(code, this.now());
    return this.transcoder?.segment(planned.track, name, Number(match[1]));
  }

  /**
   * How much of the séance's lighter qualities is ready from where it is, and
   * starts preparing them: the salon asks before anyone presses play, so the
   * film starts at once instead of waiting on its first segments.
   */
  async prep(code: string, asker: Asker = {}): Promise<PrepStatus | undefined> {
    const room = this.store.get(code);
    if (!room) return undefined;
    const plan = this.plan(code, room.currentEpisode.id);
    if (!plan || !this.transcoder) return { available: false, readySeconds: 0, targetSeconds: PREP_TARGET_SECONDS };
    this.prepareWhereWatched(plan, asker);
    const audio = plan.lightAudio === "offered" && plan.defaultAudio ? [plan.defaultAudio] : [];
    const tracks = [plan.video, ...audio];
    const ready = await Promise.all(tracks.map((planned) => this.readiness(planned)));
    // Near the end of the film, what is left is all there is to prepare.
    const target = Math.min(...ready.map((r) => r.target));
    const readySeconds = Math.min(...ready.map((r) => r.ready), target);
    return { available: true, readySeconds, targetSeconds: target };
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

  /**
   * The master this player gets: with the lighter audio once it proved to
   * work; for Apple's own player, with the lowest HEVC rungs once they did;
   * for our player asking for it, the complete HEVC ladder alone once both
   * its parts did (until then, the H.264 one).
   */
  private master(plan: FilmPlan, asker: Asker): string {
    const base = plan.lightAudio === "offered" ? plan.masters.withLightAudio : plan.masters.plain;
    const hevc = plan.hevc;
    const ladder = asker.hevcLadder ? completeLadder(hevc) : undefined;
    if (ladder) return hevcLadderMaster(base, ladder);
    const low = asker.apple ? hevc?.low.offer : undefined;
    return low && hevc ? withHevc(base, hevc.low.source.info, low) : base;
  }

  /** Our track of that name: a video rung, a lighter audio, or (once offered) a HEVC rung or its audio. */
  private planned(plan: FilmPlan, name: string): Planned<Track> | undefined {
    if (plan.video.track.rungs.some((rung) => rung.name === name)) return plan.video;
    for (const part of [plan.hevc?.low, plan.hevc?.high]) {
      if (!part?.offer) continue;
      if (part.video.track.rungs.some((rung) => rung.name === name)) return part.video;
      const audio = part.audio.get(name);
      if (audio) return audio;
    }
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

  /**
   * Starts encoding where the séance is, before anyone asks. An Apple device
   * gets the HEVC rungs checked; Apple's own player gets them prepared too.
   */
  private prepareWhereWatched(plan: FilmPlan, asker: Asker): void {
    this.prepare(plan.video);
    if (plan.lightAudio === "unchecked") this.checkLightAudio(plan);
    if (plan.lightAudio === "offered" && plan.defaultAudio) this.prepare(plan.defaultAudio);
    this.prepareHevc(plan.hevc, asker);
    const { code, episode } = plan.video.track;
    if (this.store.get(code)?.currentEpisode.id === episode) this.prepareNext(code);
  }

  /**
   * Any page on an Apple device gets the lowest HEVC rungs checked, our player
   * asking for the complete ladder its higher rungs too. Whoever is served HEVC
   * gets its lowest rungs prepared (where a player starts on a weak link); the
   * higher ones are prepared once their playlist is asked for.
   */
  private prepareHevc(hevc: HevcPlan | undefined, { apple = false, appleDevice = false, hevcLadder = false }: Asker) {
    if (!hevc || !(apple || appleDevice || hevcLadder)) return;
    if (hevc.low.state === "unchecked") this.checkHevc(hevc.low);
    if (hevcLadder && hevc.high?.state === "unchecked") this.checkHevc(hevc.high);
    const served = (apple && hevc.low.offer) || (hevcLadder && completeLadder(hevc));
    if (served) {
      this.prepare(hevc.low.video);
      this.prepare(hevc.low.defaultAudio);
    }
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

  /**
   * Makes two real consecutive HEVC segments (their inits must match) and the
   * default language's fMP4 audio, behind every H.264 job, each checked as it
   * is made (hvc1, key frame first, the source's clock). Only then is that
   * part offered.
   */
  private checkHevc(part: HevcPart): void {
    const transcoder = this.transcoder;
    if (!transcoder) return;
    part.state = "checking";
    const { video, defaultAudio } = part;
    const start = this.startIndex(video.track, video.playlist);
    const made = [start, start + 1]
      .filter((index) => index < video.track.segments.length)
      .map((index) => transcoder.ensure(video.track, index, { later: true }));
    const audioStart = this.startIndex(defaultAudio.track, defaultAudio.playlist);
    made.push(transcoder.ensure(defaultAudio.track, audioStart, { later: true }));
    void Promise.all(made)
      .then((all) => (all.every(Boolean) ? this.hevcOffer(part) : undefined))
      .catch(() => undefined)
      .then((offer) => {
        const where = `${video.track.code}/${video.track.episode}`;
        part.state = offer ? "offered" : "refused";
        if (offer) {
          part.offer = offer;
          this.log(`HEVC offered to ${part.audience} for ${where}: ${offer.rungs.map((r) => r.codecs).join(", ")}`);
        } else
          this.log(
            `HEVC not offered to ${part.audience} for ${where}: its segments could not be made or failed their checks`,
          );
      });
  }

  /** The CODECS of each HEVC rung, read from its init, with its frame rate. */
  private async hevcOffer(part: HevcPart): Promise<HevcOffer | undefined> {
    const transcoder = this.transcoder;
    if (!transcoder) return undefined;
    const rungs: Array<HevcOffer["rungs"][number]> = [];
    for (const rung of part.video.track.rungs) {
      const init = await transcoder.init(part.video.track, rung.name);
      if (!init?.frameRate) return undefined;
      rungs.push({
        rung,
        codecs: hevcCodecs(init.bytes),
        width: evenWidth(part.source, rung.height),
        frameRate: init.frameRate,
      });
    }
    if (!(await transcoder.init(part.defaultAudio.track, part.defaultAudio.track.name))) return undefined;
    return { rungs, audio: part.sound };
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
    const packedAudio = lightAudioFor(master, source, playlistOf);
    const lightAudio = this.transcoder?.makesAudio ? packedAudio : undefined;
    const audio = lightAudio ? audioTracks(code, episode, lightAudio, playlistOf) : new Map();
    const defaultName = lightAudio?.renditions.find((r) => r.isDefault)?.name ?? lightAudio?.renditions[0]?.name;
    const video: Planned<VideoTrack> = {
      track: { kind: "video", code, episode, segments: segmentSources(sourcePlaylist), rungs },
      playlist: sourcePlaylist,
    };
    return {
      masters: {
        plain: withLowQualities(master, source, rungs),
        withLightAudio: withLowQualities(master, source, rungs, lightAudio),
      },
      lightAudio: lightAudio && defaultName ? "unchecked" : "none",
      video,
      audio,
      defaultAudio: defaultName ? audio.get(defaultName) : undefined,
      hevc: this.transcoder?.makesHevc
        ? hevcPlan(video, source, packedAudio, playlistOf, this.transcoder.makesFullHevc)
        : undefined,
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

/** The complete HEVC ladder (higher rungs, then lowest), once both its parts are offered. */
function completeLadder(hevc: HevcPlan | undefined): HevcOffer[] | undefined {
  const [high, low] = [hevc?.high?.offer, hevc?.low.offer];
  return high && low ? [high, low] : undefined;
}

interface HevcContext {
  video: Planned<VideoTrack>;
  source: SourceVariant;
  packedAudio: LightAudio;
  playlist: (uri: string) => string | undefined;
}

/**
 * The HEVC rungs below the source with the lighter audio in fMP4 for each
 * language, and with `full` (on a 720p source) the higher rungs up to 720p
 * with the source's own audio in fMP4. None without separate packed audio:
 * HEVC rungs carry no sound of their own, and a muxed-audio source is not
 * worth the extra path here.
 */
function hevcPlan(
  video: Planned<VideoTrack>,
  source: SourceVariant,
  packedAudio: LightAudio | undefined,
  playlist: (uri: string) => string | undefined,
  full: boolean,
): HevcPlan | undefined {
  if (!packedAudio) return undefined;
  const context = { video, source, packedAudio, playlist };
  const lowRungs = HEVC_RUNGS.filter((rung) => rung.height < source.height);
  const low = hevcPart(context, "low", lowRungs, "light");
  if (!low) return undefined;
  const fits = full && source.height === FULL_LADDER_HEIGHT;
  return { low, high: fits ? hevcPart(context, "high", HEVC_HIGH_RUNGS, "source") : undefined };
}

const AUDIENCE = { low: "Apple players", high: "our iPad player (complete ladder)" } as const;

function hevcPart(
  { video, source, packedAudio, playlist }: HevcContext,
  part: HevcTrack["part"],
  rungs: readonly HevcRung[],
  sound: HevcSound,
): HevcPart | undefined {
  if (rungs.length === 0) return undefined;
  const { code, episode, segments } = video.track;
  const twin = hevcAudio(packedAudio, sound);
  const audio = new Map(
    twin.renditions.flatMap(({ name, sourceUri, sourceOf }) => {
      const sourcePlaylist = playlist(sourceUri);
      if (!sourcePlaylist) return [];
      const track: AudioTrack = {
        ...{ kind: "audio", code, episode, name, container: "fmp4", sourceOf },
        ...(sound === "source" ? { sound } : {}),
        segments: segmentSources(sourcePlaylist),
      };
      return [[name, { track, playlist: sourcePlaylist }] as const];
    }),
  );
  const defaultName = twin.renditions.find((r) => r.isDefault)?.name ?? twin.renditions[0]?.name;
  const defaultAudio = defaultName ? audio.get(defaultName) : undefined;
  if (!defaultAudio) return undefined;
  const codec = sound === "source" ? (sourceAudioCodec(source) ?? "mp4a.40.2") : "mp4a.40.2";
  return {
    source,
    video: { track: { kind: "hevc", part, code, episode, segments, rungs }, playlist: video.playlist },
    audio,
    defaultAudio,
    sound: { group: twin.group, lines: twin.renditions.map((r) => r.line), codec, kbps: HEVC_SOUND_KBPS[sound] },
    audience: AUDIENCE[part],
    state: "unchecked",
  };
}
