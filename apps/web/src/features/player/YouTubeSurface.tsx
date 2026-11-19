import { useEffect, useRef } from "react";
import type { SyncMedia } from "../../sync/media.ts";
import { YouTubeMedia } from "../../sync/youtube-media.ts";

interface YouTubeSurfaceProps {
  videoId: string;
  /** Hands the player to the sync, as the <video> would be (null once it leaves). */
  onMedia: (media: SyncMedia | null) => void;
}

/**
 * YouTube's own player in place of the <video>. Touches go to Annamour's
 * controls laid over it, so a play or a pause is everyone's, never this screen's alone.
 */
export function YouTubeSurface({ videoId, onMedia }: YouTubeSurfaceProps) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const media = new YouTubeMedia(element, videoId);
    onMedia(media);
    return () => {
      onMedia(null);
      media.destroy();
      element.replaceChildren();
    };
  }, [videoId, onMedia]);

  return <div ref={host} className="pointer-events-none absolute inset-0 [&_iframe]:size-full" />;
}
