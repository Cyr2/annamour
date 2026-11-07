import { mediaFiles, readMaster } from "@annamour/protocol";
import { z } from "zod/mini";
import { readStored, writeStored } from "../lib/storage.ts";

/*
 * A whole film downloaded onto this device ahead of the séance, for a link
 * too weak to stream it (a phone's shared 4G).
 *
 * Every segment goes into Cache Storage under its own URL; the service worker
 * (vite.config.ts) answers the player's requests from there first, so the
 * film then plays without the network. It costs the same data as streaming
 * it, only earlier. A download resumes where it stopped: files already stored
 * are skipped.
 */

/** Also named in vite.config.ts, where the service worker reads it. */
export const FILM_CACHE = "annamour-films-v1";
const REGISTRY_KEY = "annamour:films:v1";
const Registry = z.array(z.string());

/** Files fetched at once: enough to fill a 4G link, few enough not to hammer the source. */
const PARALLEL = 3;
const MAX_ATTEMPTS = 6;
const RETRY_BASE_MS = 1000;

export class NotEnoughSpaceError extends Error {
  constructor(readonly needed: number) {
    super("Not enough storage for this film");
    this.name = "NotEnoughSpaceError";
  }
}

export class FilmFetchError extends Error {
  constructor(url: string, status: number) {
    super(`${status} for ${url}`);
    this.name = "FilmFetchError";
  }
}

/* ---------- which films are on this device ---------- */

const listeners = new Set<() => void>();

/** Called when a film is added to or removed from this device. */
export function onFilmsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function downloadedFilms(): string[] {
  return readStored(REGISTRY_KEY, Registry) ?? [];
}

/** `src` is the room's master playlist path, which names one episode of one séance. */
export function isFilmDownloaded(src: string): boolean {
  return downloadedFilms().includes(src);
}

function markDownloaded(src: string, downloaded: boolean): void {
  const others = downloadedFilms().filter((film) => film !== src);
  writeStored(REGISTRY_KEY, downloaded ? [...others, src] : others);
  for (const listener of listeners) listener();
}

/* ---------- reading the playlists ---------- */

async function fetchText(url: URL, signal?: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new FilmFetchError(url.href, response.status);
  return response.text();
}

/** The video's declared bitrate (bits/s), to tell how big the film is before downloading it. */
export async function filmBandwidth(src: string, signal?: AbortSignal): Promise<number | undefined> {
  return readMaster(await fetchText(new URL(src, location.href), signal)).bandwidth;
}

/** Absolute URLs of every file the film plays. */
async function filmFiles(src: string, signal?: AbortSignal): Promise<string[]> {
  const masterUrl = new URL(src, location.href);
  const master = readMaster(await fetchText(masterUrl, signal));
  const uris = [master.video, ...master.audio].filter((uri) => uri !== undefined);
  // A media playlist given directly is its own (only) playlist.
  const playlists = uris.length ? uris.map((uri) => new URL(uri, masterUrl)) : [masterUrl];
  const lists = await Promise.all(
    playlists.map(async (url) => mediaFiles(await fetchText(url, signal)).map((file) => new URL(file, url).href)),
  );
  return lists.flat();
}

/* ---------- downloading ---------- */

export interface DownloadProgress {
  done: number;
  total: number;
  bytes: number;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
}

const storedSize = (response: Response) => Number(response.headers.get("content-length")) || 0;

/** Stores one file (unless it already is), patiently through drops. Returns its size. */
async function storeFile(cache: Cache, url: string, signal: AbortSignal): Promise<number> {
  const cached = await cache.match(url, { ignoreVary: true });
  if (cached) return storedSize(cached);
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { signal, mode: "cors", credentials: "omit" });
      if (!response.ok) throw new FilmFetchError(url, response.status);
      const body = await response.blob();
      const headers = { "content-type": body.type || "application/octet-stream", "content-length": String(body.size) };
      await cache.put(url, new Response(body, { headers }));
      return body.size;
    } catch (error) {
      if (signal.aborted || attempt >= MAX_ATTEMPTS) throw error;
      await wait(RETRY_BASE_MS * 2 ** attempt, signal);
    }
  }
}

/** Asks the browser to keep the film (not evicted under storage pressure) and checks it fits. */
async function ensureSpace(needed: number): Promise<void> {
  await navigator.storage?.persist?.().catch(() => false);
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  if (!estimate?.quota) return;
  if (estimate.quota - (estimate.usage ?? 0) < needed) throw new NotEnoughSpaceError(needed);
}

export interface DownloadOptions {
  signal: AbortSignal;
  /** Expected size, checked against the free space before anything is fetched. */
  expectedBytes?: number;
  onProgress: (progress: DownloadProgress) => void;
}

export async function downloadFilm(src: string, { signal, expectedBytes = 0, onProgress }: DownloadOptions) {
  await ensureSpace(expectedBytes);
  const urls = await filmFiles(src, signal);
  const cache = await caches.open(FILM_CACHE);
  const progress: DownloadProgress = { done: 0, total: urls.length, bytes: 0 };
  let next = 0;
  const worker = async () => {
    for (let url = urls[next++]; url !== undefined; url = urls[next++]) {
      // Awaited first: `bytes += await …` would read the total before the wait and lose the other workers' files.
      const size = await storeFile(cache, url, signal);
      progress.bytes += size;
      progress.done++;
      onProgress({ ...progress });
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  markDownloaded(src, true);
}

/** Frees the space a film takes on this device. */
export async function deleteFilm(src: string): Promise<void> {
  markDownloaded(src, false);
  const cache = await caches.open(FILM_CACHE);
  await Promise.all((await filmFiles(src)).map((url) => cache.delete(url, { ignoreVary: true })));
}
