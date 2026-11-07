import { describe, expect, it } from "vitest";
import {
  ClockEstimator,
  initialPlayback,
  parseServerMessage,
  play,
  positionAt,
  REACTIONS,
  Reaction,
  RoomCode,
  sampleFrom,
  seek,
} from "../src/index.ts";

describe("ClockEstimator edge cases", () => {
  it("is neutral before any sample", () => {
    const est = new ClockEstimator();
    expect(est.ready).toBe(false);
    expect(est.size).toBe(0);
    expect(est.offset).toBe(0);
    expect(est.rtt).toBe(0);
    expect(est.toServer(1000)).toBe(1000);
  });

  it("forgets the oldest samples beyond its capacity", () => {
    const est = new ClockEstimator(3);
    for (const offset of [900, 100, 100, 100]) est.add({ offset, rtt: 10 });
    expect(est.size).toBe(3);
    expect(est.offset).toBe(100);
  });

  it("averages the two middle offsets when the best half is even", () => {
    const est = new ClockEstimator();
    est.add({ offset: 10, rtt: 5 });
    est.add({ offset: 20, rtt: 6 });
    est.add({ offset: 500, rtt: 400 });
    est.add({ offset: 600, rtt: 500 });
    expect(est.offset).toBe(15);
  });

  it("converts local time to server time", () => {
    const est = new ClockEstimator();
    est.add(sampleFrom(0, 5020, 40));
    expect(est.toServer(1000)).toBe(6000);
  });

  it("never reports a negative round trip", () => {
    expect(sampleFrom(100, 0, 90).rtt).toBe(0);
  });
});

describe("playback edge cases", () => {
  it("treats a non-finite position as the start", () => {
    expect(seek(initialPlayback(0), 0, Number.NaN).position).toBe(0);
    expect(positionAt(play(initialPlayback(0), 0, Number.POSITIVE_INFINITY), 0)).toBe(0);
  });
});

describe("server messages", () => {
  it("parses known messages and rejects anything else", () => {
    expect(parseServerMessage(JSON.stringify({ type: "pong", t0: 1, ts: 2 }))).toEqual({ type: "pong", t0: 1, ts: 2 });
    expect(parseServerMessage(JSON.stringify({ type: "reaction", by: "m1", emoji: "💀" }))).toEqual({
      type: "reaction",
      by: "m1",
      emoji: "💀",
    });
    expect(parseServerMessage(JSON.stringify({ type: "teleport" }))).toBeNull();
    expect(parseServerMessage("not json")).toBeNull();
  });
});

describe("reactions", () => {
  it("offer ten, from tender to teasing, and only those", () => {
    expect(REACTIONS).toEqual(["❤️", "🥰", "😻", "🥺", "🤭", "😏", "😱", "🫪", "💀", "🤡"]);
    expect(Reaction.safeParse("🔥").success).toBe(false);
    expect(Reaction.safeParse("🫪").success).toBe(true);
  });
});

describe("RoomCode", () => {
  it("accepts only 4 letters from the alphabet", () => {
    expect(RoomCode.safeParse("YWEK").success).toBe(true);
    expect(RoomCode.safeParse("ABCI").success).toBe(false);
    expect(RoomCode.safeParse("ABC").success).toBe(false);
  });
});
