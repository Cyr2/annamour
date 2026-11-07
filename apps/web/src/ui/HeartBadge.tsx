import { Heart } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { cx } from "./cx.ts";

/** A small peach heart that beats gently, pinned to a bubble's corner. Purely decorative. */
export function HeartBadge({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion() ?? false;
  return (
    <m.span
      aria-hidden
      className={cx(
        "absolute -top-1 -right-1 grid size-[22px] place-items-center rounded-full bg-canvas text-thread",
        className,
      )}
      animate={reduceMotion ? undefined : { scale: [1, 1.18, 1, 1.1, 1] }}
      transition={{ duration: 1.4, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.8 }}
    >
      <Heart className="size-3.5 fill-current" strokeWidth={0} />
    </m.span>
  );
}
