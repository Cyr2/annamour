import type { Reaction } from "@annamour/protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useRoom } from "../../sync/room.ts";
import type { SyncClient } from "../../sync/SyncClient.ts";
import type { PlayerSyncHandle } from "../../sync/usePlayerSync.ts";
import { Button } from "../../ui/controls.tsx";
import { cx } from "../../ui/cx.ts";
import { Sheet } from "../../ui/Sheet.tsx";
import { useTv } from "../tv/tv-context.ts";
import { ControlsBar } from "./ControlsBar.tsx";
import { FloatingReactions } from "./FloatingReactions.tsx";
import { leaveFullscreen, toggleFullscreen } from "./fullscreen.ts";
import { BlockedNotice, CenterPlay, PlayerError, WaitBanner } from "./PlayerOverlays.tsx";
import { PlayerTopBar } from "./PlayerTopBar.tsx";
import { SeekBadge } from "./SeekBadge.tsx";
import { TrackPickers } from "./TrackPickers.tsx";
import { useIdle, usePlaybackNotices, useTrackChoice, useVolumeOnVideo } from "./usePlayerEffects.ts";
import { usePlayerKeyboard, useSurfaceTap } from "./usePlayerKeyboard.ts";
import { useTvPlayerRemote } from "./useTvPlayerRemote.ts";
import { useVolume } from "./volume.ts";

interface PlayerViewProps {
  code: string;
  active: boolean;
  video: HTMLVideoElement | null;
  onVideo: (video: HTMLVideoElement | null) => void;
  player: PlayerSyncHandle;
  client: SyncClient | null;
}

/**
 * The film, full bleed, with glass controls that fade away after 3 s of
 * stillness. On a TV the remote drives it instead (see useTvPlayerRemote):
 * the controls come up with ↑ ↓ and fade after 5 s.
 */
export function PlayerView({ code, active, video, onVideo, player, client }: PlayerViewProps) {
  const tv = useTv();
  const media = useRoom((s) => s.room?.media);
  const playing = useRoom((s) => s.playback?.status === "playing");
  const you = useRoom((s) => s.you);
  // Select the stable array, derive during render: a filtering selector would return a new array every time.
  const members = useRoom((s) => s.members);
  const loading = useMemo(() => members.filter((m) => m.buffering && m.id !== you), [members, you]);
  const toggleMute = useVolume((s) => s.toggleMute);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [tracksOpen, setTracksOpen] = useState(false);
  const [, navigate] = useLocation();
  const controlsLayer = useRef<HTMLDivElement>(null);
  const { controls } = player;

  // Full screen belongs to the film: leaving the player gives the app back, upright.
  useEffect(() => leaveFullscreen, []);
  useTrackChoice(video, code, media, controls);
  useVolumeOnVideo(video);
  usePlaybackNotices();

  const toggle = () => (playing ? controls.pause() : controls.play());
  const seek = (position: number) => controls.seek(position);
  const react = (emoji: Reaction) => client?.send({ type: "react", emoji });
  const fullscreen = () => toggleFullscreen(video);
  // The position is read when the key is pressed, not subscribed to: no re-render per frame here.
  const seekBy = (delta: number) => seek(Math.max(0, (video?.currentTime ?? 0) + delta));

  const remote = useTvPlayerRemote({
    enabled: tv && active,
    sheetOpen: tracksOpen,
    playing,
    // When the browser blocked the sound, OK is the gesture that lets the film play.
    toggle: () => (player.blocked ? controls.unlock() : toggle()),
    seekBy,
    bar: controlsLayer,
    onHide: () => setReactionsOpen(false),
    onLeave: () => navigate("/"),
  });
  const idle = useIdle(tv || !active || !playing || reactionsOpen || tracksOpen);
  const hidden = tv ? !remote.shown : idle;
  usePlayerKeyboard(active && !tracksOpen && !tv, { toggle, seekBy, toggleMute, fullscreen });
  const surfaceTap = useSurfaceTap(toggle);

  return (
    <section
      aria-label="Lecteur"
      data-watching={active || undefined}
      className={cx("fixed inset-0 overflow-hidden bg-screen", !active && "invisible")}
    >
      {/* Not a glisse backdrop: bending a playing film costs a full-screen filter every frame. */}
      {/* biome-ignore lint/a11y/useMediaCaption: subtitle tracks come from the room's media at runtime (mapped below). */}
      <video ref={onVideo} className="absolute inset-0 size-full object-contain" playsInline>
        {media?.subtitles.map((track) => (
          <track
            key={track.id}
            id={track.id}
            kind="subtitles"
            src={track.url}
            srcLang={track.language}
            label={track.label}
          />
        ))}
      </video>
      <FloatingReactions />
      {/* The film's surface: tapping it plays or pauses (Space and K do it from the keyboard). Hidden controls take no taps. */}
      <div
        ref={controlsLayer}
        {...surfaceTap}
        // On a TV, hidden controls are out of the remote's reach too.
        inert={tv && hidden ? true : undefined}
        className={cx(
          "safe-area absolute inset-0 z-10 flex flex-col justify-between py-4 transition-opacity duration-300 ease-out",
          hidden && "cursor-none opacity-0 [&>*]:pointer-events-none",
        )}
      >
        {/* Shades at both edges so titles and clocks read over a bright frame; they fade with the controls. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-(image:--am-player-shade-top)"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-(image:--am-player-shade-bottom)"
        />
        <PlayerTopBar code={code} />
        <ControlsBar
          video={video}
          playing={playing}
          onToggle={toggle}
          onSeek={seek}
          reactionsOpen={reactionsOpen}
          onReactionsOpenChange={setReactionsOpen}
          onReact={react}
          onOpenTracks={() => setTracksOpen(true)}
          onFullscreen={fullscreen}
        />
      </div>
      <CenterPlay
        visible={active && !playing && !player.blocked && loading.length === 0}
        onPlay={() => controls.play()}
      />
      {tv ? <SeekBadge flash={remote.seek} /> : null}
      <WaitBanner members={loading} />
      {active && player.blocked ? <BlockedNotice onUnlock={controls.unlock} /> : null}
      {player.error ? <PlayerError message={player.error} /> : null}
      <Sheet open={tracksOpen} onClose={() => setTracksOpen(false)} title="Audio et sous-titres">
        <Sheet.Lede>Ce réglage ne change que pour toi.</Sheet.Lede>
        {media ? <TrackPickers code={code} media={media} /> : null}
        <Sheet.Actions>
          <Button variant="filled" onClick={() => setTracksOpen(false)}>
            Terminé
          </Button>
        </Sheet.Actions>
      </Sheet>
    </section>
  );
}
