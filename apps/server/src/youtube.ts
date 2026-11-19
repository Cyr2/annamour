import { z } from "zod";
import type { ImportedMedia } from "./hls.ts";
import type { TextFetcher } from "./safe-fetch.ts";

/*
 * A YouTube video as a séance's episode: nothing to import (it plays in
 * YouTube's own player), only its title, read from YouTube's oEmbed, which
 * also tells whether the video exists and may be embedded. Its length, and
 * whether it is live, the first player to load it tells the room.
 */

export class YouTubeError extends Error {
  constructor() {
    super("YouTube video not found, private or not embeddable");
    this.name = "YouTubeError";
  }
}

// Some live streams' oEmbed has no title: the video exists all the same.
const OEmbed = z.object({ title: z.string().min(1).catch("Vidéo YouTube").default("Vidéo YouTube") });

export async function importYouTube(
  videoId: string,
  fetchText: TextFetcher,
): Promise<{ media: ImportedMedia; title: string }> {
  const watch = `https://www.youtube.com/watch?v=${videoId}`;
  const url = new URL(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`);
  let title: string;
  try {
    title = OEmbed.parse(JSON.parse(await fetchText(url))).title;
  } catch {
    // oEmbed answers 401/403/404 for a private, removed or non-embeddable video.
    throw new YouTubeError();
  }
  const media: ImportedMedia = {
    playlists: new Map(),
    audio: [],
    subtitleFiles: new Map(),
    subtitles: [],
    duration: undefined,
    youtube: { videoId, live: false },
  };
  return { media, title };
}
