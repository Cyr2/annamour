import type { PlaybackReport } from "@annamour/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beaconSender, PlaybackStats } from "./playback-stats.ts";
import { FakeVideo } from "./test-doubles.ts";

let video: FakeVideo & { videoHeight: number };
let playing: boolean;
let sent: PlaybackReport[];
let stats: PlaybackStats;

function start(name: string | null = "Anna") {
  stats = new PlaybackStats({
    video: video.asElement(),
    roomPlaying: () => playing,
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
