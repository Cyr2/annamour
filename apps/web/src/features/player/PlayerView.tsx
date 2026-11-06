import type { Reaction } from "@annamour/protocol";
import { useMemo, useState } from "react";
import { useRoom } from "../../sync/room.ts";
import type { SyncClient } from "../../sync/SyncClient.ts";
import type { PlayerSyncHandle } from "../../sync/usePlayerSync.ts";
import { Button } from "../../ui/controls.tsx";
import { cx } from "../../ui/cx.ts";
import { Sheet } from "../../ui/Sheet.tsx";
import { ControlsBar } from "./ControlsBar.tsx";
import { FloatingReactions } from "./FloatingReactions.tsx";
import { BlockedNotice, CenterPlay, WaitBanner } from "./PlayerOverlays.tsx";
import { PlayerTopBar } from "./PlayerTopBar.tsx";
import { TrackPickers } from "./TrackPickers.tsx";
import { useIdle, usePlaybackNotices, useTrackChoice, useVolumeOnVideo } from "./usePlayerEffects.ts";
import { toggleFullscreen, usePlayerKeyboard } from "./usePlayerKeyboard.ts";
import { useVolume } from "./volume.ts";

interface PlayerViewProps {
  code: string;
  active: boolean;
  video: HTMLVideoElement | null;
  onVideo: (video: HTMLVideoElement | null) => void;
  player: PlayerSyncHandle;
  client: SyncClient | null;
}

/** The film, full bleed, with glass controls that fade away after 3 s of stillness. */
export function PlayerView({ code, active, video, onVideo, player, client }: PlayerViewProps) {
  const media = useRoom((s) => s.room?.media);
  const playing = useRoom((s) => s.playback?.status === "playing");
  const you = useRoom((s) => s.you);
  // Select the stable array, derive during render: a filtering selector would return a new array every time.
  const members = useRoom((s) => s.members);
  const loading = useMemo(() => members.filter((m) => m.buffering && m.id !== you), [members, you]);
  const toggleMute = useVolume((s) => s.toggleMute);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [tracksOpen, setTracksOpen] = useState(false);
  const idle = useIdle(!active || !playing || reactionsOpen || tracksOpen);
  const { controls } = player;

  useTrackChoice(video, code, media, controls);
  useVolumeOnVideo(video);
  usePlaybackNotices();

  const toggle = () => (playing ? controls.pause() : controls.play());
  const seek = (position: number) => controls.seek(position);
  const react = (emoji: Reaction) => client?.send({ type: "react", emoji });
  const fullscreen = () => toggleFullscreen(video);
  // The position is read when the key is pressed, not subscribed to: no re-render per frame here.
  const seekBy = (delta: number) => seek(Math.max(0, (video?.currentTime ?? 0) + delta));
  usePlayerKeyboard(active && !tracksOpen, { toggle, seekBy, toggleMute, fullscreen });

  return (
    <section aria-label="Lecteur" className={cx("fixed inset-0 overflow-hidden bg-screen", !active && "invisible")}>
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
      <div
        className={cx(
          "safe-area absolute inset-0 z-10 flex flex-col justify-between py-[18px] transition-opacity duration-300",
          idle && "cursor-none opacity-0",
        )}
      >
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
      <WaitBanner members={loading} />
      {active && player.blocked ? <BlockedNotice onUnlock={controls.unlock} /> : null}
      {player.error ? (
        <p role="alert" className="absolute inset-x-0 top-24 z-20 text-center text-sm text-danger">
          {player.error}
        </p>
      ) : null}
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
