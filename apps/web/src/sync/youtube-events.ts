import type { SubtitleTrack } from "@annamour/protocol";
import { z } from "zod/mini";

/*
 * YouTube's player speaks in states (onStateChange); the sync listens to a
 * <video>'s events. This turns one into the other, pure.
 */

/** YouTube's player states (YT.PlayerState). */
export const YT_STATE = { unstarted: -1, ended: 0, playing: 1, paused: 2, buffering: 3, cued: 5 } as const;

export interface MediaFlags {
  paused: boolean;
  ended: boolean;
  seeking: boolean;
  /** HTMLMediaElement's readyState: 1 metadata, 2 current data, 4 enough data. */
  readyState: number;
}

/** The flags after `state`, and the <video> events a page would have heard on the way. */
export function onYouTubeState(before: MediaFlags, state: number): { flags: MediaFlags; events: string[] } {
  const events: string[] = [];
  const flags = { ...before };
  const settle = () => {
    flags.readyState = 4;
    if (flags.seeking) {
      flags.seeking = false;
      events.push("seeked");
    }
  };
  if (state === YT_STATE.playing) {
    flags.ended = false;
    settle();
    if (flags.paused) events.push("play");
    flags.paused = false;
    events.push("playing", "canplay");
  } else if (state === YT_STATE.paused || state === YT_STATE.cued) {
    settle();
    if (!flags.paused) events.push("pause");
    flags.paused = true;
    if (state === YT_STATE.cued) events.push("loadedmetadata", "canplay");
  } else if (state === YT_STATE.buffering) {
    flags.readyState = 2;
    events.push("waiting");
  } else if (state === YT_STATE.ended) {
    flags.ended = true;
    if (!flags.paused) events.push("pause");
    flags.paused = true;
    events.push("ended");
  }
  return { flags, events };
}

/** YouTube's quality names as a picture height, for the stats. */
const HEIGHTS: Record<string, number> = {
  highres: 2160,
  hd2160: 2160,
  hd1440: 1440,
  hd1080: 1080,
  hd720: 720,
  large: 480,
  medium: 360,
  small: 240,
  tiny: 144,
};

export function qualityHeight(quality: string): number {
  return HEIGHTS[quality] ?? 0;
}

/** The nearest speed YouTube accepts: it ignores any other, so small drift nudges are rounded away. */
export function nearestRate(rate: number, available: readonly number[]): number {
  if (available.length === 0) return 1;
  return available.reduce((best, candidate) => (Math.abs(candidate - rate) < Math.abs(best - rate) ? candidate : best));
}

/** YouTube's caption list (getOption("captions", "tracklist")), missing from its documentation: checked, never trusted. */
const CaptionList = z.array(z.object({ languageCode: z.string(), displayName: z.string() }));

/** The video's captions as subtitle tracks for « Audio et sous-titres », known by their language code. */
export function captionTracks(tracklist: unknown): SubtitleTrack[] {
  const parsed = CaptionList.safeParse(tracklist);
  if (!parsed.success) return [];
  return parsed.data.map((track) => ({
    id: track.languageCode,
    label: track.displayName,
    language: track.languageCode,
    url: "",
    forced: false,
  }));
}
