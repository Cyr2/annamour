/**
 * HEVC (H.265) rungs for Apple devices: ~20–40 % fewer bits than H.264 for the
 * same picture, where a weak link needs it most (the lowest rungs).
 *
 * Apple only plays HEVC in fragmented MP4 tagged `hvc1` (parameter sets in
 * the init segment, never in-band). Each source segment is encoded on its own
 * into one MP4 whose `ftyp`+`moov` is the init segment (identical for every
 * segment of a rung, checked) and whose `moof`+`mdat` pairs are the media
 * segment, its `tfdt` on the source's clock.
 *
 * hls.js starts on the most efficient codec family it decodes and never leaves
 * it. So Safari's own player gets the lowest HEVC rungs beside its H.264
 * ladder, while hls.js only gets HEVC when it asks for the complete HEVC
 * ladder (234p to 720p, see HEVC_LADDER_PARAM): then it gets nothing else.
 */

/** A HEVC rung: the same picture sizes as the H.264 rungs, for fewer bits. */
export interface HevcRung {
  name: HevcRungName;
  height: number;
  crf: number;
  maxrateKbps: number;
  bufsizeKbps: number;
  /** x265's level-idc: 720p is past level 3.0's picture size. */
  level: 30 | 31;
}

export type HevcRungName = "h720" | "h540" | "h480" | "h360" | "h288" | "h234";

/** The lowest rungs, with the lighter audio: about 30 % under their H.264 twins (q360 550, q288 300, q234 120 kb/s). */
export const HEVC_RUNGS: readonly HevcRung[] = [
  { name: "h360", height: 360, crf: 26, maxrateKbps: 380, bufsizeKbps: 760, level: 30 },
  { name: "h288", height: 288, crf: 27, maxrateKbps: 210, bufsizeKbps: 420, level: 30 },
  { name: "h234", height: 234, crf: 29, maxrateKbps: 85, bufsizeKbps: 170, level: 30 },
];

/**
 * The rest of the complete ladder (HEVC_FULL=on), with the source's audio:
 * about 30 % under q480 (1000) and q540 (1600 kb/s), and half the ~3 Mb/s
 * 720p source, re-encoded so hls.js can climb to it without leaving HEVC.
 */
export const HEVC_HIGH_RUNGS: readonly HevcRung[] = [
  { name: "h480", height: 480, crf: 25, maxrateKbps: 700, bufsizeKbps: 1400, level: 30 },
  { name: "h540", height: 540, crf: 24, maxrateKbps: 1100, bufsizeKbps: 2200, level: 30 },
  { name: "h720", height: 720, crf: 24, maxrateKbps: 1500, bufsizeKbps: 3000, level: 31 },
];

/** The complete ladder tops out at the source's own picture: only made for a 720p source (Naka's). */
export const FULL_LADDER_HEIGHT = 720;

/** What a HEVC rung's audio adds to its declared bitrate, by which audio it plays with. */
export const HEVC_SOUND_KBPS = {
  /** The lighter AAC (64 kb/s) in fMP4. */
  light: 70,
  /** The source's own AAC, repackaged in fMP4 (Naka's is ~141 kb/s), as for the H.264 rungs. */
  source: 160,
} as const;

export type HevcSound = keyof typeof HEVC_SOUND_KBPS;

export function hevcRungNamed(name: string): HevcRung | undefined {
  return [...HEVC_RUNGS, ...HEVC_HIGH_RUNGS].find((rung) => rung.name === name);
}

/* ---------- which clients see HEVC ---------- */

/**
 * Safari's own player (AVPlayer), which fetches playlists as "AppleCoreMedia".
 * The only client shown the lowest HEVC rungs beside the H.264 ones: a page in
 * Safari may play through hls.js instead (the iPad's « Moins de coupures »
 * player), which would lock onto HEVC and never climb to the 720p source.
 */
export function isAppleNativePlayer(userAgent: string | undefined): boolean {
  return userAgent !== undefined && /AppleCoreMedia/.test(userAgent);
}

/**
 * Safari (or its player) on an iPhone, iPad or Mac: its native player may ask
 * soon, so the HEVC rungs are worth checking ahead. Not Chrome, Firefox or Edge
 * on iOS (their own names), not Android or its TV WebView.
 */
export function isAppleDevice(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  if (isAppleNativePlayer(userAgent)) return true;
  if (/Android|CriOS|FxiOS|EdgiOS|Chrome|Chromium|OPR\/|Edg\//.test(userAgent)) return false;
  return /Safari\//.test(userAgent) && /iPhone|iPad|iPod|Macintosh/.test(userAgent);
}

/* ---------- MP4 boxes ---------- */

interface Box {
  type: string;
  start: number;
  end: number;
}

function boxes(bytes: Uint8Array, from = 0, to = bytes.length): Box[] {
  const found: Box[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = from; at + 8 <= to; ) {
    let size = view.getUint32(at);
    let header = 8;
    if (size === 1) {
      size = Number(view.getBigUint64(at + 8));
      header = 16;
    } else if (size === 0) {
      size = to - at;
    }
    if (size < header || at + size > to) break;
    found.push({ type: String.fromCharCode(...bytes.subarray(at + 4, at + 8)), start: at, end: at + size });
    at += size;
  }
  return found;
}

export class Mp4Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Mp4Error";
  }
}

/** Splits an MP4 into its init segment (everything up to `moov`) and its media segment (the fragments). */
export function splitMp4(bytes: Uint8Array): { init: Uint8Array; segment: Uint8Array } {
  const top = boxes(bytes);
  const moov = top.findIndex((box) => box.type === "moov");
  const firstFragment = top.findIndex((box) => box.type === "moof");
  const moovBox = top[moov];
  if (!moovBox || firstFragment < moov) throw new Mp4Error("Not a fragmented MP4 (no moov before moof)");
  return { init: bytes.subarray(0, moovBox.end), segment: bytes.subarray(moovBox.end) };
}

/** The first box of `type` found by walking down `path` (e.g. ["moov", "trak", "mdia"]). */
function findBox(bytes: Uint8Array, path: readonly string[], from = 0, to = bytes.length): Box | undefined {
  const [type, ...rest] = path;
  for (const box of boxes(bytes, from, to)) {
    if (box.type !== type) continue;
    if (rest.length === 0) return box;
    const inner = findBox(bytes, rest, box.start + 8 + containerSkip(box.type), box.end);
    if (inner) return inner;
  }
  return undefined;
}

/** Bytes after a box header before its children start (sample entries carry fields first). */
function containerSkip(type: string): number {
  if (type === "stsd") return 8; // version, flags, entry count
  if (type === "hvc1" || type === "hev1") return 78; // visual sample entry fields
  return 0;
}

const SAMPLE_ENTRY = ["moov", "trak", "mdia", "minf", "stbl", "stsd", "hvc1", "hvcC"];

/** The RFC 6381 CODECS string of a HEVC init segment, from its `hvcC` (e.g. "hvc1.1.6.L90.B0"). */
export function hevcCodecs(init: Uint8Array): string {
  const hvcC = findBox(init, SAMPLE_ENTRY);
  if (!hvcC) throw new Mp4Error("No hvc1 sample entry with an hvcC box");
  const config = init.subarray(hvcC.start + 8, hvcC.end);
  if (config.length < 13) throw new Mp4Error("hvcC too short");
  const head = config[1] ?? 0;
  const space = ["", "A", "B", "C"][head >> 6] ?? "";
  const tier = head & 0x20 ? "H" : "L";
  const profile = head & 0x1f;
  const compatibility = new DataView(config.buffer, config.byteOffset + 2, 4).getUint32(0);
  // The 32 compatibility flags are written in reverse bit order (RFC 6381 / ISO 14496-15 annex E).
  let reversed = 0;
  for (let bit = 0; bit < 32; bit++) if (compatibility & (1 << bit)) reversed |= 1 << (31 - bit);
  const constraints = [...config.subarray(6, 12)];
  while (constraints.length > 0 && constraints.at(-1) === 0) constraints.pop();
  const level = config[12] ?? 0;
  return [
    "hvc1",
    `${space}${profile}`,
    (reversed >>> 0).toString(16).toUpperCase(),
    `${tier}${level}`,
    ...constraints.map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")),
  ].join(".");
}

/** The first fragment's `tfdt` (its decode time, in its track's timescale); undefined without one. */
export function firstDecodeTime(segment: Uint8Array): number | undefined {
  const tfdt = findBox(segment, ["moof", "traf", "tfdt"]);
  if (!tfdt) return undefined;
  const view = new DataView(segment.buffer, segment.byteOffset + tfdt.start + 8, tfdt.end - tfdt.start - 8);
  return view.getUint8(0) === 1 ? Number(view.getBigUint64(4)) : view.getUint32(4);
}

/* ---------- playlists ---------- */

/** A HEVC rung's or HEVC audio's media playlist: the source's durations, our fMP4 segments, its init. */
export function fmp4Playlist(sourcePlaylist: string, name: string): string {
  let index = 0;
  let mapped = false;
  const out: string[] = [];
  for (const line of sourcePlaylist.split(/\r?\n/)) {
    if (line.startsWith("#EXT-X-VERSION")) {
      out.push("#EXT-X-VERSION:7");
      continue;
    }
    if (!mapped && line.startsWith("#EXTINF")) {
      out.push(`#EXT-X-MAP:URI="${name}/init.mp4"`);
      mapped = true;
    }
    const isUri = line.trim().length > 0 && !line.startsWith("#");
    out.push(isUri ? `${name}/${String(index++).padStart(5, "0")}.m4s` : line);
  }
  return out.join("\n");
}

/** A HEVC audio group: the lighter audio's languages and names, in fMP4, under their own names. */
export interface HevcAudio {
  group: string;
  renditions: ReadonlyArray<{ name: string; sourceUri: string; line: string; isDefault: boolean; sourceOf: string }>;
}

/** Group suffix and track prefix of each HEVC audio (the lighter one keeps phase 1's names). */
const SOUND_NAMES: Record<HevcSound, { group: string; track: string }> = {
  light: { group: "-hevc", track: "h-" },
  source: { group: "-hevc-src", track: "hs-" },
};

/** The fMP4 twin of the lighter audio group: re-encoded lighter, or the source's sound repackaged. */
export function hevcAudio(
  light: {
    group: string;
    renditions: ReadonlyArray<{ name: string; sourceUri: string; line: string; isDefault: boolean }>;
  },
  sound: HevcSound = "light",
): HevcAudio {
  const names = SOUND_NAMES[sound];
  const group = light.group.replace(/-lo$/, names.group);
  return {
    group,
    renditions: light.renditions.map((rendition) => {
      const name = rendition.name.replace(/^lo-/, names.track);
      const line = rendition.line
        .replace(`GROUP-ID="${light.group}"`, `GROUP-ID="${group}"`)
        .replace(`URI="${rendition.name}.m3u8"`, `URI="${name}.m3u8"`);
      return { name, sourceUri: rendition.sourceUri, line, isDefault: rendition.isDefault, sourceOf: rendition.name };
    }),
  };
}

/** What a master needs to list a set of HEVC rungs. */
export interface HevcOffer {
  /** Each HEVC rung, with the CODECS string read from its init and its frame rate. */
  rungs: ReadonlyArray<{ rung: HevcRung; codecs: string; width: number; frameRate: number }>;
  /** The fMP4 audio group they play with: same languages and names as the source's. */
  audio: {
    group: string;
    lines: readonly string[];
    /** Its CODECS entry (the lighter audio is AAC-LC; the source's is whatever the source declares). */
    codec: string;
    kbps: number;
  };
}

function variants({ rungs, audio }: HevcOffer): string[] {
  return rungs.map(({ rung, codecs, width, frameRate }) => {
    const parts = [
      `BANDWIDTH=${(rung.maxrateKbps + audio.kbps) * 1000}`,
      `AVERAGE-BANDWIDTH=${Math.round(rung.maxrateKbps * 0.8 + audio.kbps) * 1000}`,
      `RESOLUTION=${width}x${rung.height}`,
      `CODECS="${codecs},${audio.codec}"`,
      `FRAME-RATE=${frameRate.toFixed(3)}`,
      "VIDEO-RANGE=SDR",
      `AUDIO="${audio.group}"`,
    ];
    return `#EXT-X-STREAM-INF:${parts.join(",")}\n${rung.name}.m3u8`;
  });
}

/** The master with the HEVC rungs (and their fMP4 audio group) added before the source's own variant. */
export function withHevc(master: string, sourceInfo: string, offer: HevcOffer): string {
  return master.replace(sourceInfo, [...offer.audio.lines, ...variants(offer), sourceInfo].join("\n"));
}

const isPlaylistUri = (line: string) => line.trim().length > 0 && !line.startsWith("#");
/** Besides video variants, what would give hls.js something else than our HEVC to play: I-frame lists, audio groups. */
const isOtherMedia = (line: string) =>
  line.startsWith("#EXT-X-I-FRAME-STREAM-INF") || (line.startsWith("#EXT-X-MEDIA") && line.includes("TYPE=AUDIO"));

/**
 * The master for our hls.js player when it asked for the complete HEVC
 * ladder: only HEVC variants and their fMP4 audio groups, the source's other
 * lines (header, subtitles) kept. With a single codec family listed, hls.js
 * starts on HEVC and has nothing to mix it with, whatever its heuristics.
 */
export function hevcLadderMaster(master: string, offers: readonly HevcOffer[]): string {
  const kept: string[] = [];
  let variantUri = false;
  for (const line of master.split(/\r?\n/)) {
    if (variantUri && isPlaylistUri(line)) variantUri = false;
    else if (line.startsWith("#EXT-X-STREAM-INF")) variantUri = true;
    else if (!isOtherMedia(line) && line.trim().length > 0) kept.push(line);
  }
  const audio = offers.flatMap((offer) => offer.audio.lines);
  return [...kept, ...audio, ...offers.flatMap(variants)].join("\n");
}
