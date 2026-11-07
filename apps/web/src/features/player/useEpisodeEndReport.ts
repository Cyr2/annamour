import { useEffect } from "react";
import { useRoom } from "../../sync/room.ts";
import type { SyncClient } from "../../sync/SyncClient.ts";

/**
 * Tells the room when this device reaches the end of the episode on screen.
 * Every device does; the room acts on the first and ignores the rest.
 */
export function useEpisodeEndReport(video: HTMLVideoElement | null, client: SyncClient | null): void {
  useEffect(() => {
    if (!video || !client) return;
    const onEnded = () => {
      const room = useRoom.getState().room;
      if (room) client.send({ type: "ended", episode: room.current });
    };
    video.addEventListener("ended", onEnded);
    return () => video.removeEventListener("ended", onEnded);
  }, [video, client]);
}
