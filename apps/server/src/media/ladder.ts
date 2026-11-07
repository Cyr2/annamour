/**
 * Lighter qualities for a film whose source has only one, so a weak link
 * (a phone's shared 4G) can still play it, as Netflix's ladder does.
 *
 * The source quality is still played straight from its CDN; each lighter
 * rung is made by us, segment by segment, on exactly the source's segment
 * boundaries (same count, same durations, same timestamps), so players switch
 * between rungs seamlessly. Apple's authoring spec wants the first variant
 * listed to suit a cellular link (~1 Mb/s): 480p goes first, players then
 * move up or down on their own.
 */
export interface Rung {
  name: RungName;
  height: number;
  crf: number;
  maxrateKbps: number;
  bufsizeKbps: number;
  /** H.264 level: 540p is past level 3.0's frame size. */
  level: "3.0" | "3.1";
}

export type RungName = "q540" | "q480" | "q360" | "q234";

/** In the order they are listed in the master (see above). */
export const RUNGS: readonly Rung[] = [
  { name: "q480", height: 480, crf: 23, maxrateKbps: 1000, bufsizeKbps: 2000, level: "3.0" },
  { name: "q540", height: 540, crf: 22, maxrateKbps: 1600, bufsizeKbps: 3200, level: "3.1" },
  { name: "q360", height: 360, crf: 24, maxrateKbps: 550, bufsizeKbps: 1100, level: "3.0" },
  // The last resort for a collapsing link (Apple asks for a cellular variant this light).
  { name: "q234", height: 234, crf: 27, maxrateKbps: 150, bufsizeKbps: 300, level: "3.0" },
];

/** What a separate or muxed AAC track adds to a rung's declared bitrate. */
const AUDIO_KBPS = 160;
/** H.264 High profile at the rung's level: what every iPhone and browser decodes. */
const VIDEO_CODEC: Record<Rung["level"], string> = { "3.0": "avc1.64001e", "3.1": "avc1.64001f" };

export function rungNamed(name: string): Rung | undefined {
  return RUNGS.find((rung) => rung.name === name);
}

const lines = (text: string) => text.split(/\r?\n/);
const isUri = (line: string) => line.trim().length > 0 && !line.startsWith("#");

function attribute(line: string, name: string): string | undefined {
  const match = new RegExp(`[:,]${name}=(?:"([^"]*)"|([^,]*))`).exec(line);
  return match ? (match[1] ?? match[2]) : undefined;
}

export interface SourceVariant {
  /** The variant's playlist name in the master (e.g. p2.m3u8). */
  uri: string;
  /** The #EXT-X-STREAM-INF line. */
  info: string;
  width: number;
  height: number;
}

/** The master's first video variant: the one quality the source offers. */
export function sourceVariant(master: string): SourceVariant | undefined {
  const all = lines(master);
  const index = all.findIndex((line) => line.startsWith("#EXT-X-STREAM-INF"));
  const info = all[index];
  const uri = all.slice(index + 1).find(isUri);
  const [width, height] = (info && attribute(info, "RESOLUTION")?.split("x").map(Number)) || [];
  if (index < 0 || !info || !uri || !width || !height) return undefined;
  return { uri: uri.trim(), info, width, height };
}

/**
 * The rungs we can make for this source: lower than it, and only from
 * MPEG-TS segments (each one decodes on its own, which segment-by-segment
 * encoding needs).
 */
export function rungsFor(source: SourceVariant, sourcePlaylist: string): Rung[] {
  if (sourcePlaylist.includes("#EXT-X-MAP")) return [];
  const segments = segmentSources(sourcePlaylist);
  if (segments.length === 0 || !segments.every((uri) => new URL(uri).pathname.endsWith(".ts"))) return [];
  return RUNGS.filter((rung) => rung.height < source.height);
}

function evenWidth(source: SourceVariant, height: number): number {
  return Math.round((source.width * height) / source.height / 2) * 2;
}

function streamInf(source: SourceVariant, rung: Rung): string {
  const audioCodec = attribute(source.info, "CODECS")
    ?.split(",")
    .find((codec) => codec.startsWith("mp4a"));
  const video = VIDEO_CODEC[rung.level];
  const codecs = audioCodec ? `${video},${audioCodec}` : video;
  const parts = [
    `BANDWIDTH=${(rung.maxrateKbps + AUDIO_KBPS) * 1000}`,
    `AVERAGE-BANDWIDTH=${Math.round(rung.maxrateKbps * 0.8 + AUDIO_KBPS) * 1000}`,
    `RESOLUTION=${evenWidth(source, rung.height)}x${rung.height}`,
    `CODECS="${codecs}"`,
  ];
  const frameRate = attribute(source.info, "FRAME-RATE");
  if (frameRate) parts.push(`FRAME-RATE=${frameRate}`);
  const audio = attribute(source.info, "AUDIO");
  if (audio) parts.push(`AUDIO="${audio}"`);
  return `#EXT-X-STREAM-INF:${parts.join(",")}\n${rung.name}.m3u8`;
}

/** The master with our rungs listed before the source's own variant. */
export function withLowQualities(master: string, source: SourceVariant, rungs: readonly Rung[]): string {
  if (rungs.length === 0) return master;
  const added = rungs.map((rung) => streamInf(source, rung)).join("\n");
  return master.replace(source.info, `${added}\n${source.info}`);
}

/** The playlist names of the master's separate audio renditions, in order. */
export function audioRenditions(master: string): string[] {
  return lines(master)
    .filter((line) => line.startsWith("#EXT-X-MEDIA") && attribute(line, "TYPE") === "AUDIO")
    .flatMap((line) => attribute(line, "URI") ?? []);
}

/** Absolute URLs of the source's segments, in order. */
export function segmentSources(sourcePlaylist: string): string[] {
  return lines(sourcePlaylist)
    .filter(isUri)
    .map((line) => line.trim());
}

/** Each segment's duration (seconds), in order. */
export function segmentDurations(sourcePlaylist: string): number[] {
  return lines(sourcePlaylist)
    .filter((line) => line.startsWith("#EXTINF:"))
    .map((line) => Number.parseFloat(line.slice(8)) || 0);
}

/** The segment playing at `seconds` into the source. */
export function segmentAt(sourcePlaylist: string, seconds: number): number {
  let elapsed = 0;
  let index = 0;
  for (const line of lines(sourcePlaylist)) {
    if (!line.startsWith("#EXTINF:")) continue;
    elapsed += Number.parseFloat(line.slice(8)) || 0;
    if (elapsed > seconds) return index;
    index++;
  }
  return Math.max(0, index - 1);
}

export function segmentFile(index: number): string {
  return `${String(index).padStart(5, "0")}.ts`;
}

/** A rung's media playlist: the source's, with each segment pointing to our encode of it. */
export function rungPlaylist(sourcePlaylist: string, rung: Rung): string {
  let index = 0;
  return lines(sourcePlaylist)
    .map((line) => (isUri(line) ? `${rung.name}/${segmentFile(index++)}` : line))
    .join("\n");
}
