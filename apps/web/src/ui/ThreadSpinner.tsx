import { motion, useReducedMotion } from "motion/react";

/** A loop of red thread chasing itself: the app's loading indicator. */
export function ThreadSpinner({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion() ?? false;
  return (
    <svg viewBox="0 0 34 34" className={className ?? "size-[2.125rem] shrink-0"} aria-hidden="true">
      <motion.circle
        cx="17"
        cy="17"
        r="14"
        pathLength={100}
        fill="none"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray="30 70"
        className="stroke-thread"
        style={{ originX: "50%", originY: "50%" }}
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={{ duration: 1, ease: "linear", repeat: Infinity }}
      />
    </svg>
  );
}
