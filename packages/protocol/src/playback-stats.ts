import { z } from "zod/mini";
import { Name } from "./messages.ts";

/**
 * How well a film played on one device, so the lighter qualities can be
 * tuned on real evenings rather than on feelings. One report per page load
 * (`viewingId`), sent again and again as it grows; nothing personal beyond
 * the name already shown in the séance and a coarse kind of device.
 */

export const DEVICE_KINDS = ["iPhone", "iPad", "Android TV", "Android", "Mac", "Windows", "Linux", "Autre"] as const;
export const DeviceKind = z.enum(DEVICE_KINDS);
export type DeviceKind = z.infer<typeof DeviceKind>;

/** Height buckets kept per report: a film never switches between more qualities than this. */
export const MAX_HEIGHT_BUCKETS = 20;
const DAY_SECONDS = 86_400;

const Seconds = z.number().check(z.gte(0), z.lte(DAY_SECONDS));

export const HeightTime = z.object({
  /** The picture's height in pixels (video.videoHeight). */
  height: z.number().check(z.int(), z.gte(0), z.lte(4320)),
  seconds: Seconds,
});
export type HeightTime = z.infer<typeof HeightTime>;

/**
 * Lower bounds, in seconds, of the forward-lead buckets: under 5 s, 5–15,
 * 15–30, 30–60, 1–3 min, 3 min and more. Enough to tell a player that lives
 * hand to mouth from one that keeps minutes ahead, in six numbers.
 */
export const LEAD_BUCKETS = [0, 5, 15, 30, 60, 180] as const;

const Count = z.number().check(z.int(), z.gte(0), z.lte(100_000));

export const PlaybackReport = z.object({
  viewingId: z.string().check(z.regex(/^[A-Za-z0-9_-]{8,64}$/)),
  name: Name,
  device: DeviceKind,
  engine: z.enum(["native", "hls.js"]),
  /** Seconds the film actually played while the séance was playing. */
  watchedSeconds: Seconds,
  /** Times the picture froze waiting for data (seeks excluded). */
  stallCount: Count,
  stallSeconds: Seconds,
  /** From the séance starting to play to the first picture moving here; null until then. */
  startupMs: z.nullable(z.number().check(z.gte(0), z.lte(600_000))),
  /** Seconds played at each picture height. */
  heights: z.array(HeightTime).check(z.maxLength(MAX_HEIGHT_BUCKETS)),
  /*
   * Finer measures, added later: optional so that older pages and the
   * reports already kept still read.
   */
  /** Seconds played with each forward lead (see LEAD_BUCKETS), downloaded past the position. */
  leadSeconds: z.optional(z.array(Seconds).check(z.length(LEAD_BUCKETS.length))),
  /** The middle forward lead while playing, seconds. */
  leadMedian: z.optional(Seconds),
  /** Times the picture height changed while playing. */
  qualitySwitches: z.optional(Count),
  /** Seconds the séance stood paused waiting for someone else to load. */
  waitSeconds: z.optional(Seconds),
  /** Of the freezes, those that began within a few seconds of a seek (the rest came on their own). */
  afterSeekStallCount: z.optional(Count),
});
export type PlaybackReport = z.infer<typeof PlaybackReport>;

/** A report as the server keeps it, with what it says at a glance. */
export const PlaybackStatsEntry = z.object({
  ...PlaybackReport.shape,
  updatedAt: z.number(),
  /** Share of the evening spent frozen: 0.01 is fine, above 0.03 it is a problem. */
  rebufferRatio: z.number(),
});
export type PlaybackStatsEntry = z.infer<typeof PlaybackStatsEntry>;

export const PlaybackStatsList = z.object({ reports: z.array(PlaybackStatsEntry) });
export type PlaybackStatsList = z.infer<typeof PlaybackStatsList>;

/** Time spent frozen over the time spent watching or frozen. */
export function rebufferRatio({
  watchedSeconds,
  stallSeconds,
}: Pick<PlaybackReport, "watchedSeconds" | "stallSeconds">) {
  const total = watchedSeconds + stallSeconds;
  return total > 0 ? stallSeconds / total : 0;
}

/** Adds played seconds at a height; a new height beyond the bucket limit is not counted. */
export function addHeightTime(heights: readonly HeightTime[], height: number, seconds: number): HeightTime[] {
  const known = heights.some((bucket) => bucket.height === height);
  if (!known && heights.length >= MAX_HEIGHT_BUCKETS) return [...heights];
  if (!known) return [...heights, { height, seconds }];
  return heights.map((bucket) => (bucket.height === height ? { height, seconds: bucket.seconds + seconds } : bucket));
}

/** The bucket a forward lead counts in (index into LEAD_BUCKETS). */
export function leadBucket(lead: number): number {
  return Math.max(
    0,
    LEAD_BUCKETS.findLastIndex((from) => lead >= from),
  );
}

/** Adds played seconds at a forward lead to a histogram over LEAD_BUCKETS. */
export function addLeadTime(histogram: readonly number[], lead: number, seconds: number): number[] {
  const bucket = leadBucket(lead);
  return LEAD_BUCKETS.map((_, index) => (histogram[index] ?? 0) + (index === bucket ? seconds : 0));
}

/** The middle value; the mean of the two middle ones for an even count; null for none. */
export function median(values: readonly number[]): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] ?? 0;
  return sorted.length % 2 ? upper : ((sorted[mid - 1] ?? upper) + upper) / 2;
}

const ANDROID_TV = /\b(?:Android ?TV|Google ?TV|GoogleTV|AFT[A-Z]\w*|BRAVIA|Leanback)\b/i;

/** A coarse kind of device from the user agent (an iPad says « Macintosh » but has a touch screen). */
export function deviceKind(userAgent: string, maxTouchPoints = 0): DeviceKind {
  if (/iPhone|iPod/.test(userAgent)) return "iPhone";
  if (/iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return "iPad";
  if (ANDROID_TV.test(userAgent)) return "Android TV";
  if (/Android/.test(userAgent)) return "Android";
  if (/Macintosh|Mac OS X/.test(userAgent)) return "Mac";
  if (/Windows/.test(userAgent)) return "Windows";
  if (/Linux|X11|CrOS/.test(userAgent)) return "Linux";
  return "Autre";
}
