/**
 * Packed-audio HLS segments (raw ADTS `.aac`): split into frames, so a lighter
 * re-encode can keep exactly the source's frames, hence its timing.
 *
 * Encoding a 10 s segment on its own shifts it: the AAC encoder starts with a
 * priming frame and needs the neighbouring audio to reconstruct the edges
 * (each frame overlaps the next). So each segment is encoded with a few frames
 * of the previous and next ones around it, and the result is cut back to the
 * same number of frames, on the same sample grid, as the source segment.
 */

export class AdtsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdtsError";
  }
}

export interface AdtsSegment {
  /** A leading ID3 tag (HLS's timestamp), kept as is; empty when the source has none. */
  id3: Uint8Array;
  frames: Uint8Array[];
}

/** Frames of the neighbouring segments encoded around each one. */
export const OVERLAP_FRAMES = 4;
/** The native AAC encoder starts every stream with one frame of priming (initial_padding = 1024). */
export const PRIMING_FRAMES = 1;

function id3Length(bytes: Uint8Array): number {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0;
  const size = ((bytes[6] ?? 0) << 21) | ((bytes[7] ?? 0) << 14) | ((bytes[8] ?? 0) << 7) | (bytes[9] ?? 0);
  const footer = ((bytes[5] ?? 0) & 0x10) !== 0 ? 10 : 0;
  return 10 + size + footer;
}

/** How a packed-audio segment is really stored, whatever its name says. */
export type AudioContainer = "adts" | "mpegts" | "other";

const TS_PACKET = 188;

/** ADTS (after an optional ID3 tag), MPEG-TS (sync byte every 188 bytes), or something we do not handle. */
export function audioContainer(bytes: Uint8Array): AudioContainer {
  const at = id3Length(bytes);
  if (bytes[at] === 0xff && ((bytes[at + 1] ?? 0) & 0xf0) === 0xf0) return "adts";
  if (bytes[0] === 0x47 && (bytes.length <= TS_PACKET || bytes[TS_PACKET] === 0x47)) return "mpegts";
  return "other";
}

/** The ADTS frame starting at `at`. */
function frameAt(bytes: Uint8Array, at: number): Uint8Array {
  if (bytes[at] !== 0xff || ((bytes[at + 1] ?? 0) & 0xf0) !== 0xf0) throw new AdtsError(`No ADTS frame at ${at}`);
  if (at + 7 > bytes.length) throw new AdtsError("Truncated ADTS header");
  const length = (((bytes[at + 3] ?? 0) & 0x03) << 11) | ((bytes[at + 4] ?? 0) << 3) | ((bytes[at + 5] ?? 0) >> 5);
  // One AAC frame per ADTS frame: what segment players and our cutting expect.
  if (((bytes[at + 6] ?? 0) & 0x03) !== 0) throw new AdtsError("Several AAC frames in one ADTS frame");
  if (length < 7 || at + length > bytes.length) throw new AdtsError(`Bad ADTS frame length at ${at}`);
  return bytes.subarray(at, at + length);
}

/** Splits a segment into its ID3 tag and ADTS frames; refuses anything that is not plain ADTS. */
export function splitAdts(bytes: Uint8Array): AdtsSegment {
  const start = id3Length(bytes);
  const frames: Uint8Array[] = [];
  for (let at = start; at < bytes.length; at += frames.at(-1)?.length ?? 0) frames.push(frameAt(bytes, at));
  return { id3: bytes.subarray(0, start), frames };
}

export function joinBytes(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export interface OverlappedInput {
  /** What to encode: the segment's frames with some of its neighbours' around them. */
  frames: Uint8Array[];
  /** Index, in the encoded output, of the segment's first frame. */
  keepFrom: number;
  /** How many frames the segment has, so how many to keep. */
  count: number;
}

export function overlapped(
  current: readonly Uint8Array[],
  previous: readonly Uint8Array[] = [],
  next: readonly Uint8Array[] = [],
): OverlappedInput {
  const before = previous.slice(-OVERLAP_FRAMES);
  return {
    frames: [...before, ...current, ...next.slice(0, OVERLAP_FRAMES)],
    keepFrom: before.length + PRIMING_FRAMES,
    count: current.length,
  };
}

/** The encoded frames that stand for the segment, as many as the source had. */
export function cut(encoded: readonly Uint8Array[], { keepFrom, count }: OverlappedInput): Uint8Array[] {
  if (encoded.length < keepFrom + count) {
    throw new AdtsError(`Encoder gave ${encoded.length} frames, ${keepFrom + count} needed`);
  }
  return encoded.slice(keepFrom, keepFrom + count);
}
