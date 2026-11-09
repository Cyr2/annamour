import type { SessionSummary } from "@annamour/protocol";
import type { ReactNode } from "react";
import { cx } from "../../ui/cx.ts";
import { progressFill } from "../../ui/progress-fill.ts";
import { fanPosters, isFinished, progressOf } from "./session-rules.ts";

const POSTER_BACKGROUND = { background: "var(--am-poster-glow), var(--am-poster)" };

/** Behind the poster in front, at most two others: past that, the fan says « several » just as well. */
const FANNED = 2;
const FAN_TILT = ["rotate-6 translate-x-[8%]", "-rotate-6 -translate-x-[8%]"] as const;

/**
 * A séance as a portrait poster with how far it went along the bottom: the
 * catalog's poster when it was started from a title, a soft glow for a link.
 * A séance of several films fans their posters out, the one playing in front.
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
  const behind = fanPosters(session).slice(1, FANNED + 1);
  const percent = Math.round((progressOf(session) ?? 0) * 100);
  return (
    <span aria-hidden className={cx("relative block", className)}>
      {behind.map((url, place) => (
        <span
          key={url ?? place}
          className={cx(
            "absolute inset-0 overflow-hidden rounded-control opacity-70 ring-1 ring-surface",
            FAN_TILT[place],
          )}
          style={POSTER_BACKGROUND}
        >
          {url ? <PosterImage url={url} /> : null}
        </span>
      ))}
      <span className="relative block aspect-[2/3] overflow-hidden rounded-control" style={POSTER_BACKGROUND}>
        {session.posterUrl ? <PosterImage url={session.posterUrl} /> : null}
        {children}
        <span className="absolute inset-x-0 bottom-0 h-1 bg-fill-strong">
          <span className={cx("block h-full", progressFill(isFinished(session)))} style={{ width: `${percent}%` }} />
        </span>
      </span>
    </span>
  );
}

function PosterImage({ url }: { url: string }) {
  return <img src={url} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />;
}
