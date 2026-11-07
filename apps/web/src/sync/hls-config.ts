import type { HlsConfig } from "hls.js";

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

export function hlsConfig(startPosition: number): Partial<HlsConfig> {
  return {
    enableWorker: true,
    startPosition,
    lowLatencyMode: false,
    maxBufferLength: MAX_LEAD_SECONDS,
    maxMaxBufferLength: MAX_LEAD_SECONDS,
    maxBufferSize: (lowMemory() ? 60 : 150) * MB,
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
