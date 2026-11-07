import { ROOM_CODE_ALPHABET } from "@annamour/protocol";
import { Delete } from "lucide-react";

const LETTERS = [...ROOM_CODE_ALPHABET];
/** A key lights up milk under the focus, readable from the sofa. */
const KEY =
  "h-14 rounded-control bg-fill-soft text-fg shadow-[inset_0_0_0_1px_var(--am-line)] focus:bg-fg focus:text-canvas";

interface LetterKeyboardProps {
  onLetter: (letter: string) => void;
  onErase: () => void;
}

/**
 * The TV's keyboard for a room code: the 23 letters codes are made of (no I,
 * L or O) and Effacer, in rows of nine, walked with the arrows, OK to type.
 */
export function LetterKeyboard({ onLetter, onErase }: LetterKeyboardProps) {
  return (
    <fieldset className="grid grid-cols-[repeat(9,3.5rem)] gap-2.5">
      <legend className="sr-only">Clavier</legend>
      {LETTERS.map((letter, index) => (
        <button
          key={letter}
          type="button"
          // The keyboard is where the join screen starts on a TV.
          data-tv-primary={index === 0 ? "" : undefined}
          className={`${KEY} grid place-items-center font-rounded-tight text-lg font-extrabold`}
          onClick={() => onLetter(letter)}
        >
          {letter}
        </button>
      ))}
      <button
        type="button"
        className={`${KEY} col-span-3 flex items-center justify-center gap-2 text-sm font-semibold [&>svg]:size-5`}
        onClick={onErase}
      >
        <Delete aria-hidden />
        Effacer
      </button>
    </fieldset>
  );
}
