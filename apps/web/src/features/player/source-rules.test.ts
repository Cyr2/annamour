import type { Media } from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { hasTracks, isLive, sourceOffers } from "./source-rules.ts";

const film: Media = { title: "Dune", src: "/api/rooms/X/e/0/hls/master.m3u8", audio: [], subtitles: [] };
const youtube = (live: boolean): Media => ({ ...film, src: "", youtube: { videoId: "dQw4w9WgXcQ", live } });

describe("what the player offers for what plays", () => {
  it("turns a YouTube live stream into « En direct », not a video", () => {
    expect(isLive(youtube(true))).toBe(true);
    expect(isLive(youtube(false))).toBe(false);
    expect(isLive(film)).toBe(false);
    expect(isLive(undefined)).toBe(false);
  });

  it("offers « Audio et sous-titres » for our own player as before, never for YouTube's", () => {
    expect(hasTracks(youtube(false))).toBe(false);
    expect(hasTracks(film)).toBe(true);
    expect(hasTracks(undefined)).toBe(false);
  });
});

describe("the player's offers", () => {
  const actions = { setTracksOpen: () => {}, setUpNextOpen: () => {}, skipNext: () => {} };

  it("leave out the queue and « Épisode suivant » during a live stream", () => {
    const live = sourceOffers(youtube(true), actions);
    expect(live).toMatchObject({ live: true, openUpNext: undefined, skipToNext: undefined, openTracks: undefined });
    const video = sourceOffers(film, actions);
    expect(video.live).toBe(false);
    expect(video.openUpNext).toBeTypeOf("function");
    expect(video.skipToNext).toBe(actions.skipNext);
  });
});
