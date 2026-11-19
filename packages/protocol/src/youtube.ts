import { z } from "zod/mini";

/*
 * YouTube as a source, next to HLS: a video plays in YouTube's own embedded
 * player, driven by the same sync. A live stream is a séance of its own (see
 * isLiveSeance). Whether a video is live, and its length, only the player
 * knows: the first device that loads it tells the room (« youtubeInfo »).
 */

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);

export const YouTubeVideo = z.object({
  videoId: z.string().check(z.regex(VIDEO_ID)),
  /** A live stream: no queue, no timeline, « Revenir au direct ». */
  live: z.boolean(),
});
export type YouTubeVideo = z.infer<typeof YouTubeVideo>;

/** The video id in a YouTube link (watch, youtu.be, shorts, live, embed), or null for any other link. */
export function youTubeVideoId(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (!HOSTS.has(url.hostname)) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const candidate =
    url.hostname === "youtu.be"
      ? parts[0]
      : parts[0] === "watch"
        ? url.searchParams.get("v")
        : ["shorts", "live", "embed", "v"].includes(parts[0] ?? "")
          ? parts[1]
          : null;
  return candidate && VIDEO_ID.test(candidate) ? candidate : null;
}
