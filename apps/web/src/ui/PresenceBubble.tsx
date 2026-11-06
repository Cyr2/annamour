import type { BubbleColor } from "@annamour/protocol";
import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { spring } from "../lib/motion.ts";
import { bubbleColor } from "./colors.ts";
import { cx } from "./cx.ts";

/*
 * A person in the room: a glass bubble in their colour with their initial.
 * `waiting` breathes slowly (they're loading); a new `pulse` value sends one
 * ripple out (they just did something: play, pause, seek).
 *
 *   <PresenceBubble name="Anna" color="peach" status="waiting" pulse={n}>
 *     <PresenceBubble.Caption>Anna</PresenceBubble.Caption>
 *   </PresenceBubble>
 */

export type PresenceStatus = "here" | "waiting";

interface PresenceBubbleProps {
  name: string;
  color: BubbleColor;
  status?: PresenceStatus;
  /** Change this number to ripple once. 0 means no ripple yet. */
  pulse?: number;
  size?: "md" | "lg";
  className?: string;
  children?: ReactNode;
}

const STATUS_LABEL: Record<PresenceStatus, string> = {
  here: "en phase",
  waiting: "en chargement",
};

function initialOf(name: string): string {
  const first = name.trim().at(0);
  return first ? first.toLocaleUpperCase("fr") : "?";
}

function PresenceBubbleRoot({
  name,
  color,
  status = "here",
  pulse = 0,
  size = "md",
  className,
  children,
}: PresenceBubbleProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const waiting = status === "waiting";
  const style = { "--bubble": bubbleColor(color) } as CSSProperties;

  return (
    <div className={cx("flex flex-col items-center gap-2", className)} style={style}>
      <motion.div
        role="img"
        aria-label={`${name}, ${STATUS_LABEL[status]}`}
        className={cx(
          "relative grid place-items-center rounded-full shadow-bubble",
          size === "lg" ? "size-20 text-[2rem]" : "size-14 text-[1.5rem]",
        )}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={
          waiting && !reduceMotion
            ? { scale: [1, 1.06, 1], opacity: 1 }
            : { scale: 1, opacity: 1 }
        }
        transition={
          waiting && !reduceMotion
            ? { scale: { duration: 2.6, ease: "easeInOut", repeat: Infinity }, opacity: spring.bubble }
            : spring.bubble
        }
      >
        {/* Glass body: the colour, lit from the top left like a drop. */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(120% 120% at 30% 22%, color-mix(in oklab, var(--bubble) 70%, white) 0%, var(--bubble) 46%, color-mix(in oklab, var(--bubble) 90%, var(--am-night)) 100%)",
            boxShadow:
              "inset 0 1px 1px rgb(255 255 255 / 0.55), inset 0 -5px 12px color-mix(in oklab, var(--bubble) 80%, var(--am-night))",
          }}
        />
        {/* A soft halo that only shows while waiting. */}
        <motion.span
          aria-hidden
          className="absolute -inset-1.5 rounded-full border-2"
          style={{ borderColor: "color-mix(in oklab, var(--bubble) 55%, transparent)" }}
          initial={false}
          animate={{ opacity: waiting ? 1 : 0, scale: waiting ? 1 : 0.92 }}
          transition={spring.ui}
        />
        {pulse > 0 ? (
          <motion.span
            key={pulse}
            aria-hidden
            className="absolute inset-0 rounded-full border-2"
            style={{ borderColor: "var(--bubble)" }}
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ scale: reduceMotion ? 1 : 1.75, opacity: 0 }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          />
        ) : null}
        <span className="relative font-rounded-tight font-extrabold text-on-accent select-none">
          {initialOf(name)}
        </span>
      </motion.div>
      {children}
    </div>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <span className="text-sm font-semibold text-fg">{children}</span>;
}

function Status({ children }: { children: ReactNode }) {
  return <span className="-mt-1.5 text-xs text-fg-muted">{children}</span>;
}

export const PresenceBubble = Object.assign(PresenceBubbleRoot, { Caption, Status });
