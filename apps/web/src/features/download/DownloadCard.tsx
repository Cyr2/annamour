import { CircleCheck, Download, Pause, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { formatBytes } from "../../lib/format.ts";
import { Button } from "../../ui/controls.tsx";
import { Progress } from "../../ui/Progress.tsx";
import { Surface } from "../../ui/Surface.tsx";
import {
  type FilmDownloadState,
  pauseFilmDownload,
  removeFilmDownload,
  showFilm,
  startFilmDownload,
  useFilmDownload,
} from "./film-download.ts";

/** "≈ 3,8 Go", or nothing while the size is unknown. */
function sizeLabel(bytes: number): string {
  return bytes ? `≈ ${formatBytes(bytes)}` : "";
}

function progressLine({ progress, expectedBytes }: FilmDownloadState): string {
  const total = expectedBytes ? ` sur ${sizeLabel(expectedBytes)}` : "";
  return `${formatBytes(progress.bytes)}${total}`;
}

function offerLine(expectedBytes: number): string {
  const size = expectedBytes ? `${sizeLabel(expectedBytes)}, ` : "";
  return `Peu de réseau ? Télécharge le film sur cet appareil avant la séance (${size}autant que le regarder en direct) : il se lira sans coupure.`;
}

const fraction = ({ progress }: FilmDownloadState) => (progress.total ? progress.done / progress.total : 0);

/**
 * « Regarder sans coupure »: downloads the salon's film onto this device, for
 * a link too weak to stream it. Same data as watching it live, only earlier.
 */
export function DownloadCard({ src, duration }: { src: string; duration: number | undefined }) {
  const download = useFilmDownload();
  useEffect(() => showFilm(src, duration), [src, duration]);
  if (download.src !== src) return null;

  return (
    <Surface className="surface-panel grid w-[min(22.5rem,100%)] gap-3 p-5 text-left">
      <DownloadBody download={download} />
    </Surface>
  );
}

function DownloadBody({ download }: { download: FilmDownloadState }) {
  switch (download.status) {
    case "done":
      return (
        <>
          <p className="flex items-center gap-2 text-md text-fg">
            <CircleCheck aria-hidden className="size-5 shrink-0 text-success" />
            Le film est sur cet appareil
          </p>
          <p className="text-sm text-pretty text-fg-muted">Il se lira sans coupure, même avec peu de réseau.</p>
          <div>
            <Button icon={<Trash2 />} tone="destructive" onClick={() => void removeFilmDownload()}>
              Supprimer le film
            </Button>
          </div>
        </>
      );
    case "downloading":
      return (
        <>
          <p className="type-label">Téléchargement du film</p>
          <Progress.Bar value={fraction(download)} label={`${Math.round(fraction(download) * 100)} % téléchargé`} />
          <p className="text-sm text-fg-muted" aria-live="polite">
            {progressLine(download)} · Garde Annamour ouvert, écran allumé.
          </p>
          <div>
            <Button icon={<Pause />} onClick={pauseFilmDownload}>
              Mettre en pause
            </Button>
          </div>
        </>
      );
    default:
      return <DownloadOffer download={download} />;
  }
}

/** Not started, paused or interrupted: the offer, and how far it got. */
function DownloadOffer({ download }: { download: FilmDownloadState }) {
  const started = download.progress.done > 0;
  return (
    <>
      <p className="type-label">Regarder sans coupure</p>
      {started ? (
        <Progress.Bar value={fraction(download)} label={`${Math.round(fraction(download) * 100)} % téléchargé`} />
      ) : null}
      <p className="text-sm text-pretty text-fg-muted">
        {download.error ??
          (started ? `${progressLine(download)} déjà sur cet appareil.` : offerLine(download.expectedBytes))}
      </p>
      <div>
        <Button icon={<Download />} tone="accent" onClick={() => void startFilmDownload()}>
          {started ? "Reprendre le téléchargement" : "Télécharger le film"}
        </Button>
      </div>
    </>
  );
}
