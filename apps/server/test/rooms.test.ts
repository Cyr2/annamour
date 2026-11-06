import { describe, expect, it } from "vitest";
import type { ServerMessage } from "@annamour/protocol";
import type { ImportedMedia } from "../src/hls.ts";
import { MAX_MEMBERS, RoomStore, type Connection } from "../src/rooms.ts";

const media: ImportedMedia = {
  playlists: new Map([["master.m3u8", "#EXTM3U"]]),
  audio: [],
  subtitles: [],
  subtitleFiles: new Map(),
  duration: 100,
};

function fakeConnection() {
  const inbox: ServerMessage[] = [];
  let closed = false;
  const connection: Connection = {
    send: (m) => inbox.push(m),
    close: () => {
      closed = true;
    },
  };
  return { connection, inbox, isClosed: () => closed, last: () => inbox.at(-1) };
}

function setup() {
  const store = new RoomStore();
  const room = store.create("Film", media, 0);
  const a = fakeConnection();
  const b = fakeConnection();
  const idA = room.join("client-aaaa", "Darius", "peach", a.connection, 0)!;
  const idB = room.join("client-bbbb", "Anna", "lilac", b.connection, 0)!;
  return { store, room, a, b, idA, idB };
}

describe("Room", () => {
  it("welcomes members with the media served locally", () => {
    const { room, a } = setup();
    const welcome = a.inbox[0];
    expect(welcome?.type).toBe("welcome");
    if (welcome?.type !== "welcome") return;
    expect(welcome.room.media.src).toBe(`/api/rooms/${room.code}/hls/master.m3u8`);
    expect(room.members().map((m) => m.name)).toEqual(["Darius", "Anna"]);
  });

  it("broadcasts play and pause with the author", () => {
    const { room, b, idA } = setup();
    room.handle(idA, { type: "play", position: 12 }, 1000);
    expect(b.last()).toMatchObject({ type: "playback", action: "play", by: idA, playback: { status: "playing", position: 12 } });
    room.handle(idA, { type: "pause" }, 3000);
    expect(b.last()).toMatchObject({ type: "playback", action: "pause", playback: { status: "paused", position: 14 } });
  });

  it("waits for a buffering member, then resumes by itself", () => {
    const { room, a, idA, idB } = setup();
    room.handle(idA, { type: "play", position: 0 }, 0);
    room.handle(idB, { type: "buffering", buffering: true }, 5000);
    expect(room.playback).toMatchObject({ status: "paused", position: 5 });
    expect(a.inbox.some((m) => m.type === "playback" && m.action === "wait")).toBe(true);

    room.handle(idB, { type: "buffering", buffering: false }, 7000);
    expect(room.playback).toMatchObject({ status: "playing", position: 5, at: 7000 });
    expect(a.last()).toMatchObject({ type: "playback", action: "resume" });
  });

  it("does not resume after buffering if someone paused meanwhile", () => {
    const { room, idA, idB } = setup();
    room.handle(idA, { type: "play", position: 0 }, 0);
    room.handle(idB, { type: "buffering", buffering: true }, 1000);
    room.handle(idA, { type: "pause" }, 1500);
    room.handle(idB, { type: "buffering", buffering: false }, 2000);
    expect(room.playback.status).toBe("paused");
  });

  it("holds a play request until everyone is ready", () => {
    const { room, idA, idB } = setup();
    room.handle(idB, { type: "buffering", buffering: true }, 0);
    room.handle(idA, { type: "play", position: 3 }, 100);
    expect(room.playback.status).toBe("paused");
    room.handle(idB, { type: "buffering", buffering: false }, 900);
    expect(room.playback).toMatchObject({ status: "playing", position: 3 });
  });

  it("answers pings only to the sender with server time", () => {
    const { room, a, b, idA } = setup();
    const before = b.inbox.length;
    room.handle(idA, { type: "ping", t0: 42 }, 1234);
    expect(a.last()).toEqual({ type: "pong", t0: 42, ts: 1234 });
    expect(b.inbox.length).toBe(before);
  });

  it("replaces the socket when the same device reconnects", () => {
    const { room, a } = setup();
    const again = fakeConnection();
    const id = room.join("client-aaaa", "Darius", "mint", again.connection, 10);
    expect(a.isClosed()).toBe(true);
    expect(room.size).toBe(2);
    // the stale socket closing later must not remove the member
    room.leave(id!, a.connection, 20);
    expect(room.size).toBe(2);
  });

  it("refuses members beyond the limit", () => {
    const store = new RoomStore();
    const room = store.create("Film", media, 0);
    for (let i = 0; i < MAX_MEMBERS; i++) expect(room.join(`client-${i}xxxxxx`, `P${i}`, "sky", fakeConnection().connection, 0)).not.toBeNull();
    expect(room.join("client-extra-1", "Extra", "sky", fakeConnection().connection, 0)).toBeNull();
  });

  it("pauses an emptied room and sweeps it after the TTL", () => {
    const { store, room, a, b, idA, idB } = setup();
    room.handle(idA, { type: "play", position: 0 }, 0);
    room.leave(idA, a.connection, 1000);
    room.leave(idB, b.connection, 2000);
    expect(room.playback).toMatchObject({ status: "paused", position: 2 });
    expect(store.sweep(2000 + 1000, 5000)).toBe(0);
    expect(store.sweep(2000 + 6000, 5000)).toBe(1);
    expect(store.get(room.code)).toBeUndefined();
  });
});
