import { DatabaseSync } from "node:sqlite";
import {
  CREDITS_COUNTDOWN_MS,
  NEXT_EPISODE_COUNTDOWN_MS,
  type RoomSnapshot,
  type ServerMessage,
} from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { RoomStore } from "../src/room-store.ts";
import type { Connection } from "../src/rooms.ts";
import { migrate } from "../src/storage/database.ts";
import { RoomRepository } from "../src/storage/room-repository.ts";
import { media, testStore } from "./helpers.ts";
import { required } from "./required.ts";

function fakeConnection() {
  const inbox: ServerMessage[] = [];
  const connection: Connection = { send: (m) => inbox.push(m), close: () => {} };
  /** The last full room sent, as everyone in it saw it. */
  const lastRoom = (): RoomSnapshot | undefined => {
    const message = inbox.findLast((m) => m.type === "room");
    return message?.type === "room" ? message.room : undefined;
  };
  return { connection, inbox, lastRoom };
}

const episodeTwo = { ...media, duration: 50 };

/** A séance « The Bear » with a second episode queued, Darius and Anna in it. */
function setup() {
  const { store, repository } = testStore({ now: () => 0 });
  const room = store.create("The Bear", media, 0);
  const a = fakeConnection();
  const b = fakeConnection();
  const idA = required(room.join("client-aaaa", "Darius", "peach", a.connection, 0), "Darius to join");
  const idB = required(room.join("client-bbbb", "Anna", "lilac", b.connection, 0), "Anna to join");
  store.addEpisode(room, "É2", episodeTwo);
  return { store, repository, room, a, b, idA, idB };
}

describe("a séance with episodes", () => {
  it("shows a queued episode to everyone in the séance", () => {
    const { b } = setup();
    expect(b.lastRoom()).toMatchObject({ episodes: [{ duration: 100 }, { label: "É2", duration: 50 }], current: 0 });
  });

  it("stops everyone on the last image and starts the countdown at the end of an episode", () => {
    const { room, b, idA } = setup();
    room.handle(idA, { type: "play", position: 95 }, 0);
    room.handle(idA, { type: "ended", episode: 0 }, 5000);
    expect(room.playback).toMatchObject({ status: "paused", position: 100 });
    expect(b.lastRoom()).toMatchObject({ finished: true, countdownUntil: 5000 + NEXT_EPISODE_COUNTDOWN_MS });
  });

  it("starts the next episode's countdown for everyone when the end credits start, the video still playing", () => {
    const { room, b, idA, idB } = setup();
    room.handle(idA, { type: "play", position: 80 }, 0);
    room.handle(idA, { type: "credits", episode: 0 }, 1000);
    room.handle(idB, { type: "credits", episode: 0 }, 1200);
    expect(b.lastRoom()).toMatchObject({ finished: false, countdownUntil: 1000 + CREDITS_COUNTDOWN_MS });
    expect(room.playback.status).toBe("playing");

    room.handle(idB, { type: "declineNext" }, 2000);
    expect(b.lastRoom()).toMatchObject({ countdownUntil: null });
  });

  it("moves everyone to the next episode once, even when two devices ask together", () => {
    const { room, b, idA, idB, repository } = setup();
    room.handle(idA, { type: "ended", episode: 0 }, 1000);
    room.handle(idA, { type: "playEpisode", from: 0, to: 1 }, 9000);
    room.handle(idB, { type: "playEpisode", from: 0, to: 1 }, 9010);

    const seen = required(b.lastRoom(), "the room after the switch");
    expect(seen).toMatchObject({ current: 1, finished: false, countdownUntil: null });
    expect(seen.media.title).toBe("The Bear · É2");
    expect(seen.media.src).toBe(`/api/rooms/${room.code}/e/1/hls/master.m3u8`);
    expect(seen.playback).toEqual({ status: "playing", position: 0, at: 9000 });
    expect(b.inbox.filter((m) => m.type === "room" && m.room.current === 1)).toHaveLength(1);
    expect(repository.find(room.code)).toMatchObject({ current: 1, position: 0 });
  });

  it("skips to the next episode mid-way, and goes back to one already watched, the list kept whole", () => {
    const { room, b, idA, idB } = setup();
    room.handle(idA, { type: "play", position: 12 }, 0);
    room.handle(idB, { type: "playEpisode", from: 0, to: 1 }, 1000);
    expect(b.lastRoom()).toMatchObject({ current: 1, playback: { status: "playing", position: 0 } });

    room.handle(idA, { type: "playEpisode", from: 1, to: 0 }, 2000);
    expect(b.lastRoom()).toMatchObject({ current: 0, episodes: [{}, { label: "É2" }] });
  });

  it("keeps the next episode waiting after « Pas ce soir », and reopens on it next time", () => {
    const { repository, room, a, b, idA, idB } = setup();
    room.handle(idA, { type: "ended", episode: 0 }, 1000);
    room.handle(idB, { type: "declineNext" }, 2000);
    expect(b.lastRoom()).toMatchObject({ finished: true, countdownUntil: null, current: 0 });

    room.leave(idA, a.connection, 3000);
    room.leave(idB, b.connection, 3000);
    const reopened = new RoomStore(repository).get(room.code);
    expect(reopened?.snapshot()).toMatchObject({ current: 1, playback: { position: 0, status: "paused" } });
  });

  it("is no longer over once someone goes back into the episode", () => {
    const { room, b, idA } = setup();
    room.handle(idA, { type: "ended", episode: 0 }, 1000);
    room.handle(idA, { type: "seek", position: 0 }, 2000);
    expect(b.lastRoom()).toMatchObject({ finished: false, countdownUntil: null });
  });

  it("lets anyone take an episode still to come out of the queue, never the one on screen", () => {
    const { room, b, idB, repository } = setup();
    room.handle(idB, { type: "removeEpisode", episode: 0 }, 1000);
    expect(room.episodeCount).toBe(2);
    room.handle(idB, { type: "removeEpisode", episode: 1 }, 1000);
    expect(b.lastRoom()?.episodes).toHaveLength(1);
    expect(repository.find(room.code)?.episodes).toHaveLength(1);
  });

  it("never gives a removed episode's id to the next one, so cached files stay right", () => {
    const { store, room, idA } = setup();
    room.handle(idA, { type: "removeEpisode", episode: 1 }, 0);
    store.addEpisode(room, "É2 bis", episodeTwo);
    expect(room.episodeById(1)).toBeUndefined();
    expect(room.episodeById(2)?.label).toBe("É2 bis");
  });

  it("serves a reopened séance's episodes in their order, labels included", () => {
    const { repository, room } = setup();
    const reopened = new RoomStore(repository).get(room.code);
    expect(reopened?.snapshot().episodes.map((e) => e.label)).toEqual([undefined, "É2"]);
  });
});

describe("what someone does to the séance's episodes, told to everyone", () => {
  /** The last room message, with who sent it and what they did. */
  const lastRoomMessage = (inbox: ServerMessage[]) => inbox.findLast((m) => m.type === "room");

  it("names who started the next episode", () => {
    const { room, b, idA } = setup();
    room.handle(idA, { type: "playEpisode", from: 0, to: 1 }, 1000);
    expect(lastRoomMessage(b.inbox)).toMatchObject({ by: idA, change: { kind: "episode" } });
  });

  it("names who said « Pas ce soir »", () => {
    const { room, a, idA, idB } = setup();
    room.handle(idA, { type: "ended", episode: 0 }, 1000);
    room.handle(idB, { type: "declineNext" }, 2000);
    expect(lastRoomMessage(a.inbox)).toMatchObject({ by: idB, change: { kind: "declined" } });
  });

  it("names who took an episode out of the queue, and which one, since it is gone from the room", () => {
    const { room, a, idB } = setup();
    room.handle(idB, { type: "removeEpisode", episode: 1 }, 1000);
    expect(lastRoomMessage(a.inbox)).toMatchObject({ by: idB, change: { kind: "removed", episode: 1, label: "É2" } });
  });

  it("names who queued an episode, found by the device that asked", () => {
    const { store, room, a, idB } = setup();
    store.addEpisode(room, "Alien", episodeTwo, undefined, "client-bbbb");
    expect(lastRoomMessage(a.inbox)).toMatchObject({ by: idB, change: { kind: "added", episode: 2 } });
  });

  it("names nobody for an episode queued by a device that is not in the séance", () => {
    const { store, room, a } = setup();
    store.addEpisode(room, "Alien", episodeTwo, undefined, "client-zzzz");
    const message = lastRoomMessage(a.inbox);
    expect(message).toMatchObject({ change: { kind: "added", episode: 2 } });
    expect(message).not.toHaveProperty("by");
  });

  it("names nobody when the room moves on by itself, at the end of an episode", () => {
    const { room, a, idA } = setup();
    room.handle(idA, { type: "ended", episode: 0 }, 1000);
    expect(lastRoomMessage(a.inbox)).not.toHaveProperty("change");
  });
});

describe("séances saved before episodes existed", () => {
  it("become a séance whose only episode is the video they had", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    // The schema as shipped before episodes: rooms kept their media themselves.
    db.exec(`CREATE TABLE rooms (code TEXT PRIMARY KEY, title TEXT NOT NULL, media TEXT NOT NULL, duration REAL,
      position REAL NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, last_used_at INTEGER NOT NULL);
      CREATE TABLE tv_pairings (poll_token_hash TEXT PRIMARY KEY, code_hash TEXT NOT NULL, state TEXT NOT NULL,
      account_id TEXT, expires_at INTEGER NOT NULL); PRAGMA user_version = 2;`);
    const stored = JSON.stringify({
      playlists: [["master.m3u8", "#EXTM3U"]],
      audio: [],
      subtitleFiles: [],
      subtitles: [],
      duration: 42,
    });
    db.prepare("INSERT INTO rooms VALUES ('HZEA', 'Vieux film', ?, 42, 12, 0, 0)").run(stored);

    migrate(db);

    const room = new RoomRepository(db).find("HZEA");
    expect(room).toMatchObject({ title: "Vieux film", current: 0, position: 12 });
    expect(room?.episodes).toHaveLength(1);
    expect(room?.episodes[0]?.media.duration).toBe(42);
  });
});
