import { z } from "zod/mini";
import { Name } from "./messages.ts";
import { DeviceKind, type PlaybackStatsEntry, rebufferRatio } from "./playback-stats.ts";

/**
 * A séance's evening at a glance: per person and device (and player), how
 * well the film played, measured against the targets set for someone on a
 * weak link: almost never frozen, few and short freezes, rarely at the
 * lightest quality, a quick start. Several page loads of one device add up.
 */

/** Picture heights as the ladder knows them; anything between two goes to the higher one. */
export const HEIGHT_BUCKETS = [234, 288, 360, 480, 540, 640] as const;
export type HeightBucket = (typeof HEIGHT_BUCKETS)[number];

export const TARGETS = {
  /** Share of the evening frozen. */
  rebufferRatio: 0.01,
  /** Freezes per 40 minutes watched (about an episode). */
  stallsPerEpisode: 1,
  /** Mean length of a freeze, seconds. */
  stallSeconds: 5,
  /** Share of the time at the lightest quality (234p or below). */
  lowestShare: 0.1,
  /** From the séance playing to the picture moving, ms. */
  startupMs: 2000,
} as const;

const EPISODE_SECONDS = 40 * 60;

/** A target and how the evening did: met, missed, or not measurable yet (null). */
export const TargetCheck = z.object({ value: z.nullable(z.number()), met: z.nullable(z.boolean()) });
export type TargetCheck = z.infer<typeof TargetCheck>;

export const DeviceEvening = z.object({
  name: Name,
  device: DeviceKind,
  engine: z.enum(["native", "hls.js"]),
  watchedSeconds: z.number(),
  stallCount: z.number(),
  stallSeconds: z.number(),
  /** Share of the watched time at each height bucket, from the lightest; buckets never seen are left out. */
  heights: z.array(z.object({ height: z.number(), share: z.number() })),
  targets: z.object({
    rebuffer: TargetCheck,
    stalls: TargetCheck,
    stallLength: TargetCheck,
    lowest: TargetCheck,
    startup: TargetCheck,
  }),
});
export type DeviceEvening = z.infer<typeof DeviceEvening>;

export const SeanceReport = z.object({ devices: z.array(DeviceEvening) });
export type SeanceReport = z.infer<typeof SeanceReport>;

/** The bucket a picture height counts in. */
export function heightBucket(height: number): HeightBucket {
  return HEIGHT_BUCKETS.find((bucket) => height <= bucket) ?? 640;
}

function median(values: readonly number[]): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] ?? 0;
  return sorted.length % 2 ? upper : ((sorted[mid - 1] ?? upper) + upper) / 2;
}

const below = (value: number | null, limit: number): TargetCheck => ({
  value,
  met: value === null ? null : value < limit,
});

function shares(entries: readonly PlaybackStatsEntry[], watched: number): DeviceEvening["heights"] {
  const seconds = new Map<HeightBucket, number>();
  for (const { heights } of entries) {
    for (const { height, seconds: played } of heights) {
      const bucket = heightBucket(height);
      seconds.set(bucket, (seconds.get(bucket) ?? 0) + played);
    }
  }
  const total = [...seconds.values()].reduce((sum, s) => sum + s, 0) || watched;
  return HEIGHT_BUCKETS.flatMap((height) => {
    const played = seconds.get(height);
    return played ? [{ height, share: total > 0 ? played / total : 0 }] : [];
  });
}

function evening(entries: readonly PlaybackStatsEntry[]): DeviceEvening | null {
  const [latest] = entries;
  if (!latest) return null;
  const watchedSeconds = entries.reduce((sum, e) => sum + e.watchedSeconds, 0);
  const stallCount = entries.reduce((sum, e) => sum + e.stallCount, 0);
  const stallSeconds = entries.reduce((sum, e) => sum + e.stallSeconds, 0);
  const heights = shares(entries, watchedSeconds);
  const lowest = heights.find((bucket) => bucket.height === 234)?.share ?? 0;
  const startups = entries.flatMap((e) => (e.startupMs === null ? [] : [e.startupMs]));
  const perEpisode = watchedSeconds > 0 ? (stallCount * EPISODE_SECONDS) / watchedSeconds : null;
  return {
    name: latest.name,
    device: latest.device,
    engine: latest.engine,
    watchedSeconds,
    stallCount,
    stallSeconds,
    heights,
    targets: {
      rebuffer: below(
        watchedSeconds > 0 ? rebufferRatio({ watchedSeconds, stallSeconds }) : null,
        TARGETS.rebufferRatio,
      ),
      // « At most one » per episode: below the limit plus a hair.
      stalls: { value: perEpisode, met: perEpisode === null ? null : perEpisode <= TARGETS.stallsPerEpisode },
      stallLength: below(stallCount > 0 ? stallSeconds / stallCount : 0, TARGETS.stallSeconds),
      lowest: below(heights.length > 0 ? lowest : null, TARGETS.lowestShare),
      startup: below(median(startups), TARGETS.startupMs),
    },
  };
}

/** One line per person, device and player; the one who watched the most first. */
export function seanceReport(entries: readonly PlaybackStatsEntry[]): SeanceReport {
  const groups = new Map<string, PlaybackStatsEntry[]>();
  for (const entry of [...entries].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const key = `${entry.name}\u0000${entry.device}\u0000${entry.engine}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const devices = [...groups.values()].flatMap((group) => evening(group) ?? []);
  return { devices: devices.sort((a, b) => b.watchedSeconds - a.watchedSeconds) };
}
