import { describe, expect, it } from "vitest";
import {
  ClockEstimator,
  correct,
  generateRoomCode,
  initialPlayback,
  isRoomCode,
  normalizeRoomCode,
  parseClientMessage,
  pause,
  play,
  positionAt,
  sampleFrom,
  seek,
} from "../src/index.ts";

describe("playback", () => {
  it("advances only while playing", () => {
    const paused = initialPlayback(1000);
    expect(positionAt(paused, 9000)).toBe(0);
    const playing = play(paused, 1000, 10);
    expect(positionAt(playing, 3500)).toBeCloseTo(12.5);
    const stopped = pause(playing, 3500);
    expect(positionAt(stopped, 99_000)).toBeCloseTo(12.5);
  });

  it("keeps status on seek and never goes negative", () => {
    const playing = play(initialPlayback(0), 0, 5);
    const sought = seek(playing, 1000, 120);
    expect(sought.status).toBe("playing");
    expect(positionAt(sought, 2000)).toBeCloseTo(121);
    expect(seek(playing, 0, -4).position).toBe(0);
  });
});

describe("clock", () => {
  it("recovers a fixed offset despite asymmetric noise", () => {
    const est = new ClockEstimator();
    const trueOffset = 5000;
    const rtts = [40, 300, 35, 500, 38, 42, 250, 36];
    let t = 0;
    for (const rtt of rtts) {
      const t0 = t;
      const t1 = t0 + rtt;
      // slow samples are asymmetric: the server answered late in the trip
      const skew = rtt > 100 ? rtt * 0.4 : 0;
      const ts = t0 + rtt / 2 + trueOffset + skew;
      est.add(sampleFrom(t0, ts, t1));
      t += 1000;
    }
    expect(est.ready).toBe(true);
    expect(Math.abs(est.offset - trueOffset)).toBeLessThan(5);
    expect(est.rtt).toBe(35);
  });
});

describe("drift", () => {
  it("ignores tiny drift, nudges small drift, seeks large drift", () => {
    expect(correct(10, 10.03).kind).toBe("none");
    const ahead = correct(10, 10.3);
    expect(ahead.kind).toBe("nudge");
    expect(ahead.rate).toBeGreaterThan(1);
    expect(ahead.rate).toBeLessThanOrEqual(1.05);
    expect(correct(10, 9.7).rate).toBeLessThan(1);
    expect(correct(10, 14)).toEqual({ kind: "seek", to: 14, rate: 1 });
  });
});

describe("room codes", () => {
  it("generates valid codes and normalizes input", () => {
    for (let i = 0; i < 200; i++) expect(isRoomCode(generateRoomCode())).toBe(true);
    expect(normalizeRoomCode("ab c-d")).toBe("ABCD");
    expect(normalizeRoomCode("io01")).toBe("");
    expect(isRoomCode("ABCI")).toBe(false);
  });
});

describe("messages", () => {
  it("accepts valid and rejects malformed messages", () => {
    expect(parseClientMessage(JSON.stringify({ type: "seek", position: 42 }))).toEqual({ type: "seek", position: 42 });
    expect(parseClientMessage(JSON.stringify({ type: "seek", position: -1 }))).toBeNull();
    expect(parseClientMessage("{not json")).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "react", emoji: "🍿" }))).toEqual({ type: "react", emoji: "🍿" });
    expect(parseClientMessage(JSON.stringify({ type: "react", emoji: "🍆" }))).toBeNull();
    expect(
      parseClientMessage(JSON.stringify({ type: "hello", clientId: "abcdefgh", name: "  ", color: "peach" })),
    ).toBeNull();
  });
});
