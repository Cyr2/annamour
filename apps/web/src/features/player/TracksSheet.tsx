import type { Media } from "@annamour/protocol";
import type { SyncMedia } from "../../sync/media.ts";
import { YouTubeMedia } from "../../sync/youtube-media.ts";
import { Button } from "../../ui/controls.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { SubtitleSettings } from "./SubtitleSettings.tsx";
import { TrackPickers } from "./TrackPickers.tsx";

interface TracksSheetProps {
  open: boolean;
  onClose: () => void;
  code: string;
  media: Media | undefined;
  video: SyncMedia | null;
}

/** « Audio et sous-titres »: a personal choice, never sent to the room. */
export function TracksSheet({ open, onClose, code, media, video }: TracksSheetProps) {
  // A YouTube video's subtitles are its captions, read from its player each time the sheet opens.
  const youtube = video instanceof YouTubeMedia;
  const tracks = media && youtube ? { ...media, subtitles: video.captionTracks() } : media;
  return (
    <Sheet open={open} onClose={onClose} title="Audio et sous-titres">
      <Sheet.Lede>Ces réglages ne changent que pour toi.</Sheet.Lede>
      {tracks ? (
        <>
          <TrackPickers code={code} media={tracks} />
          <SubtitleSettings code={code} media={tracks} canShift={!youtube} />
        </>
      ) : null}
      <Sheet.Actions>
        <Button variant="filled" onClick={onClose}>
          Terminé
        </Button>
      </Sheet.Actions>
    </Sheet>
  );
}
