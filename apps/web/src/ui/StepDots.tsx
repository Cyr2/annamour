import { motion } from "motion/react";
import { spring } from "../lib/motion.ts";

/** Where we are in a short sequence: the current step stretches into a peach pill. */
export function StepDots({ count, current }: { count: number; current: number }) {
  return (
    <div className="flex gap-1.5" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <motion.i
          // biome-ignore lint/suspicious/noArrayIndexKey: the dots are positions in a fixed sequence, nothing else identifies them.
          key={i}
          className="block h-[7px] rounded-full"
          initial={false}
          animate={{
            width: i === current ? 22 : 7,
            backgroundColor: i === current ? "var(--am-thread)" : "var(--am-fill-strong)",
          }}
          transition={spring.ui}
        />
      ))}
    </div>
  );
}
