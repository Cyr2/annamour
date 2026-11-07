import type { ReactNode } from "react";
import { cx } from "./cx.ts";
import { Wordmark } from "./Wordmark.tsx";

interface BrandBarProps {
  /** Before the wordmark, e.g. a back button. */
  start?: ReactNode;
  /** On the right, e.g. « J'ai déjà une clé ». */
  end?: ReactNode;
}

/**
 * A screen's top bar led by the wordmark. Alone on a phone, the wordmark sits
 * in the middle, the way an app shows its name; with a button beside it, it
 * keeps its place on the left.
 */
export function BrandBar({ start, end }: BrandBarProps) {
  return (
    <header
      className={cx(
        "flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-2",
        !start && !end && "max-sm:justify-center",
      )}
    >
      <div className="flex items-center gap-3">
        {start}
        <Wordmark />
      </div>
      {end}
    </header>
  );
}
