/**
 * Which files make up an HLS film, read from its playlists, so a device can
 * download all of it ahead of the séance.
 *
 * Only the first video variant is kept (the sources we use publish a single
 * one), with every audio rendition: they are small, and the language is
 * picked during the film.
 */
export interface MasterContents {
  /** The video variant's playlist URI, as written in the master. */
  video: string | undefined;
  /** Every audio rendition's playlist URI. */
  audio: string[];
  /** The video variant's declared peak bitrate (bits/s). */
  bandwidth: number | undefined;
}

const URI_ATTR = /URI="([^"]+)"/;
const BANDWIDTH_ATTR = /BANDWIDTH=(\d+)/;

function lines(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim());
}

const isUri = (line: string) => line.length > 0 && !line.startsWith("#");

export function readMaster(text: string): MasterContents {
  const all = lines(text);
  const audio = all
    .filter((line) => line.startsWith("#EXT-X-MEDIA") && line.includes("TYPE=AUDIO"))
    .flatMap((line) => URI_ATTR.exec(line)?.[1] ?? []);
  const variantIndex = all.findIndex((line) => line.startsWith("#EXT-X-STREAM-INF"));
  if (variantIndex < 0) return { video: undefined, audio, bandwidth: undefined };
  const bandwidth = BANDWIDTH_ATTR.exec(all[variantIndex] ?? "")?.[1];
  return {
    video: all.slice(variantIndex + 1).find(isUri),
    audio,
    bandwidth: bandwidth === undefined ? undefined : Number(bandwidth),
  };
}

/** Every file a media playlist plays: its segments and their init sections. */
export function mediaFiles(text: string): string[] {
  return lines(text).flatMap((line) => {
    if (isUri(line)) return [line];
    if (line.startsWith("#EXT-X-MAP")) return URI_ATTR.exec(line)?.[1] ?? [];
    return [];
  });
}

/** Rough size of a film from its declared bitrate (a peak, so this errs on the large side). */
export function estimateBytes(bandwidth: number, durationSeconds: number): number {
  return Math.round((bandwidth * durationSeconds) / 8);
}
