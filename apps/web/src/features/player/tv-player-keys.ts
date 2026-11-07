import type { RemoteKey } from "../tv/remote.ts";
import { SEEK_STEP } from "./seek.ts";

/*
 * The film with a remote, the way TV apps do it. Bar hidden: OK plays or
 * pauses, ← → jump 10 s (a small badge, no menu), ↑ or ↓ bring up the
 * controls. Bar shown: the arrows walk its buttons and OK presses them.
 * Play/pause always plays or pauses. Retour is handled by the screen
 * (close the bar, then leave the film).
 */

export type TvPlayerAction = { kind: "toggle" } | { kind: "seek"; delta: number } | { kind: "showBar" };

/** How long the controls stay up without a key while the film plays. */
export const TV_BAR_HIDE_MS = 5000;
/** How long the « +10 s » badge stays. */
export const SEEK_BADGE_MS = 700;

export function tvPlayerAction(key: RemoteKey | null, barShown: boolean): TvPlayerAction | null {
  if (key === "playPause") return { kind: "toggle" };
  if (barShown) return null;
  switch (key) {
    case "ok":
      return { kind: "toggle" };
    case "left":
      return { kind: "seek", delta: -SEEK_STEP };
    case "right":
      return { kind: "seek", delta: SEEK_STEP };
    case "up":
    case "down":
      return { kind: "showBar" };
    default:
      return null;
  }
}

/** « −10 s » or « +10 s », with a real minus sign. */
export function seekBadgeLabel(delta: number): string {
  return `${delta < 0 ? "−" : "+"}${Math.abs(delta)} s`;
}
