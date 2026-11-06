import { motion, useReducedMotion } from "motion/react";
import { cx } from "./cx.ts";
import { BUBBLE_SIZE_CLASSES, type BubbleSize } from "./PresenceBubble.tsx";

/** The seat nobody has taken yet: a dashed ring with a question mark, breathing slowly. */
export function EmptyBubble({ size = "lg", label }: { size?: BubbleSize; label: string }) {
  const reduceMotion = useReducedMotion() ?? false;
  return (
    <motion.div
      role="img"
      aria-label={label}
      className={cx(
        "grid place-items-center rounded-full border-2 border-dashed border-line-strong font-rounded-tight font-extrabold text-fg-subtle select-none",
        BUBBLE_SIZE_CLASSES[size],
      )}
      animate={reduceMotion ? undefined : { scale: [1, 1.05, 1] }}
      transition={{ duration: 2.6, ease: "easeInOut", repeat: Infinity }}
    >
      ?
    </motion.div>
  );
}
