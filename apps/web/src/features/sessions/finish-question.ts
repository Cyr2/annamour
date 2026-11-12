import { inLastStretch, type RoomSnapshot } from "@annamour/protocol";
import { create } from "zustand";

/*
 * Leaving a salon in the last minutes of a video, before the credits counted
 * it, asks « C'est fini ? » on the screen that comes next: three minutes of
 * credits left should not leave a film « en cours » forever.
 */

export interface FinishQuestion {
  code: string;
  /** The video left, as the salon names it (« Dune », « The Bear · S2 · É5 »). */
  title: string;
  minutesLeft: number;
  /** What the séance reopens on once this one is over, when something follows. */
  next: string | undefined;
}

export const useFinishQuestion = create<{ question: FinishQuestion | null }>()(() => ({ question: null }));

export function askIfFinished(question: FinishQuestion | null): void {
  if (question) useFinishQuestion.setState({ question });
}

export function dismissFinishQuestion(): void {
  useFinishQuestion.setState({ question: null });
}

/** How far this device watched, and in which of the séance's videos. */
export interface WatchedTo {
  episode: number;
  position: number;
}

/**
 * The question for a salon being left, or null: not while others stay (the last
 * one out is asked), nor once the end already counted, nor about a video other
 * than the one on screen (an episode just started is not over).
 */
export function finishQuestion(
  room: RoomSnapshot,
  { episode, position }: WatchedTo,
  othersStaying: boolean,
): FinishQuestion | null {
  const duration = room.media.duration;
  const spot = { position, duration, index: room.current, count: room.episodes.length };
  if (othersStaying || room.finished || episode !== room.current) return null;
  if (duration === undefined || !inLastStretch(spot)) return null;
  const next = room.episodes[room.current + 1];
  return {
    code: room.code,
    title: room.media.title,
    minutesLeft: Math.max(1, Math.round((duration - position) / 60)),
    next: next?.catalog?.title ?? next?.label,
  };
}
