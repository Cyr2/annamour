import type { Member } from "@annamour/protocol";
import { Play } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { joinNames } from "../../lib/format.ts";
import { spring } from "../../lib/motion.ts";
import { Button, Glass } from "../../ui/controls.tsx";
import { PresenceBubble } from "../../ui/PresenceBubble.tsx";

/** The big round play button while the film is paused. */
export function CenterPlay({ visible, onPlay }: { visible: boolean; onPlay: () => void }) {
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1, transition: spring.ui }}
          exit={{ opacity: 0, scale: 0.7, transition: { duration: 0.16 } }}
        >
          <Button
            variant="glass"
            size="large"
            icon={<Play />}
            aria-label="Reprendre la lecture"
            onClick={onPlay}
            className="size-[88px] rounded-full"
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** « On attend Anna, sa vidéo charge… » while someone else is buffering. */
export function WaitBanner({ members }: { members: Member[] }) {
  const first = members[0];
  return (
    <AnimatePresence>
      {first ? (
        <motion.div
          role="status"
          className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1, transition: spring.ui }}
          exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.16 } }}
        >
          <Glass className="flex items-center gap-3 rounded-pill py-3 pr-5 pl-3 font-semibold text-fg shadow-float">
            <PresenceBubble name={first.name} color={first.color} size="sm" status="waiting" />
            On attend {joinNames(members.map((m) => m.name))}, la vidéo charge…
          </Glass>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** The browser refused to start the sound without a tap: one tap joins the film. */
export function BlockedNotice({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-scrim">
      <div className="grid justify-items-center gap-4 text-center">
        <p className="max-w-[32ch] text-md text-fg">Le film a commencé. Touche pour le rejoindre avec le son.</p>
        <Button variant="filled" size="large" icon={<Play />} onClick={onUnlock}>
          Rejoindre le film
        </Button>
      </div>
    </div>
  );
}
