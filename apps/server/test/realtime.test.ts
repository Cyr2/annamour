import type { AddressInfo } from "node:net";
import { parseServerMessage, type ServerMessage } from "@annamour/protocol";
import { type ServerType, serve } from "@hono/node-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createApp } from "../src/app.ts";
import type { ImportedMedia } from "../src/hls.ts";
import { attachRealtime } from "../src/realtime.ts";
import { MAX_MEMBERS, RoomStore } from "../src/rooms.ts";

const media: ImportedMedia = {
  playlists: new Map([["master.m3u8", "#EXTM3U"]]),
  audio: [],
  subtitles: [],
  subtitleFiles: new Map(),
  duration: 60,
};

const store = new RoomStore();
let server: ServerType;
let port: number;

beforeAll(async () => {
  server = serve({ fetch: createApp({ store }).fetch, port: 0 });
  attachRealtime(server, store);
  await new Promise((resolve) => server.once("listening", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

/** Opens a socket and collects every server message it receives. */
function connect(path: string) {
  const ws = new WebSocket(`ws://localhost:${port}${path}`);
  const inbox: ServerMessage[] = [];
  ws.on("message", (data) => {
    const message = parseServerMessage(data.toString());
    if (message) inbox.push(message);
  });
  const opened = new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  const closed = new Promise<number>((resolve) => ws.once("close", (code) => resolve(code)));
  return { ws, inbox, opened, closed };
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(check()).toBe(true);
}

const hello = (name: string) => JSON.stringify({ type: "hello", clientId: `client-${name}-0000`, name, color: "mint" });

describe("realtime transport", () => {
  it("refuses upgrades outside /ws", async () => {
    const ws = new WebSocket(`ws://localhost:${port}/elsewhere`);
    const failure = await new Promise<Error>((resolve) => ws.once("error", resolve));
    expect(failure).toBeInstanceOf(Error);
  });

  it("answers an unreadable message without dropping the connection", async () => {
    const room = store.create("Film", media, Date.now());
    const client = connect(`/ws?room=${room.code}`);
    await client.opened;
    client.ws.send("{not json");
    await until(() => client.inbox.some((m) => m.type === "error" && m.code === "bad_message"));
    expect(client.ws.readyState).toBe(WebSocket.OPEN);
    client.ws.close();
  });

  it("ignores everything until the hello, then joins", async () => {
    const room = store.create("Film", media, Date.now());
    const client = connect(`/ws?room=${room.code.toLowerCase()}`);
    await client.opened;
    client.ws.send(JSON.stringify({ type: "play" }));
    client.ws.send(hello("Lou"));
    await until(() => client.inbox.some((m) => m.type === "welcome"));
    expect(client.inbox.some((m) => m.type === "playback")).toBe(false);
    expect(room.size).toBe(1);
    client.ws.close();
    await client.closed;
    await until(() => room.size === 0);
  });

  it("turns away a ninth person", async () => {
    const room = store.create("Film", media, Date.now());
    const guests = Array.from({ length: MAX_MEMBERS }, () => connect(`/ws?room=${room.code}`));
    await Promise.all(guests.map((g) => g.opened));
    for (const [i, g] of guests.entries()) g.ws.send(hello(`P${i}`));
    await until(() => room.size === MAX_MEMBERS);

    const extra = connect(`/ws?room=${room.code}`);
    await extra.opened;
    extra.ws.send(hello("Extra"));
    expect(await extra.closed).toBe(4003);
    expect(extra.inbox.some((m) => m.type === "error" && m.code === "room_full")).toBe(true);
    for (const g of guests) g.ws.close();
  });
});
