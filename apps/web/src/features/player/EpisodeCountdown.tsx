import { NEXT_EPISODE_COUNTDOWN_MS } from "@annamour/protocol";
import type { SyncClient } from "../../sync/SyncClient.ts";
import { Progress } from "../../ui/Progress.tsx";
import { useCountdown } from "./useCountdown.ts";

interface EpisodeCountdownProps {
  /** Server time at which the next episode starts. */
  until: number;
  client: SyncClient | null;
  /** At 0: this device asks for the next episode (the room starts it once, whoever asks first). */
  onDone: () => void;
  next: string;
  titleId: string;
}

/** The ring that empties until the next episode, on the shared clock so every screen counts together. */
export function EpisodeCountdown({ until, client, onDone, next, titleId }: EpisodeCountdownProps) {
  const seconds = useCountdown(until, client, onDone);
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
