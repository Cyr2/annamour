import { Heart } from "lucide-react";
import { cx } from "./cx.ts";

/** A small peach heart that beats gently, pinned to a bubble's corner. Purely decorative. */
export function HeartBadge({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "am-heartbeat absolute -top-1 -right-1 grid size-[22px] place-items-center rounded-full bg-canvas text-thread",
        className,
      )}
    >
      <Heart className="size-3.5 fill-current" strokeWidth={0} />
    </span>
  );
}
