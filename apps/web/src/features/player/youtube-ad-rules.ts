/** Seconds a playing video may stand still before an ad (or a long wait) is likely. */
export const STUCK_SECONDS = 3;
/** How long YouTube's player stays touchable once asked, to tap « Passer l'annonce ». */
export const TOUCH_YOUTUBE_MS = 15_000;

/**
 * YouTube does not say when an ad plays, but the video then stands still while
 * it should play: that is when « Une pub ? Toucher YouTube » is worth offering.
 */
export function standingStill(samples: readonly { paused: boolean; time: number }[]): boolean {
  if (samples.length <= STUCK_SECONDS) return false;
  const recent = samples.slice(-(STUCK_SECONDS + 1));
  const first = recent[0]?.time ?? 0;
  return recent.every((sample) => !sample.paused && Math.abs(sample.time - first) < 0.25);
}
