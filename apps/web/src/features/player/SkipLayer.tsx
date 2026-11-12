import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { exit, spring } from "../../lib/motion.ts";
import { useRoom } from "../../sync/room.ts";
import type { SyncClient } from "../../sync/SyncClient.ts";
import { primaryIn } from "../tv/focus-engine.ts";
import { useTv } from "../tv/tv-context.ts";
import { AddNextCard } from "./AddNextCard.tsx";
import { useEpisodeOver } from "./EpisodeLayer.tsx";
import { CreditsCountdown, NextPill, SkipIntroPill } from "./SkipOffers.tsx";
import { SKIP_OFFER_ATTRIBUTE, type SkipOffer, skipOfferOf } from "./skip-rules.ts";
import { useSkipPhase } from "./useSkipPhase.ts";

interface SkipLayerProps {
  /** The film is on screen (not the salon). */
  active: boolean;
  video: HTMLVideoElement | null;
  client: SyncClient | null;
}

/**
 * Over the film, bottom right, above the controls and seen even when they are
 * hidden: « Passer l'intro », then at the end credits « Épisode suivant dans
 * 10 s », « Épisode suivant », or « Ajouter et lancer » the next episode of a
 * series. Every choice is for everyone, but dismissing the last one.
 */
export function SkipLayer({ active, video, client }: SkipLayerProps) {
  const room = useRoom((s) => s.room);
  const phase = useSkipPhase(video, client);
  // The end screen takes over once the video is over.
  const over = useEpisodeOver();
  const shown = active && !over;
  // The episode whose « Ajouter et lancer » was dismissed on this screen.
  const [dismissed, setDismissed] = useState<number | null>(null);
  const offer = room && shown ? skipOfferOf(room, phase, dismissed === room.current) : null;
  const holder = useTvFocusOn(offer?.kind);
  if (!room) return null;

  const from = room.current;
  const start = () => client?.send({ type: "playEpisode", from, to: from + 1 });
  return (
    <AnimatePresence>
      {offer ? (
        <m.div
          key={offer.kind}
          ref={holder}
          {...{ [SKIP_OFFER_ATTRIBUTE]: true }}
          className="safe-area pointer-events-auto absolute right-0 bottom-24 z-20 sm:bottom-28"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0, transition: spring.ui }}
          exit={{ opacity: 0, transition: exit.quick }}
        >
          <OfferView
            offer={offer}
            client={client}
            onSkipIntro={(to) => client?.send({ type: "seek", position: to })}
            onStart={start}
            onWatchCredits={() => client?.send({ type: "declineNext" })}
            onDismiss={() => setDismissed(from)}
          />
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}

interface OfferViewProps {
  offer: Exclude<SkipOffer, null>;
  client: SyncClient | null;
  onSkipIntro: (to: number) => void;
  onStart: () => void;
  onWatchCredits: () => void;
  onDismiss: () => void;
}

function OfferView({ offer, client, onSkipIntro, onStart, onWatchCredits, onDismiss }: OfferViewProps) {
  const room = useRoom((s) => s.room);
  switch (offer.kind) {
    case "intro":
      return <SkipIntroPill onSkip={() => onSkipIntro(offer.introEnd)} />;
    case "countdown":
      return (
        <CreditsCountdown
          next={offer.next}
          until={offer.until}
          client={client}
          onStart={onStart}
          onWatchCredits={onWatchCredits}
        />
      );
    case "next":
      return <NextPill next={offer.next} onStart={onStart} />;
    case "add-next":
      return room ? <AddNextCard room={room} client={client} onDismiss={onDismiss} /> : null;
  }
}

/** On a TV, the remote lands on an offer as it shows: its main action, ready for OK. */
function useTvFocusOn(kind: string | undefined) {
  const tv = useTv();
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tv && kind && holder.current) primaryIn(holder.current)?.focus();
  }, [tv, kind]);
  return holder;
}
