import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useReactions } from "../../sync/reactions.ts";
import { bubbleColor } from "../../ui/colors.ts";

/** Reactions rise over the film for everyone: mine from the right, the others' from the left. */
export function FloatingReactions() {
  const reactions = useReactions((s) => s.reactions);
  const reduce = useReducedMotion() ?? false;

  return (
    <div aria-live="polite" className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <AnimatePresence>
        {reactions.map((r) => (
          <motion.div
            key={r.id}
            className="absolute bottom-[150px] grid justify-items-center gap-1.5"
            style={{ left: `${(r.mine ? 70 : 14) + r.spread * 12}%` }}
            initial={{ opacity: 0, y: 10, scale: 0.3 }}
            animate={
              reduce
                ? { opacity: 1, y: 0, scale: 1 }
                : {
                    // A pop past full size, then a slow, drifting rise that shrinks a little as it fades.
                    opacity: [0, 1, 1, 0],
                    y: [10, -40, -180, -280],
                    x: [0, r.drift * 12, r.drift * 28, r.drift * 35],
                    scale: [0.3, 1.15, 1, 0.9],
                  }
            }
            exit={{ opacity: 0 }}
            transition={{ duration: 2.8, ease: [0.2, 0.7, 0.3, 1], times: [0, 0.1, 0.65, 1] }}
          >
            <span
              role="img"
              aria-label={`${r.mine ? "Toi" : r.name} : ${r.emoji}`}
              className="text-[clamp(44px,6vw,64px)] leading-none drop-shadow-lg"
            >
              {r.emoji}
            </span>
            <span
              className="rounded-pill px-2.5 py-0.5 text-xs font-bold text-on-accent shadow-bubble"
              style={{ backgroundColor: bubbleColor(r.color) }}
            >
              {r.mine ? "Toi" : r.name}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
