import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import { formatClock } from "../../lib/format.ts";
import { cx } from "../../ui/cx.ts";
import { timelineKeyTarget } from "./seek.ts";
import type { VideoClock } from "./usePlayerEffects.ts";

/** The film's timeline: the buffered part, the watched part; drag or tap to move everyone there. */
interface ScrubberProps {
  clock: VideoClock;
  onSeek: (position: number) => void;
  className?: string;
}

export function Scrubber({ clock, onSeek, className }: ScrubberProps) {
  const track = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const { duration } = clock;
  const dragging = preview !== null;
  const shown = preview ?? clock.current;
  const percent = (value: number) => (duration ? `${Math.min(100, (value / duration) * 100)}%` : "0%");

  const positionAt = (clientX: number): number => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect?.width || !duration) return 0;
    return Math.min(duration, Math.max(0, ((clientX - rect.left) / rect.width) * duration));
  };

  const down = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setPreview(positionAt(event.clientX));
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (preview !== null) setPreview(positionAt(event.clientX));
  };
  // One seek on release, not a flood while dragging: everyone jumps once.
  const up = (event: PointerEvent<HTMLDivElement>) => {
    if (preview === null) return;
    onSeek(positionAt(event.clientX));
    setPreview(null);
  };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = timelineKeyTarget(event.key, clock.current, duration);
    if (target === null) return;
    event.preventDefault();
    event.stopPropagation();
    onSeek(target);
  };

  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label="Position dans le film"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={`${formatClock(shown)} sur ${formatClock(duration)}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onKeyDown={key}
      data-dragging={dragging || undefined}
      className={cx("group relative flex h-7 cursor-pointer touch-none items-center rounded-control", className)}
    >
      {/* The red thread is the film: watched in peach, loaded in milk. It thickens under the finger (transform only). */}
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-fill-strong transition-transform duration-200 ease-out group-hover:scale-y-150 group-data-[dragging]:scale-y-150">
        <div className="absolute inset-y-0 left-0 bg-fill-strong" style={{ width: percent(clock.buffered) }} />
        <div className="absolute inset-y-0 left-0 bg-thread" style={{ width: percent(shown) }} />
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 size-4 -translate-1/2 scale-0 rounded-full bg-palette-milk shadow-bubble transition-transform duration-200 ease-out group-hover:scale-100 group-focus-visible:scale-100 group-data-[dragging]:scale-125 pointer-coarse:scale-75"
        style={{ left: percent(shown) }}
      />
      {dragging ? (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-full mb-1.5 -translate-x-1/2 rounded-pill bg-sheet px-2.5 py-1 text-xs font-semibold text-fg tabular-nums shadow-float"
          style={{ left: percent(shown) }}
        >
          {formatClock(shown)}
        </span>
      ) : null}
    </div>
  );
}
