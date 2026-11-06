import { AnimatePresence, motion } from "motion/react";
import { exit, spring } from "../lib/motion.ts";
import { bubbleColor } from "./colors.ts";
import { Glass } from "./controls.tsx";
import { cx } from "./cx.ts";
import { type Toast, useToasts } from "./toast.ts";

/** A glass pill that springs down from the top of the screen. */
function Capsule({ toast }: { toast: Toast }) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -28, scale: 0.86 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: spring.capsule }}
      exit={{ opacity: 0, y: -10, scale: 0.94, transition: exit.quick }}
      transition={spring.ui}
    >
      <Glass className="flex min-h-11 items-center gap-2.5 rounded-pill py-2 pr-5 pl-3.5 text-sm font-semibold text-fg shadow-float">
        {toast.color ? (
          <span
            aria-hidden
            className={cx(
              "grid shrink-0 place-items-center rounded-full font-rounded-tight text-[0.6875rem] font-black text-on-accent",
              toast.name ? "-ml-1 size-6" : "size-2.5",
            )}
            style={{ backgroundColor: bubbleColor(toast.color) }}
          >
            {toast.name?.trim().at(0)?.toLocaleUpperCase("fr")}
          </span>
        ) : null}
        {toast.icon ? <span className="grid shrink-0 text-accent [&>svg]:size-[18px]">{toast.icon}</span> : null}
        <span>{toast.message}</span>
      </Glass>
    </motion.li>
  );
}

/** Mount once near the root. */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <ol
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[var(--am-z-toast)] flex flex-col items-center gap-2 px-4 pt-[max(12px,var(--am-safe-top))]"
    >
      <AnimatePresence initial={false} mode="popLayout">
        {toasts.map((t) => (
          <Capsule key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </ol>
  );
}
