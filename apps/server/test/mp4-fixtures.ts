/* Tiny hand-built MP4 boxes, to test HEVC init/segment handling without an encoder. */

export function box(type: string, ...children: Uint8Array[]): Uint8Array {
  const size = 8 + children.reduce((sum, child) => sum + child.length, 0);
  const out = new Uint8Array(size);
  new DataView(out.buffer).setUint32(0, size);
  out.set(new TextEncoder().encode(type), 4);
  let at = 8;
  for (const child of children) {
    out.set(child, at);
    at += child.length;
  }
  return out;
}

const bytes = (...values: number[]) => new Uint8Array(values);

/** An hvcC for HEVC Main (profile 1, compatibility 0x60000000), tier/level as given. */
export function hvcC(level = 90, highTier = false): Uint8Array {
  return box(
    "hvcC",
    bytes(1, highTier ? 0x21 : 0x01, 0x60, 0x00, 0x00, 0x00, 0xb0, 0, 0, 0, 0, 0, level, 0xf0, 0x00, 0xfc),
  );
}

/** An init segment: ftyp + moov with one HEVC (hvc1) video track. */
export function hevcInit(level = 90, highTier = false): Uint8Array {
  const sampleEntry = box("hvc1", new Uint8Array(78), hvcC(level, highTier));
  const stsd = box("stsd", bytes(0, 0, 0, 0, 0, 0, 0, 1), sampleEntry);
  const moov = box("moov", box("trak", box("mdia", box("minf", box("stbl", stsd)))));
  return new Uint8Array([...box("ftyp", new TextEncoder().encode("iso6")), ...moov]);
}

/** One fragment (moof with a tfdt + mdat) starting at `decodeTime`. */
export function fragment(decodeTime: number, version: 0 | 1 = 0, payload = 4): Uint8Array {
  const tfdtBody = new Uint8Array(version === 1 ? 12 : 8);
  const view = new DataView(tfdtBody.buffer);
  view.setUint8(0, version);
  if (version === 1) view.setBigUint64(4, BigInt(decodeTime));
  else view.setUint32(4, decodeTime);
  const moof = box("moof", box("traf", box("tfdt", tfdtBody)));
  return new Uint8Array([...moof, ...box("mdat", new Uint8Array(payload))]);
}

/** A whole fragmented MP4, as one of our encodes produces it. */
export function hevcMp4(decodeTime: number, level = 90): Uint8Array {
  return new Uint8Array([...hevcInit(level), ...fragment(decodeTime)]);
}
