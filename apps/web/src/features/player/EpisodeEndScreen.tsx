import type { RoomSnapshot } from "@annamour/protocol";
import { m } from "motion/react";
import { useEffect, useRef } from "react";
import { spring } from "../../lib/motion.ts";
import type { SyncClient } from "../../sync/SyncClient.ts";
import { BubbleStack } from "../../ui/BubbleStack.tsx";
import { KeepSeanceLink } from "../account/KeepSeanceLink.tsx";
import { primaryIn } from "../tv/focus-engine.ts";
import { useTv } from "../tv/tv-context.ts";
import { LeaveAction, TogetherActions } from "./EndActions.tsx";
import { EpisodeCountdown } from "./EpisodeCountdown.tsx";
import { type EpisodeEnd, endTitle, episodeName, onSeries } from "./episode-rules.ts";
import { MarkSeriesWatched } from "./MarkSeriesWatched.tsx";
import { RateWhatEnded } from "./RateWhatEnded.tsx";

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
 * Once an episode ends, for everyone at once: the countdown to
 * the next one, the next one waiting (« Pas ce soir »), or nothing queued yet.
 * What one person picks for all is kept apart from leaving, which is only theirs.
 */
export function EpisodeEndScreen({ end, room, client, onWatchAgain, onAddNext }: EpisodeEndScreenProps) {
  const tv = useTv();
  const panel = useRef<HTMLDivElement>(null);
  const next = episodeName(room.episodes, room.current + 1, room.media.title);
  const series = onSeries(room);
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
      // Opaque: a see-through scrim let the video's frame show through as a darker band across the screen.
      className="safe-area absolute inset-0 z-30 flex flex-col items-center justify-center gap-8 overflow-y-auto bg-screen text-center"
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
        <EndHeading end={end} next={next} series={series} />
      )}
      <BubbleStack people={room.members} />
      <div className="flex w-[min(28rem,100%)] flex-col gap-4">
        <TogetherActions
          end={end}
          series={series}
          onStartNext={startNext}
          onDecline={() => client?.send({ type: "declineNext" })}
          onAddNext={onAddNext}
          onWatchAgain={onWatchAgain}
        />
        {end === "nothing-next" ? <MarkSeriesWatched room={room} /> : null}
        <RateWhatEnded room={room} end={end} />
        <LeaveAction othersStay={room.members.length > 1} />
      </div>
      <KeepSeanceLink code={room.code} />
    </m.div>
  );
}

interface EndHeadingProps {
  end: End;
  next: string;
  series: boolean;
}

function EndHeading({ end, next, series }: EndHeadingProps) {
  const tv = useTv();
  const addHint = tv
    ? "On enchaîne ? Ajoute la suite depuis ton téléphone : elle démarrera ici."
    : `On enchaîne ? Ajoute ${series ? "l'épisode d'après" : "un film"} : il démarre chez tout le monde.`;
  return (
    <div className="grid justify-items-center gap-3">
      <h2 id={TITLE_ID} className="type-title">
        {end === "next-ready" ? `À suivre : ${next}` : endTitle(series)}
      </h2>
      <p className="type-lede">{end === "next-ready" ? "Il démarre pour tout le monde quand vous voulez." : addHint}</p>
    </div>
  );
}
