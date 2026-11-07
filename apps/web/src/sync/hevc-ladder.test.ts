import { beforeEach, describe, expect, it } from "vitest";
import { decodesHevc, HEVC_MSE_TYPE, wantsHevcLadder } from "./hevc-ladder.ts";
import { setPlayerChoice } from "./player-choice.ts";

beforeEach(() => localStorage.clear());

const IPAD = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 5 } as Navigator;
const ANDROID_TV = { userAgent: "Mozilla/5.0 (Linux; Android 11; BRAVIA 4K; wv)", maxTouchPoints: 0 } as Navigator;

/** A window whose Media Source takes exactly the types listed. */
function withMediaSource(...types: string[]): typeof globalThis {
  const MediaSource = Object.assign(() => {}, { isTypeSupported: (type: string) => types.includes(type) });
  return { MediaSource } as unknown as typeof globalThis;
}

describe("whether this browser decodes HEVC in Media Source", () => {
  it("asks the Media Source about the ladder's hardest rung, 720p HEVC Main", () => {
    expect(HEVC_MSE_TYPE).toBe('video/mp4; codecs="hvc1.1.6.L93.B0"');
    expect(decodesHevc(withMediaSource(HEVC_MSE_TYPE))).toBe(true);
    expect(decodesHevc(withMediaSource('video/mp4; codecs="avc1.640028"'))).toBe(false);
  });

  it("is no without a Media Source, or one that cannot be asked", () => {
    expect(decodesHevc({} as typeof globalThis)).toBe(false);
    expect(decodesHevc({ MediaSource: class {} } as unknown as typeof globalThis)).toBe(false);
  });
});

describe("who asks for the complete HEVC ladder", () => {
  it("is an iPad that chose our player and decodes HEVC", () => {
    setPlayerChoice("annamour");
    expect(wantsHevcLadder(IPAD, withMediaSource(HEVC_MSE_TYPE))).toBe(true);
  });

  it("is nobody by default: not an iPad on Safari's own player, nor one without HEVC, nor a TV", () => {
    expect(wantsHevcLadder(IPAD, withMediaSource(HEVC_MSE_TYPE))).toBe(false);
    setPlayerChoice("annamour");
    expect(wantsHevcLadder(IPAD, withMediaSource())).toBe(false);
    // The Android TV app may decode HEVC, but plays through hls.js with H.264 only.
    expect(wantsHevcLadder(ANDROID_TV, withMediaSource(HEVC_MSE_TYPE))).toBe(false);
  });
});
