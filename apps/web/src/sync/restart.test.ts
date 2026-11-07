import type { ClientMessage, PlaybackState, ServerMessage } from "@annamour/protocol";
import { describe, expect, it, vi } from "vitest";
import { restartOnWelcome, sessionPath, wantsFromStart } from "./restart.ts";

/** A client that records what is sent and lets the test play the server. */
class Stub {
  sent: ClientMessage[] = [];
  private listeners = new Set<(message: ServerMessage) => void>();

  on(listener: (message: ServerMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(message: ClientMessage): boolean {
    this.sent.push(message);
    return true;
  }

  receive(message: ServerMessage): void {
    for (const listener of [...this.listeners]) listener(message);
  }

  get listening(): number {
    return this.listeners.size;
  }
}

const welcome = (playback: PlaybackState): ServerMessage => ({
  type: "welcome",
  you: "m1",
  serverTime: 0,
  room: {
    code: "YWEK",
    media: { title: "Film", src: "/api/rooms/YWEK/hls/master.m3u8", audio: [], subtitles: [], duration: 6100 },
    playback,
    members: [{ id: "m1", name: "Darius", color: "sky", buffering: false }],
    episodes: [{ duration: 6100 }],
    current: 0,
    finished: false,
    countdownUntil: null,
  },
});

const finishedAt = (position: number): PlaybackState => ({ status: "paused", position, at: 0 });

describe("« Revoir » links", () => {
  it("adds ?depuis=debut only to watch again from the start", () => {
    expect(sessionPath("YWEK")).toBe("/s/YWEK");
    expect(sessionPath("YWEK", true)).toBe("/s/YWEK?depuis=debut");
    expect(wantsFromStart("?depuis=debut")).toBe(true);
    expect(wantsFromStart("depuis=debut&x=1")).toBe(true);
    expect(wantsFromStart("")).toBe(false);
    expect(wantsFromStart("?depuis=ailleurs")).toBe(false);
  });
});

describe("restartOnWelcome", () => {
  it("rewinds a finished séance to 0 for everyone once in, then stops listening", () => {
    const client = new Stub();
    const done = vi.fn();
    restartOnWelcome(client, done);
    expect(client.sent).toEqual([]);

    client.receive(welcome(finishedAt(6080)));
    expect(client.sent).toEqual([{ type: "seek", position: 0 }]);
    expect(done).toHaveBeenCalledOnce();
    expect(client.listening).toBe(0);

    // A reconnection's welcome does not rewind again.
    client.receive(welcome(finishedAt(1200)));
    expect(client.sent).toHaveLength(1);
  });

  it("leaves a séance someone already restarted (playing) alone", () => {
    const client = new Stub();
    const done = vi.fn();
    restartOnWelcome(client, done);
    client.receive(welcome({ status: "playing", position: 12, at: 0 }));
    expect(client.sent).toEqual([]);
    expect(done).toHaveBeenCalledOnce();
  });

  it("does not send anything already at the start, nor after being stopped", () => {
    const atStart = new Stub();
    restartOnWelcome(atStart);
    atStart.receive(welcome(finishedAt(0)));
    expect(atStart.sent).toEqual([]);

    const stopped = new Stub();
    const stop = restartOnWelcome(stopped);
    stop();
    stopped.receive(welcome(finishedAt(6080)));
    expect(stopped.sent).toEqual([]);
  });

  it("ignores everything before the welcome", () => {
    const client = new Stub();
    restartOnWelcome(client);
    client.receive({ type: "pong", t0: 1, ts: 2 });
    expect(client.sent).toEqual([]);
    expect(client.listening).toBe(1);
  });
});
