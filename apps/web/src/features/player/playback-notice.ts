import {
  type EpisodeInfo,
  type Member,
  type PlaybackAction,
  type PlaybackState,
  positionAt,
  type RoomChange,
} from "@annamour/protocol";
import { formatClock } from "../../lib/format.ts";

/*
 * What to tell everyone else when someone changes something for all:
 * "Anna a mis en pause", "Léo a avancé de 10 s", "Inès a dit « Pas ce soir »".
 * Our own actions say nothing: we just did them.
 */

export type NoticeKind = "play" | "pause" | "forward" | "back" | "resume" | RoomChange["kind"];

export interface PlaybackNotice {
  kind: NoticeKind;
  message: string;
  member: Member | undefined;
}

/** Seeks shorter than this are corrections, not news (s). */
const MIN_SEEK = 1;
/** Up to this, say how far; beyond, say where (s). */
const RELATIVE_SEEK_MAX = 120;

interface PlaybackEventInput {
  action: PlaybackAction;
  by: string | undefined;
  previous: PlaybackState | null;
  next: PlaybackState;
  members: Member[];
  you: string | null;
}

function seekNotice(
  name: string,
  previous: PlaybackState | null,
  next: PlaybackState,
): Omit<PlaybackNotice, "member"> | null {
  const before = previous ? positionAt(previous, next.at) : next.position;
  const delta = next.position - before;
  const distance = Math.abs(delta);
  if (distance < MIN_SEEK) return null;
  const kind = delta > 0 ? "forward" : "back";
  const verb = delta > 0 ? "a avancé" : "a reculé";
  const message =
    distance <= RELATIVE_SEEK_MAX
      ? `${name} ${verb} de ${Math.round(distance)} s`
      : `${name} ${verb} à ${formatClock(next.position)}`;
  return { kind, message };
}

/** A wait shorter than this went unnoticed (a jump inside what everyone had downloaded): no « C'est reparti » (ms). */
const BRIEF_WAIT_MS = 1500;

function briefWait(previous: PlaybackState | null, next: PlaybackState): boolean {
  return previous?.status === "paused" && next.at - previous.at < BRIEF_WAIT_MS;
}

export function describePlaybackEvent({
  action,
  by,
  previous,
  next,
  members,
  you,
}: PlaybackEventInput): PlaybackNotice | null {
  if (by !== undefined && by === you) return null;
  if (action === "resume")
    return briefWait(previous, next) ? null : { kind: "resume", message: "C'est reparti", member: undefined };
  // A wait is shown by the banner naming who is loading.
  if (action === "wait" || by === undefined) return null;
  const member = members.find((m) => m.id === by);
  const name = member?.name ?? "Quelqu'un";
  if (action === "play") return { kind: "play", message: `${name} a relancé le film`, member };
  if (action === "pause") return { kind: "pause", message: `${name} a mis en pause`, member };
  const seek = seekNotice(name, previous, next);
  return seek ? { ...seek, member } : null;
}

interface RoomChangeInput {
  change: RoomChange | undefined;
  by: string | undefined;
  /** The séance's episodes after the change, and the one now on screen. */
  episodes: readonly EpisodeInfo[];
  current: number;
  members: Member[];
  you: string | null;
}

/** « S1 · É4 », « Alien », or « l'épisode 2 » for one without a label, inside a sentence. */
function queuedName(label: string | undefined, index: number): string {
  return label ?? `l'épisode ${index + 1}`;
}

function roomChangeMessage(name: string, change: RoomChange, episodes: readonly EpisodeInfo[], current: number) {
  switch (change.kind) {
    case "episode":
      return `${name} a lancé ${queuedName(episodes[current]?.label, current)}`;
    case "declined":
      return `${name} a dit « Pas ce soir »`;
    case "added":
      return `${name} a ajouté ${queuedName(episodes[change.episode]?.label, change.episode)} à la file`;
    case "removed":
      return `${name} a retiré ${queuedName(change.label, change.episode)} de la file`;
  }
}

/** « Léo a lancé S1 · É3 », « Léo a ajouté Alien à la file »: what someone else did to the séance's episodes. */
export function describeRoomChange({
  change,
  by,
  episodes,
  current,
  members,
  you,
}: RoomChangeInput): PlaybackNotice | null {
  if (!change || by === undefined || by === you) return null;
  const member = members.find((m) => m.id === by);
  const message = roomChangeMessage(member?.name ?? "Quelqu'un", change, episodes, current);
  return { kind: change.kind, message, member };
}
