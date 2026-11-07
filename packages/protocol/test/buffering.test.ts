import { describe, expect, it } from "vitest";
import { bufferedAhead, RESUME_LEAD, readyToResume } from "../src/buffering.ts";

describe("buffered lead", () => {
  it("measures what is downloaded past the position, in the range that holds it", () => {
    const ranges = [
      [0, 30],
      [100, 160],
    ] as const;
    expect(bufferedAhead(ranges, 10)).toBe(20);
    expect(bufferedAhead(ranges, 120)).toBe(40);
    expect(bufferedAhead(ranges, 50)).toBe(0);
    expect(bufferedAhead([], 0)).toBe(0);
  });

  it("tolerates a position a hair before the start of a range", () => {
    expect(bufferedAhead([[10, 25]], 9.9)).toBeCloseTo(15.1);
  });
});

describe("resuming after a wait", () => {
  it("waits for a real lead rather than the first frames", () => {
    expect(readyToResume(2, 3600)).toBe(false);
    expect(readyToResume(RESUME_LEAD, 3600)).toBe(true);
  });

  it("does not wait for more than is left of the video", () => {
    expect(readyToResume(4.5, 5)).toBe(true);
    expect(readyToResume(0, 0.2)).toBe(true);
  });
});
