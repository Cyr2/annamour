import { type AudioTrack, correct, type PlaybackState, positionAt } from "@annamour/protocol";
import type Hls from "hls.js";
import type { SyncClient } from "./SyncClient.ts";

/*
 * Keeps one <video> on the shared timeline.
 *
 * The server owns PlaybackState {status, position, at}. Every LOOP_MS we
 * compute where the video should be (positionAt at the shared server clock)
 * and close the gap: nudging playbackRate for small drift, seeking for large.
 *
 * Echo loops: changes we make to the element (play/pause/seek) fire the same
 * DOM events as a person using native controls. We mark each programmatic
 * change as "expected" and swallow its event; any other event is only sent to
 * the server if it actually disagrees with the shared state.
 */

export type PlaybackEngine = "native" | "hls.js";

export interface PlayerSyncState {
  /** The browser refused to start playback without a tap. Call unlock() from a click. */
  blocked: boolean;
  /** This device is short of data (as reported to the room). */
  buffering: boolean;
  engine: PlaybackEngine | null;
  error: string | null;
}

export const initialPlayerSyncState: PlayerSyncState = {
  blocked: false,
  buffering: false,
  engine: null,
  error: null,
};

const LOOP_MS = 500;
const BUFFERING_DEBOUNCE_MS = 400;
/** While paused, how far off we tolerate before seeking (s). */
const PAUSED_TOLERANCE = 0.15;
/** A seek we didn't make is only a "user seek" if it lands this far from the shared position (s). */
const USER_SEEK_TOLERANCE = 1;
/** After a correction seek, let playback settle before judging drift again (ms). */
const SEEK_COOLDOWN_MS = 1200;
/** How long a programmatic play/pause stays "expected" (ms). */
const EXPECT_PLAY_PAUSE_MS = 1500;
const EXPECT_SEEK_MS = 5000;
/** How long our own optimistic state wins before the server's echo (ms). */
const OPTIMISTIC_MS = 2000;
const MAX_FATAL_RECOVERIES = 3;

const HAVE_METADATA = 1;
const HAVE_FUTURE_DATA = 3;

const now = () => performance.now();

function isApple(): boolean {
  return /Apple/.test(navigator.vendor);
}

export class PlayerSync {
  private readonly video: HTMLVideoElement;
  private readonly client: SyncClient;
  private readonly emit: (state: PlayerSyncState) => void;
  private state: PlayerSyncState = { ...initialPlayerSyncState };

  private playback: PlaybackState | null = null;
  /** Our own action, applied before the server confirms it. */
  private optimistic: { state: PlaybackState; until: number } | null = null;

  private src: string | null = null;
  private sourceToken = 0;
  private sourceReady = false;
  private hls: Hls | null = null;
  /** Safari's own player refused this source: hls.js (Media Source, on recent iPads too) gets a go. */
  private nativeFailed = false;
  private fatalRecoveries = 0;
  /** Element events only count as a person's actions once the source has settled (first canplay). */
  private armed = false;

  private expectPlayUntil = 0;
  private expectPauseUntil = 0;
  private expectSeekUntil = 0;
  private seekIssuedAt = -Infinity;
  /** Seconds a seek takes to land, learned; we seek that far ahead while playing. */
  private seekLead = 0.15;

  private bufferingDesired = false;
  private bufferingSent = false;
  private bufferingTimer: ReturnType<typeof setTimeout> | undefined;

  /** The audio rendition this person picked; personal, never sent to the room. */
  private audioChoice: AudioTrack | null = null;

  private loop: ReturnType<typeof setInterval> | undefined;
  private destroyed = false;
  private readonly offStatus: () => void;

  constructor(video: HTMLVideoElement, client: SyncClient, emit: (state: PlayerSyncState) => void) {
    this.video = video;
    this.client = client;
    this.emit = emit;

    video.playsInline = true;
    video.preload = "auto";

    video.addEventListener("play", this.onPlay);
    video.addEventListener("pause", this.onPause);
    video.addEventListener("seeked", this.onSeeked);
    video.addEventListener("canplay", this.onCanPlay);
    video.addEventListener("loadedmetadata", this.tick);
    video.addEventListener("loadedmetadata", this.applyAudio);
    video.addEventListener("error", this.onMediaError);
    for (const type of BUFFER_EVENTS) video.addEventListener(type, this.evaluateBuffering);
    document.addEventListener("visibilitychange", this.onVisibility);

    // A fresh connection means the server forgot our buffering flag: report again.
    this.offStatus = client.onStatus((status) => {
      if (status !== "open") return;
      this.bufferingSent = false;
      this.bufferingDesired = false;
      this.evaluateBuffering();
      this.tick();
    });

    this.loop = setInterval(this.tick, LOOP_MS);
  }

  destroy(): void {
    this.destroyed = true;
    clearInterval(this.loop);
    clearTimeout(this.bufferingTimer);
    this.offStatus();
    const video = this.video;
    video.removeEventListener("play", this.onPlay);
    video.removeEventListener("pause", this.onPause);
    video.removeEventListener("seeked", this.onSeeked);
    video.removeEventListener("canplay", this.onCanPlay);
    video.removeEventListener("loadedmetadata", this.tick);
    video.removeEventListener("loadedmetadata", this.applyAudio);
    video.removeEventListener("error", this.onMediaError);
    for (const type of BUFFER_EVENTS) video.removeEventListener(type, this.evaluateBuffering);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.teardownSource();
  }

  /* ---------- inputs from the room ---------- */

  setPlayback(playback: PlaybackState | null): void {
    if (playback === this.playback) return;
    this.playback = playback;
    this.optimistic = null; // the server has spoken
    if (playback?.status === "paused" && this.state.blocked) this.update({ blocked: false });
    this.tick();
  }

  setSource(src: string | null): void {
    if (src === this.src) return;
    this.src = src;
    this.nativeFailed = false;
    const token = ++this.sourceToken;
    this.teardownSource();
    if (!src) return;
    void this.attach(src, token);
  }

  /* ---------- intents from this person (call from event handlers) ---------- */

  play(): boolean {
    const current = this.effective();
    if (!current || !this.client.send({ type: "play" })) return false;
    this.applyOptimistic({ status: "playing", position: this.target(current), at: this.client.serverNow() });
    return true;
  }

  pause(): boolean {
    const current = this.effective();
    const position = this.video.currentTime;
    if (!current || !this.client.send({ type: "pause", position })) return false;
    this.applyOptimistic({ status: "paused", position, at: this.client.serverNow() });
    return true;
  }

  seek(position: number): boolean {
    const current = this.effective();
    const to = Math.max(0, position);
    if (!current || !this.client.send({ type: "seek", position: to })) return false;
    this.applyOptimistic({ status: current.status, position: to, at: this.client.serverNow() });
    return true;
  }

  /** Switches this device to another audio rendition (language). Only this person hears the change. */
  selectAudio(track: AudioTrack | null): void {
    this.audioChoice = track;
    this.applyAudio();
  }

  /** Retry playback after the browser blocked it. Must run inside a tap/click handler. */
  unlock(): void {
    this.update({ blocked: false });
    this.tick();
  }

  /* ---------- source ---------- */

  private async attach(src: string, token: number): Promise<void> {
    const video = this.video;
    const native = video.canPlayType("application/vnd.apple.mpegurl") !== "";
    // Safari (incl. iPad) gets native HLS: AirPlay, PiP, fullscreen and battery all work best.
    if (native && isApple() && !this.nativeFailed) {
      this.attachNative(src);
      return;
    }
    const { default: HlsClass } = await import("hls.js");
    if (token !== this.sourceToken || this.destroyed) return;
    if (!HlsClass.isSupported()) {
      if (native) this.attachNative(src);
      else this.update({ error: "Ce navigateur ne sait pas lire cette vidéo." });
      return;
    }

    const playback = this.effective();
    const hls = new HlsClass({
      enableWorker: true,
      backBufferLength: 60,
      maxBufferLength: 30,
      startPosition: playback ? this.target(playback) : -1,
    });
    this.hls = hls;
    this.fatalRecoveries = 0;
    hls.on(HlsClass.Events.ERROR, (_event, data) => {
      if (!data.fatal || hls !== this.hls) return;
      if (this.fatalRecoveries++ >= MAX_FATAL_RECOVERIES) {
        this.update({ error: "La vidéo ne se charge plus. Vérifiez la connexion." });
        hls.destroy();
        this.hls = null;
        this.sourceReady = false;
        return;
      }
      if (data.type === HlsClass.ErrorTypes.NETWORK_ERROR) hls.startLoad();
      else if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      else this.update({ error: "Lecture impossible." });
    });
    hls.on(HlsClass.Events.AUDIO_TRACKS_UPDATED, this.applyAudio);
    hls.on(HlsClass.Events.FRAG_BUFFERED, () => {
      this.fatalRecoveries = 0;
    });
    hls.loadSource(src);
    hls.attachMedia(video);
    this.sourceReady = true;
    this.update({ engine: "hls.js", error: null });
  }

  private attachNative(src: string): void {
    this.video.src = src;
    this.sourceReady = true;
    this.update({ engine: "native", error: null });
  }

  private teardownSource(): void {
    this.sourceReady = false;
    this.armed = false;
    // Unloading a playing element fires "pause": that's us, not the person.
    if (!this.video.paused) this.expectPauseUntil = now() + EXPECT_PLAY_PAUSE_MS;
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    if (this.video.getAttribute("src")) {
      this.video.removeAttribute("src");
      this.video.load();
    }
    if (this.state.engine) this.update({ engine: null });
  }

  private readonly applyAudio = (): void => {
    const choice = this.audioChoice;
    if (!choice) return;
    const matches = (name: string, language: string | undefined) =>
      name === choice.label || (choice.language !== undefined && language === choice.language);
    if (this.hls) {
      const index = this.hls.audioTracks.findIndex((t) => matches(t.name, t.lang));
      if (index >= 0 && this.hls.audioTrack !== index) this.hls.audioTrack = index;
      return;
    }
    const tracks = nativeAudioTracks(this.video);
    const index = tracks.findIndex((t) => matches(t.label, t.language));
    if (index < 0) return;
    tracks.forEach((t, i) => {
      t.enabled = i === index;
    });
  };

  /* ---------- the sync loop ---------- */

  private effective(): PlaybackState | null {
    if (this.optimistic && now() < this.optimistic.until) return this.optimistic.state;
    return this.playback;
  }

  private target(playback: PlaybackState): number {
    const t = positionAt(playback, this.client.serverNow());
    const duration = this.video.duration;
    return Number.isFinite(duration) && duration > 0 ? Math.min(t, Math.max(0, duration - 0.05)) : t;
  }

  private applyOptimistic(state: PlaybackState): void {
    this.optimistic = { state, until: now() + OPTIMISTIC_MS };
    if (state.status === "playing") this.update({ blocked: false });
    // Synchronous, so play() runs inside the user's gesture (iOS autoplay rules).
    this.tick();
  }

  private readonly tick = (): void => {
    const video = this.video;
    const playback = this.effective();
    if (!playback || !this.sourceReady || this.destroyed || video.readyState < HAVE_METADATA) return;

    const target = this.target(playback);
    if (playback.status === "paused") this.holdPaused(target);
    else this.followPlaying(target);
  };

  /** Shared state is paused: stop and sit exactly on the shared position. */
  private holdPaused(target: number): void {
    const video = this.video;
    this.setRate(1);
    this.doPause();
    if (!video.seeking && Math.abs(video.currentTime - target) > PAUSED_TOLERANCE) this.doSeek(target);
    this.evaluateBuffering();
  }

  /** Shared state is playing: start if needed, then keep drift under control. */
  private followPlaying(target: number): void {
    const video = this.video;
    if (video.ended && target >= video.duration - 0.1) return;
    if (this.state.blocked) return; // waiting for a tap; nothing we can do

    if (video.paused) {
      if (Math.abs(video.currentTime - target) > PAUSED_TOLERANCE * 2) this.doSeek(target + this.seekLead);
      this.doPlay();
      return;
    }

    // Let seeks land and stalls recover before judging drift.
    if (video.seeking || now() - this.seekIssuedAt < SEEK_COOLDOWN_MS || video.readyState < HAVE_FUTURE_DATA) {
      this.setRate(1);
    } else {
      this.correctDrift(target);
    }
    this.evaluateBuffering();
  }

  private correctDrift(target: number): void {
    const correction = correct(this.video.currentTime, target);
    if (correction.kind === "seek") {
      this.setRate(1);
      this.doSeek(correction.to + this.seekLead);
    } else {
      this.setRate(correction.rate);
    }
  }

  /* ---------- programmatic element changes (always "expected") ---------- */

  private doPlay(): void {
    const video = this.video;
    if (!video.paused) return;
    this.expectPlayUntil = now() + EXPECT_PLAY_PAUSE_MS;
    const attempt = video.play();
    attempt
      ?.then(() => {
        if (this.state.blocked) this.update({ blocked: false });
      })
      .catch((error: unknown) => {
        this.expectPlayUntil = 0;
        if (error instanceof DOMException && error.name === "NotAllowedError") this.update({ blocked: true });
        // AbortError: interrupted by a pause or a new source; the loop retries.
      });
  }

  private doPause(): void {
    if (this.video.paused) return;
    this.expectPauseUntil = now() + EXPECT_PLAY_PAUSE_MS;
    this.video.pause();
  }

  private doSeek(to: number): void {
    const duration = this.video.duration;
    const clamped = Number.isFinite(duration) && duration > 0 ? Math.min(to, duration - 0.05) : to;
    this.expectSeekUntil = now() + EXPECT_SEEK_MS;
    this.seekIssuedAt = now();
    this.video.currentTime = Math.max(0, clamped);
  }

  private setRate(rate: number): void {
    if (Math.abs(this.video.playbackRate - rate) > 0.002) this.video.playbackRate = rate;
  }

  /* ---------- element events ---------- */

  private readonly onCanPlay = (): void => {
    if (this.sourceReady) this.armed = true;
  };

  private readonly onPlay = (): void => {
    if (now() < this.expectPlayUntil) {
      this.expectPlayUntil = 0;
      return;
    }
    if (!this.armed) return;
    // Native controls (or a headset button) started playback.
    if (this.effective()?.status === "playing") return;
    if (!this.play()) this.tick(); // offline: snap back to the shared state
  };

  private readonly onPause = (): void => {
    if (now() < this.expectPauseUntil) {
      this.expectPauseUntil = 0;
      return;
    }
    if (!this.armed) return;
    const video = this.video;
    // Not a person's decision: reaching the end, or the OS pausing a backgrounded page.
    if (video.ended || document.visibilityState === "hidden") return;
    if (this.effective()?.status !== "playing") return;
    if (!this.pause()) this.tick();
  };

  private readonly onSeeked = (): void => {
    if (now() < this.expectSeekUntil) {
      this.expectSeekUntil = 0;
      const landed = (now() - this.seekIssuedAt) / 1000;
      this.seekLead = Math.min(2, Math.max(0, this.seekLead * 0.7 + landed * 0.3));
      return;
    }
    if (!this.armed) return;
    const playback = this.effective();
    if (!playback) return;
    const position = this.video.currentTime;
    if (Math.abs(position - this.target(playback)) > USER_SEEK_TOLERANCE && !this.seek(position)) this.tick();
  };

  private readonly onMediaError = (): void => {
    // hls.js reports and recovers its own errors.
    if (this.hls || !this.sourceReady || !this.src) return;
    if (this.state.engine === "native" && !this.nativeFailed) {
      // Rather than a black screen: some streams Safari refuses still play through hls.js.
      this.nativeFailed = true;
      const token = ++this.sourceToken;
      this.teardownSource();
      void this.attach(this.src, token);
      return;
    }
    this.update({ error: "Cette vidéo ne se lit pas sur cet appareil. Essaie un autre lien ou un autre appareil." });
  };

  private readonly onVisibility = (): void => {
    if (document.visibilityState === "visible") this.tick();
  };

  /* ---------- buffering report ---------- */

  private readonly evaluateBuffering = (): void => {
    const video = this.video;
    const playback = this.effective();
    const starving = video.seeking || video.readyState < HAVE_FUTURE_DATA;
    // Report while we're meant to be playing; once reported, keep it up until
    // we're ready, even if the room paused to wait for us.
    const desired =
      this.sourceReady &&
      !this.state.blocked &&
      !video.ended &&
      playback !== null &&
      starving &&
      (playback.status === "playing" || this.bufferingSent);

    this.update({ buffering: starving && this.sourceReady && playback?.status === "playing" });
    if (desired === this.bufferingDesired) return;
    this.bufferingDesired = desired;
    clearTimeout(this.bufferingTimer);
    this.bufferingTimer = setTimeout(() => {
      const value = this.bufferingDesired;
      if (value === this.bufferingSent) return;
      if (this.client.send({ type: "buffering", buffering: value })) this.bufferingSent = value;
    }, BUFFERING_DEBOUNCE_MS);
  };

  private update(patch: Partial<PlayerSyncState>): void {
    const next = { ...this.state, ...patch };
    if (
      next.blocked === this.state.blocked &&
      next.buffering === this.state.buffering &&
      next.engine === this.state.engine &&
      next.error === this.state.error
    )
      return;
    this.state = next;
    this.emit(next);
  }
}

/** Safari's AudioTrackList (not in the TypeScript DOM types). */
interface NativeAudioTrack {
  label: string;
  language: string;
  enabled: boolean;
}

function nativeAudioTracks(video: HTMLVideoElement): NativeAudioTrack[] {
  const list: unknown = Reflect.get(video, "audioTracks");
  if (!list || typeof list !== "object" || !(Symbol.iterator in list)) return [];
  // Narrowed by shape just above; the entries are the browser's own AudioTrack objects.
  return Array.from(list as Iterable<NativeAudioTrack>);
}

const BUFFER_EVENTS = ["waiting", "playing", "canplay", "canplaythrough", "seeking", "seeked", "stalled"] as const;
