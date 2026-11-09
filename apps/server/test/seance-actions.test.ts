import {
  API,
  apiPath,
  CIRCLES_API,
  type CircleList,
  type CreateAccountResponse,
  type SessionList,
  WATCHLIST_API,
  type WatchlistResponse,
} from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import type { Connection } from "../src/rooms.ts";
import { jsonRequest, media, sessionCookieOf, testApp } from "./helpers.ts";
import { required } from "./required.ts";

const silent: Connection = { send: () => {}, close: () => {} };
const INTERSTELLAR = { id: 543, type: "movie", title: "Interstellar" } as const;

function setup() {
  const { app, services } = testApp({ now: () => 1000 });
  async function account(name: string) {
    const response = await app.request(API.createAccount, jsonRequest("POST", { name, color: "peach" }));
    const { account } = (await response.json()) as CreateAccountResponse;
    return { id: account.id, cookie: sessionCookieOf(response) };
  }
  /** A séance of Interstellar these people enter, the first one creating it. */
  function seance(...accountIds: string[]) {
    const room = services.store.create("Interstellar", media, 1000, { catalog: INTERSTELLAR });
    for (const id of accountIds) services.history.recordParticipation(room.code, id);
    return room;
  }
  const get = async <T>(path: string, cookie: string) =>
    (await (await app.request(path, { headers: { cookie } })).json()) as T;
  const codes = async (cookie: string) => (await get<SessionList>(API.sessions, cookie)).sessions.map((s) => s.code);
  const evenings = async (cookie: string) => (await get<CircleList>(CIRCLES_API.list, cookie)).circles[0]?.evenings;
  const send = (path: string, cookie: string, method = "DELETE") => app.request(path, { method, headers: { cookie } });
  return { app, services, account, seance, get, codes, evenings, send };
}

describe("leaving a séance", () => {
  it("takes it out of my séances and my circle's count, and leaves it to the others", async () => {
    const { account, seance, codes, evenings, send } = setup();
    const darius = await account("Darius");
    const annou = await account("Annou");
    seance(darius.id, annou.id);
    const room = seance(darius.id, annou.id);
    expect(await evenings(darius.cookie)).toBe(2);

    const left = await send(apiPath(API.session, { code: room.code }), darius.cookie);
    expect(left.status).toBe(204);
    expect(await codes(darius.cookie)).not.toContain(room.code);
    expect(await evenings(darius.cookie)).toBe(1);
    expect(await codes(annou.cookie)).toContain(room.code);
    expect(await evenings(annou.cookie)).toBe(2);
  });

  it("leaves my bubble to the others, marked gone, until I come back", async () => {
    const { account, seance, get, send, services, codes } = setup();
    const darius = await account("Darius");
    const annou = await account("Annou");
    const room = seance(darius.id, annou.id);
    const seenByAnnou = async () =>
      (await get<SessionList>(API.sessions, annou.cookie)).sessions.find((s) => s.code === room.code)?.participants;

    await send(apiPath(API.session, { code: room.code }), darius.cookie);
    expect(await seenByAnnou()).toMatchObject([{ name: "Darius", left: true }]);

    services.history.recordParticipation(room.code, darius.id);
    expect(await codes(darius.cookie)).toContain(room.code);
    expect((await seenByAnnou())?.[0]?.left).toBeUndefined();
  });
});

describe("a séance of several films", () => {
  it("lists each of them in order, with its poster, and a séance of one film none", async () => {
    const { account, seance, get, services } = setup();
    const darius = await account("Darius");
    const room = seance(darius.id);
    const alone = seance(darius.id);
    const dune = {
      id: 7,
      type: "movie",
      title: "Dune",
      posterUrl: "https://image.tmdb.org/t/p/w342/dune.jpg",
    } as const;
    services.store.addEpisode(room, undefined, media, dune);
    services.store.addEpisode(room, "Lien collé", media);

    const sessions = (await get<SessionList>(API.sessions, darius.cookie)).sessions;
    expect(sessions.find((s) => s.code === room.code)?.queue).toEqual([
      { title: "Interstellar", type: "movie" },
      { title: "Dune", type: "movie", posterUrl: dune.posterUrl },
      { title: "Lien collé" },
    ]);
    expect(sessions.find((s) => s.code === alone.code)?.queue).toBeUndefined();
  });
});

describe("deleting a séance for everyone", () => {
  it("is offered only to the person who created it", async () => {
    const { account, seance, get } = setup();
    const darius = await account("Darius");
    const annou = await account("Annou");
    seance(darius.id, annou.id);
    const mine = (s: SessionList) => s.sessions.map((session) => session.createdByMe ?? false);
    expect(mine(await get<SessionList>(API.sessions, darius.cookie))).toEqual([true]);
    expect(mine(await get<SessionList>(API.sessions, annou.cookie))).toEqual([false]);
  });

  it("removes it for everyone, and what it marked « vu » goes back to watch", async () => {
    const { app, account, seance, codes, get, send } = setup();
    const darius = await account("Darius");
    const annou = await account("Annou");
    seance(darius.id, annou.id);
    await app.request(
      WATCHLIST_API.list,
      jsonRequest("POST", { title: INTERSTELLAR, shareWith: "everyone", want: true }, { cookie: annou.cookie }),
    );
    const room = seance(darius.id, annou.id);
    const member = required(room.join("client-aaaa", "Darius", "peach", silent, 1000), "Darius to join");
    room.handle(member, { type: "ended", episode: 0 }, 2000);
    expect((await get<WatchlistResponse>(WATCHLIST_API.list, annou.cookie)).items[0]?.watchedAt).toBeDefined();

    const deleted = await send(apiPath(API.sessionForEveryone, { code: room.code }), darius.cookie);
    expect(deleted.status).toBe(204);
    expect(await codes(darius.cookie)).not.toContain(room.code);
    expect(await codes(annou.cookie)).not.toContain(room.code);
    expect((await app.request(`/api/rooms/${room.code}`)).status).toBe(404);
    expect((await get<WatchlistResponse>(WATCHLIST_API.list, annou.cookie)).items[0]?.watchedAt).toBeUndefined();
  });

  it("is refused to someone who only joined it, who can leave it instead", async () => {
    const { account, seance, codes, send } = setup();
    const darius = await account("Darius");
    const annou = await account("Annou");
    const room = seance(darius.id, annou.id);
    const refused = await send(apiPath(API.sessionForEveryone, { code: room.code }), annou.cookie);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: expect.stringMatching(/quitter/) });
    expect(await codes(darius.cookie)).toContain(room.code);
  });
});
