import type { HlsConfig } from "hls.js";
// The ES module build of hls.js cannot start its own worker: without this file, every segment is
// remuxed on the main thread, 100–150 ms per segment on a TV, a hitch the remote and the UI feel.
import hlsWorkerUrl from "hls.js/dist/hls.worker.js?url";

/*
 * hls.js tuned for weak, jittery links (a phone's shared 4G) without costing
 * anything on fiber.
 *
 * The stream often has a single quality, so adapting the bitrate cannot help:
 * what does is downloading far ahead whenever the link allows it (and during
 * every pause), so a slow patch is absorbed by the lead instead of stalling
 * the whole room. The limit is memory: browsers refuse more than ~150 MB of
 * video per source (hls.js then trims its target by itself), and TV boxes
 * have far less RAM.
 */

const MB = 1024 * 1024;
/** Ten minutes: in practice the size cap below stops earlier (≈ 6 min at 3 Mb/s). */
const MAX_LEAD_SECONDS = 600;
/** navigator.deviceMemory (Chromium only), in GB: TV boxes and old phones report 2 or less. */
const LOW_MEMORY_GB = 2;

function lowMemory(): boolean {
  const memory: unknown = Reflect.get(navigator, "deviceMemory");
  return typeof memory === "number" && memory <= LOW_MEMORY_GB;
}

/** A dropped fragment on 4G is retried patiently rather than turned into a fatal error. */
const patientRetry = {
  maxNumRetry: 8,
  retryDelayMs: 1000,
  maxRetryDelayMs: 16_000,
  backoff: "exponential",
} as const;

/**
 * On an iPad (Safari's Media Source), WebKit caps each source's memory:
 * ~105 MB for video and only ~5.5 MB for a separate audio track, about
 * 5 minutes of source audio. Asking for more makes appends fail in a loop,
 * so the lead stays under that, and the bitrate climbs more carefully on 4G.
 * Plain Media Source, not Managed: the managed kind keeps a 10–30 s lead by
 * design, no better than Safari's own player.
 */
const WEBKIT_LEAD_SECONDS = 300;
const webkitTuning: Partial<HlsConfig> = {
  preferManagedMediaSource: false,
  maxBufferLength: WEBKIT_LEAD_SECONDS,
  maxMaxBufferLength: WEBKIT_LEAD_SECONDS,
  maxBufferSize: 100 * MB,
  abrBandWidthFactor: 0.8,
  abrBandWidthUpFactor: 0.6,
  abrEwmaDefaultEstimate: 400_000,
};

const isWebKit = (nav: Navigator) => /Apple/.test(nav.vendor);

export function hlsConfig(startPosition: number, nav: Navigator = navigator): Partial<HlsConfig> {
  return {
    enableWorker: true,
    workerPath: hlsWorkerUrl,
    startPosition,
    lowLatencyMode: false,
    maxBufferLength: MAX_LEAD_SECONDS,
    maxMaxBufferLength: MAX_LEAD_SECONDS,
    maxBufferSize: (lowMemory() ? 60 : 150) * MB,
    ...(isWebKit(nav) ? webkitTuning : {}),
    // What was watched is let go quickly: memory goes to what comes next.
    backBufferLength: 30,
    // Never pick more pixels than the screen shows (only matters when several qualities exist).
    capLevelToPlayerSize: true,
    fragLoadPolicy: {
      default: {
        maxTimeToFirstByteMs: 10_000,
        maxLoadTimeMs: 120_000,
        timeoutRetry: patientRetry,
        errorRetry: patientRetry,
      },
    },
  };
}
