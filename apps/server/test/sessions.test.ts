import type { AddressInfo } from "node:net";
import { API, type CreateAccountResponse, type SessionList } from "@annamour/protocol";
import { serve } from "@hono/node-server";
import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import { attachRealtime } from "../src/realtime.ts";
import type { TextFetcher } from "../src/safe-fetch.ts";
import { jsonRequest, media, sessionCookieOf, testApp } from "./helpers.ts";
import { required } from "./required.ts";

const MASTER = "https://cdn.example/movie.m3u8";
const fetchText: TextFetcher = async () => "#EXTM3U\n#EXTINF:120,\ns0.ts\n#EXT-X-ENDLIST";

function setup() {
  const clock = { now: 1_000_000 };
  const { app, services } = testApp({ now: () => clock.now, fetchText });
  async function account(name: string, color = "sky") {
    const response = await app.request(API.createAccount, jsonRequest("POST", { name, color }));
    const { account } = (await response.json()) as CreateAccountResponse;
    return { ...account, cookie: sessionCookieOf(response) };
  }
  async function createRoom(cookie?: string, title = "Film") {
    const response = await app.request(
      "/api/rooms",
      jsonRequest("POST", { url: MASTER, title }, cookie ? { cookie } : {}),
    );
    return ((await response.json()) as { code: string }).code;
  }
  async function sessions(cookie: string) {
    const response = await app.request(API.sessions, { headers: { cookie } });
    return ((await response.json()) as SessionList).sessions;
  }
  return { app, services, clock, account, createRoom, sessions };
}

describe("my sessions", () => {
  it("include the sessions I created, with their duration and saved position", async () => {
    const { account, createRoom, sessions, clock } = setup();
    const darius = await account("Darius");
    const code = await createRoom(darius.cookie, "Harry");
    expect(await sessions(darius.cookie)).toEqual([
      {
        code,
        title: "Harry",
        duration: 120,
        position: 0,
        lastUsedAt: clock.now,
        participants: [],
        episode: { index: 0, count: 1 },
      },
    ]);
  });

  it("are shared: everyone sees the same session with the others, never themselves", async () => {
    const { account, createRoom, sessions, services } = setup();
    const darius = await account("Darius");
    const anna = await account("Anna", "lilac");
    const ines = await account("Inès", "mint");
    const code = await createRoom(darius.cookie);
    services.history.recordParticipation(code, anna.id);
    services.history.recordParticipation(code, ines.id);

    const forAnna = required((await sessions(anna.cookie))[0], "Anna's session");
    expect(forAnna.participants).toEqual([
      { accountId: darius.id, name: "Darius", color: "sky" },
      { accountId: ines.id, name: "Inès", color: "mint" },
    ]);
    const forDarius = required((await sessions(darius.cookie))[0], "Darius's session");
    expect(forDarius.participants.map((p) => p.name)).toEqual(["Anna", "Inès"]);
  });

  it("are listed newest first, with the live position of a session being watched", async () => {
    const { account, createRoom, sessions, services, clock } = setup();
    const darius = await account("Darius");
    const older = await createRoom(darius.cookie, "Ancien");
    clock.now += 1000;
    const newer = await createRoom(darius.cookie, "Récent");
    expect((await sessions(darius.cookie)).map((s) => s.code)).toEqual([newer, older]);

    const room = required(services.store.get(older), "the older room");
    const silent = { send: () => {}, close: () => {} };
    const id = required(room.join("client-aaaa", "Darius", "sky", silent, clock.now), "a member");
    room.handle(id, { type: "play", position: 60 }, clock.now);
    clock.now += 10_000;
    const list = await sessions(darius.cookie);
    expect(list.map((s) => s.code)).toEqual([older, newer]);
    expect(list[0]?.position).toBe(70);
  });

  it("can be hidden for me only, and come back if I join again", async () => {
    const { app, account, createRoom, sessions, services } = setup();
    const darius = await account("Darius");
    const anna = await account("Anna");
    const code = await createRoom(darius.cookie);
    services.history.recordParticipation(code, anna.id);

    const hidden = await app.request(`${API.sessions}/${code.toLowerCase()}`, {
      method: "DELETE",
      headers: { cookie: darius.cookie },
    });
    expect(hidden.status).toBe(204);
    expect(await sessions(darius.cookie)).toEqual([]);
    expect(required((await sessions(anna.cookie))[0], "Anna's session").participants).toHaveLength(1);

    services.history.recordParticipation(code, darius.id);
    expect(await sessions(darius.cookie)).toHaveLength(1);
  });

  it("cannot hide a session I was never in", async () => {
    const { app, account } = setup();
    const darius = await account("Darius");
    const response = await app.request(`${API.sessions}/ZZZZ`, {
      method: "DELETE",
      headers: { cookie: darius.cookie },
    });
    expect(response.status).toBe(404);
    expect((await app.request(API.sessions)).status).toBe(401);
  });

  it("do not track people without an account", async () => {
    const { createRoom, services } = setup();
    const code = await createRoom();
    expect(services.store.get(code)).toBeDefined();
  });

  it("record a signed-in person joining through the live connection", async () => {
    const { app, services, account, createRoom, sessions } = setup();
    const darius = await account("Darius");
    const anna = await account("Anna");
    const code = await createRoom(darius.cookie);
    const server = serve({ fetch: app.fetch, port: 0 });
    attachRealtime(server, services);
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const ws = new WebSocket(`ws://localhost:${port}/ws?room=${code}`, { headers: { cookie: anna.cookie } });
      await new Promise((resolve) => ws.once("open", resolve));
      const welcomed = new Promise((resolve) => ws.once("message", resolve));
      ws.send(JSON.stringify({ type: "hello", clientId: "client-anna-0000", name: "Anna", color: "lilac" }));
      await welcomed;
      expect((await sessions(anna.cookie)).map((s) => s.code)).toEqual([code]);
      ws.close();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("keep sessions that only live on disk", async () => {
    const { account, sessions, services, clock } = setup();
    const darius = await account("Darius");
    const room = services.store.create("Disque", media, clock.now);
    services.history.recordParticipation(room.code, darius.id);
    services.store.sweep(clock.now + 11 * 60 * 1000);
    expect(await sessions(darius.cookie)).toMatchObject([{ code: room.code, position: 0, duration: 100 }]);
  });
});
