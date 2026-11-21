import { type BubbleColor, type Member, NOTE_LIFETIME_MS } from "@annamour/protocol";
import { create } from "zustand";

/* « Un petit mot »: the notes sent during a pause, shown to everyone until the film starts again. */

export interface ShownNote {
  id: number;
  text: string;
  name: string;
  color: BubbleColor;
  mine: boolean;
}

/** A pause full of notes still keeps the film in sight. */
const MAX_ON_SCREEN = 4;

export const useNotes = create<{ notes: ShownNote[] }>()(() => ({ notes: [] }));

let nextId = 1;

/** Shows a note received from the room. Unknown senders (just left) still get a name. */
export function showNote(message: { by: string; text: string }, you: string | null, members: Member[]): ShownNote {
  const sender = members.find((m) => m.id === message.by);
  const note: ShownNote = {
    id: nextId++,
    text: message.text,
    name: sender?.name ?? "Quelqu'un",
    color: sender?.color ?? "lilac",
    mine: message.by === you,
  };
  useNotes.setState((s) => ({ notes: [...s.notes, note].slice(-MAX_ON_SCREEN) }));
  setTimeout(() => useNotes.setState((s) => ({ notes: s.notes.filter((n) => n.id !== note.id) })), NOTE_LIFETIME_MS);
  return note;
}

export function clearNotes(): void {
  useNotes.setState({ notes: [] });
}
