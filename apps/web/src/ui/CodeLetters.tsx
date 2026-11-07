import { m } from "motion/react";
import { spring } from "../lib/motion.ts";
import { cx } from "./cx.ts";

const SIZES = {
  /** The salon's room code and the TV's pairing code: shown big, to be read from afar. */
  large: {
    row: "gap-2.5",
    tile: "h-[clamp(4rem,8.6vw,5.5rem)] w-[clamp(3.25rem,7vw,4.5rem)] text-[clamp(2rem,4.6vw,3rem)]",
  },
  /** Six tiles in a phone's card (the TV code to confirm). */
  compact: { row: "gap-1.5", tile: "h-14 w-10 text-[1.75rem]" },
} as const;

/**
 * A code, one tile per character, landing one after the other: a room code
 * (« YWEK »), or a TV's pairing code, whose dash (« K7P-2QX ») is a short
 * gap between two groups rather than a tile.
 */
export function CodeLetters({ code, size = "large" }: { code: string; size?: keyof typeof SIZES }) {
  const characters = [...code];
  const { row, tile } = SIZES[size];
  return (
    <div
      className={cx("flex items-center", row)}
      role="img"
      aria-label={`Code ${characters.filter((c) => c !== "-").join(" ")}`}
    >
      {characters.map((letter, i) =>
        letter === "-" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: a code can repeat a letter; the position is the identity.
          <span key={`${i}-gap`} aria-hidden className="h-1 w-3 shrink-0 rounded-full bg-fg-subtle" />
        ) : (
          <m.span
            // biome-ignore lint/suspicious/noArrayIndexKey: a code can repeat a letter; the position is the identity.
            key={`${i}-${letter}`}
            aria-hidden
            className={cx(
              "grid shrink-0 place-items-center rounded-control bg-fill-soft font-rounded-tight font-black text-fg shadow-[inset_0_0_0_1px_var(--am-line-strong)]",
              tile,
            )}
            initial={{ opacity: 0, y: 14, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ...spring.bubble, delay: i * 0.06 }}
          >
            {letter}
          </m.span>
        ),
      )}
    </div>
  );
}
