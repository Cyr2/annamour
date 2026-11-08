import type { ServerMessage } from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { type Connection, MAX_MEMBERS } from "../src/rooms.ts";
import { media, testStore } from "./helpers.ts";
import { required } from "./required.ts";

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
  const { store, repository } = testStore();
  const room = store.create("Film", media, 0);
  const a = fakeConnection();
  const b = fakeConnection();
  const idA = required(room.join("client-aaaa", "Darius", "peach", a.connection, 0), "Darius to join");
  const idB = required(room.join("client-bbbb", "Anna", "lilac", b.connection, 0), "Anna to join");
  return { store, repository, room, a, b, idA, idB };
}

describe("Room", () => {
  it("welcomes members with the media served locally", () => {
    const { room, a } = setup();
    const welcome = a.inbox[0];
    expect(welcome?.type).toBe("welcome");
    if (welcome?.type !== "welcome") return;
    expect(welcome.room.media.src).toBe(`/api/rooms/${room.code}/e/0/hls/master.m3u8`);
    expect(room.members().map((m) => m.name)).toEqual(["Darius", "Anna"]);
  });

  it("broadcasts play and pause with the author", () => {
    const { room, b, idA } = setup();
    room.handle(idA, { type: "play", position: 12 }, 1000);
    expect(b.last()).toMatchObject({
      type: "playback",
      action: "play",
      by: idA,
      playback: { status: "playing", position: 12 },
    });
    room.handle(idA, { type: "pause" }, 3000);
    expect(b.last()).toMatchObject({ type: "playback", action: "pause", playback: { status: "paused", position: 14 } });
  });

  it("stops waiting for a loading member whose link dropped, without saying they left", () => {
    const { room, a, b, idA, idB } = setup();
    room.handle(idA, { type: "play", position: 0 }, 0);
    room.handle(idB, { type: "buffering", buffering: true }, 5000);
    expect(room.playback.status).toBe("paused");
    room.disconnected(idB, b.connection, 6000);
    expect(room.playback).toMatchObject({ status: "playing", at: 6000 });
    expect(room.members().map((m) => m.name)).toEqual(["Darius", "Anna"]);
    expect(a.last()).toMatchObject({ type: "playback", action: "resume" });
    // A stale socket closing after its replacement changes nothing.
    room.disconnected(idA, b.connection, 7000);
    expect(room.size).toBe(2);
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

  it("waits where the stuck member is, so the others step back instead of it jumping ahead", () => {
    const { room, idA, idB } = setup();
    room.handle(idA, { type: "play", position: 0 }, 0);
    room.handle(idB, { type: "buffering", buffering: true, position: 7.5 }, 10_000);
    expect(room.playback).toMatchObject({ status: "paused", position: 7.5 });
  });

  it("never waits ahead of the shared position, whatever a member claims", () => {
    const { room, idA, idB } = setup();
    room.handle(idA, { type: "play", position: 0 }, 0);
    room.handle(idB, { type: "buffering", buffering: true, position: 600 }, 10_000);
    expect(room.playback).toMatchObject({ status: "paused", position: 10 });
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
    const id = required(room.join("client-aaaa", "Darius", "mint", again.connection, 10), "Darius to rejoin");
    expect(a.isClosed()).toBe(true);
    expect(room.size).toBe(2);
    // the stale socket closing later must not remove the member
    room.leave(id, a.connection, 20);
    expect(room.size).toBe(2);
  });

  it("shows a second device of the same account as « Darius (2) », still waited for on its own", () => {
    const { store } = testStore();
    const room = store.create("Film", media, 0);
    const phone = fakeConnection();
    required(room.join("client-phone", "Darius", "peach", phone.connection, 0, "account-darius"), "phone to join");
    required(room.join("client-anna", "Anna", "lilac", fakeConnection().connection, 0, "account-anna"), "Anna");
    required(room.join("client-tablet", "Darius", "peach", fakeConnection().connection, 0, "account-darius"), "tablet");
    expect(room.size).toBe(3);
    expect(phone.isClosed()).toBe(false);
    expect(room.members().map((member) => member.name)).toEqual(["Darius", "Anna", "Darius (2)"]);
  });

  it("broadcasts reactions to everyone, with a cooldown", () => {
    const { room, a, b, idA } = setup();
    room.handle(idA, { type: "react", emoji: "❤️" }, 1000);
    expect(a.last()).toEqual({ type: "reaction", by: idA, emoji: "❤️" });
    expect(b.last()).toEqual({ type: "reaction", by: idA, emoji: "❤️" });
    const before = b.inbox.length;
    room.handle(idA, { type: "react", emoji: "💀" }, 1100);
    expect(b.inbox.length).toBe(before);
    room.handle(idA, { type: "react", emoji: "💀" }, 1400);
    expect(b.last()).toEqual({ type: "reaction", by: idA, emoji: "💀" });
  });

  it("refuses members beyond the limit", () => {
    const { store } = testStore();
    const room = store.create("Film", media, 0);
    for (let i = 0; i < MAX_MEMBERS; i++)
      expect(room.join(`client-${i}xxxxxx`, `P${i}`, "sky", fakeConnection().connection, 0)).not.toBeNull();
    expect(room.join("client-extra-1", "Extra", "sky", fakeConnection().connection, 0)).toBeNull();
  });

  it("pauses an emptied room and saves where it stopped", () => {
    const { repository, room, a, b, idA, idB } = setup();
    room.handle(idA, { type: "play", position: 0 }, 0);
    room.leave(idA, a.connection, 1000);
    room.leave(idB, b.connection, 2000);
    expect(room.playback).toMatchObject({ status: "paused", position: 2 });
    expect(repository.find(room.code)).toMatchObject({ position: 2, lastUsedAt: 2000 });
  });

  it("saves the position on every pause and seek, not on play", () => {
    const { repository, room, idA } = setup();
    room.handle(idA, { type: "play", position: 10 }, 1000);
    expect(repository.find(room.code)?.position).toBe(0);
    room.handle(idA, { type: "seek", position: 50 }, 2000);
    expect(repository.find(room.code)?.position).toBe(50);
    room.handle(idA, { type: "pause" }, 4000);
    expect(repository.find(room.code)).toMatchObject({ position: 52, lastUsedAt: 4000 });
  });
});

describe("starting together", () => {
  const lastOf = (inbox: ServerMessage[], type: ServerMessage["type"]) => inbox.findLast((m) => m.type === type);

  it("starts at once when no device is still downloading", () => {
    const { room, idA } = setup();
    room.handle(idA, { type: "play", position: 0 }, 1000);
    expect(room.playback.status).toBe("playing");
  });

  it("waits for a device still downloading its lead, shows how far it got, then starts by itself", () => {
    const { room, a, idA, idB } = setup();
    room.handle(idB, { type: "lead", seconds: 5 }, 1000);
    room.handle(idA, { type: "play", position: 0 }, 1500);
    expect(room.playback).toMatchObject({ status: "paused", position: 0 });
    expect(lastOf(a.inbox, "playback")).toMatchObject({ action: "wait", by: idA });
    expect(lastOf(a.inbox, "readying")).toEqual({ type: "readying", readying: { target: 30, until: 26_500 } });

    room.handle(idB, { type: "lead", seconds: 20 }, 2500);
    expect(room.playback.status).toBe("paused");
    const members = lastOf(a.inbox, "members");
    expect(members?.type === "members" && members.members.find((m) => m.id === idB)?.lead).toBe(20);

    room.handle(idB, { type: "lead", seconds: 31 }, 3500);
    expect(room.playback).toMatchObject({ status: "playing", position: 0, at: 3500 });
    expect(lastOf(a.inbox, "playback")).toMatchObject({ action: "resume" });
    expect(lastOf(a.inbox, "readying")).toEqual({ type: "readying", readying: null });
  });

  it("does not wait for a device whose lead stopped growing (Safari loading nothing while paused)", () => {
    const { room, idA, idB } = setup();
    room.handle(idB, { type: "lead", seconds: 0 }, 0);
    room.handle(idA, { type: "play", position: 0 }, 5000);
    expect(room.playback.status).toBe("playing");
  });

  it("lets go of a device that stops downloading during the wait", () => {
    const { room, idA, idB } = setup();
    room.handle(idB, { type: "lead", seconds: 2 }, 1000);
    room.handle(idA, { type: "play", position: 0 }, 1500);
    expect(room.playback.status).toBe("paused");
    room.handle(idB, { type: "lead", seconds: 2.2 }, 5100);
    expect(room.playback.status).toBe("playing");
  });

  it("never waits past its deadline, even for a device still crawling", () => {
    const { room, idA, idB } = setup();
    room.handle(idB, { type: "lead", seconds: 1 }, 1000);
    room.handle(idA, { type: "play", position: 0 }, 1000);
    for (let t = 3000; t < 26_000; t += 3000) room.handle(idB, { type: "lead", seconds: t / 1000 }, t);
    expect(room.playback.status).toBe("paused");
    // Any message notices the deadline, a ping included.
    room.handle(idA, { type: "ping", t0: 0 }, 26_000);
    expect(room.playback.status).toBe("playing");
  });

  it("is cancelled by a pause: nobody starts behind the person who paused", () => {
    const { room, a, idA, idB } = setup();
    room.handle(idB, { type: "lead", seconds: 5 }, 1000);
    room.handle(idA, { type: "play", position: 0 }, 1500);
    room.handle(idA, { type: "pause" }, 2000);
    expect(lastOf(a.inbox, "readying")).toEqual({ type: "readying", readying: null });
    room.handle(idB, { type: "lead", seconds: 31 }, 3000);
    expect(room.playback.status).toBe("paused");
  });

  it("starts over after a seek: what was downloaded was for another moment", () => {
    const { room, idA, idB } = setup();
    room.handle(idB, { type: "lead", seconds: 25 }, 1000);
    room.handle(idA, { type: "play", position: 0 }, 1500);
    room.handle(idA, { type: "seek", position: 40 }, 2000);
    room.handle(idB, { type: "lead", seconds: 3 }, 2500);
    expect(room.playback).toMatchObject({ status: "paused", position: 40 });
    room.handle(idB, { type: "lead", seconds: 35 }, 3500);
    expect(room.playback).toMatchObject({ status: "playing", position: 40 });
  });

  it("starts when the person it waited for leaves", () => {
    const { room, b, idA, idB } = setup();
    room.handle(idB, { type: "lead", seconds: 5 }, 1000);
    room.handle(idA, { type: "play", position: 0 }, 1500);
    room.leave(idB, b.connection, 2000);
    expect(room.playback.status).toBe("playing");
  });

  it("starts a new episode together too, from its beginning", () => {
    const { room, a, idA, idB } = setup();
    room.addEpisode({ id: 1, label: "É2", imported: { ...media, duration: 50 } });
    room.handle(idB, { type: "lead", seconds: 40 }, 500);
    room.handle(idA, { type: "playEpisode", from: 0, to: 1 }, 1000);
    const moved = lastOf(a.inbox, "room");
    expect(moved?.type === "room" && moved.room.readying).toEqual({ target: 30, until: 26_000 });
    expect(room.playback).toMatchObject({ status: "paused", position: 0 });
    room.handle(idB, { type: "lead", seconds: 8 }, 1500);
    expect(room.playback.status).toBe("paused");
    room.handle(idB, { type: "lead", seconds: 31 }, 2500);
    expect(room.playback).toMatchObject({ status: "playing", position: 0 });
  });

  it("keeps the old way for apps that never report their lead", () => {
    const { room, idA } = setup();
    room.addEpisode({ id: 1, label: "É2", imported: { ...media, duration: 50 } });
    room.handle(idA, { type: "playEpisode", from: 0, to: 1 }, 1000);
    expect(room.playback).toMatchObject({ status: "playing", position: 0 });
    expect(room.snapshot().readying).toBeUndefined();
  });
});

describe("starting together, with a dropped link", () => {
  const leadOf = (room: ReturnType<typeof setup>["room"], id: string) => room.members().find((m) => m.id === id)?.lead;

  it("starts at once when the device it waited for loses its link, without saying it left", () => {
    const { room, b, idA, idB } = setup();
    room.handle(idB, { type: "lead", seconds: 5 }, 1000);
    room.handle(idA, { type: "play", position: 0 }, 1500);
    expect(room.playback.status).toBe("paused");
    room.disconnected(idB, b.connection, 2000);
    expect(room.playback).toMatchObject({ status: "playing", position: 0, at: 2000 });
    expect(room.snapshot().readying).toBeUndefined();
    expect(room.size).toBe(2);
  });

  it("does not wait for a device whose link is down, not even the few seconds a silent one gets", () => {
    const { room, b, idA, idB } = setup();
    room.handle(idB, { type: "lead", seconds: 5 }, 1000);
    room.disconnected(idB, b.connection, 1200);
    room.handle(idA, { type: "play", position: 0 }, 1500);
    expect(room.playback).toMatchObject({ status: "playing", at: 1500 });
  });

  it("waits for a member who comes back, and no longer shows their stale lead meanwhile", () => {
    const { room, b, idA, idB } = setup();
    const leo = fakeConnection();
    const idC = required(room.join("client-cccc", "Léo", "mint", leo.connection, 0), "Léo to join");
    room.handle(idB, { type: "lead", seconds: 5 }, 1000);
    room.handle(idC, { type: "lead", seconds: 8 }, 1000);
    room.handle(idA, { type: "play", position: 0 }, 1500);
    room.disconnected(idB, b.connection, 2000);
    expect(room.playback.status).toBe("paused"); // still waiting for Léo
    expect(leadOf(room, idB)).toBeUndefined();

    expect(room.join("client-bbbb", "Anna", "lilac", fakeConnection().connection, 2500)).toBe(idB);
    room.handle(idB, { type: "lead", seconds: 6 }, 2600);
    room.handle(idC, { type: "lead", seconds: 31 }, 3000);
    expect(room.playback.status).toBe("paused"); // now waiting for Anna again
    expect(leadOf(room, idB)).toBe(6);
    room.handle(idB, { type: "lead", seconds: 30 }, 3500);
    expect(room.playback).toMatchObject({ status: "playing", at: 3500 });
  });

  it("does not start for nobody when every link dropped", () => {
    const { room, a, b, idA, idB } = setup();
    room.handle(idB, { type: "lead", seconds: 5 }, 1000);
    room.handle(idA, { type: "play", position: 0 }, 1500);
    room.disconnected(idA, a.connection, 2000);
    room.disconnected(idB, b.connection, 2100);
    expect(room.playback.status).toBe("paused");
  });
});

describe("a jump while the film plays", () => {
  const lastOf = (inbox: ServerMessage[], type: ServerMessage["type"]) => inbox.findLast((m) => m.type === type);

  /** Both devices told their lead at the start, then the film played. */
  function playing() {
    const context = setup();
    const { room, idA, idB } = context;
    room.handle(idA, { type: "lead", seconds: 40 }, 500);
    room.handle(idB, { type: "lead", seconds: 40 }, 500);
    room.handle(idA, { type: "play", position: 0 }, 1000);
    expect(room.playback.status).toBe("playing");
    return context;
  }

  it("waits at the new position for everyone's lead, told as a jump, then plays on by itself", () => {
    const { room, b, idA, idB } = playing();
    room.handle(idA, { type: "seek", position: 60 }, 5000);
    expect(room.playback).toMatchObject({ status: "paused", position: 60 });
    expect(lastOf(b.inbox, "playback")).toMatchObject({ action: "seek", by: idA, playback: { position: 60 } });
    expect(b.inbox.some((m) => m.type === "playback" && m.action === "pause")).toBe(false);
    expect(lastOf(b.inbox, "readying")).toEqual({ type: "readying", readying: { target: 30, until: 30_000 } });

    room.handle(idA, { type: "lead", seconds: 35 }, 5100);
    room.handle(idB, { type: "lead", seconds: 12 }, 5200);
    expect(room.playback.status).toBe("paused");
    room.handle(idB, { type: "lead", seconds: 30 }, 6000);
    expect(room.playback).toMatchObject({ status: "playing", position: 60, at: 6000 });
    expect(lastOf(b.inbox, "readying")).toEqual({ type: "readying", readying: null });
  });

  it("resumes as soon as everyone answers when the new position was already downloaded", () => {
    const { room, idA, idB } = playing();
    room.handle(idA, { type: "seek", position: 20 }, 5000);
    room.handle(idA, { type: "lead", seconds: 300 }, 5050);
    room.handle(idB, { type: "lead", seconds: 280 }, 5080);
    expect(room.playback).toMatchObject({ status: "playing", position: 20, at: 5080 });
  });

  it("starts first, then ends the wait, so nobody sees the film simply paused in between", () => {
    const { room, b, idA, idB } = playing();
    room.handle(idA, { type: "seek", position: 20 }, 5000);
    room.handle(idA, { type: "lead", seconds: 300 }, 5050);
    room.handle(idB, { type: "lead", seconds: 280 }, 5080);
    const kinds = b.inbox.map((m) => m.type);
    expect(kinds.lastIndexOf("playback")).toBeLessThan(kinds.lastIndexOf("readying"));
  });

  it("plays straight on when nobody reports a lead (older apps): no pause at all", () => {
    const { room, b, idA } = setup();
    room.handle(idA, { type: "play", position: 0 }, 1000);
    room.handle(idA, { type: "seek", position: 60 }, 5000);
    expect(room.playback).toMatchObject({ status: "playing", position: 60, at: 5000 });
    expect(b.inbox.some((m) => m.type === "readying")).toBe(false);
  });

  it("plays straight on near the very end: there is nothing left to download", () => {
    const { room, idA } = playing();
    room.handle(idA, { type: "seek", position: 99.8 }, 5000);
    expect(room.playback).toMatchObject({ status: "playing", position: 99.8 });
  });

  it("does not wait for a device that loses its link during the wait", () => {
    const { room, b, idA, idB } = playing();
    room.handle(idA, { type: "seek", position: 60 }, 5000);
    room.handle(idA, { type: "lead", seconds: 35 }, 5100);
    room.handle(idB, { type: "lead", seconds: 2 }, 5200);
    room.disconnected(idB, b.connection, 6000);
    expect(room.playback).toMatchObject({ status: "playing", position: 60, at: 6000 });
  });

  it("still only moves the position of a paused film", () => {
    const { room, idA } = playing();
    room.handle(idA, { type: "pause" }, 2000);
    room.handle(idA, { type: "seek", position: 60 }, 3000);
    expect(room.playback).toMatchObject({ status: "paused", position: 60 });
    expect(room.snapshot().readying).toBeUndefined();
  });
});
