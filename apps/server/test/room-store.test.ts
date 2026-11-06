import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOM_RETENTION_MS, type ServerMessage } from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { EVICT_EMPTY_ROOM_AFTER_MS, RoomStore } from "../src/room-store.ts";
import type { Connection } from "../src/rooms.ts";
import { migrate, openDatabase, SCHEMA_VERSION } from "../src/storage/database.ts";
import { RoomRepository } from "../src/storage/room-repository.ts";
import { media } from "./helpers.ts";
import { required } from "./required.ts";

const richMedia = {
  ...media,
  playlists: new Map([
    ["master.m3u8", "#EXTM3U\np0.m3u8"],
    ["p0.m3u8", "#EXTM3U\n#EXTINF:10,\nhttps://cdn.example/s0.ts"],
  ]),
  audio: [{ id: "p1.m3u8", label: "Français", language: "fr" }],
  subtitleFiles: new Map([["subs_fre", "WEBVTT\n\nSalut"]]),
  subtitles: [{ id: "subs_fre", label: "Français", language: "fr", forced: false }],
};

const silent: Connection = { send: (_message: ServerMessage) => {}, close: () => {} };

describe("rooms on disk", () => {
  it("survives a restart: the session reopens paused where everyone left it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "annamour-db-"));
    try {
      const path = join(dir, "annamour.db");
      const first = openDatabase(path);
      const before = new RoomStore(new RoomRepository(first));
      const room = before.create("Harry", richMedia, 0);
      const id = required(room.join("client-aaaa", "Darius", "peach", silent, 0), "a member");
      room.handle(id, { type: "play", position: 100 }, 1000);
      room.handle(id, { type: "pause" }, 31_000);
      first.close();

      const second = openDatabase(path);
      const after = new RoomStore(new RoomRepository(second), { now: () => 5_000_000 });
      const reopened = required(after.get(room.code), "the reopened room");
      second.close();
      expect(reopened.playback).toEqual({ status: "paused", position: 130, at: 5_000_000 });
      expect(reopened.media).toEqual(room.media);
      expect(reopened.imported.playlists.get("p0.m3u8")).toContain("s0.ts");
      expect(reopened.imported.subtitleFiles.get("subs_fre")).toContain("Salut");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps a media without known duration", () => {
    const store = new RoomStore(new RoomRepository(openDatabase(":memory:")));
    const room = store.create("Live", { ...media, duration: undefined }, 0);
    expect(room.media.duration).toBeUndefined();
  });

  it("saves the position of rooms in use every checkpoint, not of empty ones", () => {
    const repository = new RoomRepository(openDatabase(":memory:"));
    const store = new RoomStore(repository);
    const watched = store.create("Film", media, 0);
    const idle = store.create("Autre", media, 0);
    const id = required(watched.join("client-aaaa", "Lou", "mint", silent, 0), "a member");
    watched.handle(id, { type: "play", position: 0 }, 0);

    store.checkpoint(30_000);
    expect(repository.find(watched.code)).toMatchObject({ position: 30, lastUsedAt: 30_000 });
    expect(repository.find(idle.code)).toMatchObject({ position: 0, lastUsedAt: 0 });
    expect(store.livePosition(watched.code, 45_000)).toBe(45);
    expect(store.livePosition("ZZZZ", 45_000)).toBeUndefined();
  });

  it("frees memory from idle rooms but keeps them on disk", () => {
    const store = new RoomStore(new RoomRepository(openDatabase(":memory:")));
    const room = store.create("Film", media, 0);
    expect(store.sweep(EVICT_EMPTY_ROOM_AFTER_MS)).toEqual({ evicted: 0, deleted: 0 });
    expect(store.sweep(EVICT_EMPTY_ROOM_AFTER_MS + 1)).toEqual({ evicted: 1, deleted: 0 });
    expect(store.size).toBe(0);
    expect(store.get(room.code)?.media.title).toBe("Film");
    expect(store.size).toBe(1);
  });

  it("forgets a session 60 days after its last use", () => {
    const store = new RoomStore(new RoomRepository(openDatabase(":memory:")));
    const room = store.create("Film", media, 0);
    required(room.join("client-aaaa", "Lou", "mint", silent, 0), "a member");
    expect(store.sweep(ROOM_RETENTION_MS).deleted).toBe(0);
    expect(store.sweep(ROOM_RETENTION_MS + 1).deleted).toBe(1);
    expect(store.get(room.code)).toBeUndefined();
    expect(room.size).toBe(0);
  });

  it("never hands out a code already taken, even by a room only on disk", () => {
    const store = new RoomStore(new RoomRepository(openDatabase(":memory:")), { random: () => 0 });
    store.create("Film", media, 0);
    store.sweep(EVICT_EMPTY_ROOM_AFTER_MS + 1);
    expect(() => store.create("Film", media, 0)).toThrow("No free room code");
  });
});

describe("database schema", () => {
  it("is migrated once and stays at the latest version", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    expect(db.prepare("PRAGMA user_version").get()).toEqual({ user_version: SCHEMA_VERSION });
  });

  it("rolls back a migration that fails half-way", () => {
    const db = openDatabase(":memory:");
    db.exec("PRAGMA user_version = 0");
    expect(() => migrate(db)).toThrow(/already exists/);
    expect(db.prepare("PRAGMA user_version").get()).toEqual({ user_version: 0 });
  });
});
