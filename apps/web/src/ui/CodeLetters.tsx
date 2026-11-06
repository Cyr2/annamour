import { motion } from "motion/react";
import { spring } from "../lib/motion.ts";

/** A room code, one tile per letter, landing one after the other. */
export function CodeLetters({ code }: { code: string }) {
  return (
    <div className="flex gap-2.5" role="img" aria-label={`Code ${[...code].join(" ")}`}>
      {[...code].map((letter, i) => (
        <motion.span
          // biome-ignore lint/suspicious/noArrayIndexKey: a code can repeat a letter; the position is the identity.
          key={`${i}-${letter}`}
          aria-hidden
          className="grid h-[clamp(64px,8.6vw,88px)] w-[clamp(52px,7vw,72px)] place-items-center rounded-[18px] border border-line-strong bg-fill-soft font-rounded-tight text-[clamp(32px,4.6vw,48px)] font-black text-fg"
          initial={{ opacity: 0, y: 14, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...spring.bubble, delay: i * 0.06 }}
        >
          {letter}
        </motion.span>
      ))}
    </div>
  );
}
