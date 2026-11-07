import { AnimatePresence, m } from "motion/react";
import { createPortal } from "react-dom";

/** 3, 2, 1, each number swelling in and dissolving, over the whole screen. */
export function Countdown({ value }: { value: number | null }) {
  return createPortal(
    <div
      aria-live="assertive"
      className="pointer-events-none fixed inset-0 z-[var(--am-z-overlay)] grid place-items-center"
    >
      <AnimatePresence>
        {value !== null && value > 0 ? (
          <m.span
            key={value}
            className="col-start-1 row-start-1 font-rounded-tight text-[clamp(120px,20vw,200px)] leading-none font-black text-fg [text-shadow:0_0_60px_var(--am-thread-glow)]"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1, transition: { type: "spring", stiffness: 300, damping: 16 } }}
            exit={{ opacity: 0, scale: 1.25, transition: { duration: 0.4, ease: "easeIn" } }}
          >
            {value}
          </m.span>
        ) : null}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
