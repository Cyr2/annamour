import type { PlaybackState } from "@annamour/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerSync, type PlayerSyncState } from "./PlayerSync.ts";
import { FakeClient, FakeVideo } from "./test-doubles.ts";

/** A stand-in for hls.js: records what the player asks of it. */
const hlsCalls = vi.hoisted(() => ({
  loaded: [] as string[],
  supported: true,
  recovered: 0,
  /** The latest hls.js instance's handlers, by event. */
  handlers: new Map<string, (event: string, data: unknown) => void>(),
}));
vi.mock("hls.js", () => {
  class FakeHls {
    static isSupported = () => hlsCalls.supported;
    static Events = { ERROR: "error", AUDIO_TRACKS_UPDATED: "audio", FRAG_BUFFERED: "frag" };
    static ErrorTypes = { NETWORK_ERROR: "network", MEDIA_ERROR: "media" };
    audioTracks = [];
    on(event: string, handler: (event: string, data: unknown) => void) {
      hlsCalls.handlers.set(event, handler);
    }
    loadSource(src: string) {
      hlsCalls.loaded.push(src);
    }
    attachMedia() {}
    recoverMediaError() {
      hlsCalls.recovered++;
    }
    startLoad() {}
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

/** Our player (hls.js), which keeps downloading while paused: the one that tells the room its lead. */
async function startOwnPlayer(): Promise<PlayerSync> {
  sync = new PlayerSync(video.asElement(), client.asClient(), (s) => states.push(s), { ownPlayer: () => true });
  sync.setSource("/api/rooms/YWEK/hls/master.m3u8");
  await vi.waitFor(() => expect(lastState()?.engine).toBe("hls.js"));
  return sync;
}

beforeEach(() => {
  hlsCalls.loaded.length = 0;
  hlsCalls.recovered = 0;
  hlsCalls.handlers.clear();
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

  it("plays a film downloaded on the device through hls.js on Safari, which can read it from there", async () => {
    sync = new PlayerSync(video.asElement(), client.asClient(), (s) => states.push(s), { fromDevice: () => true });
    sync.setSource("/api/rooms/YWEK/hls/master.m3u8");
    await vi.waitFor(() => expect(lastState()?.engine).toBe("hls.js"));
    expect(video.src).toBe("");
  });

  it("uses our player on Safari when this device chose it, for its minutes of lead", async () => {
    sync = new PlayerSync(video.asElement(), client.asClient(), (s) => states.push(s), { ownPlayer: () => true });
    sync.setSource("/api/rooms/YWEK/hls/master.m3u8");
    await vi.waitFor(() => expect(lastState()?.engine).toBe("hls.js"));
    expect(video.src).toBe("");
  });

  it("falls back to Safari's own player where ours cannot run (no Media Source)", async () => {
    hlsCalls.supported = false;
    sync = new PlayerSync(video.asElement(), client.asClient(), (s) => states.push(s), { ownPlayer: () => true });
    sync.setSource("/api/rooms/YWEK/hls/master.m3u8");
    await vi.waitFor(() => expect(lastState()?.engine).toBe("native"));
    hlsCalls.supported = true;
  });

  describe("our player on an iPad, which gives way to Safari's if it fails", () => {
    const ours = () =>
      new PlayerSync(video.asElement(), client.asClient(), (s) => states.push(s), { ownPlayer: () => true });
    const fatal = (type: string) => hlsCalls.handlers.get("error")?.("error", { fatal: true, type });

    it("goes on with Safari's player, without a word, when ours keeps failing", async () => {
      sync = ours();
      sync.setSource("/api/rooms/YWEK/hls/master.m3u8");
      await vi.waitFor(() => expect(lastState()?.engine).toBe("hls.js"));
      for (let i = 0; i < 4; i++) fatal("network");
      await vi.waitFor(() => expect(lastState()?.engine).toBe("native"));
      expect(lastState()?.error).toBeNull();
      expect(video.src).toBe("/api/rooms/YWEK/hls/master.m3u8");
    });

    it("gives way when ours has not started after 30 s", async () => {
      sync = ours();
      sync.setSource("/api/rooms/YWEK/hls/master.m3u8");
      await vi.waitFor(() => expect(lastState()?.engine).toBe("hls.js"));
      vi.advanceTimersByTime(30_000);
      await vi.waitFor(() => expect(lastState()?.engine).toBe("native"));
    });

    it("stays with ours once it has started", async () => {
      sync = ours();
      sync.setSource("/api/rooms/YWEK/hls/master.m3u8");
      await vi.waitFor(() => expect(lastState()?.engine).toBe("hls.js"));
      video.fire("canplay");
      vi.advanceTimersByTime(60_000);
      expect(lastState()?.engine).toBe("hls.js");
    });
  });

  describe("the complete HEVC ladder", () => {
    const SRC = "/api/rooms/YWEK/hls/master.m3u8";
    const withOptions = (options: ConstructorParameters<typeof PlayerSync>[3]) => {
      sync = new PlayerSync(video.asElement(), client.asClient(), (s) => states.push(s), options);
      sync.setSource(SRC);
    };
    const mediaError = () => hlsCalls.handlers.get("error")?.("error", { fatal: true, type: "media" });

    it("is asked for by our player on a device that decodes HEVC", async () => {
      withOptions({ ownPlayer: () => true, hevcLadder: () => true });
      await vi.waitFor(() => expect(hlsCalls.loaded).toEqual([`${SRC}?hevc=1`]));
    });

    it("is never asked for by Safari's own player, nor for a film read from the device", async () => {
      withOptions({ hevcLadder: () => true });
      expect(lastState()?.engine).toBe("native");
      sync.destroy();
      withOptions({ ownPlayer: () => true, fromDevice: () => true, hevcLadder: () => true });
      await vi.waitFor(() => expect(hlsCalls.loaded).toEqual([SRC]));
    });

    it("gives way to the same film in H.264 when HEVC fails in Media Source, without a word to the person", async () => {
      withOptions({ ownPlayer: () => true, hevcLadder: () => true });
      await vi.waitFor(() => expect(hlsCalls.loaded).toHaveLength(1));
      mediaError();
      await vi.waitFor(() => expect(hlsCalls.loaded).toEqual([`${SRC}?hevc=1`, SRC]));
      expect(lastState()).toMatchObject({ engine: "hls.js", error: null });
      // From then on, a media error is an ordinary one: recovered, H.264 kept.
      mediaError();
      expect(hlsCalls.recovered).toBe(1);
      expect(hlsCalls.loaded).toHaveLength(2);
    });
  });

  it("switches to the device's copy as soon as the download completes", async () => {
    let downloaded = false;
    sync = new PlayerSync(video.asElement(), client.asClient(), (s) => states.push(s), {
      fromDevice: () => downloaded,
    });
    sync.setSource("/api/rooms/YWEK/hls/master.m3u8");
    expect(lastState()?.engine).toBe("native");
    downloaded = true;
    sync.refreshEngine();
    await vi.waitFor(() => expect(lastState()?.engine).toBe("hls.js"));
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
    // Only its lead is told (to start together later), never a playback action echoed back.
    expect(client.sent.filter((m) => m.type !== "lead")).toEqual([]);
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

  it("tells the room how much it has downloaded ahead while paused, without repeating itself", async () => {
    video.bufferedRanges = [[0, 35]];
    await startOwnPlayer();
    sync.setPlayback(paused(30));
    expect(client.of("lead")).toEqual([{ type: "lead", seconds: 5 }]);
    vi.advanceTimersByTime(5000);
    expect(client.of("lead")).toHaveLength(1);
    video.bufferedRanges = [[0, 52]];
    vi.advanceTimersByTime(1000);
    expect(client.of("lead").at(-1)).toEqual({ type: "lead", seconds: 22 });
  });

  it("keeps telling it while the room waits to start together, so the room notices its deadline", async () => {
    video.bufferedRanges = [[0, 35]];
    await startOwnPlayer();
    sync.setPlayback(paused(30));
    sync.setReadying({ target: 30, until: 25_000 });
    // Every 2 s, whatever the phase of the player's own loop.
    vi.advanceTimersByTime(4600);
    expect(client.of("lead").length).toBeGreaterThanOrEqual(3);
  });

  it("tells its lead at the new position at once when a jump during the film makes the room wait", async () => {
    // Downloaded far ahead around 10, and a little around 600 where someone jumps.
    video.bufferedRanges = [
      [0, 300],
      [600, 612],
    ];
    await startOwnPlayer();
    sync.setPlayback(paused(10));
    sync.setPlayback(playing(10));
    vi.advanceTimersByTime(100);
    client.sent.length = 0;
    sync.setReadying({ target: 30, until: 25_000 });
    sync.setPlayback(paused(600, 100));
    expect(video.currentTime).toBe(600);
    expect(client.of("lead")).toEqual([{ type: "lead", seconds: 12 }]);
  });

  it("tells it again when the room pauses elsewhere, even if the amount ahead looks the same", async () => {
    video.bufferedRanges = [[0, 7826]];
    await startOwnPlayer();
    sync.setPlayback(paused(10));
    sync.setPlayback(paused(20, 50));
    expect(client.of("lead")).toHaveLength(2);
  });

  it("says nothing of its lead while the film plays", () => {
    start();
    sync.setPlayback(playing(10));
    vi.advanceTimersByTime(3000);
    expect(client.of("lead")).toEqual([]);
  });

  it("tells its lead again after a reconnection, since the server forgot it", async () => {
    video.bufferedRanges = [[0, 35]];
    await startOwnPlayer();
    sync.setPlayback(paused(30));
    client.reopen();
    vi.advanceTimersByTime(600);
    expect(client.of("lead")).toHaveLength(2);
  });

  it("does not tell its lead with Safari's own player, which hardly downloads while paused", () => {
    video.bufferedRanges = [[0, 35]];
    start();
    sync.setPlayback(paused(30));
    vi.advanceTimersByTime(5000);
    expect(client.of("lead")).toEqual([]);
  });

  it("resumes a few tenths off without seeking (a seek makes Safari reload), but seeks a real gap", () => {
    start();
    sync.setPlayback(paused(30));
    expect(video.currentTime).toBe(30);
    // The resume arrives 0.4 s late over a 4G link: it plays on from 30, no jump to 30.4.
    client.now = 400;
    sync.setPlayback(playing(30, 0));
    expect(video.currentTime).toBe(30);
    expect(video.paused).toBe(false);

    sync.setPlayback(paused(50, 400));
    expect(video.currentTime).toBe(50);
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
