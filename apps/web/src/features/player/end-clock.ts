import { z } from "zod/mini";
import { create } from "zustand";
import { formatClock } from "../../lib/format.ts";
import { readStored, writeStored } from "../../lib/storage.ts";

/*
 * The clock at the end of the timeline: the film's length, or the time left.
 * A personal habit, kept on this device and never sent to the room.
 */

export const EndClockMode = z.enum(["total", "remaining"]);
export type EndClockMode = z.infer<typeof EndClockMode>;

const KEY = "annamour.temps-fin";

export const useEndClock = create<{ mode: EndClockMode }>()(() => ({
  mode: readStored(KEY, EndClockMode) ?? "total",
}));

export function toggleEndClock(): void {
  const mode = useEndClock.getState().mode === "total" ? "remaining" : "total";
  writeStored(KEY, mode);
  useEndClock.setState({ mode });
}

/** "1:40:00", or "−1:30:00" left; rounded up, so it reads zero only once the film is over. */
export function endClockText(clock: { current: number; duration: number }, mode: EndClockMode): string {
  if (mode === "total") return formatClock(clock.duration);
  return `−${formatClock(Math.ceil(Math.max(0, clock.duration - clock.current)))}`;
}
