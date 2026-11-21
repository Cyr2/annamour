import { z } from "zod/mini";
import { create } from "zustand";
import { readStored, writeStored } from "../../lib/storage.ts";

/*
 * Subtitle size and timing are personal, never sent to the room. The size is
 * remembered on this device; the offset belongs to a séance (track-choice.ts).
 */

const SubtitleSize = z.enum(["small", "normal", "large"]);
export type SubtitleSize = z.infer<typeof SubtitleSize>;

export const SUBTITLE_SIZES: { value: SubtitleSize; label: string }[] = [
  { value: "small", label: "Petit" },
  { value: "normal", label: "Normal" },
  { value: "large", label: "Grand" },
];

/** YouTube's undocumented captions font size, -1 (smaller) to 3 (largest), 0 its default. */
export const YOUTUBE_FONT_SIZE: Record<SubtitleSize, number> = { small: -1, normal: 0, large: 2 };

const STORAGE_KEY = "annamour:subtitle-size:v1";

interface SubtitleSizeStore {
  size: SubtitleSize;
  setSize: (size: SubtitleSize) => void;
}

export const useSubtitleSize = create<SubtitleSizeStore>()((set) => ({
  size: readStored(STORAGE_KEY, SubtitleSize) ?? "normal",
  setSize: (size) => {
    writeStored(STORAGE_KEY, size);
    set({ size });
  },
}));

export const SUBTITLE_OFFSET_STEP = 0.5;
export const SUBTITLE_OFFSET_MAX = 10;

/** The offset after `steps` presses (+ later, − earlier), on the 0.5 s grid, within ±10 s. */
export function steppedOffset(offset: number, steps: number): number {
  const next = Math.round((offset + steps * SUBTITLE_OFFSET_STEP) / SUBTITLE_OFFSET_STEP) * SUBTITLE_OFFSET_STEP;
  return Math.min(SUBTITLE_OFFSET_MAX, Math.max(-SUBTITLE_OFFSET_MAX, next)) || 0;
}

/** « 0 s », « +1,5 s », « −2 s ». */
export function formatOffset(offset: number): string {
  if (offset === 0) return "0 s";
  const amount = Math.abs(offset).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  return `${offset > 0 ? "+" : "−"}${amount} s`;
}

export interface CueTimes {
  startTime: number;
  endTime: number;
}

/**
 * Moves every cue of a track by `offset` from its original time, kept in
 * `originals` the first time a cue is seen: shifting again never drifts, and
 * cues loaded later get the same offset.
 */
export function shiftCues(cues: ArrayLike<CueTimes> | null, offset: number, originals: WeakMap<CueTimes, CueTimes>) {
  for (const cue of Array.from(cues ?? [])) {
    let original = originals.get(cue);
    if (!original) {
      original = { startTime: cue.startTime, endTime: cue.endTime };
      originals.set(cue, original);
    }
    cue.startTime = Math.max(0, original.startTime + offset);
    cue.endTime = Math.max(0, original.endTime + offset);
  }
}
