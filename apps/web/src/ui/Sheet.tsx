import { AnimatePresence, m, useDragControls } from "motion/react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { exit, spring } from "../lib/motion.ts";
import { cx } from "./cx.ts";
import { LayoutMotion } from "./LayoutMotion.tsx";
import { useVisibleArea } from "./useVisibleArea.ts";

/*
 * A bottom sheet: slides up over a scrim, closes on Escape, a tap outside or
 * pulled down by its top, and gives focus back to whatever opened it.
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
    // The full engine has the drag that pulls a sheet down: loaded with the first sheet, not at launch.
    <LayoutMotion>
      <AnimatePresence>
        {open ? (
          <SheetPanel onClose={onClose} title={title}>
            {children}
          </SheetPanel>
        ) : null}
      </AnimatePresence>
    </LayoutMotion>,
    document.body,
  );
}

/** Pulled down this far (px), or flicked this fast (px/s), a sheet closes. */
const DISMISS_DISTANCE = 120;
const DISMISS_SPEED = 600;

function SheetPanel({ onClose, title, children }: Omit<SheetProps, "open">) {
  const titleId = useId();
  const drag = useDragControls();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    // A field marked data-autofocus wins over choices above it (« Pour : … » before the search).
    const first = panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Said handled, so the TV remote's Retour closes the sheet only (see features/tv/TvRemote.tsx).
      event.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus({ preventScroll: true });
    };
  }, []);

  // With a keyboard up (iPhone, iPad), the sheet sits above it, like a native one, instead of behind it.
  const area = useVisibleArea(true);

  return (
    <div
      className="fixed inset-x-0 top-0 bottom-0 z-[var(--am-z-overlay)]"
      style={area ? { top: area.top, height: area.height, bottom: "auto" } : undefined}
    >
      <m.div
        aria-hidden
        className="am-sheet-scrim absolute inset-0 bg-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: exit.quick }}
        onClick={onClose}
      />
      <m.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        // Centred by its margins, not translate: older Android browsers ignore the `translate` property,
        // which left the sheet half off the screen, its left part alone in view.
        className={cx(
          "absolute inset-x-0 bottom-0 mx-auto flex max-h-[92%] w-full max-w-[560px] flex-col gap-4 overflow-x-hidden overflow-y-auto overscroll-contain",
          "am-sheet rounded-t-sheet px-6 pt-2.5 pb-[max(28px,var(--am-safe-bottom))] outline-none sm:px-8",
        )}
        initial={{ y: "105%" }}
        animate={{ y: 0, transition: spring.ui }}
        exit={{ y: "105%", transition: exit.sheet }}
        // Pulled down by its handle or its title, like a native sheet: far or fast enough closes it,
        // otherwise it springs back. Its content keeps scrolling: only the top starts the drag.
        drag="y"
        dragListener={false}
        dragControls={drag}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={(_event, info) => {
          if (info.offset.y > DISMISS_DISTANCE || info.velocity.y > DISMISS_SPEED) onClose();
        }}
      >
        <div
          className="-mx-6 -mt-2.5 touch-none px-6 pt-2.5 sm:-mx-8 sm:px-8"
          onPointerDown={(event) => drag.start(event)}
        >
          <div aria-hidden className="mx-auto mb-4 h-[5px] w-9 shrink-0 rounded-full bg-fill-strong" />
          <h2 id={titleId} className="type-heading text-[1.625rem] leading-tight">
            {title}
          </h2>
        </div>
        {children}
      </m.div>
    </div>
  );
}

function Lede({ children }: { children: ReactNode }) {
  return <p className="-mt-2 text-sm text-pretty text-fg-muted">{children}</p>;
}

/**
 * The sheet's buttons, primary last in the markup: stacked full width on a
 * phone with the primary on top, under the thumb; packed to the right on wider screens.
 */
function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-2 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">{children}</div>;
}

export const Sheet = Object.assign(SheetRoot, { Lede, Actions });
