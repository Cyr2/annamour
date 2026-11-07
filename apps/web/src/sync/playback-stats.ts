import {
  addHeightTime,
  addLeadTime,
  bufferedAhead,
  type DeviceKind,
  type HeightTime,
  median,
  type PlaybackReport,
} from "@annamour/protocol";

/*
 * Measures how well the film plays on this device, only while the séance is
 * playing: time watched, freezes (seeks excluded), how long the picture took
 * to start, and the picture height actually shown (Safari's own player hides
 * which quality it picked, but not the height). Finer measures tell the
 * players apart: the lead downloaded ahead while playing, quality switches,
 * time spent waiting for someone else rather than freezing here, and freezes
 * that follow a seek. The report grows during the
 * evening and is sent again every minute and when the page goes away.
 */

export interface PlaybackStatsOptions {
  video: HTMLVideoElement;
  /** True while the séance's shared state is « playing ». */
  roomPlaying: () => boolean;
  /** True while the séance stands paused waiting for someone else to load. */
  waitingForOthers: () => boolean;
  /** The name shown in the séance; null until the room has welcomed us. */
  name: () => string | null;
  engine: () => PlaybackReport["engine"] | null;
  device: DeviceKind;
  send: (report: PlaybackReport) => void;
  /** One per page load; random by default. */
  viewingId?: string;
}

const SAMPLE_MS = 2000;
const REPORT_MS = 60_000;
/** A wait shorter than this is not a freeze anyone sees. */
const STALL_DEBOUNCE_MS = 300;
const HAVE_FUTURE_DATA = 3;
/** A freeze starting this soon after a seek is the seek's doing, not the network's alone. */
const AFTER_SEEK_MS = 3000;

function randomViewingId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class PlaybackStats {
  private readonly options: PlaybackStatsOptions;
  private readonly viewingId: string;
  private watchedSeconds = 0;
  private stallCount = 0;
  private stallSeconds = 0;
  private startupMs: number | null = null;
  private heights: HeightTime[] = [];
  private leadSeconds: number[] = [];
  /** One lead per sample: about 3,600 numbers for a two-hour film. */
  private readonly leads: number[] = [];
  private qualitySwitches = 0;
  private lastHeight = 0;
  private waitSeconds = 0;
  private afterSeekStallCount = 0;
  private lastSeekAt = Number.NEGATIVE_INFINITY;

  private lastSampleAt = performance.now();
  private roomPlayingSince: number | null = null;
  private stallTimer: ReturnType<typeof setTimeout> | undefined;
  private stalledAt: number | null = null;
  private lastSent = "";
  private readonly sampler: ReturnType<typeof setInterval>;
  private readonly reporter: ReturnType<typeof setInterval>;

  constructor(options: PlaybackStatsOptions) {
    this.options = options;
    this.viewingId = options.viewingId ?? randomViewingId();
    const { video } = options;
    video.addEventListener("waiting", this.onWaiting);
    video.addEventListener("playing", this.onPlaying);
    video.addEventListener("seeking", this.onSeeking);
    video.addEventListener("seeked", this.onSeeked);
    window.addEventListener("pagehide", this.flush);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.sampler = setInterval(this.sample, SAMPLE_MS);
    this.reporter = setInterval(this.flush, REPORT_MS);
  }

  destroy(): void {
    this.flush();
    const { video } = this.options;
    video.removeEventListener("waiting", this.onWaiting);
    video.removeEventListener("playing", this.onPlaying);
    video.removeEventListener("seeking", this.onSeeking);
    video.removeEventListener("seeked", this.onSeeked);
    window.removeEventListener("pagehide", this.flush);
    document.removeEventListener("visibilitychange", this.onVisibility);
    clearInterval(this.sampler);
    clearInterval(this.reporter);
    clearTimeout(this.stallTimer);
  }

  /** The report so far; null while there is nothing to tell or nobody to tell it about. */
  report(): PlaybackReport | null {
    const name = this.options.name();
    const engine = this.options.engine();
    if (!name || !engine || (this.watchedSeconds === 0 && this.stallCount === 0)) return null;
    return {
      viewingId: this.viewingId,
      name,
      device: this.options.device,
      engine,
      watchedSeconds: round(this.watchedSeconds),
      stallCount: this.stallCount,
      stallSeconds: round(this.stallSeconds),
      startupMs: this.startupMs === null ? null : Math.round(this.startupMs),
      heights: this.heights.map(({ height, seconds }) => ({ height, seconds: round(seconds) })),
      ...this.finerMeasures(),
    };
  }

  private finerMeasures() {
    const leadMedian = median(this.leads);
    return {
      ...(leadMedian === null ? {} : { leadSeconds: this.leadSeconds.map(round), leadMedian: round(leadMedian) }),
      qualitySwitches: this.qualitySwitches,
      waitSeconds: round(this.waitSeconds),
      afterSeekStallCount: this.afterSeekStallCount,
    };
  }

  /** Sends the report if it changed since the last time. */
  readonly flush = (): void => {
    const report = this.report();
    if (!report) return;
    const text = JSON.stringify(report);
    if (text === this.lastSent) return;
    this.lastSent = text;
    this.options.send(report);
  };

  private readonly sample = (): void => {
    const now = performance.now();
    const elapsed = (now - this.lastSampleAt) / 1000;
    this.lastSampleAt = now;
    const { video } = this.options;
    if (!this.options.roomPlaying()) {
      this.roomPlayingSince = null;
      if (this.options.waitingForOthers()) this.waitSeconds += elapsed;
      return;
    }
    this.roomPlayingSince ??= now;
    if (video.paused || video.readyState < HAVE_FUTURE_DATA) return;
    this.watchedSeconds += elapsed;
    this.samplePicture(video, elapsed);
    this.sampleLead(video, elapsed);
  };

  private samplePicture(video: HTMLVideoElement, elapsed: number): void {
    const height = video.videoHeight;
    if (height <= 0) return;
    if (this.lastHeight > 0 && height !== this.lastHeight) this.qualitySwitches++;
    this.lastHeight = height;
    this.heights = addHeightTime(this.heights, height, elapsed);
  }

  private sampleLead(video: HTMLVideoElement, elapsed: number): void {
    const { buffered } = video;
    const ranges = Array.from({ length: buffered.length }, (_, i) => [buffered.start(i), buffered.end(i)] as const);
    const lead = bufferedAhead(ranges, video.currentTime);
    this.leads.push(lead);
    this.leadSeconds = addLeadTime(this.leadSeconds, lead, elapsed);
  }

  private readonly onWaiting = (): void => {
    const { video } = this.options;
    if (video.seeking || !this.options.roomPlaying() || this.stallTimer !== undefined || this.stalledAt !== null)
      return;
    const startedAt = performance.now();
    this.stallTimer = setTimeout(() => {
      this.stallTimer = undefined;
      if (this.options.video.readyState >= HAVE_FUTURE_DATA) return;
      this.stallCount++;
      if (startedAt - this.lastSeekAt <= AFTER_SEEK_MS) this.afterSeekStallCount++;
      this.stalledAt = startedAt;
    }, STALL_DEBOUNCE_MS);
  };

  private readonly onPlaying = (): void => {
    const now = performance.now();
    clearTimeout(this.stallTimer);
    this.stallTimer = undefined;
    if (this.stalledAt !== null) {
      this.stallSeconds += (now - this.stalledAt) / 1000;
      this.stalledAt = null;
    }
    if (this.startupMs === null && this.options.roomPlaying()) {
      this.startupMs = this.roomPlayingSince === null ? 0 : now - this.roomPlayingSince;
    }
  };

  private readonly onSeeking = (): void => {
    // A seek's wait is the price of the seek, not a freeze.
    clearTimeout(this.stallTimer);
    this.stallTimer = undefined;
    this.lastSeekAt = performance.now();
  };

  private readonly onSeeked = (): void => {
    this.lastSeekAt = performance.now();
  };

  private readonly onVisibility = (): void => {
    if (document.visibilityState === "hidden") this.flush();
  };

  /** Marks the moment the séance starts playing, for the startup time. */
  roomStarted(): void {
    if (this.options.roomPlaying()) this.roomPlayingSince ??= performance.now();
  }
}

const round = (seconds: number) => Math.round(seconds * 10) / 10;

/** Posts a report so that it survives the page closing. */
export function beaconSender(code: string): (report: PlaybackReport) => void {
  const url = `/api/rooms/${encodeURIComponent(code)}/stats`;
  return (report) => {
    const body = JSON.stringify(report);
    try {
      if (navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))) return;
    } catch {
      // Falls back to fetch below.
    }
    void fetch(url, { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(
      () => {},
    );
  };
}
