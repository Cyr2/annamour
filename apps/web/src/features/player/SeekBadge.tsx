import { AnimatePresence, m } from "motion/react";
import { exit, spring } from "../../lib/motion.ts";
import { Surface } from "../../ui/Surface.tsx";
import { seekBadgeLabel } from "./tv-player-keys.ts";
import type { SeekFlash } from "./useTvPlayerRemote.ts";

/** « −10 s » on the left, « +10 s » on the right, for a moment: the remote's jump, without opening the bar. */
export function SeekBadge({ flash }: { flash: SeekFlash | null }) {
  return (
    <AnimatePresence>
      {flash ? (
        <m.div
          key={flash.id}
          aria-hidden
          className={`absolute top-1/2 z-20 -translate-y-1/2 ${flash.delta < 0 ? "left-[8vw]" : "right-[8vw]"}`}
          initial={{ opacity: 0, scale: 0.85, x: flash.delta < 0 ? 12 : -12 }}
          animate={{ opacity: 1, scale: 1, x: 0, transition: spring.snappy }}
          exit={{ opacity: 0, transition: exit.fade }}
        >
          <Surface className="rounded-pill px-6 py-3 font-rounded-tight text-xl font-black text-fg tabular-nums shadow-float">
            {seekBadgeLabel(flash.delta)}
          </Surface>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
