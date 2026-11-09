import type { PlaybackReport } from "@annamour/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beaconSender, PlaybackStats } from "./playback-stats.ts";
import { type RoomState, waitingForOthers } from "./room.ts";
import { FakeVideo } from "./test-doubles.ts";

let video: FakeVideo & { videoHeight: number };
let playing: boolean;
let waiting: boolean;
let sent: PlaybackReport[];
let stats: PlaybackStats;

function start(name: string | null = "Anna") {
  stats = new PlaybackStats({
    video: video.asElement(),
    roomPlaying: () => playing,
    waitingForOthers: () => waiting,
    name: () => name,
    engine: () => "native",
    device: "iPhone",
    send: (report) => sent.push(report),
    viewingId: "viewing-0001",
  });
  return stats;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
  video = Object.assign(new FakeVideo(), { videoHeight: 480 });
  video.paused = false;
  playing = true;
  waiting = false;
  sent = [];
});

afterEach(() => {
  stats.destroy();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("measuring how the film plays", () => {
  it("counts the time watched at each picture height while the séance plays", () => {
    start();
    vi.advanceTimersByTime(4000);
    video.videoHeight = 720;
    vi.advanceTimersByTime(2000);
    expect(stats.report()).toMatchObject({
      watchedSeconds: 6,
      heights: [
        { height: 480, seconds: 4 },
        { height: 720, seconds: 2 },
      ],
    });
  });

  it("counts nothing while the séance is paused", () => {
    playing = false;
    start();
    vi.advanceTimersByTime(10_000);
    expect(stats.report()).toBeNull();
  });

  it("counts a freeze and how long it lasted, but not a short hiccup nor a seek", () => {
    start();
    video.readyState = 2;
    video.fire("waiting");
    vi.advanceTimersByTime(3000);
    video.readyState = 4;
    video.fire("playing");

    video.fire("waiting");
    vi.advanceTimersByTime(100);
    video.fire("playing");

    video.seeking = true;
    video.readyState = 2;
    video.fire("waiting");
    vi.advanceTimersByTime(2000);
    video.seeking = false;
    video.readyState = 4;
    video.fire("playing");

    expect(stats.report()).toMatchObject({ stallCount: 1, stallSeconds: 3 });
  });

  it("measures how long the picture took to start once the séance played", () => {
    playing = false;
    start();
    playing = true;
    stats.roomStarted();
    vi.advanceTimersByTime(1500);
    video.fire("playing");
    vi.advanceTimersByTime(2000);
    expect(stats.report()?.startupMs).toBe(1500);
  });

  it("sends its report every minute and when the page goes away, only when it changed", () => {
    start();
    vi.advanceTimersByTime(60_000);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ viewingId: "viewing-0001", name: "Anna", device: "iPhone", engine: "native" });
    playing = false;
    vi.advanceTimersByTime(60_000);
    const settled = sent.length;
    vi.advanceTimersByTime(60_000);
    expect(sent).toHaveLength(settled);
    playing = true;
    vi.advanceTimersByTime(2000);
    window.dispatchEvent(new Event("pagehide"));
    expect(sent).toHaveLength(settled + 1);
  });

  it("says nothing before the séance knows who we are", () => {
    start(null);
    vi.advanceTimersByTime(60_000);
    expect(sent).toEqual([]);
  });
});

describe("the finer measures", () => {
  it("keeps how much is downloaded ahead while playing, in buckets, and its middle value", () => {
    video.currentTime = 100;
    video.bufferedRanges = [
      [0, 50],
      [99.9, 103],
    ];
    start();
    vi.advanceTimersByTime(2000);
    video.bufferedRanges = [[90, 400]];
    vi.advanceTimersByTime(4000);
    expect(stats.report()).toMatchObject({ leadSeconds: [2, 0, 0, 0, 0, 4], leadMedian: 300 });
  });

  it("counts a picture that sits outside every downloaded range as no lead at all", () => {
    video.currentTime = 600;
    start();
    video.bufferedRanges = [[0, 50]];
    vi.advanceTimersByTime(2000);
    expect(stats.report()).toMatchObject({ leadSeconds: [2, 0, 0, 0, 0, 0], leadMedian: 0 });
  });

  it("leaves the lead out before anything played", () => {
    start();
    video.readyState = 2;
    video.fire("waiting");
    vi.advanceTimersByTime(2000);
    const report = stats.report();
    expect(report?.stallCount).toBe(1);
    expect(report).not.toHaveProperty("leadSeconds");
    expect(report).not.toHaveProperty("leadMedian");
  });

  it("counts each change of picture height while playing", () => {
    start();
    vi.advanceTimersByTime(2000);
    video.videoHeight = 234;
    vi.advanceTimersByTime(4000);
    video.videoHeight = 0;
    vi.advanceTimersByTime(2000);
    video.videoHeight = 480;
    vi.advanceTimersByTime(2000);
    expect(stats.report()?.qualitySwitches).toBe(2);
  });

  it("does not count a change made while paused until the picture plays again", () => {
    start();
    vi.advanceTimersByTime(2000);
    video.paused = true;
    video.videoHeight = 720;
    vi.advanceTimersByTime(2000);
    expect(stats.report()?.qualitySwitches).toBe(0);
  });

  it("keeps the time spent waiting for someone else apart from its own freezes", () => {
    start();
    vi.advanceTimersByTime(2000);
    playing = false;
    waiting = true;
    vi.advanceTimersByTime(64_000);
    waiting = false;
    vi.advanceTimersByTime(10_000);
    expect(stats.report()).toMatchObject({ waitSeconds: 64, stallCount: 0, watchedSeconds: 2 });
  });

  it("tells a freeze right after a seek from one that came on its own", () => {
    start();
    video.fire("seeking");
    video.fire("seeked");
    vi.advanceTimersByTime(1000);
    video.readyState = 2;
    video.fire("waiting");
    vi.advanceTimersByTime(1000);
    video.readyState = 4;
    video.fire("playing");

    vi.advanceTimersByTime(10_000);
    video.readyState = 2;
    video.fire("waiting");
    vi.advanceTimersByTime(1000);
    video.readyState = 4;
    video.fire("playing");

    expect(stats.report()).toMatchObject({ stallCount: 2, afterSeekStallCount: 1 });
  });
});

describe("waiting for someone else", () => {
  const room = (overrides: Partial<RoomState>): RoomState => ({
    status: "open",
    you: "me",
    room: null,
    members: [],
    playback: { status: "paused", position: 10, at: 0 },
    lastEvent: { action: "wait", by: "leo", seq: 1 },
    roomEvent: null,
    error: null,
    readying: null,
    ...overrides,
  });

  it("is when the séance stands paused for someone else's loading", () => {
    expect(waitingForOthers(room({}))).toBe(true);
  });

  it("is not when this device caused the wait, nor after a pause or once playing again", () => {
    expect(waitingForOthers(room({ lastEvent: { action: "wait", by: "me", seq: 1 } }))).toBe(false);
    expect(waitingForOthers(room({ lastEvent: { action: "wait", by: undefined, seq: 1 } }))).toBe(false);
    expect(waitingForOthers(room({ lastEvent: { action: "pause", by: "leo", seq: 2 } }))).toBe(false);
    expect(waitingForOthers(room({ playback: { status: "playing", position: 10, at: 0 } }))).toBe(false);
    expect(waitingForOthers(room({ playback: null, lastEvent: null }))).toBe(false);
  });
});

describe("sending a report", () => {
  const report = { viewingId: "viewing-0001" } as PlaybackReport;

  it("uses a beacon, which survives the page closing", () => {
    const beacon = vi.fn(() => true);
    vi.stubGlobal("navigator", { sendBeacon: beacon });
    beaconSender("ABCD")(report);
    expect(beacon).toHaveBeenCalledWith("/api/rooms/ABCD/stats", expect.any(Blob));
  });

  it("falls back to a fetch that outlives the page when no beacon goes", () => {
    vi.stubGlobal("navigator", { sendBeacon: () => false });
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    beaconSender("ABCD")(report);
    expect(fetchMock).toHaveBeenCalledWith("/api/rooms/ABCD/stats", expect.objectContaining({ keepalive: true }));
  });
});
