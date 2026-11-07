import { useTv } from "../tv/tv-context.ts";
import { endClockText, toggleEndClock, useEndClock } from "./end-clock.ts";
import type { VideoClock } from "./usePlayerEffects.ts";

/**
 * The time after the timeline: a tap switches between the film's length and
 * the time left. On a TV it stays plain text, out of the remote's path.
 */
export function EndClock({ clock }: { clock: VideoClock }) {
  const tv = useTv();
  const mode = useEndClock((s) => s.mode);
  const text = endClockText(clock, mode);
  if (tv) return <span>{text}</span>;

  return (
    <button
      type="button"
      onClick={toggleEndClock}
      aria-label={
        mode === "total" ? `Durée ${text}, afficher le temps restant` : `Reste ${text.slice(1)}, afficher la durée`
      }
      // 44px tall to the finger, without making the clock row taller.
      className="-my-3 min-h-11 cursor-pointer rounded-control px-1 tabular-nums transition-colors hover:text-fg focus-visible:text-fg"
    >
      {text}
    </button>
  );
}
