/**
 * Where a packed-audio segment (raw ADTS `.aac`) sits on the film's clock.
 *
 * Unlike MPEG-TS, raw AAC carries no timestamps: HLS puts the segment's
 * start in an ID3 tag before the audio, a PRIV frame owned by
 * `com.apple.streaming.transportStreamTimestamp` holding a 33-bit MPEG-TS
 * PTS (90 kHz). Players use it to line the audio up with the video; any
 * audio we re-encode has to keep that clock.
 */
const OWNER = "com.apple.streaming.transportStreamTimestamp";
const PTS_HZ = 90_000;

/** A 28-bit "syncsafe" integer (7 bits per byte), as ID3v2 sizes are written. */
function syncsafe(bytes: Uint8Array, at: number): number {
  return ((bytes[at] ?? 0) << 21) | ((bytes[at + 1] ?? 0) << 14) | ((bytes[at + 2] ?? 0) << 7) | (bytes[at + 3] ?? 0);
}

function bigEndian(bytes: Uint8Array, at: number, length: number): number {
  let value = 0;
  for (let i = 0; i < length; i++) value = value * 256 + (bytes[at + i] ?? 0);
  return value;
}

/** The segment's start in seconds, from its leading ID3 tag; undefined when it has none. */
export function id3Timestamp(bytes: Uint8Array): number | undefined {
  if (bytes.length < 10 || String.fromCharCode(...bytes.subarray(0, 3)) !== "ID3") return undefined;
  const version = bytes[3] ?? 0;
  const end = 10 + syncsafe(bytes, 6);
  for (let at = 10; at + 10 <= Math.min(end, bytes.length); ) {
    const id = String.fromCharCode(...bytes.subarray(at, at + 4));
    // ID3v2.4 frame sizes are syncsafe; v2.3 ones are plain big-endian.
    const size = version >= 4 ? syncsafe(bytes, at + 4) : bigEndian(bytes, at + 4, 4);
    if (size <= 0) return undefined;
    const body = bytes.subarray(at + 10, at + 10 + size);
    if (id === "PRIV" && String.fromCharCode(...body.subarray(0, OWNER.length)) === OWNER) {
      // Owner, a NUL, then 8 bytes of which the low 33 bits are the PTS.
      const raw = body.subarray(OWNER.length + 1, OWNER.length + 9);
      if (raw.length < 8) return undefined;
      const pts = ((raw[3] ?? 0) & 0x01) * 2 ** 32 + bigEndian(raw, 4, 4);
      return pts / PTS_HZ;
    }
    at += 10 + size;
  }
  return undefined;
}
