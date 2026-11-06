import type { AddressInfo } from "node:net";
import { parseServerMessage, type RoomSnapshot, type ServerMessage } from "@annamour/protocol";
import { type ServerType, serve } from "@hono/node-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { attachRealtime } from "../src/realtime.ts";
import { FetchError, type TextFetcher } from "../src/safe-fetch.ts";
import { testApp } from "./helpers.ts";

const MASTER = "https://cdn.example/movie/master.m3u8?token=t";
const fakeFetch: TextFetcher = async (url) => {
  if (url.href === MASTER) return "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nv/playlist.m3u8?token=t";
  if (url.href === "https://cdn.example/movie/v/playlist.m3u8?token=t")
    return "#EXTM3U\n#EXTINF:10,\ns0.ts\n#EXT-X-ENDLIST";
  if (url.href.startsWith("https://cdn.example/expired")) throw new FetchError("denied", 401);
  throw new FetchError("not found", 404);
};

const { app, services } = testApp({ fetchText: fakeFetch });

describe("HTTP API", () => {
  it("creates a room and serves its playlists", async () => {
    const created = await app.request("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: MASTER, title: "Harry" }),
    });
    expect(created.status).toBe(201);
    const { code } = (await created.json()) as { code: string };

    const snapshot = (await (await app.request(`/api/rooms/${code}`)).json()) as RoomSnapshot;
    expect(snapshot.media.title).toBe("Harry");
    expect(snapshot.media.duration).toBe(10);

    const master = await app.request(snapshot.media.src);
    expect(master.headers.get("content-type")).toContain("mpegurl");
    expect(await master.text()).toContain("p0.m3u8");
    expect(await (await app.request(`/api/rooms/${code}/hls/p0.m3u8`)).text()).toContain(
      "https://cdn.example/movie/v/s0.ts",
    );
  });

  it("explains bad links in plain words", async () => {
    const post = (body: unknown) =>
      app.request("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await post({ url: "http://insecure.example/a.m3u8" })).status).toBe(400);
    const expired = await post({ url: "https://cdn.example/expired.m3u8" });
    expect(expired.status).toBe(422);
    expect(((await expired.json()) as { error: string }).error).toMatch(/expiré/);
    expect((await app.request("/api/rooms/ZZZZ")).status).toBe(404);
  });
});

describe("WebSocket sync", () => {
  let server: ServerType;
  let port: number;
  let code: string;

  beforeAll(async () => {
    server = serve({ fetch: app.fetch, port: 0 });
    attachRealtime(server, services);
    await new Promise((r) => server.once("listening", r));
    port = (server.address() as AddressInfo).port;
    const res = await app.request("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: MASTER }),
    });
    code = ((await res.json()) as { code: string }).code;
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  function client(name: string) {
    const ws = new WebSocket(`ws://localhost:${port}/ws?room=${code}`);
    const inbox: ServerMessage[] = [];
    const waiters: Array<() => void> = [];
    ws.on("message", (d) => {
      const m = parseServerMessage(d.toString());
      if (m) inbox.push(m);
      for (const wake of waiters.splice(0)) wake();
    });
    const next = async (pred: (m: ServerMessage) => boolean) => {
      for (;;) {
        const hit = inbox.find(pred);
        if (hit) return hit;
        await new Promise<void>((r) => waiters.push(r));
      }
    };
    const open = new Promise((r) => ws.once("open", r)).then(() =>
      ws.send(JSON.stringify({ type: "hello", clientId: `id-${name}-0000`, name, color: "peach" })),
    );
    return { ws, inbox, next, open };
  }

  it("syncs a pause from one client to the other", async () => {
    const a = client("Darius");
    const b = client("Anna");
    await Promise.all([a.open, b.open]);
    await a.next((m) => m.type === "welcome");
    await b.next((m) => m.type === "welcome");
    await a.next((m) => m.type === "members" && m.members.length === 2);

    a.ws.send(JSON.stringify({ type: "play", position: 30 }));
    const played = await b.next((m) => m.type === "playback" && m.action === "play");
    expect(played).toMatchObject({ playback: { status: "playing", position: 30 } });

    b.ws.send(JSON.stringify({ type: "pause" }));
    const paused = await a.next((m) => m.type === "playback" && m.action === "pause");
    expect(paused.type === "playback" && paused.playback.position).toBeGreaterThanOrEqual(30);

    a.ws.send(JSON.stringify({ type: "ping", t0: 1 }));
    expect(await a.next((m) => m.type === "pong")).toMatchObject({ t0: 1 });

    a.ws.close();
    b.ws.close();
  });

  it("rejects unknown rooms", async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws?room=QQQQ`);
    const closeCode = await new Promise<number>((r) => ws.on("close", (c) => r(c)));
    expect(closeCode).toBe(4004);
  });
});
