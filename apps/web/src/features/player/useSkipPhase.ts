import { useEffect, useRef, useState } from "react";
import { useRoom } from "../../sync/room.ts";
import type { SyncClient } from "../../sync/SyncClient.ts";
import { type SkipPhase, skipPhaseOf } from "./skip-rules.ts";

/**
 * Where the film is for the skip offers (intro, credits, near the end),
 * re-rendering only when that changes, not on every frame. Reaching the credits
 * tells the room once per episode, which starts the next one's countdown for all.
 */
export function useSkipPhase(video: HTMLVideoElement | null, client: SyncClient | null): SkipPhase {
  const [phase, setPhase] = useState<SkipPhase>(null);
  const reported = useRef<number | null>(null);
  const current = useRoom((s) => s.room?.current);

  useEffect(() => {
    // Re-read on each new episode, from its own markers; nothing without a room.
    if (!video || current === undefined) return;
    const check = () => {
      const room = useRoom.getState().room;
      const next = room ? skipPhaseOf(room, video.currentTime) : null;
      setPhase(next);
      if (next === "credits" && room && reported.current !== room.current) {
        reported.current = room.current;
        client?.send({ type: "credits", episode: room.current });
      }
    };
    check();
    video.addEventListener("timeupdate", check);
    video.addEventListener("seeked", check);
    return () => {
      video.removeEventListener("timeupdate", check);
      video.removeEventListener("seeked", check);
    };
  }, [video, client, current]);

  return phase;
}
