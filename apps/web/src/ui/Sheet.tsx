import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { exit, spring } from "../lib/motion.ts";
import { cx } from "./cx.ts";

/*
 * A bottom sheet: slides up over a scrim, closes on Escape or a tap outside,
 * and gives focus back to whatever opened it.
 *
 *   <Sheet open={open} onClose={close} title="Nouvelle séance">
 *     <Sheet.Lede>…</Sheet.Lede>
 *     …
 *     <Sheet.Actions>…</Sheet.Actions>
 *   </Sheet>
 */

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}

const FOCUSABLE = "input, button:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex='-1'])";

function SheetRoot({ open, onClose, title, children }: SheetProps) {
  return createPortal(
    <AnimatePresence>
      {open ? (
        <SheetPanel onClose={onClose} title={title}>
          {children}
        </SheetPanel>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function SheetPanel({ onClose, title, children }: Omit<SheetProps, "open">) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[var(--am-z-overlay)]">
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: exit.quick }}
        onClick={onClose}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          "absolute bottom-0 left-1/2 flex max-h-[92dvh] w-[min(560px,100%)] -translate-x-1/2 flex-col gap-4 overflow-y-auto overscroll-contain",
          "rounded-t-[30px] border border-b-0 border-line-strong bg-sheet px-[26px] pt-2.5 pb-[max(28px,var(--am-safe-bottom))] backdrop-blur-2xl outline-none",
        )}
        initial={{ y: "105%" }}
        animate={{ y: 0, transition: spring.ui }}
        exit={{ y: "105%", transition: { duration: 0.26, ease: [0.4, 0, 1, 1] } }}
      >
        <div aria-hidden className="mx-auto mb-1 h-[5px] w-[38px] shrink-0 rounded-full bg-fill-strong" />
        <h2 id={titleId} className="font-rounded-tight text-[1.625rem] leading-tight font-extrabold text-fg">
          {title}
        </h2>
        {children}
      </motion.div>
    </div>
  );
}

function Lede({ children }: { children: ReactNode }) {
  return <p className="-mt-3 text-sm text-fg-muted">{children}</p>;
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-1.5 flex flex-wrap justify-end gap-2.5">{children}</div>;
}

export const Sheet = Object.assign(SheetRoot, { Lede, Actions });
