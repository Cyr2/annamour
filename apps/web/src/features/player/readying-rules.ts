import type { Member, PlaybackState, Readying } from "@annamour/protocol";

/**
 * The film is on, for the controls: playing, or about to (the room waits for
 * everyone's lead, after a play or a jump). The button then offers « Pause »,
 * which cancels the wait, and a short wait after a jump does not flicker it.
 */
export function filmIsOn(playback: PlaybackState | null, readying: Readying | null): boolean {
  return playback?.status === "playing" || readying !== null;
}

/** Who the room is waiting for before starting together: the device with the least downloaded. */
export interface SlowestLead {
  member: Member;
  lead: number;
  target: number;
  isYou: boolean;
}

export function slowestLead(members: Member[], readying: Readying | null, you: string | null): SlowestLead | null {
  if (!readying) return null;
  let slowest: SlowestLead | null = null;
  for (const member of members) {
    const lead = member.lead;
    if (lead === undefined || lead >= readying.target) continue;
    if (!slowest || lead < slowest.lead) slowest = { member, lead, target: readying.target, isYou: member.id === you };
  }
  return slowest;
}

/** « On attend que la vidéo d'Annou ait de l'avance… 18 s / 30 s » (or « ta vidéo » on that device). */
export function readyingMessage({ member, lead, target, isYou }: SlowestLead): string {
  const whose = isYou ? "ta vidéo" : `la vidéo de ${member.name}`;
  return `On attend que ${whose} ait un peu d'avance… ${Math.floor(lead)} s / ${Math.round(target)} s`;
}
