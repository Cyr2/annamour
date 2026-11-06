import type { Reaction } from "@annamour/protocol";
import { Maximize, Pause, Play, RotateCcw, RotateCw, Subtitles } from "lucide-react";
import { formatClock } from "../../lib/format.ts";
import { Glass } from "../../ui/controls.tsx";
import { IconButton } from "../../ui/IconButton.tsx";
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

/** The glass capsule: timeline, then play, ±10 s, volume, time — and reactions, tracks, full screen. */
export function ControlsBar(props: ControlsBarProps) {
  const { playing, onToggle, onSeek } = props;
  // Only this capsule follows the video frame by frame; the rest of the player does not re-render.
  const clock = useVideoClock(props.video);
  const skip = (delta: number) =>
    onSeek(Math.min(clock.duration || Number.POSITIVE_INFINITY, Math.max(0, clock.current + delta)));

  return (
    <Glass className="grid gap-2 rounded-[26px] px-4 pt-3 pb-3.5">
      <Scrubber clock={clock} onSeek={onSeek} />
      <div className="flex items-center gap-1.5">
        <IconButton label={playing ? "Pause" : "Lecture"} icon={playing ? <Pause /> : <Play />} onClick={onToggle} />
        <IconButton label="Reculer de 10 secondes" icon={<RotateCcw />} onClick={() => skip(-SEEK_STEP)} />
        <IconButton label="Avancer de 10 secondes" icon={<RotateCw />} onClick={() => skip(SEEK_STEP)} />
        <VolumeControl />
        <span className="ml-1.5 text-sm text-fg-muted tabular-nums">
          {formatClock(clock.current)} / {formatClock(clock.duration)}
        </span>
        <span className="flex-1" />
        <ReactionPicker open={props.reactionsOpen} onOpenChange={props.onReactionsOpenChange} onReact={props.onReact} />
        <IconButton label="Audio et sous-titres" icon={<Subtitles />} onClick={props.onOpenTracks} />
        <IconButton label="Plein écran" icon={<Maximize />} onClick={props.onFullscreen} />
      </div>
    </Glass>
  );
}
