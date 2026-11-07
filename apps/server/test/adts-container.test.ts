import { describe, expect, it } from "vitest";
import { audioContainer } from "../src/media/adts.ts";

describe("what a packed-audio segment really is", () => {
  it("recognises ADTS, with or without its ID3 timestamp", () => {
    expect(audioContainer(new Uint8Array([0xff, 0xf1, 0x50, 0x80]))).toBe("adts");
    const id3 = [0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 2, 0xaa, 0xbb];
    expect(audioContainer(new Uint8Array([...id3, 0xff, 0xf1]))).toBe("adts");
  });

  it("recognises MPEG-TS whatever its name, by its sync byte every 188 bytes", () => {
    const ts = new Uint8Array(376);
    ts[0] = 0x47;
    ts[188] = 0x47;
    expect(audioContainer(ts)).toBe("mpegts");
    expect(audioContainer(new Uint8Array([0x47, 0x40]))).toBe("mpegts");
  });

  it("refuses anything else rather than guess", () => {
    const notTs = new Uint8Array(376);
    notTs[0] = 0x47;
    expect(audioContainer(notTs)).toBe("other");
    expect(audioContainer(new TextEncoder().encode("....ftypiso6"))).toBe("other");
  });
});
