import { type BubbleColor, type Member, REACTION_COOLDOWN_MS, type Reaction } from "@annamour/protocol";
import { create } from "zustand";

/* Emoji reactions floating over the film, for everyone in the room. */

export interface FloatingReaction {
  id: number;
  emoji: Reaction;
  name: string;
  color: BubbleColor;
  /** Mine rise on the right, everyone else's on the left. */
  mine: boolean;
  /** 0..1: where in its lane it starts, and which way it drifts. */
  spread: number;
  drift: number;
}

interface ReactionStore {
  reactions: FloatingReaction[];
}

/** How long one reaction stays on screen (the float animation's length), ms. */
export const REACTION_LIFETIME_MS = 2900;
/** A burst of reactions never piles up more than this on screen. */
const MAX_ON_SCREEN = 16;

export const useReactions = create<ReactionStore>()(() => ({ reactions: [] }));

let nextId = 1;

/** Shows a reaction received from the room. Unknown senders (just left) still get a bubble. */
export function showReaction(
  message: { by: string; emoji: Reaction },
  you: string | null,
  members: Member[],
  random: () => number = Math.random,
): FloatingReaction {
  const sender = members.find((m) => m.id === message.by);
  const reaction: FloatingReaction = {
    id: nextId++,
    emoji: message.emoji,
    name: sender?.name ?? "Quelqu'un",
    color: sender?.color ?? "lilac",
    mine: message.by === you,
    spread: random(),
    drift: random() * 2 - 1,
  };
  useReactions.setState((s) => ({ reactions: [...s.reactions, reaction].slice(-MAX_ON_SCREEN) }));
  setTimeout(() => dismissReaction(reaction.id), REACTION_LIFETIME_MS);
  return reaction;
}

export function dismissReaction(id: number): void {
  useReactions.setState((s) => ({ reactions: s.reactions.filter((r) => r.id !== id) }));
}

export function clearReactions(): void {
  useReactions.setState({ reactions: [] });
}

/** Mirrors the server's per-person limit, so a double tap doesn't send a reaction it will drop. */
export function createReactionThrottle(now: () => number = () => performance.now()): () => boolean {
  let last = -Infinity;
  return () => {
    const t = now();
    if (t - last < REACTION_COOLDOWN_MS) return false;
    last = t;
    return true;
  };
}
