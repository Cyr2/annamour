import type { Media, PlaybackState } from "@annamour/protocol";
import { useEffect, useRef, useState } from "react";
import { useRoom } from "../../sync/room.ts";
import type { PlayerControls } from "../../sync/usePlayerSync.ts";
import { toast } from "../../ui/toast.ts";
import { memberChanges } from "./member-changes.ts";
import { describePlaybackEvent } from "./playback-notice.ts";
import { choiceFor, useTrackChoices } from "./track-choice.ts";
import { audibleLevel, useVolume } from "./volume.ts";

export interface VideoClock {
  current: number;
  duration: number;
  buffered: number;
}

/** Where the video is, smoothly while it plays (one update per frame), for the scrubber and the time. */
export function useVideoClock(video: HTMLVideoElement | null): VideoClock {
  const [clock, setClock] = useState<VideoClock>({ current: 0, duration: 0, buffered: 0 });

  useEffect(() => {
    if (!video) return;
    let frame = 0;
    const read = () => {
      const end = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      setClock({ current: video.currentTime, duration, buffered: end });
    };
    const loop = () => {
      read();
      frame = video.paused ? 0 : requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(loop);
    };
    const events = ["seeked", "durationchange", "progress", "pause", "loadedmetadata"] as const;
    for (const name of events) video.addEventListener(name, read);
    video.addEventListener("play", start);
    read();
    return () => {
      cancelAnimationFrame(frame);
      for (const name of events) video.removeEventListener(name, read);
      video.removeEventListener("play", start);
    };
  }, [video]);

  return clock;
}

interface ControlsVisibility {
  tv: boolean;
  /** The film is on screen. */
  active: boolean;
  playing: boolean;
  /** The end screen of an episode covers the film. */
  over: boolean;
  /** A menu or a sheet is open: the controls stay. */
  busy: boolean;
  /** On a TV, the remote brought the controls up. */
  remoteShown: boolean;
}

/** Whether the controls are out of sight: under the end screen, after 3 s of stillness, or until the remote calls them. */
export function useControlsHidden({ tv, active, playing, over, busy, remoteShown }: ControlsVisibility): boolean {
  const idle = useIdle(tv || !active || !playing || busy);
  return over || (tv ? !remoteShown : idle);
}

/** True after `delay` ms without pointer or keyboard activity, unless the UI must stay visible. */
export function useIdle(keepVisible: boolean, delay = 3000): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (keepVisible) {
      setIdle(false);
      return;
    }
    let timer = setTimeout(() => setIdle(true), delay);
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), delay);
    };
    const events = ["pointermove", "pointerdown", "keydown", "touchstart"] as const;
    for (const name of events) window.addEventListener(name, wake, { passive: true });
    return () => {
      clearTimeout(timer);
      for (const name of events) window.removeEventListener(name, wake);
    };
  }, [keepVisible, delay]);

  return idle;
}

/** « Anna a mis en pause », « Léo a avancé de 10 s »… for what the others do. */
export function usePlaybackNotices(): void {
  const previous = useRef<PlaybackState | null>(null);

  useEffect(
    () =>
      useRoom.subscribe((state, before) => {
        const event = state.lastEvent;
        if (event && event !== before.lastEvent && state.playback) {
          const notice = describePlaybackEvent({
            action: event.action,
            by: event.by,
            previous: previous.current,
            next: state.playback,
            members: state.members,
            you: state.you,
          });
          if (notice) toast({ message: notice.message, color: notice.member?.color, name: notice.member?.name });
        }
        previous.current = state.playback;
      }),
    [],
  );
}

/** « Anna a rejoint la séance » / « Léo est sorti du salon », but not for the list received on arrival. */
export function useMemberNotices(): void {
  useEffect(
    () =>
      useRoom.subscribe((state, before) => {
        if (!before.you || state.members === before.members) return;
        const { joined, left } = memberChanges(before.members, state.members, state.you);
        for (const m of joined) toast({ message: `${m.name} a rejoint la séance`, color: m.color, name: m.name });
        for (const m of left) toast({ message: `${m.name} est sorti du salon`, color: m.color, name: m.name });
      }),
    [],
  );
}

/** Applies this person's audio language and subtitles to the video. */
export function useTrackChoice(
  video: HTMLVideoElement | null,
  code: string,
  media: Media | undefined,
  controls: PlayerControls,
) {
  const byRoom = useTrackChoices((s) => s.byRoom);
  // Primitive ids, so the effects only run when the choice really changes.
  const audioId = media ? choiceFor(byRoom, code, media).audio : null;
  const subtitlesId = media ? choiceFor(byRoom, code, media).subtitles : null;
  const { selectAudio } = controls;

  useEffect(() => {
    if (!media) return;
    selectAudio(media.audio.find((a) => a.id === audioId) ?? null);
  }, [media, audioId, selectAudio]);

  useEffect(() => {
    if (!video) return;
    const apply = () => {
      for (const track of Array.from(video.textTracks)) {
        track.mode = track.id === subtitlesId ? "showing" : "disabled";
      }
    };
    apply();
    // Tracks are added when the media loads; apply the choice to them too.
    video.textTracks.addEventListener("addtrack", apply);
    return () => video.textTracks.removeEventListener("addtrack", apply);
  }, [video, subtitlesId]);
}

/** Personal volume: never sent to the room. */
export function useVolumeOnVideo(video: HTMLVideoElement | null): void {
  const level = useVolume((s) => audibleLevel(s));
  useEffect(() => {
    if (!video) return;
    video.volume = level;
    video.muted = level === 0;
  }, [video, level]);
}
