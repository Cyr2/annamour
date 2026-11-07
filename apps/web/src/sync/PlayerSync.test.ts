import type { PlaybackState } from "@annamour/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerSync, type PlayerSyncState } from "./PlayerSync.ts";
import { FakeClient, FakeVideo } from "./test-doubles.ts";

/** A stand-in for hls.js: records what the player asks of it. */
const hlsCalls = vi.hoisted(() => ({ loaded: [] as string[], supported: true }));
vi.mock("hls.js", () => {
  class FakeHls {
    static isSupported = () => hlsCalls.supported;
    static Events = { ERROR: "error", AUDIO_TRACKS_UPDATED: "audio", FRAG_BUFFERED: "frag" };
    static ErrorTypes = { NETWORK_ERROR: "network", MEDIA_ERROR: "media" };
    audioTracks = [];
    on() {}
    loadSource(src: string) {
      hlsCalls.loaded.push(src);
    }
    attachMedia() {}
    destroy() {}
  }
  return { default: FakeHls };
});

const playing = (position: number, at = 0): PlaybackState => ({ status: "playing", position, at });
const paused = (position: number, at = 0): PlaybackState => ({ status: "paused", position, at });

let video: FakeVideo;
let client: FakeClient;
let states: PlayerSyncState[];
let sync: PlayerSync;

function start(): PlayerSync {
  sync = new PlayerSync(video.asElement(), client.asClient(), (s) => states.push(s));
  sync.setSource("/api/rooms/YWEK/hls/master.m3u8");
  return sync;
}

const lastState = () => states.at(-1);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "Date"] });
  // Safari plays HLS natively: no hls.js to load in tests.
  Object.defineProperty(navigator, "vendor", { value: "Apple Computer, Inc.", configurable: true });
  video = new FakeVideo();
  client = new FakeClient();
  states = [];
});

afterEach(() => {
  sync.destroy();
  vi.useRealTimers();
});

describe("PlayerSync", () => {
  it("plays the source natively on Safari", () => {
    start();
    expect(video.src).toBe("/api/rooms/YWEK/hls/master.m3u8");
    expect(lastState()?.engine).toBe("native");
  });

  it("falls back to hls.js when Safari's own player refuses the stream, instead of a black screen", async () => {
    start();
    video.fire("error");
    await vi.waitFor(() => expect(hlsCalls.loaded).toContain("/api/rooms/YWEK/hls/master.m3u8"));
    expect(lastState()).toMatchObject({ engine: "hls.js", error: null });
  });

  it("sits on the shared position while the room is paused", () => {
    start();
    sync.setPlayback(paused(30));
    expect(video.currentTime).toBe(30);
    expect(video.paused).toBe(true);
    expect(client.sent).toEqual([]);
  });

  it("starts playing at the shared position without echoing a play to the room", () => {
    start();
    sync.setPlayback(playing(10));
    expect(video.paused).toBe(false);
    expect(video.currentTime).toBeGreaterThanOrEqual(10);
    expect(client.of("play")).toEqual([]);
  });

  it("tells the room when the person pauses with the native controls", () => {
    start();
    video.fire("canplay");
    sync.setPlayback(playing(10));
    video.pause();
    expect(client.of("pause")).toHaveLength(1);
    expect(client.of("pause")[0]?.position).toBeCloseTo(video.currentTime);
  });

  it("nudges the rate for a small drift and seeks for a large one", () => {
    start();
    sync.setPlayback(playing(10));
    // Let the start-up seek settle, then fall 0.3 s behind.
    client.now = 2000;
    video.currentTime = 11.7;
    vi.advanceTimersByTime(1600);
    client.now = 2000;
    video.currentTime = 11.7;
    vi.advanceTimersByTime(500);
    expect(video.playbackRate).toBeGreaterThan(1);
    expect(video.playbackRate).toBeLessThanOrEqual(1.05);

    video.currentTime = 8;
    vi.advanceTimersByTime(500);
    expect(video.currentTime).toBeGreaterThan(11.9);
    expect(video.playbackRate).toBe(1);
  });

  it("catches up by speed rather than jumping past what is downloaded", () => {
    start();
    sync.setPlayback(playing(10));
    client.now = 2000;
    vi.advanceTimersByTime(1600);
    // 5 s behind, and the shared position is not downloaded yet.
    video.currentTime = 7;
    video.bufferedRanges = [[0, 9]];
    vi.advanceTimersByTime(500);
    expect(video.currentTime).toBe(7);
    expect(video.playbackRate).toBe(1.05);
  });

  it("reports a lasting stall with where it is stuck, then reports it is ready", () => {
    start();
    sync.setPlayback(playing(10));
    video.readyState = 2;
    video.fire("waiting");
    vi.advanceTimersByTime(2100);
    expect(client.of("buffering")).toEqual([{ type: "buffering", buffering: true, position: video.currentTime }]);
    expect(lastState()?.buffering).toBe(true);

    video.readyState = 4;
    video.fire("canplay");
    vi.advanceTimersByTime(500);
    expect(client.of("buffering").at(-1)).toEqual({ type: "buffering", buffering: false });
  });

  it("keeps a short stall to itself instead of pausing the room", () => {
    start();
    sync.setPlayback(playing(10));
    video.readyState = 2;
    video.fire("waiting");
    vi.advanceTimersByTime(1000);
    video.readyState = 4;
    video.fire("canplay");
    vi.advanceTimersByTime(3000);
    expect(client.of("buffering")).toEqual([]);
  });

  it("holds the room until a real lead is downloaded, not just the first frames", () => {
    start();
    sync.setPlayback(playing(10));
    video.readyState = 2;
    video.fire("waiting");
    vi.advanceTimersByTime(2100);
    // The room waits; the first frames come back but barely anything is downloaded ahead.
    sync.setPlayback(paused(video.currentTime));
    video.bufferedRanges = [[0, video.currentTime + 3]];
    video.readyState = 4;
    video.fire("canplay");
    vi.advanceTimersByTime(2000);
    expect(client.of("buffering").filter((m) => !m.buffering)).toEqual([]);

    video.bufferedRanges = [[0, video.currentTime + 20]];
    vi.advanceTimersByTime(1000);
    expect(client.of("buffering").at(-1)).toEqual({ type: "buffering", buffering: false });
  });

  it("reports buffering again after a reconnection, since the server forgot it", () => {
    start();
    sync.setPlayback(playing(10));
    video.readyState = 2;
    video.fire("waiting");
    vi.advanceTimersByTime(2100);
    client.reopen();
    vi.advanceTimersByTime(2100);
    expect(client.of("buffering").filter((m) => m.buffering)).toHaveLength(2);
  });

  it("waits for a tap when the browser blocks autoplay, then retries", async () => {
    video.refusePlay = true;
    start();
    sync.setPlayback(playing(10));
    await vi.advanceTimersByTimeAsync(0);
    expect(lastState()?.blocked).toBe(true);

    video.refusePlay = false;
    sync.unlock();
    await vi.advanceTimersByTimeAsync(0);
    expect(lastState()?.blocked).toBe(false);
    expect(video.paused).toBe(false);
  });

  it("sends a seek the person made, but not its own corrections", () => {
    start();
    video.fire("canplay");
    sync.setPlayback(paused(30));
    vi.advanceTimersByTime(5100);
    video.userSeek(100);
    expect(client.of("seek")).toEqual([{ type: "seek", position: 100 }]);
  });

  it("applies the person's intents at once and reports when offline", () => {
    start();
    sync.setPlayback(paused(30));
    expect(sync.play()).toBe(true);
    expect(video.paused).toBe(false);
    expect(sync.seek(50)).toBe(true);
    expect(client.of("seek")).toEqual([{ type: "seek", position: 50 }]);
    expect(sync.pause()).toBe(true);
    expect(video.paused).toBe(true);

    client.online = false;
    expect(sync.play()).toBe(false);
    expect(sync.pause()).toBe(false);
    expect(sync.seek(10)).toBe(false);
  });

  it("switches to the chosen audio language on Safari", () => {
    const tracks = [
      { label: "Français", language: "fr", enabled: true },
      { label: "English", language: "en", enabled: false },
    ];
    Object.defineProperty(video, "audioTracks", { value: tracks });
    start();
    sync.selectAudio({ id: "en", label: "English", language: "en" });
    expect(tracks.map((t) => t.enabled)).toEqual([false, true]);
  });

  it("drops the source when it goes away", () => {
    start();
    sync.setSource(null);
    expect(video.src).toBe("");
    expect(lastState()?.engine).toBeNull();
  });

  it("says plainly when neither Safari nor hls.js can read the video", async () => {
    hlsCalls.supported = false;
    start();
    video.fire("error");
    await vi.waitFor(() => expect(video.src).toBe("/api/rooms/YWEK/hls/master.m3u8"));
    video.fire("error");
    expect(lastState()?.error).toMatch(/ne se lit pas sur cet appareil/);
    hlsCalls.supported = true;
  });
});
