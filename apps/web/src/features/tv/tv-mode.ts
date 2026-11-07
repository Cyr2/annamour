import { z } from "zod/mini";
import { readStored, removeStored, writeStored } from "../../lib/storage.ts";

/*
 * Is this device a TV? The Android TV app opens the PWA with `?tv=1` (kept,
 * so the next launch from the home screen stays in TV mode) and exposes
 * `window.AnnamourTV`; a browser on Android TV / Google TV is recognised by
 * its user agent. `?tv=0` turns the mode off again.
 */

export const TV_STORAGE = "annamour:tv:v1";
const StoredTv = z.literal(true);

/** Android TV, Google TV, Fire TV and the TV browsers that say so. */
const TV_USER_AGENT = /\b(?:Android ?TV|Google ?TV|GoogleTV|AFT[A-Z]\w*|BRAVIA|SMART-?TV|Leanback)\b/i;

export interface TvSignals {
  /** `location.search`. */
  search: string;
  userAgent: string;
  /** What `window.AnnamourTV?.isTv()` answered, when the bridge exists. */
  bridge: boolean | undefined;
  /** Whether TV mode was remembered from an earlier `?tv=1`. */
  remembered: boolean;
}

export type TvDecision = { tv: boolean; remember: "keep" | "store" | "forget" };

/** Pure: decides TV mode from what the device says, and whether to remember it. */
export function decideTvMode({ search, userAgent, bridge, remembered }: TvSignals): TvDecision {
  const flag = new URLSearchParams(search).get("tv");
  if (flag === "1") return { tv: true, remember: "store" };
  if (flag === "0") return { tv: false, remember: "forget" };
  return { tv: bridge === true || remembered || TV_USER_AGENT.test(userAgent), remember: "keep" };
}

function askBridge(): boolean | undefined {
  try {
    return window.AnnamourTV?.isTv?.();
  } catch {
    return undefined;
  }
}

/** Reads the signals of this browser, remembers `?tv=…`, and returns whether it is a TV. */
export function detectTvMode(): boolean {
  const decision = decideTvMode({
    search: window.location.search,
    userAgent: navigator.userAgent,
    bridge: askBridge(),
    remembered: readStored(TV_STORAGE, StoredTv) === true,
  });
  if (decision.remember === "store") writeStored(TV_STORAGE, true);
  if (decision.remember === "forget") removeStored(TV_STORAGE);
  return decision.tv;
}

/** Tells the Android TV app that the page handled its Retour key (else it goes back or closes). */
export function notifyBackHandled(): void {
  try {
    window.AnnamourTV?.backHandled?.();
  } catch {
    // The bridge is optional: a TV browser has none.
  }
}
