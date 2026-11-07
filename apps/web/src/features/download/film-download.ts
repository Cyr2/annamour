import { estimateBytes } from "@annamour/protocol";
import { create } from "zustand";
import { formatBytes } from "../../lib/format.ts";
import {
  type DownloadProgress,
  deleteFilm,
  downloadFilm,
  filmBandwidth,
  isFilmDownloaded,
  NotEnoughSpaceError,
} from "../../sync/film-cache.ts";

/*
 * The film of the séance on screen, downloaded onto this device (see
 * sync/film-cache.ts). One film at a time: the one of the salon you are in.
 */

export type FilmDownloadStatus = "idle" | "downloading" | "paused" | "done" | "error";

export interface FilmDownloadState {
  src: string | null;
  status: FilmDownloadStatus;
  progress: DownloadProgress;
  /** Expected size in bytes, refined as files arrive; 0 while unknown. */
  expectedBytes: number;
  error: string | null;
}

const noProgress: DownloadProgress = { done: 0, total: 0, bytes: 0 };
const initialState: FilmDownloadState = {
  src: null,
  status: "idle",
  progress: noProgress,
  expectedBytes: 0,
  error: null,
};

export const useFilmDownload = create<FilmDownloadState>()(() => initialState);

let controller: AbortController | null = null;
let wakeLock: WakeLockSentinel | null = null;

/** Stops the running download without letting it report back (its state no longer applies). */
function stopCurrent(): void {
  const running = controller;
  controller = null;
  running?.abort();
}

/** The declared bitrate overstates the size; once enough files are in, their average is closer. */
const AVERAGE_AFTER_FILES = 20;

function refinedSize({ done, total, bytes }: DownloadProgress, declared: number): number {
  return done >= AVERAGE_AFTER_FILES ? Math.round((bytes / done) * total) : declared;
}

/** Points the download at the salon's film (and tells how big it is). */
export function showFilm(src: string, durationSeconds: number | undefined): void {
  if (useFilmDownload.getState().src === src) return;
  stopCurrent();
  useFilmDownload.setState({ ...initialState, src, status: isFilmDownloaded(src) ? "done" : "idle" });
  if (!durationSeconds) return;
  filmBandwidth(src)
    .then((bandwidth) => {
      if (bandwidth && useFilmDownload.getState().src === src)
        useFilmDownload.setState({ expectedBytes: estimateBytes(bandwidth, durationSeconds) });
    })
    .catch(() => {
      // Size unknown: the card says so; downloading still works.
    });
}

function failureMessage(error: unknown): string {
  if (error instanceof NotEnoughSpaceError)
    return `Pas assez de place : libère environ ${formatBytes(error.needed)} sur cet appareil, puis réessaie.`;
  return "Le réseau a lâché. Reprends quand il revient : ce qui est téléchargé est gardé.";
}

/** The screen stays on while downloading: iOS stops everything once the app leaves the screen. */
async function holdScreen(hold: boolean): Promise<void> {
  if (!hold) {
    await wakeLock?.release().catch(() => {});
    wakeLock = null;
    return;
  }
  wakeLock = await navigator.wakeLock?.request("screen").catch(() => null);
}

export async function startFilmDownload(): Promise<void> {
  const { src, status, expectedBytes } = useFilmDownload.getState();
  if (!src || status === "downloading" || status === "done") return;
  const current = new AbortController();
  controller = current;
  useFilmDownload.setState({ status: "downloading", error: null });
  void holdScreen(true);
  const onProgress = (progress: DownloadProgress) => {
    if (controller === current)
      useFilmDownload.setState({ progress, expectedBytes: refinedSize(progress, expectedBytes) });
  };
  try {
    await downloadFilm(src, { signal: current.signal, expectedBytes, onProgress });
    if (controller === current) useFilmDownload.setState({ status: "done" });
  } catch (error) {
    if (controller !== current) return;
    if (current.signal.aborted) useFilmDownload.setState({ status: "paused" });
    else useFilmDownload.setState({ status: "error", error: failureMessage(error) });
  } finally {
    if (controller === current) controller = null;
    void holdScreen(false);
  }
}

export function pauseFilmDownload(): void {
  controller?.abort();
}

export async function removeFilmDownload(): Promise<void> {
  const { src } = useFilmDownload.getState();
  if (!src) return;
  stopCurrent();
  useFilmDownload.setState({ status: "idle", progress: noProgress, error: null });
  await deleteFilm(src).catch(() => {
    // The film is already forgotten; its files go with the next clean-up of the browser.
  });
}
