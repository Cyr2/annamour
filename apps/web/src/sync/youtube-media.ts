import type { SubtitleTrack } from "@annamour/protocol";
import type { SyncMedia } from "./media.ts";
import {
  captionTracks,
  type MediaFlags,
  nearestRate,
  onYouTubeState,
  qualityHeight,
  YT_STATE,
} from "./youtube-events.ts";

/*
 * A YouTube video in YouTube's own embedded player (its IFrame API), shown to
 * the sync as if it were a <video>: same properties, same events. Its own
 * controls are off; Annamour's drive it, for everyone at once.
 */

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getVideoLoadedFraction(): number;
  getPlaybackQuality(): string;
  getAvailablePlaybackRates(): number[];
  setPlaybackRate(rate: number): void;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  /** Not in YouTube's documentation, but present: tells a live stream. */
  getVideoData?: () => { isLive?: boolean };
  /** Undocumented too: the captions module ("tracklist" to read, "track" to pick one, {} for none). */
  loadModule?: (module: "captions") => void;
  getOption?: (module: "captions", option: "tracklist") => unknown;
  setOption?: {
    (module: "captions", option: "track", value: { languageCode?: string }): void;
    /** -1 (smaller) to 3 (largest), 0 YouTube's default. */
    (module: "captions", option: "fontSize", value: number): void;
  };
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      width: string;
      height: string;
      playerVars: Record<string, string | number>;
      events: { onReady: () => void; onStateChange: (event: { data: number }) => void; onError: () => void };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let api: Promise<YTNamespace> | null = null;

/** YouTube's IFrame API, loaded once, the first time a YouTube video is played. */
function loadYouTubeApi(): Promise<YTNamespace> {
  api ??= new Promise<YTNamespace>((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      api = null;
      reject(new Error("YouTube ne répond pas."));
    };
    document.head.append(script);
  });
  return api;
}

const POLL_MS = 250;
/** A start that has not begun after this long was refused by the browser: it needs a tap. */
const START_TIMEOUT_MS = 3000;
/** A seek has landed once the player is this close to where it was sent (s). */
const SEEK_LANDED = 1;

export interface YouTubeInfo {
  duration: number;
  live: boolean;
}

export class YouTubeMedia extends EventTarget implements SyncMedia {
  readonly videoId: string;
  private player: YTPlayer | null = null;
  private flags: MediaFlags = { paused: true, ended: false, seeking: false, readyState: 0 };
  private seekTarget = 0;
  private rate = 1;
  private sentRate = 1;
  private level = 1;
  private silent = false;
  /** Language code of the captions shown, null for none. */
  private captions: string | null = null;
  private captionsFontSize = 0;
  /** A start was asked and no pause since: a start that never comes is the browser's refusal. */
  private wantsPlay = false;
  private readonly poll: ReturnType<typeof setInterval>;
  private destroyed = false;

  constructor(host: HTMLElement, videoId: string) {
    super();
    this.videoId = videoId;
    // YouTube replaces the element it is given: a child of ours, so React's own node stays.
    const slot = document.createElement("div");
    host.append(slot);
    void loadYouTubeApi().then(
      (YT) => {
        if (this.destroyed) return;
        const player = new YT.Player(slot, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: { playsinline: 1, controls: 0, disablekb: 1, rel: 0, modestbranding: 1, origin: location.origin },
          events: {
            onReady: () => this.onReady(player),
            onStateChange: ({ data }) => this.onState(data),
            onError: () => this.dispatchEvent(new Event("error")),
          },
        });
      },
      () => this.dispatchEvent(new Event("error")),
    );
    this.poll = setInterval(this.tick, POLL_MS);
  }

  destroy(): void {
    this.destroyed = true;
    clearInterval(this.poll);
    this.player?.destroy();
    this.player = null;
  }

  /** Its length (0 for a live stream) and whether it is live, once loaded. */
  info(): YouTubeInfo | null {
    const player = this.player;
    if (!player) return null;
    const duration = player.getDuration();
    return { duration, live: player.getVideoData?.().isLive ?? duration === 0 };
  }

  get live(): boolean {
    return this.info()?.live === true;
  }

  /** Its captions, once YouTube has loaded them (when it starts playing). */
  captionTracks(): SubtitleTrack[] {
    return captionTracks(this.player?.getOption?.("captions", "tracklist"));
  }

  /** Shows the captions in this language, or none. */
  setCaptions(languageCode: string | null): void {
    this.captions = languageCode;
    this.applyCaptions();
  }

  /** This person's caption size, on YouTube's scale (-1 to 3). */
  setCaptionsFontSize(size: number): void {
    this.captionsFontSize = size;
    this.applyCaptions();
  }

  private applyCaptions(): void {
    // The module stays loaded even with none shown: its list is what « Audio et sous-titres » offers.
    this.player?.loadModule?.("captions");
    this.player?.setOption?.("captions", "track", this.captions ? { languageCode: this.captions } : {});
    this.player?.setOption?.("captions", "fontSize", this.captionsFontSize);
  }

  get currentTime(): number {
    return this.player?.getCurrentTime() ?? 0;
  }

  set currentTime(seconds: number) {
    this.seekTarget = seconds;
    this.flags.seeking = true;
    this.dispatchEvent(new Event("seeking"));
    this.player?.seekTo(seconds, true);
  }

  get duration(): number {
    const duration = this.player?.getDuration() ?? 0;
    return duration > 0 ? duration : Number.NaN;
  }

  get paused(): boolean {
    return this.flags.paused;
  }

  get ended(): boolean {
    return this.flags.ended;
  }

  get seeking(): boolean {
    return this.flags.seeking;
  }

  get readyState(): number {
    return this.flags.readyState;
  }

  get buffered(): TimeRanges {
    const end = (this.player?.getVideoLoadedFraction() ?? 0) * (Number.isFinite(this.duration) ? this.duration : 0);
    return { length: end > 0 ? 1 : 0, start: () => 0, end: () => end };
  }

  get videoHeight(): number {
    return qualityHeight(this.player?.getPlaybackQuality() ?? "");
  }

  get playbackRate(): number {
    return this.rate;
  }

  set playbackRate(rate: number) {
    this.rate = rate;
    const accepted = nearestRate(rate, this.player?.getAvailablePlaybackRates() ?? []);
    if (accepted === this.sentRate) return;
    this.sentRate = accepted;
    this.player?.setPlaybackRate(accepted);
  }

  get volume(): number {
    return this.level;
  }

  set volume(level: number) {
    this.level = level;
    this.player?.setVolume(Math.round(level * 100));
  }

  get muted(): boolean {
    return this.silent;
  }

  set muted(silent: boolean) {
    this.silent = silent;
    if (silent) this.player?.mute();
    else this.player?.unMute();
  }

  play(): Promise<void> {
    const player = this.player;
    if (!player) return Promise.reject(new DOMException("Pas encore prête", "AbortError"));
    this.wantsPlay = true;
    player.playVideo();
    const asked = performance.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        const state = player.getPlayerState();
        if (state === YT_STATE.playing || state === YT_STATE.buffering) return resolve();
        if (!this.wantsPlay) return reject(new DOMException("Mise en pause", "AbortError"));
        if (performance.now() - asked > START_TIMEOUT_MS)
          return reject(new DOMException("Lecture bloquée", "NotAllowedError"));
        setTimeout(check, POLL_MS);
      };
      check();
    });
  }

  pause(): void {
    this.wantsPlay = false;
    this.player?.pauseVideo();
  }

  private onReady(player: YTPlayer): void {
    this.player = player;
    player.setVolume(Math.round(this.level * 100));
    if (this.silent) player.mute();
    this.apply(YT_STATE.cued);
  }

  private onState(state: number): void {
    if (state === YT_STATE.paused) this.wantsPlay = false;
    // YouTube turns on captions of its own accord (the viewer's settings, a foreign video): the choice made here wins.
    if (state === YT_STATE.playing) this.applyCaptions();
    this.apply(state);
  }

  private apply(state: number): void {
    const { flags, events } = onYouTubeState(this.flags, state);
    this.flags = flags;
    for (const type of events) this.dispatchEvent(new Event(type));
  }

  /** YouTube says nothing of time passing, nor of a seek landing while paused: we look. */
  private readonly tick = (): void => {
    if (!this.player) return;
    if (this.flags.seeking && Math.abs(this.currentTime - this.seekTarget) < SEEK_LANDED) {
      this.flags.seeking = false;
      this.dispatchEvent(new Event("seeked"));
    }
    if (!this.flags.paused) this.dispatchEvent(new Event("timeupdate"));
  };
}
