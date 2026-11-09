import {
  API,
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
const EUPHORIA = { id: 91, type: "tv", title: "Euphoria", season: 1, episode: 1 } as const;

function setup() {
  const { app, services } = testApp({ now: () => 1000 });
  async function account(name: string) {
    const response = await app.request(API.createAccount, jsonRequest("POST", { name, color: "peach" }));
    const { account } = (await response.json()) as CreateAccountResponse;
    return { id: account.id, cookie: sessionCookieOf(response) };
  }
  /** A séance of this catalog title, Darius and Annou in it (so they share a circle and a list). */
  function seance(catalog: typeof INTERSTELLAR | typeof EUPHORIA, ...accountIds: string[]) {
    const room = services.store.create(catalog.title, media, 1000, { catalog });
    for (const id of accountIds) services.history.recordParticipation(room.code, id);
    return room;
  }
  const sessions = async (cookie: string) =>
    ((await (await app.request(API.sessions, { headers: { cookie } })).json()) as SessionList).sessions;
  const list = async (cookie: string) =>
    ((await (await app.request(WATCHLIST_API.list, { headers: { cookie } })).json()) as WatchlistResponse).items;
  const want = (cookie: string, title: object) =>
    app.request(WATCHLIST_API.list, jsonRequest("POST", { title, shareWith: "everyone", want: true }, { cookie }));
  return { app, services, account, seance, sessions, list, want };
}

describe("a séance and the title it plays", () => {
  it("tells which catalog title it plays, so a title can lead back to its séance", async () => {
    const { account, seance, sessions } = setup();
    const darius = await account("Darius");
    seance(INTERSTELLAR, darius.id);
    expect((await sessions(darius.cookie))[0]?.catalog).toEqual({ id: 543, type: "movie" });
  });

  it("marks a film « vu » in everyone's list when the séance reaches its end, not before", async () => {
    const { account, seance, list, want } = setup();
    const darius = await account("Darius");
    const annou = await account("Annou");
    seance(INTERSTELLAR, darius.id, annou.id);
    await want(annou.cookie, { id: 543, type: "movie", title: "Interstellar" });
    const room = seance(INTERSTELLAR, darius.id, annou.id);
    const member = required(room.join("client-aaaa", "Darius", "peach", silent, 1000), "Darius to join");
    expect((await list(darius.cookie))[0]?.watchedAt).toBeUndefined();

    room.handle(member, { type: "ended", episode: 0 }, 2000);
    expect((await list(darius.cookie))[0]?.watchedAt).toBeDefined();
    expect((await list(annou.cookie))[0]?.watchedAt).toBeDefined();
  });

  it("leaves a series to watch at the end of one episode", async () => {
    const { account, seance, list, want } = setup();
    const darius = await account("Darius");
    await want(darius.cookie, { id: 91, type: "tv", title: "Euphoria" });
    const room = seance(EUPHORIA, darius.id);
    const member = required(room.join("client-aaaa", "Darius", "peach", silent, 1000), "Darius to join");
    room.handle(member, { type: "ended", episode: 0 }, 2000);
    expect((await list(darius.cookie))[0]?.watchedAt).toBeUndefined();
  });
});
