import { useEffect, useRef, useState } from "react";
import type { SyncMedia } from "../../sync/media.ts";
import { YouTubeMedia } from "../../sync/youtube-media.ts";
import { cx } from "../../ui/cx.ts";
import { STUCK_SECONDS, standingStill, TOUCH_YOUTUBE_MS } from "./youtube-ad-rules.ts";

interface YouTubeSurfaceProps {
  videoId: string;
  /** Hands the player to the sync, as the <video> would be (null once it leaves). */
  onMedia: (media: SyncMedia | null) => void;
}

/** Watches the video once a second: true while it should play but stands still (an ad, mostly). */
function useStandingStill(media: SyncMedia | null): boolean {
  const [still, setStill] = useState(false);
  useEffect(() => {
    if (!media) return;
    const samples: { paused: boolean; time: number }[] = [];
    const timer = setInterval(() => {
      samples.push({ paused: media.paused, time: media.currentTime });
      if (samples.length > STUCK_SECONDS + 1) samples.shift();
      setStill(standingStill(samples));
    }, 1000);
    return () => clearInterval(timer);
  }, [media]);
  return still;
}

/**
 * YouTube's own player in place of the <video>. Touches go to Annamour's
 * controls laid over it, so a play or a pause is everyone's, never this screen's alone.
 * During an ad, « Une pub ? Toucher YouTube » brings it up for a while, to tap « Passer l'annonce ».
 */
export function YouTubeSurface({ videoId, onMedia }: YouTubeSurfaceProps) {
  const host = useRef<HTMLDivElement>(null);
  const [media, setMedia] = useState<SyncMedia | null>(null);
  const [touchable, setTouchable] = useState(false);
  const still = useStandingStill(media);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const created = new YouTubeMedia(element, videoId);
    setMedia(created);
    onMedia(created);
    return () => {
      setMedia(null);
      onMedia(null);
      created.destroy();
      element.replaceChildren();
    };
  }, [videoId, onMedia]);

  useEffect(() => {
    if (!touchable) return;
    const timer = setTimeout(() => setTouchable(false), TOUCH_YOUTUBE_MS);
    return () => clearTimeout(timer);
  }, [touchable]);

  return (
    <>
      <div className={cx("absolute inset-0 overflow-hidden", touchable && "z-40")}>
        <div
          ref={host}
          className={cx(
            "absolute inset-x-0 [&_iframe]:size-full",
            // Brought over the controls for a moment, whole (« Passer l'annonce » sits in its bottom corner).
            // Otherwise it runs past the frame: YouTube's title, channel and « Autres vidéos » bars fall outside,
            // the picture stays (letterboxed by YouTube, so nothing of the film is cut on a 16:9 screen).
            touchable
              ? "pointer-events-auto inset-y-0"
              : "pointer-events-none -top-[var(--am-youtube-chrome)] -bottom-[var(--am-youtube-chrome)]",
          )}
        />
      </div>
      {still && !touchable ? (
        <button
          type="button"
          onClick={() => setTouchable(true)}
          className="safe-area absolute top-4 left-4 z-40 min-h-11 rounded-pill bg-surface-raised px-4 text-sm font-semibold text-fg shadow-float"
        >
          Une pub ? Toucher YouTube
        </button>
      ) : null}
    </>
  );
}
