import { NEXT_EPISODE_COUNTDOWN_MS } from "@annamour/protocol";
import { useEffect, useRef, useState } from "react";
import type { SyncClient } from "../../sync/SyncClient.ts";
import { Progress } from "../../ui/Progress.tsx";
import { secondsLeft } from "./episode-rules.ts";

interface EpisodeCountdownProps {
  /** Server time at which the next episode starts. */
  until: number;
  client: SyncClient | null;
  /** At 0: this device asks for the next episode (the room starts it once, whoever asks first). */
  onDone: () => void;
  next: string;
  titleId: string;
}

const TICK_MS = 250;

/** The ring that empties until the next episode, on the shared clock so every screen counts together. */
export function EpisodeCountdown({ until, client, onDone, next, titleId }: EpisodeCountdownProps) {
  const serverNow = () => client?.serverNow() ?? Date.now();
  const [seconds, setSeconds] = useState(() => secondsLeft(until, serverNow()));
  // The latest callback, without restarting the clock each render.
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let asked = false;
    const tick = () => {
      const left = secondsLeft(until, client?.serverNow() ?? Date.now());
      setSeconds(left);
      if (left > 0 || asked) return;
      asked = true;
      done.current();
    };
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [until, client]);

  return (
    <div className="grid justify-items-center gap-4">
      <Progress.Ring value={(seconds * 1000) / NEXT_EPISODE_COUNTDOWN_MS} label={`${seconds} s`} className="size-32">
        <span aria-hidden className="font-rounded text-display font-black text-fg tabular-nums">
          {seconds}
        </span>
      </Progress.Ring>
      <div className="grid gap-1">
        <span className="text-sm font-semibold text-accent">Épisode suivant</span>
        <h2 id={titleId} className="type-title">
          {next}
        </h2>
        <p className="type-lede">Démarre pour tout le monde dans {seconds} s</p>
      </div>
    </div>
  );
}
