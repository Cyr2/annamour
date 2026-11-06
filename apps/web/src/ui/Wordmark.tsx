import { cx } from "./cx.ts";

/** The logo geometry (512 grid), shared with public/icon.svg. */
const THREAD_HEART =
  "M150 218C150 320 217 390 256 360C282 340 316 318 316 288C316 256 276 248 256 278C236 248 196 256 196 288C196 318 230 340 256 360C295 390 362 320 362 218";

interface MarkProps {
  className?: string;
  /** Accessible name; omit when the mark sits next to the written name. */
  title?: string;
}

/** Two screens joined by a red thread that ties itself into a heart. */
export function Mark({ className, title }: MarkProps) {
  return (
    <svg
      viewBox="40 110 432 300"
      className={cx("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <rect x="62" y="128" width="124" height="90" rx="22" strokeWidth="18" className="fill-surface stroke-fg" />
        <rect x="326" y="128" width="124" height="90" rx="22" strokeWidth="18" className="fill-surface stroke-fg" />
        <path d={THREAD_HEART} strokeWidth="24" className="stroke-thread" />
      </g>
    </svg>
  );
}

interface WordmarkProps {
  size?: "sm" | "lg";
  className?: string;
}

/** "Annamour" set in the rounded face, with the mark leading. */
export function Wordmark({ size = "sm", className }: WordmarkProps) {
  const large = size === "lg";
  return (
    <span
      className={cx(
        "inline-flex items-center font-rounded-tight font-extrabold text-fg",
        large ? "gap-3 text-xl" : "gap-2 text-lg",
        className,
      )}
    >
      <Mark className={large ? "h-9 w-auto" : "h-6 w-auto"} />
      <span>Annamour</span>
    </span>
  );
}
