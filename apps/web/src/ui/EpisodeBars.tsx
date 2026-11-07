import { cx } from "./cx.ts";

interface EpisodeBarsProps {
  count: number;
  /** Index of the episode the séance is on. */
  current: number;
  /** How far into the current episode, 0 to 1 (null when its length is unknown). */
  progress: number | null;
  /** The current episode was watched to the credits: it is ticked like those before it. */
  finished?: boolean;
  className?: string;
}

export type BarState = "watched" | "current" | "upcoming";

/** Before the episode on screen, or that one once watched to the credits: ticked. */
export function barState(index: number, current: number, finished: boolean): BarState {
  if (index < current || (index === current && finished)) return "watched";
  return index === current ? "current" : "upcoming";
}

/** One short bar per episode: watched ones in mint, the current one filling in the thread colour, the rest empty. */
export function EpisodeBars({ count, current, progress, finished = false, className }: EpisodeBarsProps) {
  const percent = Math.round(Math.min(1, Math.max(0, progress ?? 0)) * 100);
  return (
    <div role="img" aria-label={`Épisode ${current + 1} sur ${count}`} className={cx("flex h-1 gap-1", className)}>
      {Array.from({ length: count }, (_, index) => {
        const state = barState(index, current, finished);
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: the bars are positions in the séance, nothing else names them.
            key={index}
            className={cx(
              "relative flex-1 overflow-hidden rounded-full",
              state === "watched" ? "bg-success" : "bg-fill-strong",
            )}
          >
            {state === "current" ? (
              <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${percent}%` }} />
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
