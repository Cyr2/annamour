import { describe, expect, it } from "vitest";
import { type MediaFlags, nearestRate, onYouTubeState, qualityHeight, YT_STATE } from "./youtube-events.ts";

const paused: MediaFlags = { paused: true, ended: false, seeking: false, readyState: 0 };

describe("YouTube's player, heard as a <video>", () => {
  it("is ready once its video is cued", () => {
    const { flags, events } = onYouTubeState(paused, YT_STATE.cued);
    expect(flags).toMatchObject({ paused: true, readyState: 4 });
    expect(events).toEqual(["loadedmetadata", "canplay"]);
  });

  it("plays, waits for data, plays on, then pauses", () => {
    const playing = onYouTubeState({ ...paused, readyState: 4 }, YT_STATE.playing);
    expect(playing.events).toEqual(["play", "playing", "canplay"]);
    const waiting = onYouTubeState(playing.flags, YT_STATE.buffering);
    expect(waiting).toMatchObject({ flags: { readyState: 2, paused: false }, events: ["waiting"] });
    expect(onYouTubeState(waiting.flags, YT_STATE.playing).events).toEqual(["playing", "canplay"]);
    expect(onYouTubeState(playing.flags, YT_STATE.paused).events).toEqual(["pause"]);
  });

  it("says a seek has landed once it plays or pauses again", () => {
    const seeking = { ...paused, seeking: true, readyState: 4 };
    const landed = onYouTubeState(seeking, YT_STATE.paused);
    expect(landed.flags.seeking).toBe(false);
    expect(landed.events).toEqual(["seeked"]);
  });

  it("ends paused", () => {
    const { flags, events } = onYouTubeState({ ...paused, paused: false, readyState: 4 }, YT_STATE.ended);
    expect(flags).toMatchObject({ ended: true, paused: true });
    expect(events).toEqual(["pause", "ended"]);
  });

  it("tells its picture's height and the nearest speed it accepts", () => {
    expect(qualityHeight("hd1080")).toBe(1080);
    expect(qualityHeight("auto")).toBe(0);
    expect(nearestRate(1.04, [0.75, 1, 1.25])).toBe(1);
    expect(nearestRate(1.2, [0.75, 1, 1.25])).toBe(1.25);
    expect(nearestRate(1.04, [])).toBe(1);
  });
});
