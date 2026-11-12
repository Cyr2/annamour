import type { SkipMarkers } from "./messages.ts";

/*
 * « Passer l'intro » and the end credits: where they are comes from public
 * databases (TheIntroDB, IntroDB, SkipDB), each made on some copy of the film.
 * Ours may differ (a French dub's extra card, other logos): times are only
 * kept when they plausibly fit our video, the most trusted source first.
 */

/** What one source says, in seconds, with the length of the copy it was timed on. */
export interface SourceMarkers {
  source: string;
  /** 0 to 1. */
  confidence: number;
  introStart?: number;
  introEnd?: number;
  creditsStart?: number;
  /** The length of the copy these times were taken on; unknown for some sources. */
  referenceDuration?: number;
}

/** Copies whose lengths differ by more than this (s) are not the same cut: their times would miss. */
export const DURATION_TOLERANCE = 3;
const MIN_CONFIDENCE = 0.5;
/** An intro between these lengths (s): shorter is a logo, longer is not an intro. */
const INTRO_LENGTH = { min: 5, max: 300 } as const;
/** End credits between these lengths (s) before the end. */
const CREDITS_LENGTH = { min: 10, max: 20 * 60 } as const;

function fitsOurCopy(source: SourceMarkers, duration: number | undefined): boolean {
  if (source.confidence < MIN_CONFIDENCE) return false;
  if (duration === undefined || source.referenceDuration === undefined) return true;
  return Math.abs(source.referenceDuration - duration) <= DURATION_TOLERANCE;
}

function introOf(
  source: SourceMarkers,
  duration: number | undefined,
): Pick<SkipMarkers, "introStart" | "introEnd"> | null {
  const start = source.introStart ?? 0;
  const end = source.introEnd;
  if (end === undefined || end - start < INTRO_LENGTH.min || end - start > INTRO_LENGTH.max) return null;
  if (duration !== undefined && end >= duration) return null;
  return { introStart: start, introEnd: end };
}

function creditsOf(source: SourceMarkers, duration: number | undefined): number | null {
  const start = source.creditsStart;
  if (start === undefined || duration === undefined) return null;
  const length = duration - start;
  return length >= CREDITS_LENGTH.min && length <= CREDITS_LENGTH.max ? start : null;
}

/** The intro and credits to use on our copy: from the most trusted source that fits it, each on its own. */
export function chooseSkips(sources: readonly SourceMarkers[], duration: number | undefined): SkipMarkers | undefined {
  const trusted = sources.filter((source) => fitsOurCopy(source, duration)).sort((a, b) => b.confidence - a.confidence);
  const intro = trusted.map((source) => introOf(source, duration)).find((found) => found !== null);
  const credits = trusted.map((source) => creditsOf(source, duration)).find((found) => found !== null);
  if (!intro && credits === undefined) return undefined;
  return { ...(intro ?? {}), ...(credits !== undefined ? { creditsStart: credits } : {}) };
}

/** Seconds before the intro's end under which « Passer l'intro » is no longer worth it. */
const INTRO_TAIL = 2;

/** « Passer l'intro » shows while the intro plays (and is worth skipping). */
export function inIntro(skips: SkipMarkers | undefined, position: number): boolean {
  if (skips?.introEnd === undefined) return false;
  return position >= (skips.introStart ?? 0) && position < skips.introEnd - INTRO_TAIL;
}

/** The end credits are rolling. */
export function inCredits(skips: SkipMarkers | undefined, position: number): boolean {
  return skips?.creditsStart !== undefined && position >= skips.creditsStart;
}

/** Without known credits: the last stretch where a discreet « Épisode suivant » shows, without a countdown. */
export const LAST_SECONDS_WITHOUT_CREDITS = 90;

/** Near the end of a video whose credits are unknown. */
export function nearEndWithoutCredits(
  skips: SkipMarkers | undefined,
  position: number,
  duration: number | undefined,
): boolean {
  if (skips?.creditsStart !== undefined || duration === undefined) return false;
  return position >= duration - LAST_SECONDS_WITHOUT_CREDITS;
}
