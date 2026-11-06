import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import { formatClock } from "../../lib/format.ts";
import type { VideoClock } from "./usePlayerEffects.ts";

const KEY_STEP = 10;

/** The film's timeline: the buffered part, the watched part; drag or tap to move everyone there. */
export function Scrubber({ clock, onSeek }: { clock: VideoClock; onSeek: (position: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const { duration } = clock;
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
    const delta = event.key === "ArrowRight" ? KEY_STEP : event.key === "ArrowLeft" ? -KEY_STEP : 0;
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    onSeek(Math.min(duration, Math.max(0, clock.current + delta)));
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
      className="group relative flex h-[22px] cursor-pointer touch-none items-center rounded-control"
    >
      <div className="relative h-[5px] w-full overflow-hidden rounded-full bg-fill-strong transition-[height] duration-300 group-hover:h-2">
        <div className="absolute inset-y-0 left-0 bg-fill-hover" style={{ width: percent(clock.buffered) }} />
        <div className="absolute inset-y-0 left-0 bg-fg" style={{ width: percent(shown) }} />
      </div>
    </div>
  );
}
