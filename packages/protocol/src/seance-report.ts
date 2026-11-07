import { z } from "zod/mini";
import { Name } from "./messages.ts";
import { DeviceKind, LEAD_BUCKETS, median, type PlaybackStatsEntry, rebufferRatio } from "./playback-stats.ts";

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
  /** Share of the measured time at each forward lead (LEAD_BUCKETS); empty when no page measured it. */
  leadShares: z.array(z.number()),
  /** The middle forward lead while playing, seconds. The finer measures are null when no page measured them. */
  leadMedian: z.nullable(z.number()),
  qualitySwitches: z.nullable(z.number()),
  /** Seconds spent waiting for someone else, as opposed to freezing here. */
  waitSeconds: z.nullable(z.number()),
  /** Freezes that began right after a seek; the rest of stallCount came on their own. */
  afterSeekStallCount: z.nullable(z.number()),
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

type FinerMeasures = Pick<
  DeviceEvening,
  "leadShares" | "leadMedian" | "qualitySwitches" | "waitSeconds" | "afterSeekStallCount"
>;
type CountedMeasure = "qualitySwitches" | "waitSeconds" | "afterSeekStallCount";

/** The sum over the page loads that measured it; null when none did (pages from before it existed). */
function sumMeasured(entries: readonly PlaybackStatsEntry[], measure: CountedMeasure): number | null {
  const measured = entries.flatMap((entry) => entry[measure] ?? []);
  return measured.length > 0 ? measured.reduce((sum, value) => sum + value, 0) : null;
}

/**
 * The middle of several middles, each counting for the time it was measured
 * over: a long evening outweighs a page reloaded after a minute.
 */
export function weightedMedian(samples: ReadonlyArray<{ value: number; weight: number }>): number | null {
  const total = samples.reduce((sum, { weight }) => sum + weight, 0);
  if (total <= 0) return median(samples.map(({ value }) => value));
  let seen = 0;
  for (const { value, weight } of [...samples].sort((a, b) => a.value - b.value)) {
    seen += weight;
    if (seen >= total / 2) return value;
  }
  return null;
}

function finerMeasures(entries: readonly PlaybackStatsEntry[]): FinerMeasures {
  const leads = entries.flatMap(({ leadSeconds, leadMedian }) =>
    leadSeconds && leadMedian !== undefined ? [{ leadSeconds, leadMedian }] : [],
  );
  const histogram = LEAD_BUCKETS.map((_, index) => leads.reduce((sum, l) => sum + (l.leadSeconds[index] ?? 0), 0));
  const measured = histogram.reduce((sum, seconds) => sum + seconds, 0);
  const middles = leads.map(({ leadSeconds, leadMedian }) => ({
    value: leadMedian,
    weight: leadSeconds.reduce((sum, seconds) => sum + seconds, 0),
  }));
  return {
    leadShares: measured > 0 ? histogram.map((seconds) => seconds / measured) : [],
    leadMedian: weightedMedian(middles),
    qualitySwitches: sumMeasured(entries, "qualitySwitches"),
    waitSeconds: sumMeasured(entries, "waitSeconds"),
    afterSeekStallCount: sumMeasured(entries, "afterSeekStallCount"),
  };
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
    ...finerMeasures(entries),
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
