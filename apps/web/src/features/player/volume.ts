import { z } from "zod/mini";
import { create } from "zustand";
import { readStored, writeStored } from "../../lib/storage.ts";

/*
 * Volume is personal: it never goes to the room, and it is remembered on
 * this device. Muting keeps the level, so unmuting restores it.
 */

const VolumeState = z.object({ level: z.number().check(z.gte(0), z.lte(1)), muted: z.boolean() });
export type VolumeState = z.infer<typeof VolumeState>;

const STORAGE_KEY = "annamour:volume:v1";
/** Where unmuting lands when the slider had been dragged all the way down. */
const UNMUTE_LEVEL = 0.6;
export const VOLUME_STEP = 0.1;

export function withLevel(state: VolumeState, level: number): VolumeState {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(level) ? level : state.level));
  return { level: clamped, muted: clamped === 0 };
}

export function toggledMute(state: VolumeState): VolumeState {
  if (!state.muted) return { ...state, muted: true };
  return { level: state.level === 0 ? UNMUTE_LEVEL : state.level, muted: false };
}

/** What the speaker actually plays, 0..1. */
export function audibleLevel(state: VolumeState): number {
  return state.muted ? 0 : state.level;
}

/**
 * iPhone and iPad Safari ignore a volume set from script (the hardware
 * buttons own it) and always read back 1: there, only mute can work.
 */
export function supportsVolumeControl(probe: () => HTMLMediaElement = () => document.createElement("audio")): boolean {
  try {
    const element = probe();
    element.volume = 0.5;
    return element.volume === 0.5;
  } catch {
    return false;
  }
}

interface VolumeStore extends VolumeState {
  setLevel: (level: number) => void;
  toggleMute: () => void;
}

function persist(state: VolumeState): VolumeState {
  writeStored(STORAGE_KEY, state);
  return state;
}

export const useVolume = create<VolumeStore>()((set, get) => ({
  ...(readStored(STORAGE_KEY, VolumeState) ?? { level: 0.8, muted: false }),
  setLevel: (level) => set(persist(withLevel(get(), level))),
  toggleMute: () => set(persist(toggledMute(get()))),
}));
