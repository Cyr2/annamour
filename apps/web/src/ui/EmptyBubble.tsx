import { cx } from "./cx.ts";
import { BUBBLE_SIZE_CLASSES, type BubbleSize } from "./PresenceBubble.tsx";

/** The seat nobody has taken yet: a dashed ring with a question mark, breathing slowly (still under reduced motion). */
export function EmptyBubble({ size = "lg", label }: { size?: BubbleSize; label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      data-thread-knot=""
      className={cx(
        "am-breathe-soft grid place-items-center rounded-full border-2 border-dashed border-line-strong font-rounded-tight font-extrabold text-fg-subtle select-none",
        BUBBLE_SIZE_CLASSES[size],
      )}
    >
      ?
    </div>
  );
}
