import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { exit, spring } from "../../lib/motion.ts";
import { useNotes } from "../../sync/notes.ts";
import { bubbleColor } from "../../ui/colors.ts";
import { Surface } from "../../ui/Surface.tsx";

/** The pause's notes, stacked under the top bar for everyone, newest at the bottom; they leave when the film starts. */
export function FloatingNotes() {
  const notes = useNotes((s) => s.notes);
  const reduce = useReducedMotion() ?? false;

  return (
    <ul
      aria-live="polite"
      aria-label="Petits mots"
      className="pointer-events-none absolute inset-x-4 top-24 z-20 flex flex-col items-center gap-2"
    >
      <AnimatePresence initial={false}>
        {notes.map((note) => (
          <m.li
            key={note.id}
            layout={!reduce}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: reduce ? exit.fade : spring.bubble }}
            exit={{ opacity: 0, transition: exit.quick }}
          >
            <Surface className="flex max-w-[34rem] items-center gap-2 rounded-panel py-1.5 pr-3.5 pl-1.5 shadow-float">
              <span
                className="shrink-0 rounded-pill px-2.5 py-0.5 text-xs font-bold text-on-accent shadow-bubble"
                style={{ backgroundColor: bubbleColor(note.color) }}
              >
                {note.mine ? "Toi" : note.name}
              </span>
              <span className="min-w-0 text-sm font-semibold break-words text-fg">{note.text}</span>
            </Surface>
          </m.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
