import type { Reaction } from "@annamour/protocol";
import { LogOut, Maximize, Pause, Play, RotateCcw, RotateCw, Subtitles } from "lucide-react";
import { Link } from "wouter";
import { formatClock } from "../../lib/format.ts";
import { IconButton } from "../../ui/IconButton.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { useTv } from "../tv/tv-context.ts";
import { ReactionPicker } from "./ReactionPicker.tsx";
import { Scrubber } from "./Scrubber.tsx";
import { SEEK_STEP } from "./seek.ts";
import { useVideoClock } from "./usePlayerEffects.ts";
import { VolumeControl } from "./VolumeControl.tsx";

interface ControlsBarProps {
  video: HTMLVideoElement | null;
  playing: boolean;
  onToggle: () => void;
  onSeek: (position: number) => void;
  reactionsOpen: boolean;
  onReactionsOpenChange: (open: boolean) => void;
  onReact: (emoji: Reaction) => void;
  onOpenTracks: () => void;
  onFullscreen: () => void;
}

/**
 * The glass capsule floating over the film: the timeline between its two
 * clocks, then play, ±10 s and volume on the left; reactions, tracks and full
 * screen on the right. On a phone the seven buttons share the width evenly.
 * On a TV (always full screen, volume on the remote) the last one is
 * « Quitter » instead, and play/pause is where the remote lands.
 */
export function ControlsBar(props: ControlsBarProps) {
  const { playing, onToggle, onSeek } = props;
  const tv = useTv();
  // Only this capsule follows the video frame by frame; the rest of the player does not re-render.
  const clock = useVideoClock(props.video);
  const skip = (delta: number) =>
    onSeek(Math.min(clock.duration || Number.POSITIVE_INFINITY, Math.max(0, clock.current + delta)));

  return (
    <Surface className="surface-panel mx-auto grid w-full max-w-[55rem] gap-0.5 px-2 pt-2.5 pb-1.5 sm:px-3">
      <div className="flex items-center gap-3 px-2 text-xs font-semibold text-fg-muted tabular-nums">
        <span>{formatClock(clock.current)}</span>
        <Scrubber clock={clock} onSeek={onSeek} className="flex-1" />
        <span>{formatClock(clock.duration)}</span>
      </div>
      <div className="flex items-center justify-between sm:justify-start sm:gap-1">
        <IconButton
          label={playing ? "Pause" : "Lecture"}
          icon={playing ? <Pause /> : <Play />}
          onClick={onToggle}
          data-tv-primary
          className="[&>svg]:size-6 [&>svg]:fill-current"
        />
        <IconButton label="Reculer de 10 secondes" icon={<RotateCcw />} onClick={() => skip(-SEEK_STEP)} />
        <IconButton label="Avancer de 10 secondes" icon={<RotateCw />} onClick={() => skip(SEEK_STEP)} />
        <VolumeControl />
        <span className="hidden flex-1 sm:block" />
        <ReactionPicker open={props.reactionsOpen} onOpenChange={props.onReactionsOpenChange} onReact={props.onReact} />
        <IconButton label="Audio et sous-titres" icon={<Subtitles />} onClick={props.onOpenTracks} />
        {tv ? (
          <Link
            href="/"
            aria-label="Quitter le film"
            title="Quitter le film"
            className="grid size-11 shrink-0 place-items-center rounded-full text-fg transition-colors hover:bg-fill-hover [&>svg]:size-5"
          >
            <LogOut aria-hidden />
          </Link>
        ) : (
          <IconButton label="Plein écran" icon={<Maximize />} onClick={props.onFullscreen} />
        )}
      </div>
    </Surface>
  );
}
