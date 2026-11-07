import { deviceKind } from "@annamour/protocol";
import { useEffect, useRef } from "react";
import type { PlaybackEngine } from "./PlayerSync.ts";
import { beaconSender, PlaybackStats } from "./playback-stats.ts";
import { type RoomState, useRoom } from "./room.ts";
import type { SyncClient } from "./SyncClient.ts";

const myName = ({ members, you }: RoomState) => members.find((member) => member.id === you)?.name ?? null;

/** Reports how well the film plays on this device to the séance (see playback-stats.ts). */
export function usePlaybackStats(
  video: HTMLVideoElement | null,
  client: SyncClient | null,
  engine: PlaybackEngine | null,
): void {
  const engineRef = useRef(engine);
  engineRef.current = engine;

  useEffect(() => {
    if (!video || !client) return;
    const stats = new PlaybackStats({
      video,
      roomPlaying: () => useRoom.getState().playback?.status === "playing",
      name: () => myName(useRoom.getState()),
      engine: () => engineRef.current,
      device: deviceKind(navigator.userAgent, navigator.maxTouchPoints),
      send: beaconSender(client.room),
    });
    const unsubscribe = useRoom.subscribe((room, before) => {
      if (room.playback !== before.playback) stats.roomStarted();
    });
    return () => {
      unsubscribe();
      stats.destroy();
    };
  }, [video, client]);
}
