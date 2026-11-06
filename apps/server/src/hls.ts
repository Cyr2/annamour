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

  const master = new MasterRewriter(masterUrl, audio);
  playlists.set("master.m3u8", master.rewrite(masterText));

  let duration: number | undefined;
  await Promise.all(
    [...master.upstream].map(async ([name, url]) => {
      const text = await fetchText(url);
      if (!text.trimStart().startsWith("#EXTM3U")) throw new HlsError(`Playlist ${name} is not HLS`);
      const media = absolutizeMediaPlaylist(text, url);
      playlists.set(name, media.text);
      if (name === master.firstVariant && media.duration > 0) duration = media.duration;
    }),
  );

  const { subtitles, subtitleFiles } = await discoverSiblingSubtitles(masterUrl, fetchText);
  return { playlists, audio, subtitles, subtitleFiles, duration };
}

/**
 * Rewrites a master playlist so every child playlist is served by us under a
 * short local name (p0.m3u8, p1.m3u8...), remembering where each one lives
 * upstream. Audio renditions found along the way are pushed to `audio`.
 */
class MasterRewriter {
  /** Local name -> upstream URL of every child playlist to fetch. */
  readonly upstream = new Map<string, URL>();
  /** The first video variant: its duration stands for the whole video. */
  firstVariant: string | undefined;
  /** A #EXT-X-STREAM-INF tag was just seen: the next URI line is its variant. */
  private expectVariantUri = false;
  private readonly masterUrl: URL;
  private readonly audio: AudioTrack[];

  constructor(masterUrl: URL, audio: AudioTrack[]) {
    this.masterUrl = masterUrl;
    this.audio = audio;
  }

  rewrite(masterText: string): string {
    const out: string[] = [];
    for (const raw of masterText.split(/\r?\n/)) {
      const line = this.rewriteLine(raw.trim());
      if (line !== null) out.push(line);
    }
    return out.join("\n");
  }

  /** Returns the rewritten line, or null to drop it. */
  private rewriteLine(line: string): string | null {
    if (line.startsWith("#EXT-X-I-FRAME-STREAM-INF")) return null; // trick-play only, not needed
    if (line.startsWith("#EXT-X-MEDIA")) return this.rewriteMediaLine(line);
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      this.expectVariantUri = true;
      // Subtitles are served as WebVTT side files, not as HLS renditions.
      return line.replace(/,?SUBTITLES="[^"]*"/, "");
    }
    if (this.expectVariantUri && isUriLine(line)) return this.rewriteVariantLine(line);
    return line;
  }

  private rewriteMediaLine(line: string): string | null {
    const uri = URI_ATTR.exec(line)?.[1];
    if (uri === undefined) return line; // e.g. muxed audio declared without its own playlist
    const type = attr(line, "TYPE");
    if (type === "SUBTITLES" || type === "CLOSED-CAPTIONS") return null; // handled as WebVTT side files
    const name = this.register(uri);
    if (type === "AUDIO") this.audio.push(audioTrack(line, name));
    return line.replace(URI_ATTR, `URI="${name}"`);
  }

  private rewriteVariantLine(uri: string): string {
    const name = this.register(uri);
    this.firstVariant ??= name;
    this.expectVariantUri = false;
    return name;
  }

  private register(uri: string): string {
    const name = `p${this.upstream.size}.m3u8`;
    this.upstream.set(name, new URL(uri, this.masterUrl));
    return name;
  }
}

function audioTrack(line: string, id: string): AudioTrack {
  const language = attr(line, "LANGUAGE");
  return { id, label: attr(line, "NAME") ?? language ?? "Audio", ...(language ? { language } : {}) };
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
