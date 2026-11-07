import { describe, expect, it } from "vitest";
import { AdtsError, cut, joinBytes, OVERLAP_FRAMES, overlapped, splitAdts } from "../src/media/adts.ts";

/** One ADTS frame of `length` bytes (header included), its payload filled with `fill`. */
function frame(length: number, fill: number, rawBlocks = 0): Uint8Array {
  const bytes = new Uint8Array(length).fill(fill);
  bytes[0] = 0xff;
  bytes[1] = 0xf1;
  bytes[2] = 0x50;
  bytes[3] = 0x80 | ((length >> 11) & 0x03);
  bytes[4] = (length >> 3) & 0xff;
  bytes[5] = ((length & 0x07) << 5) | 0x1f;
  bytes[6] = 0xfc | rawBlocks;
  return bytes;
}

const ID3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 2, 0xaa, 0xbb]);

describe("a packed-audio segment", () => {
  it("splits into its ADTS frames", () => {
    const segment = splitAdts(joinBytes([frame(20, 1), frame(31, 2), frame(9, 3)]));
    expect(segment.frames.map((f) => [f.length, f.at(-1)])).toEqual([
      [20, 1],
      [31, 2],
      [9, 3],
    ]);
    expect(segment.id3.length).toBe(0);
  });

  it("keeps its leading ID3 tag (the HLS timestamp) apart", () => {
    const segment = splitAdts(joinBytes([ID3, frame(20, 1)]));
    expect([...segment.id3]).toEqual([...ID3]);
    expect(segment.frames).toHaveLength(1);
  });

  it("refuses what is not plain ADTS, rather than cutting it wrong", () => {
    expect(() => splitAdts(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(AdtsError);
    expect(() => splitAdts(frame(20, 1).subarray(0, 12))).toThrow(AdtsError);
    expect(() => splitAdts(frame(20, 1, 1))).toThrow(/Several AAC frames/);
    expect(() => splitAdts(new Uint8Array([0xff, 0xf1, 0x50]))).toThrow(/Truncated/);
  });
});

describe("re-encoding a segment on the source's timing", () => {
  const frames = (count: number, fill: number) => Array.from({ length: count }, () => frame(10, fill));

  it("encodes it with a few frames of its neighbours around it", () => {
    const input = overlapped(frames(469, 2), frames(469, 1), frames(469, 3));
    expect(input.frames).toHaveLength(469 + 2 * OVERLAP_FRAMES);
    expect(input.frames[0]?.at(-1)).toBe(1);
    expect(input.frames.at(-1)?.at(-1)).toBe(3);
    // The encoder's priming frame, then the previous segment's frames, come first.
    expect(input).toMatchObject({ keepFrom: OVERLAP_FRAMES + 1, count: 469 });
  });

  it("has nothing before the first segment, nor after the last", () => {
    expect(overlapped(frames(3, 2))).toMatchObject({ keepFrom: 1, count: 3 });
    expect(overlapped(frames(3, 2)).frames).toHaveLength(3);
  });

  it("keeps exactly as many frames as the source segment had, from the right place", () => {
    const input = overlapped(frames(5, 2), frames(5, 1), frames(5, 3));
    const encoded = Array.from({ length: input.frames.length + 2 }, (_, i) => frame(10, i));
    const kept = cut(encoded, input);
    expect(kept).toHaveLength(5);
    expect(kept[0]?.at(-1)).toBe(OVERLAP_FRAMES + 1);
  });

  it("fails rather than make a short segment", () => {
    const input = overlapped(frames(5, 2));
    expect(() => cut(frames(3, 0), input)).toThrow(AdtsError);
  });
});
