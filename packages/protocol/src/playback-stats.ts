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

export const PlaybackReport = z.object({
  viewingId: z.string().check(z.regex(/^[A-Za-z0-9_-]{8,64}$/)),
  name: Name,
  device: DeviceKind,
  engine: z.enum(["native", "hls.js"]),
  /** Seconds the film actually played while the séance was playing. */
  watchedSeconds: Seconds,
  /** Times the picture froze waiting for data (seeks excluded). */
  stallCount: z.number().check(z.int(), z.gte(0), z.lte(100_000)),
  stallSeconds: Seconds,
  /** From the séance starting to play to the first picture moving here; null until then. */
  startupMs: z.nullable(z.number().check(z.gte(0), z.lte(600_000))),
  /** Seconds played at each picture height. */
  heights: z.array(HeightTime).check(z.maxLength(MAX_HEIGHT_BUCKETS)),
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
