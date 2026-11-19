import { useEffect } from "react";
import type { SyncMedia } from "./media.ts";
import { useRoom } from "./room.ts";
import type { SyncClient } from "./SyncClient.ts";
import { YouTubeMedia } from "./youtube-media.ts";

/**
 * Only YouTube's player knows a video's length and whether it is live: once
 * loaded, it tells the room, which keeps it for everyone (and turns a live
 * stream into a « Direct » séance). Once per video on this device.
 */
export function useYouTubeInfo(media: SyncMedia | null, client: SyncClient | null): void {
  useEffect(() => {
    if (!(media instanceof YouTubeMedia) || !client) return;
    let told = false;
    const tell = () => {
      const info = media.info();
      const room = useRoom.getState().room;
      if (told || !info || !room || room.media.youtube?.videoId !== media.videoId) return;
      // A video's length can still read 0 before it plays: told once it is known (a live stream has none).
      if (!info.live && info.duration <= 0) return;
      told = client.send({ type: "youtubeInfo", episode: room.current, duration: info.duration, live: info.live });
    };
    media.addEventListener("loadedmetadata", tell);
    media.addEventListener("playing", tell);
    return () => {
      media.removeEventListener("loadedmetadata", tell);
      media.removeEventListener("playing", tell);
    };
  }, [media, client]);
}
