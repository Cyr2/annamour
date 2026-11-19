import { describe, expect, it } from "vitest";
import { standingStill } from "./youtube-ad-rules.ts";

const playing = (time: number) => ({ paused: false, time });

describe("« Une pub ? Toucher YouTube »", () => {
  it("is offered when the video should play but stands still for a few seconds", () => {
    expect(standingStill([playing(10), playing(10), playing(10), playing(10)])).toBe(true);
  });

  it("is not offered while the video moves, is paused, or not for long", () => {
    expect(standingStill([playing(10), playing(11), playing(12), playing(13)])).toBe(false);
    expect(standingStill([playing(10), { paused: true, time: 10 }, playing(10), playing(10)])).toBe(false);
    expect(standingStill([playing(10), playing(10)])).toBe(false);
  });
});
