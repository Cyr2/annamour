import { useEffect, useState } from "react";
import { useRoom } from "../../sync/room.ts";
import type { PlayerControls } from "../../sync/usePlayerSync.ts";

export type SessionStage = "lobby" | "watching";
const COUNTDOWN_FROM = 3;
const COUNTDOWN_STEP_MS = 820;

/**
 * The salon until the film starts, then the film. Pressing « Lancer » counts
 * 3-2-1 then starts it for everyone; when someone else starts it (or it was
 * already playing on arrival) this device goes straight to the film.
 */
export function useSessionStage(controls: PlayerControls) {
  const [stage, setStage] = useState<SessionStage>("lobby");
  const [countdown, setCountdown] = useState<number | null>(null);
  const playing = useRoom((s) => s.playback?.status === "playing");

  useEffect(() => {
    if (playing && countdown === null) setStage("watching");
  }, [playing, countdown]);

  useEffect(() => {
    if (countdown === null) return;
    const timer = setTimeout(() => {
      if (countdown > 1) return setCountdown(countdown - 1);
      setCountdown(null);
      setStage("watching");
      controls.play();
    }, COUNTDOWN_STEP_MS);
    return () => clearTimeout(timer);
  }, [countdown, controls]);

  return { stage, countdown, start: () => setCountdown(COUNTDOWN_FROM) };
}
