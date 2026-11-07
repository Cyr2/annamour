import { type Member, type PlaybackAction, type PlaybackState, positionAt } from "@annamour/protocol";
import { formatClock } from "../../lib/format.ts";

/*
 * What to tell everyone else when someone changes the shared playback:
 * "Anna a mis en pause", "Léo a avancé de 10 s". Our own actions say nothing:
 * we just did them.
 */

export type NoticeKind = "play" | "pause" | "forward" | "back" | "resume";

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
