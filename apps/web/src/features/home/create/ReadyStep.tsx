import type { RoomSnapshot } from "@annamour/protocol";
import { Check } from "lucide-react";
import { m } from "motion/react";
import { useLocation } from "wouter";
import { formatDuration } from "../../../lib/format.ts";
import { spring } from "../../../lib/motion.ts";
import { Button } from "../../../ui/controls.tsx";
import { Sheet } from "../../../ui/Sheet.tsx";
import { TrackPickers } from "../../player/TrackPickers.tsx";
import { describeAudio } from "../../player/track-choice.ts";

function summary(room: RoomSnapshot): string {
  const { media } = room;
  const parts = [
    media.duration ? formatDuration(media.duration) : null,
    describeAudio(media),
    media.subtitles.length ? "sous-titres" : "sans sous-titres",
  ];
  return parts.filter(Boolean).join(" · ");
}

export function ReadyStep({ room }: { room: RoomSnapshot }) {
  const [, navigate] = useLocation();

  return (
    <>
      <Sheet.Lede>Choisis comment tu le regardes. Chacun pourra changer de son côté.</Sheet.Lede>
      <div className="surface-tile flex items-center gap-3.5 p-3.5">
        <div
          aria-hidden
          className="relative h-[72px] w-[54px] shrink-0 overflow-hidden rounded-[10px]"
          style={{ background: "var(--am-poster-glow), var(--am-poster)" }}
        />
        <div className="min-w-0">
          <h3 className="truncate font-sans text-md font-semibold text-fg">{room.media.title}</h3>
          <p className="mt-0.5 text-xs text-fg-muted">{summary(room)}</p>
        </div>
        <m.span
          className="ml-auto grid size-[26px] shrink-0 place-items-center rounded-full bg-success text-on-accent"
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={spring.bubble}
        >
          <Check className="size-[15px]" strokeWidth={3} aria-label="Vidéo trouvée" />
        </m.span>
      </div>
      <TrackPickers code={room.code} media={room.media} />
      <Sheet.Actions>
        <Button variant="filled" size="large" onClick={() => navigate(`/s/${room.code}`)}>
          Ouvrir la séance
        </Button>
      </Sheet.Actions>
    </>
  );
}
