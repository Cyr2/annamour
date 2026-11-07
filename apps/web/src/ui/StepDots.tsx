import { m } from "motion/react";
import { spring } from "../lib/motion.ts";

/** Where we are in a short sequence: the current step stretches into a peach pill. */
export function StepDots({ count, current }: { count: number; current: number }) {
  return (
    <div className="flex gap-1.5">
      <span className="sr-only">
        Étape {current + 1} sur {count}
      </span>
      {Array.from({ length: count }, (_, i) => (
        <m.i
          // biome-ignore lint/suspicious/noArrayIndexKey: the dots are positions in a fixed sequence, nothing else identifies them.
          key={i}
          aria-hidden
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
