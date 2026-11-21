import { describe, expect, it } from "vitest";
import { type CueTimes, formatOffset, shiftCues, steppedOffset } from "./subtitle-settings.ts";

describe("subtitle offset", () => {
  it("moves by half seconds and stops at ten seconds either way", () => {
    expect(steppedOffset(0, 1)).toBe(0.5);
    expect(steppedOffset(0.5, -2)).toBe(-0.5);
    expect(steppedOffset(9.5, 3)).toBe(10);
    expect(steppedOffset(-10, -1)).toBe(-10);
    expect(steppedOffset(0.5, -1)).toBe(0);
    expect(Object.is(steppedOffset(-0.5, 1), 0)).toBe(true);
  });

  it("snaps a stray value back onto the half-second grid", () => {
    expect(steppedOffset(1.3, 0)).toBe(1.5);
    expect(steppedOffset(42, 0)).toBe(10);
  });

  it("reads « +1,5 s », « −2 s », « 0 s »", () => {
    expect(formatOffset(1.5)).toBe("+1,5 s");
    expect(formatOffset(-2)).toBe("−2 s");
    expect(formatOffset(0)).toBe("0 s");
  });
});

describe("shifting cues", () => {
  it("shifts from the original times, so changing the offset twice never drifts", () => {
    const cue = { startTime: 10, endTime: 12 };
    const originals = new WeakMap<CueTimes, CueTimes>();
    shiftCues([cue], 1.5, originals);
    expect(cue).toEqual({ startTime: 11.5, endTime: 13.5 });
    shiftCues([cue], -1, originals);
    expect(cue).toEqual({ startTime: 9, endTime: 11 });
    shiftCues([cue], 0, originals);
    expect(cue).toEqual({ startTime: 10, endTime: 12 });
  });

  it("gives cues loaded later the same offset, and never a time before the start", () => {
    const originals = new WeakMap<CueTimes, CueTimes>();
    const first = { startTime: 1, endTime: 2 };
    shiftCues([first], -5, originals);
    const later = { startTime: 30, endTime: 31 };
    shiftCues([first, later], -5, originals);
    expect(first).toEqual({ startTime: 0, endTime: 0 });
    expect(later).toEqual({ startTime: 25, endTime: 26 });
  });

  it("ignores a track whose cues are not loaded yet", () => {
    expect(() => shiftCues(null, 2, new WeakMap<CueTimes, CueTimes>())).not.toThrow();
  });
});
