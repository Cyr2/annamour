import type { Reaction } from "@annamour/protocol";
import { Maximize, Pause, Play, RotateCcw, RotateCw, Subtitles } from "lucide-react";
import { formatClock } from "../../lib/format.ts";
import { IconButton } from "../../ui/IconButton.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { ReactionPicker } from "./ReactionPicker.tsx";
import { Scrubber } from "./Scrubber.tsx";
import { useVideoClock } from "./usePlayerEffects.ts";
import { VolumeControl } from "./VolumeControl.tsx";

export const SEEK_STEP = 10;

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
 */
export function ControlsBar(props: ControlsBarProps) {
  const { playing, onToggle, onSeek } = props;
  // Only this capsule follows the video frame by frame; the rest of the player does not re-render.
  const clock = useVideoClock(props.video);
  const skip = (delta: number) =>
    onSeek(Math.min(clock.duration || Number.POSITIVE_INFINITY, Math.max(0, clock.current + delta)));

  return (
    <Surface className="surface-panel mx-auto grid w-full max-w-[880px] gap-0.5 px-2 pt-2.5 pb-1.5 sm:px-3">
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
          className="[&>svg]:size-6 [&>svg]:fill-current"
        />
        <IconButton label="Reculer de 10 secondes" icon={<RotateCcw />} onClick={() => skip(-SEEK_STEP)} />
        <IconButton label="Avancer de 10 secondes" icon={<RotateCw />} onClick={() => skip(SEEK_STEP)} />
        <VolumeControl />
        <span className="hidden flex-1 sm:block" />
        <ReactionPicker open={props.reactionsOpen} onOpenChange={props.onReactionsOpenChange} onReact={props.onReact} />
        <IconButton label="Audio et sous-titres" icon={<Subtitles />} onClick={props.onOpenTracks} />
        <IconButton label="Plein écran" icon={<Maximize />} onClick={props.onFullscreen} />
      </div>
    </Surface>
  );
}
