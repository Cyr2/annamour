import type { Media } from "@annamour/protocol";

/* What the player offers depends on what plays: a film of the catalog, a pasted link, a YouTube video or live. */

/** A YouTube live stream: no timeline, no queue, no end; « Revenir au direct » instead. */
export function isLive(media: Media | undefined): boolean {
  return media?.youtube?.live === true;
}

/** Something to choose in « Audio et sous-titres » (YouTube's player has neither of ours). */
export function hasTracks(media: Media | undefined): boolean {
  return Boolean(media && (media.audio.length > 0 || media.subtitles.length > 0));
}

interface PlayerActions {
  setTracksOpen: (open: boolean) => void;
  setUpNextOpen: (open: boolean) => void;
  /** Absent on the last episode. */
  skipNext: (() => void) | undefined;
}

/** The player's offers for what plays: during a live stream, no queue and no « Épisode suivant ». */
export function sourceOffers(media: Media | undefined, { setTracksOpen, setUpNextOpen, skipNext }: PlayerActions) {
  const live = isLive(media);
  return {
    live,
    openTracks: hasTracks(media) ? () => setTracksOpen(true) : undefined,
    openUpNext: live ? undefined : () => setUpNextOpen(true),
    skipToNext: live ? undefined : skipNext,
  };
}
