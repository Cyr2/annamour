import type { Reaction } from "@annamour/protocol";
import { Ellipsis, ListVideo, Maximize, Pause, Play, RotateCcw, RotateCw, SkipForward, Subtitles } from "lucide-react";
import { formatClock } from "../../lib/format.ts";
import type { SyncMedia } from "../../sync/media.ts";
import { cx } from "../../ui/cx.ts";
import { IconButton } from "../../ui/IconButton.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { useTv } from "../tv/tv-context.ts";
import { EndClock } from "./EndClock.tsx";
import { useQueueTitle } from "./EpisodeLayer.tsx";
import { LiveRow } from "./LiveRow.tsx";
import { NoteComposer } from "./NoteComposer.tsx";
import { ReactionPicker } from "./ReactionPicker.tsx";
import { Scrubber } from "./Scrubber.tsx";
import { SEEK_STEP } from "./seek.ts";
import { useVideoClock } from "./usePlayerEffects.ts";
import { VolumeControl } from "./VolumeControl.tsx";

interface ControlsBarProps {
  video: SyncMedia | null;
  playing: boolean;
  onToggle: () => void;
  onSeek: (position: number) => void;
  reactionsOpen: boolean;
  onReactionsOpenChange: (open: boolean) => void;
  onReact: (emoji: Reaction) => void;
  /** « Un petit mot », offered during a pause, never on a TV (nothing to type with). */
  onNote: (text: string) => void;
  /** Absent when there is nothing to choose (a YouTube video). */
  onOpenTracks: (() => void) | undefined;
  /** Absent during a live stream: it is a séance of its own. */
  onOpenUpNext: (() => void) | undefined;
  /** A live stream: « En direct » and « Revenir au direct » instead of the timeline and ±10 s. */
  live: boolean;
  /** « ⋯ » on a phone held upright: tracks, episodes, sound and full screen. */
  onOpenMore: () => void;
  /** Skips to the next episode for everyone; absent on the last one. */
  onSkipNext: (() => void) | undefined;
  onFullscreen: () => void;
}

/**
 * The glass capsule floating over the film: the timeline between its two
 * clocks, then play, ±10 s and volume on the left; reactions, tracks and full
 * screen on the right, with « Épisode suivant » and « Épisodes » before it. On a
 * phone held upright, one row only: play, ±10 s, reactions and « ⋯ » for the rest.
 * During a pause, « Un petit mot » comes before the reactions.
 * On a TV (always full screen, volume on the remote) there is no full-screen
 * button, leaving the film is the top bar's back arrow (or Retour), and
 * play/pause is where the remote lands.
 */
export function ControlsBar(props: ControlsBarProps) {
  const { playing, onToggle, onSeek } = props;
  const tv = useTv();
  const queueTitle = useQueueTitle();
  // What a phone held upright folds behind « ⋯ »: one row of five buttons there.
  const folded = "max-sm:hidden";
  // Only this capsule follows the video frame by frame; the rest of the player does not re-render.
  const clock = useVideoClock(props.video);
  const skip = (delta: number) =>
    onSeek(Math.min(clock.duration || Number.POSITIVE_INFINITY, Math.max(0, clock.current + delta)));

  return (
    <Surface className="surface-panel mx-auto grid w-full max-w-[55rem] gap-0.5 px-2 pt-2.5 pb-1.5 sm:px-3">
      {props.live ? (
        // The live edge is where YouTube's player says the stream has got to.
        <LiveRow onBackToLive={() => clock.duration > 0 && onSeek(clock.duration)} />
      ) : (
        <div className="flex items-center gap-3 px-2 text-xs font-semibold text-fg-muted tabular-nums">
          <span>{formatClock(clock.current)}</span>
          <Scrubber clock={clock} onSeek={onSeek} className="flex-1" />
          <EndClock clock={clock} />
        </div>
      )}
      {/* A phone held upright keeps five buttons in one row (six during a pause); everything else waits behind « ⋯ ». */}
      <div className="grid auto-cols-fr grid-flow-col justify-items-center sm:flex sm:items-center sm:justify-start sm:gap-1">
        <IconButton
          label={playing ? "Pause" : "Lecture"}
          icon={playing ? <Pause /> : <Play />}
          onClick={onToggle}
          data-tv-primary
          className="[&>svg]:size-6 [&>svg]:fill-current"
        />
        {props.live ? null : (
          <>
            <IconButton label="Reculer de 10 secondes" icon={<RotateCcw />} onClick={() => skip(-SEEK_STEP)} />
            <IconButton label="Avancer de 10 secondes" icon={<RotateCw />} onClick={() => skip(SEEK_STEP)} />
          </>
        )}
        <div className={cx("contents", folded)}>
          <VolumeControl />
        </div>
        <span className="hidden flex-1 sm:block" />
        {tv || playing ? null : <NoteComposer onSend={props.onNote} />}
        <ReactionPicker open={props.reactionsOpen} onOpenChange={props.onReactionsOpenChange} onReact={props.onReact} />
        {props.onOpenTracks ? (
          <IconButton
            label="Audio et sous-titres"
            icon={<Subtitles />}
            onClick={props.onOpenTracks}
            className={folded}
          />
        ) : null}
        {props.onSkipNext ? (
          <IconButton
            label="Épisode suivant"
            icon={<SkipForward />}
            onClick={props.onSkipNext}
            className="max-sm:hidden"
          />
        ) : null}
        {props.onOpenUpNext ? (
          <IconButton label={queueTitle} icon={<ListVideo />} onClick={props.onOpenUpNext} className={folded} />
        ) : null}
        {tv ? null : (
          <IconButton label="Plein écran" icon={<Maximize />} onClick={props.onFullscreen} className={folded} />
        )}
        <IconButton label="Plus d'options" icon={<Ellipsis />} onClick={props.onOpenMore} className="sm:hidden" />
      </div>
    </Surface>
  );
}
