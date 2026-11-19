/**
 * What the sync and the player's hooks read and drive on a film: the subset of
 * <video> they use. A <video> is one as it is; YouTube's player is one through
 * YouTubeMedia (youtube-media.ts).
 */
export interface SyncMedia {
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly ended: boolean;
  readonly seeking: boolean;
  readonly readyState: number;
  readonly buffered: TimeRanges;
  /** The picture's height, for the séance's stats. */
  readonly videoHeight: number;
  /** A live stream (YouTube only): every device follows its own edge. */
  readonly live?: boolean;
  playbackRate: number;
  volume: number;
  muted: boolean;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export const isLiveStream = (media: SyncMedia) => media.live === true;

/** A <video> (or what stands for one), as opposed to YouTube's player: told by what only a <video> can do. */
export function isVideoElement(media: SyncMedia | null): media is HTMLVideoElement {
  return media !== null && "canPlayType" in media;
}
