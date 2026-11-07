import type { Media, SubtitleTrack } from "@annamour/protocol";
import { create } from "zustand";

/*
 * Audio language and subtitles are personal: each person picks their own,
 * per session, and nothing is sent to the room.
 */

export interface TrackChoice {
  /** Audio rendition id; null keeps the stream's default. */
  audio: string | null;
  /** Subtitle track id; null shows none. */
  subtitles: string | null;
}

interface TrackChoiceStore {
  byRoom: Record<string, TrackChoice>;
}

export const useTrackChoices = create<TrackChoiceStore>()(() => ({ byRoom: {} }));

/** Forced French subtitles only translate the foreign lines of a French film: on by default. */
export function defaultSubtitles(subtitles: readonly SubtitleTrack[]): string | null {
  return subtitles.find((s) => s.forced && s.language === "fr")?.id ?? null;
}

export function defaultChoice(media: Pick<Media, "audio" | "subtitles">): TrackChoice {
  return { audio: media.audio[0]?.id ?? null, subtitles: defaultSubtitles(media.subtitles) };
}

export function choiceFor(
  byRoom: Record<string, TrackChoice>,
  code: string,
  media: Pick<Media, "audio" | "subtitles">,
): TrackChoice {
  return byRoom[code] ?? defaultChoice(media);
}

export function chooseTracks(
  code: string,
  media: Pick<Media, "audio" | "subtitles">,
  patch: Partial<TrackChoice>,
): void {
  useTrackChoices.setState((s) => ({
    byRoom: { ...s.byRoom, [code]: { ...choiceFor(s.byRoom, code, media), ...patch } },
  }));
}

/**
 * A subtitle track's name in the picker. The server already names forced
 * tracks (« Français (forcés) », « English (forced) »): only an unnamed one
 * gets « (forcés) » added, never twice.
 */
export function subtitleLabel(track: Pick<SubtitleTrack, "label" | "forced">): string {
  if (!track.forced || /forc/i.test(track.label)) return track.label;
  return `${track.label} (forcés)`;
}

/** "Français", "2 langues", or nothing when the stream has a single unnamed track. */
export function describeAudio(media: Pick<Media, "audio">): string | null {
  if (media.audio.length > 1) return `${media.audio.length} langues`;
  return media.audio[0]?.label ?? null;
}
