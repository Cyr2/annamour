import type { AudioTrack, SubtitleTrack } from "@annamour/protocol";
import type { TextFetcher } from "./safe-fetch.ts";

/**
 * Imports an HLS stream once, at room creation:
 * - the master and media playlists are fetched and kept in memory, so the
 *   room keeps working after the source's short-lived token expires;
 * - playlist references point back to our server, segment references are
 *   made absolute so video bytes flow straight from the source CDN.
 */
export interface ImportedMedia {
  /** Rewritten playlists by file name; "master.m3u8" is the entry point. */
  playlists: Map<string, string>;
  audio: AudioTrack[];
  /** Subtitle files by id, already fetched. */
  subtitleFiles: Map<string, string>;
  subtitles: Omit<SubtitleTrack, "url">[];
  duration: number | undefined;
}

export class HlsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HlsError";
  }
}

const URI_ATTR = /URI="([^"]+)"/;

function attr(line: string, name: string): string | undefined {
  const match = new RegExp(`${name}=(?:"([^"]*)"|([^,]*))`).exec(line);
  return match ? (match[1] ?? match[2]) : undefined;
}

function isUriLine(line: string): boolean {
  return line.length > 0 && !line.startsWith("#");
}

/** Makes every segment, key and init-map reference absolute. */
export function absolutizeMediaPlaylist(text: string, base: URL): { text: string; duration: number } {
  let duration = 0;
  const lines = text.split(/\r?\n/).map((raw) => {
    const line = raw.trim();
    if (line.startsWith("#EXTINF:")) duration += Number.parseFloat(line.slice(8)) || 0;
    if (isUriLine(line)) return new URL(line, base).href;
    if ((line.startsWith("#EXT-X-KEY") || line.startsWith("#EXT-X-MAP")) && URI_ATTR.test(line)) {
      return line.replace(URI_ATTR, (_, uri: string) => `URI="${new URL(uri, base).href}"`);
    }
    return line;
  });
  return { text: lines.join("\n"), duration };
}

export async function importHls(masterUrl: URL, fetchText: TextFetcher): Promise<ImportedMedia> {
  const masterText = await fetchText(masterUrl);
  if (!masterText.trimStart().startsWith("#EXTM3U")) throw new HlsError("This link is not an HLS playlist");

  const playlists = new Map<string, string>();
  const audio: AudioTrack[] = [];

  // A media playlist given directly: serve it as the entry point.
  if (!masterText.includes("#EXT-X-STREAM-INF")) {
    const media = absolutizeMediaPlaylist(masterText, masterUrl);
    playlists.set("master.m3u8", media.text);
    return { playlists, audio, subtitleFiles: new Map(), subtitles: [], duration: media.duration || undefined };
  }

  const upstream = new Map<string, URL>();
  let counter = 0;
  const register = (uri: string): string => {
    const name = `p${counter++}.m3u8`;
    upstream.set(name, new URL(uri, masterUrl));
    return name;
  };

  let firstVariant: string | undefined;
  let expectVariantUri = false;
  const out: string[] = [];
  for (const raw of masterText.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("#EXT-X-I-FRAME-STREAM-INF")) continue; // trick-play only, not needed
    if (line.startsWith("#EXT-X-MEDIA") && URI_ATTR.test(line)) {
      const type = attr(line, "TYPE");
      if (type === "SUBTITLES" || type === "CLOSED-CAPTIONS") continue; // handled as WebVTT side files
      const name = register(URI_ATTR.exec(line)![1]!);
      if (type === "AUDIO") {
        const language = attr(line, "LANGUAGE");
        audio.push({ id: name, label: attr(line, "NAME") ?? language ?? "Audio", ...(language ? { language } : {}) });
      }
      out.push(line.replace(URI_ATTR, `URI="${name}"`));
      continue;
    }
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      expectVariantUri = true;
      out.push(line.replace(/,?SUBTITLES="[^"]*"/, ""));
      continue;
    }
    if (isUriLine(line) && expectVariantUri) {
      const name = register(line);
      firstVariant ??= name;
      expectVariantUri = false;
      out.push(name);
      continue;
    }
    out.push(line);
  }
  playlists.set("master.m3u8", out.join("\n"));

  let duration: number | undefined;
  await Promise.all(
    [...upstream].map(async ([name, url]) => {
      const text = await fetchText(url);
      if (!text.trimStart().startsWith("#EXTM3U")) throw new HlsError(`Playlist ${name} is not HLS`);
      const media = absolutizeMediaPlaylist(text, url);
      playlists.set(name, media.text);
      if (name === firstVariant && media.duration > 0) duration = media.duration;
    }),
  );

  const { subtitles, subtitleFiles } = await discoverSiblingSubtitles(masterUrl, fetchText);
  return { playlists, audio, subtitles, subtitleFiles, duration };
}

/**
 * Some sources publish WebVTT files next to the master playlist instead of
 * declaring them in it (Naka does: subs_fre.vtt, subs_fre_forced.vtt...).
 * We try the usual names with the same query string and keep what answers.
 */
const SUBTITLE_CANDIDATES: Array<{ file: string; label: string; language: string; forced: boolean }> = [
  { file: "subs_fre.vtt", label: "Français", language: "fr", forced: false },
  { file: "subs_fre_forced.vtt", label: "Français (forcés)", language: "fr", forced: true },
  { file: "subs_eng.vtt", label: "English", language: "en", forced: false },
  { file: "subs_eng_forced.vtt", label: "English (forced)", language: "en", forced: true },
];

export async function discoverSiblingSubtitles(masterUrl: URL, fetchText: TextFetcher) {
  const subtitles: Omit<SubtitleTrack, "url">[] = [];
  const subtitleFiles = new Map<string, string>();
  const found = await Promise.all(
    SUBTITLE_CANDIDATES.map(async (candidate) => {
      const url = new URL(candidate.file, masterUrl);
      url.search = masterUrl.search;
      try {
        const text = await fetchText(url);
        return text.trimStart().startsWith("WEBVTT") ? { candidate, text } : null;
      } catch {
        return null;
      }
    }),
  );
  for (const hit of found) {
    if (!hit) continue;
    const id = hit.candidate.file.replace(/\.vtt$/, "");
    subtitleFiles.set(id, hit.text);
    subtitles.push({ id, label: hit.candidate.label, language: hit.candidate.language, forced: hit.candidate.forced });
  }
  return { subtitles, subtitleFiles };
}
