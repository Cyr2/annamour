import type { SessionSummary } from "@annamour/protocol";
import type { ReactNode } from "react";
import { cx } from "../../ui/cx.ts";
import { progressFill } from "../../ui/progress-fill.ts";
import { isFinished, progressOf } from "./session-rules.ts";

/**
 * A séance as a portrait poster with how far it went along the bottom: the
 * catalog's poster when it was started from a title, a soft glow for a link.
 * Decorative: the title is said next to it.
 */
export function SeancePoster({
  session,
  className,
  children,
}: {
  session: SessionSummary;
  className?: string;
  /** Laid over the poster, e.g. a play button. */
  children?: ReactNode;
}) {
  const percent = Math.round((progressOf(session) ?? 0) * 100);
  return (
    <span
      aria-hidden
      className={cx("relative block aspect-[2/3] overflow-hidden rounded-control", className)}
      style={{ background: "var(--am-poster-glow), var(--am-poster)" }}
    >
      {session.posterUrl ? (
        <img
          src={session.posterUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
      {children}
      <span className="absolute inset-x-0 bottom-0 h-1 bg-fill-strong">
        <span className={cx("block h-full", progressFill(isFinished(session)))} style={{ width: `${percent}%` }} />
      </span>
    </span>
  );
}
