/** The jump of the ±10 s buttons, the arrow keys and the remote. */
export const SEEK_STEP = 10;

/**
 * Where a key sends the timeline (the ARIA slider keys): ← → by a step,
 * Début and Fin to either end; null for any other key.
 */
export function timelineKeyTarget(key: string, current: number, duration: number): number | null {
  const clamp = (position: number) => Math.min(duration, Math.max(0, position));
  switch (key) {
    case "ArrowRight":
      return clamp(current + SEEK_STEP);
    case "ArrowLeft":
      return clamp(current - SEEK_STEP);
    case "Home":
      return 0;
    case "End":
      return duration;
    default:
      return null;
  }
}
