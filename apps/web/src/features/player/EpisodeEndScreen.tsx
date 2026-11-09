import type { RoomSnapshot } from "@annamour/protocol";
import { House, Plus, RotateCcw, SkipForward } from "lucide-react";
import { m } from "motion/react";
import { useEffect, useRef } from "react";
import { spring } from "../../lib/motion.ts";
import type { SyncClient } from "../../sync/SyncClient.ts";
import { BubbleStack } from "../../ui/BubbleStack.tsx";
import { Button } from "../../ui/controls.tsx";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { KeepSeanceLink } from "../account/KeepSeanceLink.tsx";
import { primaryIn } from "../tv/focus-engine.ts";
import { useTv } from "../tv/tv-context.ts";
import { EpisodeCountdown } from "./EpisodeCountdown.tsx";
import { type EpisodeEnd, endTitle, episodeName } from "./episode-rules.ts";

const TITLE_ID = "episode-end-title";

type End = Exclude<EpisodeEnd, null>;

interface EpisodeEndScreenProps {
  end: End;
  room: RoomSnapshot;
  client: SyncClient | null;
  onWatchAgain: () => void;
  onAddNext: () => void;
}

/**
 * Over the last image of an episode, for everyone at once: the countdown to
 * the next one, the next one waiting (« Pas ce soir »), or nothing queued yet.
 * Whatever one person picks here, everyone follows.
 */
export function EpisodeEndScreen({ end, room, client, onWatchAgain, onAddNext }: EpisodeEndScreenProps) {
  const tv = useTv();
  const panel = useRef<HTMLDivElement>(null);
  const next = episodeName(room.episodes, room.current + 1);
  const startNext = () => client?.send({ type: "playEpisode", from: room.current, to: room.current + 1 });

  // The remote lands on the main choice, again when the screen changes (the countdown declined, say).
  useEffect(() => {
    if (tv && panel.current && end) primaryIn(panel.current)?.focus();
  }, [tv, end]);

  return (
    <m.div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      className="safe-area absolute inset-0 z-30 flex flex-col items-center justify-center gap-8 bg-scrim text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: spring.ui }}
    >
      {end === "countdown" && room.countdownUntil !== null ? (
        <EpisodeCountdown
          until={room.countdownUntil}
          client={client}
          onDone={startNext}
          next={next}
          titleId={TITLE_ID}
        />
      ) : (
        <EndHeading end={end} next={next} episodeCount={room.episodes.length} />
      )}
      <BubbleStack people={room.members} />
      <div className="flex w-[min(28rem,100%)] flex-col gap-3">
        {end === "countdown" ? (
          <>
            <Button variant="filled" size="large" icon={<SkipForward />} onClick={startNext} data-tv-primary>
              Lancer maintenant
            </Button>
            <Button size="large" onClick={() => client?.send({ type: "declineNext" })}>
              Pas ce soir
            </Button>
          </>
        ) : (
          <AfterActions
            end={end}
            next={next}
            onStartNext={startNext}
            onAddNext={onAddNext}
            onWatchAgain={onWatchAgain}
          />
        )}
      </div>
      <KeepSeanceLink code={room.code} />
    </m.div>
  );
}

function EndHeading({ end, next, episodeCount }: { end: End; next: string; episodeCount: number }) {
  const tv = useTv();
  const addHint = tv
    ? "On enchaîne ? Ajoute la suite depuis ton téléphone : elle démarrera ici."
    : "On enchaîne ? Colle le lien de l'épisode d'après : il démarre chez tout le monde.";
  return (
    <div className="grid justify-items-center gap-3">
      <h2 id={TITLE_ID} className="type-title">
        {end === "next-ready" ? `À suivre : ${next}` : endTitle(episodeCount)}
      </h2>
      <p className="type-lede">{end === "next-ready" ? "Il démarre pour tout le monde quand vous voulez." : addHint}</p>
    </div>
  );
}

interface AfterActionsProps {
  end: End;
  next: string;
  onStartNext: () => void;
  onAddNext: () => void;
  onWatchAgain: () => void;
}

/** Once the countdown is over or was declined: the next episode if there is one, else adding it (not on a TV). */
function AfterActions({ end, next, onStartNext, onAddNext, onWatchAgain }: AfterActionsProps) {
  const tv = useTv();
  return (
    <>
      {end === "next-ready" ? (
        <Button variant="filled" size="large" icon={<SkipForward />} onClick={onStartNext} data-tv-primary>
          Lancer {next}
        </Button>
      ) : null}
      {end === "nothing-next" && !tv ? (
        <Button variant="filled" size="large" icon={<Plus />} onClick={onAddNext}>
          Ajouter l'épisode suivant
        </Button>
      ) : null}
      <div className="flex gap-3 [&>*]:flex-1">
        <Button
          size="large"
          icon={<RotateCcw />}
          onClick={onWatchAgain}
          data-tv-primary={end === "nothing-next" ? "" : undefined}
        >
          Revoir
        </Button>
        <LinkButton href="/" size="large" icon={<House />}>
          Finir la soirée
        </LinkButton>
      </div>
    </>
  );
}
