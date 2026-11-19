import type { Media } from "@annamour/protocol";
import type { SyncMedia } from "../../sync/media.ts";
import { YouTubeSurface } from "./YouTubeSurface.tsx";

interface FilmSurfaceProps {
  media: Media | undefined;
  onVideo: (media: SyncMedia | null) => void;
}

/** What plays, full bleed: our <video> (HLS, with the room's subtitles), or YouTube's own player. */
export function FilmSurface({ media, onVideo }: FilmSurfaceProps) {
  if (media?.youtube) return <YouTubeSurface videoId={media.youtube.videoId} onMedia={onVideo} />;
  return (
    // biome-ignore lint/a11y/useMediaCaption: subtitle tracks come from the room's media at runtime (mapped below).
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
  );
}
