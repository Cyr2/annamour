import type { Member } from "@annamour/protocol";
import { CircleAlert, Play } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { joinNames } from "../../lib/format.ts";
import { exit, spring } from "../../lib/motion.ts";
import { Button } from "../../ui/controls.tsx";
import { PresenceBubble } from "../../ui/PresenceBubble.tsx";
import { Progress } from "../../ui/Progress.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { ThreadSpinner } from "../../ui/ThreadSpinner.tsx";
import { readyingMessage, type SlowestLead } from "./readying-rules.ts";

/** Centred over the film, above the controls' layer. */
const CENTRED = "absolute top-1/2 left-1/2 z-10 -translate-1/2";

/** The big round play button while the film is paused: it swells in, and sinks under the finger. */
export function CenterPlay({ visible, onPlay }: { visible: boolean; onPlay: () => void }) {
  return (
    <AnimatePresence>
      {visible ? (
        <m.div
          className={CENTRED}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1, transition: spring.bubble }}
          exit={{ opacity: 0, scale: 0.8, transition: exit.quick }}
        >
          <Button variant="glass" size="hero" icon={<Play />} aria-label="Reprendre la lecture" onClick={onPlay} />
        </m.div>
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
        <m.div
          role="status"
          className={`${CENTRED} w-max max-w-[calc(100vw-32px)]`}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1, transition: spring.ui }}
          exit={{ opacity: 0, scale: 0.95, transition: exit.quick }}
        >
          <Surface className="flex items-center gap-3 rounded-pill py-2.5 pr-5 pl-2.5 font-semibold text-fg shadow-float">
            <PresenceBubble name={first.name} color={first.color} size="sm" status="waiting" />
            <span className="text-pretty">On attend {joinNames(members.map((m) => m.name))}, la vidéo charge…</span>
          </Surface>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * « On attend que la vidéo d'Annou ait un peu d'avance… 18 s / 30 s » while
 * the room waits to start together. Shown after a moment only: on a fast link
 * the wait is over before anyone could read it.
 */
export function ReadyBanner({ slowest }: { slowest: SlowestLead | null }) {
  return (
    <AnimatePresence>
      {slowest ? (
        <m.div
          role="status"
          className={`${CENTRED} w-max max-w-[calc(100vw-32px)]`}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1, transition: { ...spring.ui, delay: 1 } }}
          exit={{ opacity: 0, scale: 0.95, transition: exit.quick }}
        >
          <Surface className="grid gap-2 rounded-panel px-5 py-3 font-semibold text-fg shadow-float">
            <span className="flex items-center gap-3">
              <PresenceBubble name={slowest.member.name} color={slowest.member.color} size="sm" status="waiting" />
              <span className="text-pretty">{readyingMessage(slowest)}</span>
            </span>
            <Progress.Bar value={slowest.lead / slowest.target} label="Avance téléchargée" />
          </Surface>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}

/** The browser refused to start the sound without a tap: one tap joins the film. */
export function BlockedNotice({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-scrim p-4">
      <Surface className="surface-panel grid max-w-sm justify-items-center gap-5 p-6 text-center">
        <p className="text-md text-pretty text-fg">Le film a commencé. Touche pour le rejoindre avec le son.</p>
        <Button variant="filled" size="large" icon={<Play />} onClick={onUnlock}>
          Rejoindre le film
        </Button>
      </Surface>
    </div>
  );
}

/** The film could not load: said on glass near the top, readable over any frame. */
export function PlayerError({ message }: { message: string }) {
  return (
    <div className="absolute inset-x-4 top-24 z-20 grid justify-items-center">
      <Surface
        role="alert"
        className="flex max-w-md items-center gap-2.5 rounded-pill py-2.5 pr-5 pl-3.5 text-sm font-semibold text-fg shadow-float"
      >
        <CircleAlert aria-hidden className="size-5 shrink-0 text-danger" />
        {message}
      </Surface>
    </div>
  );
}

/** This device is still fetching the film: said over the black frame, so it never looks like nothing is happening. */
export function VideoLoading({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible ? (
        <m.div
          role="status"
          className={`${CENTRED} pointer-events-none flex items-center gap-3 text-sm font-semibold text-fg-muted`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.6 } }}
          exit={{ opacity: 0, transition: exit.quick }}
        >
          <ThreadSpinner />
          Chargement de la vidéo…
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
