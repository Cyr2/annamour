import { CREDITS_COUNTDOWN_MS } from "@annamour/protocol";
import { ChevronsRight, Play, SkipForward } from "lucide-react";
import { useReducedMotion } from "motion/react";
import type { SyncClient } from "../../sync/SyncClient.ts";
import { Button } from "../../ui/controls.tsx";
import { Poster } from "../../ui/Poster.tsx";
import { Progress } from "../../ui/Progress.tsx";
import { Surface } from "../../ui/Surface.tsx";
import type { NextUp } from "./skip-rules.ts";
import { useCountdown } from "./useCountdown.ts";

/* The small offers over the film around its intro and its end credits (see SkipLayer). */

/** « Passer l'intro »: everyone jumps to its end. */
export function SkipIntroPill({ onSkip }: { onSkip: () => void }) {
  return (
    <Button icon={<ChevronsRight />} onClick={onSkip} data-tv-primary>
      Passer l'intro
    </Button>
  );
}

/** « Épisode suivant · S1 · É2 », without a countdown: one touch starts it for everyone. */
export function NextPill({ next, onStart }: { next: NextUp; onStart: () => void }) {
  return (
    <Button icon={<SkipForward />} onClick={onStart} data-tv-primary>
      {next.kind} · {next.name}
    </Button>
  );
}

interface CreditsCountdownProps {
  next: NextUp;
  /** Server time at which it starts by itself. */
  until: number;
  client: SyncClient | null;
  onStart: () => void;
  /** « Regarder le générique »: the countdown stops for everyone. */
  onWatchCredits: () => void;
}

/** While the credits roll: what comes next, starting by itself in 10 s, unless someone wants the credits. */
export function CreditsCountdown({ next, until, client, onStart, onWatchCredits }: CreditsCountdownProps) {
  const seconds = useCountdown(until, client, onStart);
  const still = useReducedMotion();
  const counted = `${seconds} s`;
  return (
    <Surface className="surface-panel grid w-[min(24rem,calc(100vw-2rem))] gap-3 p-4">
      <div className="flex min-w-0 items-center gap-3">
        {next.poster ? <Poster title={next.poster} size="small" /> : null}
        <div className="grid min-w-0 flex-1">
          <span className="text-xs font-semibold text-accent">{next.kind}</span>
          <strong className="truncate text-sm text-fg">{next.name}</strong>
          <span className="text-xs text-fg-muted" aria-live="polite">
            Démarre pour tout le monde dans {counted}
          </span>
        </div>
        {still ? (
          <span aria-hidden className="font-rounded text-xl font-black text-fg tabular-nums">
            {seconds}
          </span>
        ) : (
          <Progress.Ring value={1 - (seconds * 1000) / CREDITS_COUNTDOWN_MS} label={counted} className="size-12">
            <span aria-hidden className="text-sm font-black text-fg tabular-nums">
              {seconds}
            </span>
          </Progress.Ring>
        )}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onWatchCredits}>Regarder le générique</Button>
        <Button variant="filled" icon={<Play />} onClick={onStart} data-tv-primary>
          Lancer maintenant
        </Button>
      </div>
    </Surface>
  );
}
