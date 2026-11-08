import { m } from "motion/react";
import { spring } from "../lib/motion.ts";

/** The 4 words of a key, appearing one by one, numbered: the order matters to sign in. */
export function KeyWords({ words, label = "Ta clé de 4 mots" }: { words: readonly string[]; label?: string }) {
  return (
    <ol className="grid w-full grid-cols-2 gap-2.5" aria-label={label}>
      {words.map((word, index) => (
        <m.li
          key={word}
          className="surface-tile flex min-w-0 items-baseline gap-2.5 px-4 py-3.5 text-left"
          initial={{ opacity: 0, y: 14, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...spring.bubble, delay: 0.1 + index * 0.18 }}
        >
          {/* The order matters to log back in: the number says it without a word. */}
          <span aria-hidden className="text-xs font-bold text-accent tabular-nums">
            {index + 1}
          </span>
          <span className="truncate font-rounded-tight text-lg font-black text-fg select-all sm:text-xl">{word}</span>
        </m.li>
      ))}
    </ol>
  );
}
