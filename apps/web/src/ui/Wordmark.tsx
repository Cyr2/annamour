import { cx } from "./cx.ts";
import { LOGO, LOGO_WORD, SYMBOL } from "./logo.ts";

type Drawing = typeof LOGO | typeof SYMBOL;

/** The thread and its two dots, coloured by the tokens. */
function Thread({ drawing }: { drawing: Drawing }) {
  return (
    <>
      <path
        d={drawing.thread}
        fill="none"
        strokeWidth={drawing.threadWidth}
        strokeLinecap="round"
        className="stroke-thread"
      />
      <circle {...drawing.you} className="fill-thread" />
      <circle {...drawing.other} className="fill-thread-light" />
    </>
  );
}

interface MarkProps {
  className?: string;
  /** Accessible name; omit when the mark sits next to the written name. */
  title?: string;
}

/** The symbol alone: two dots joined by the red thread, smiling. */
export function Mark({ className, title }: MarkProps) {
  return (
    <svg
      viewBox={SYMBOL.viewBox}
      className={cx("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <Thread drawing={SYMBOL} />
    </svg>
  );
}

interface WordmarkProps {
  size?: "sm" | "lg";
  className?: string;
}

/** The logo « le sourire »: « Annamour » with the thread smiling under it, from one dot to the other. */
export function Wordmark({ size = "sm", className }: WordmarkProps) {
  return (
    <svg
      viewBox={LOGO.viewBox}
      role="img"
      aria-label="Annamour"
      className={cx("w-auto shrink-0", size === "lg" ? "h-12" : "h-8", className)}
    >
      <Thread drawing={LOGO} />
      <path d={LOGO_WORD} className="fill-fg" />
    </svg>
  );
}
