import type { RoomSnapshot, ServerMessage } from "@annamour/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactionThrottle, useReactions } from "./reactions.ts";
import { bindRoom, memberById, useRoom } from "./room.ts";
import { type ConnectionStatus, SyncClient } from "./SyncClient.ts";

/** A WebSocket we drive by hand. */
class FakeSocket {
  static instances: FakeSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly url: string;
  readyState = FakeSocket.CONNECTING;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    this.readyState = FakeSocket.CLOSED;
  }

  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  receive(message: ServerMessage | string): void {
    this.onmessage?.({ data: typeof message === "string" ? message : JSON.stringify(message) });
  }

  drop(): void {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.();
  }

  types(): string[] {
    return this.sent.map((m) => (m as { type: string }).type);
  }
}

const room: RoomSnapshot = {
  code: "YWEK",
  media: { title: "Film", src: "/api/rooms/YWEK/hls/master.m3u8", audio: [], subtitles: [] },
  playback: { status: "paused", position: 0, at: 0 },
  members: [
    { id: "m1", name: "Darius", color: "sky", buffering: false },
    { id: "m2", name: "Anna", color: "lilac", buffering: false },
  ],
  episodes: [{}],
  current: 0,
  finished: false,
  countdownUntil: null,
};

const identity = () => ({ clientId: "device-1234", name: "Darius", color: "sky" as const });
let client: SyncClient;
let statuses: ConnectionStatus[];

const socket = (index = -1): FakeSocket => {
  const ws = FakeSocket.instances.at(index);
  if (!ws) throw new Error("no socket yet");
  return ws;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "Date"] });
  FakeSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  client = new SyncClient({ room: "YWEK", identity, url: (code) => `ws://test/ws?room=${code}` });
  statuses = [];
  client.onStatus((s) => statuses.push(s));
});

afterEach(() => {
  client.close();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("SyncClient", () => {
  it("says hello on connection and is open once welcomed", () => {
    client.connect();
    socket().open();
    expect(socket().url).toBe("ws://test/ws?room=YWEK");
    expect(socket().sent[0]).toEqual({ type: "hello", clientId: "device-1234", name: "Darius", color: "sky" });
    expect(socket().types()).toContain("ping");
    socket().receive({ type: "welcome", you: "m1", room, serverTime: 5_000 });
    expect(statuses).toEqual(["idle", "connecting", "open"]);
    expect(client.connectionStatus).toBe("open");
  });

  it("estimates the server clock from pongs", () => {
    client.connect();
    socket().open();
    const t0 = (socket().sent[1] as { t0: number }).t0;
    for (let i = 0; i < 3; i++) socket().receive({ type: "pong", t0, ts: t0 + 1000 });
    expect(client.clockReady).toBe(true);
    expect(client.clockOffset).toBeCloseTo(1000, -1);
    expect(client.serverNow()).toBeGreaterThan(t0);
    expect(client.rtt).toBe(0);
  });

  it("reconnects with backoff after a drop, and says hello again", () => {
    client.connect();
    socket().open();
    socket().receive({ type: "welcome", you: "m1", room, serverTime: 0 });
    socket().drop();
    expect(client.connectionStatus).toBe("reconnecting");
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(2);
    socket().open();
    expect(socket().sent[0]).toMatchObject({ type: "hello" });
  });

  it("gives up for good when the room does not exist", () => {
    client.connect();
    socket().open();
    socket().receive({ type: "error", code: "room_not_found", message: "Cette séance n'existe plus." });
    expect(client.connectionStatus).toBe("failed");
    vi.advanceTimersByTime(30_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("only sends while connected, and ignores unreadable messages", () => {
    expect(client.send({ type: "play" })).toBe(false);
    client.connect();
    socket().open();
    const listener = vi.fn();
    const off = client.on(listener);
    socket().receive("not json");
    expect(listener).not.toHaveBeenCalled();
    expect(client.send({ type: "pause" })).toBe(true);
    off();
    client.close();
    expect(client.connectionStatus).toBe("closed");
    expect(client.send({ type: "play" })).toBe(false);
  });
});

describe("room store", () => {
  it("mirrors the room, playback events and members", () => {
    const unbind = bindRoom(client);
    client.connect();
    socket().open();
    socket().receive({ type: "welcome", you: "m1", room, serverTime: 0 });
    expect(useRoom.getState()).toMatchObject({ you: "m1", status: "open", members: room.members });

    socket().receive({
      type: "playback",
      playback: { status: "playing", position: 3, at: 10 },
      action: "play",
      by: "m2",
    });
    expect(useRoom.getState().lastEvent).toEqual({ action: "play", by: "m2", seq: 1 });
    expect(useRoom.getState().playback?.status).toBe("playing");

    socket().receive({ type: "members", members: room.members.slice(0, 1) });
    expect(useRoom.getState().members).toHaveLength(1);

    // The next episode starts: the whole room again, the new video from its start.
    const next = {
      ...room,
      media: { ...room.media, title: "Film · É2", src: "/api/rooms/YWEK/e/1/hls/master.m3u8" },
      playback: { status: "playing" as const, position: 0, at: 20 },
      episodes: [{}, { label: "É2" }],
      current: 1,
    };
    socket().receive({ type: "room", room: next, by: "m2" });
    expect(useRoom.getState()).toMatchObject({
      room: { current: 1 },
      playback: { position: 0 },
      members: room.members,
    });

    socket().receive({ type: "error", code: "bad_message", message: "Message illisible." });
    expect(useRoom.getState().error?.code).toBe("bad_message");
    unbind();
  });

  it("knows when the room waits for everyone's lead before starting, from any message that says so", () => {
    const unbind = bindRoom(client);
    client.connect();
    socket().open();
    const waiting = { target: 30, until: 5000 };
    socket().receive({ type: "welcome", you: "m1", room: { ...room, readying: waiting }, serverTime: 0 });
    expect(useRoom.getState().readying).toEqual(waiting);
    socket().receive({ type: "readying", readying: null });
    expect(useRoom.getState().readying).toBeNull();
    socket().receive({ type: "room", room: { ...room, readying: waiting } });
    expect(useRoom.getState().readying).toEqual(waiting);
    unbind();
  });

  it("floats reactions with the sender's name and colour, mine on the right", () => {
    const unbind = bindRoom(client);
    client.connect();
    socket().open();
    socket().receive({ type: "welcome", you: "m1", room, serverTime: 0 });
    socket().receive({ type: "reaction", by: "m2", emoji: "🍿" });
    socket().receive({ type: "reaction", by: "m1", emoji: "❤️" });
    const [theirs, mine] = useReactions.getState().reactions;
    expect(theirs).toMatchObject({ emoji: "🍿", name: "Anna", color: "lilac", mine: false });
    expect(mine).toMatchObject({ emoji: "❤️", name: "Darius", mine: true });

    vi.advanceTimersByTime(3000);
    expect(useReactions.getState().reactions).toEqual([]);
    unbind();
  });

  it("finds who caused an event", () => {
    expect(memberById(room.members, "m2")?.name).toBe("Anna");
    expect(memberById(room.members, undefined)).toBeUndefined();
  });
});

describe("reaction throttle", () => {
  it("lets one reaction through per cooldown, like the server", () => {
    let now = 0;
    const allow = createReactionThrottle(() => now);
    expect(allow()).toBe(true);
    now = 100;
    expect(allow()).toBe(false);
    now = 350;
    expect(allow()).toBe(true);
  });
});
