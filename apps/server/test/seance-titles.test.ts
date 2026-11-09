import {
  API,
  CIRCLES_API,
  type CircleList,
  type CreateAccountResponse,
  type SessionList,
  WATCHLIST_API,
  type WatchlistResponse,
} from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import type { Connection } from "../src/rooms.ts";
import { openDatabase } from "../src/storage/database.ts";
import { createRepositories } from "../src/storage/repositories.ts";
import { jsonRequest, media, sessionCookieOf, testApp } from "./helpers.ts";
import { required } from "./required.ts";

const silent: Connection = { send: () => {}, close: () => {} };
const INTERSTELLAR = { id: 543, type: "movie", title: "Interstellar" } as const;
const EUPHORIA = { id: 91, type: "tv", title: "Euphoria", season: 1, episode: 1 } as const;

function setup() {
  const db = openDatabase(":memory:");
  const { app, services } = testApp({ now: () => 1000, db });
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
  const addToCircle = (cookie: string, title: object, circleId: string) =>
    app.request(
      WATCHLIST_API.list,
      jsonRequest("POST", { title, shareWith: "everyone", want: true, circleId }, { cookie }),
    );
  const circles = async (cookie: string) =>
    ((await (await app.request(CIRCLES_API.list, { headers: { cookie } })).json()) as CircleList).circles;
  /** Plays the séance to the end of its film. */
  function finish(room: ReturnType<typeof seance>) {
    const member = required(room.join("client-aaaa", "Darius", "peach", silent, 1000), "Darius to join");
    room.handle(member, { type: "ended", episode: 0 }, 2000);
  }
  return {
    app,
    services,
    repositories: createRepositories(db),
    account,
    seance,
    sessions,
    list,
    want,
    addToCircle,
    circles,
    finish,
  };
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

  it("marks « vu » the title of the séance's circle only, and the older titles shared with its people", async () => {
    const { account, seance, list, want, addToCircle, circles, finish } = setup();
    const darius = await account("Darius");
    const leo = await account("Léo");
    const ines = await account("Inès");
    seance(INTERSTELLAR, darius.id, leo.id);
    seance(INTERSTELLAR, darius.id, ines.id);
    const circleWith = async (name: string) =>
      (await circles(darius.cookie)).find((c) => c.members.some((m) => m.name === name))?.id ?? "";
    const withLeo = await circleWith("Léo");
    const withInes = await circleWith("Inès");
    // A title shared the older way, before circles, then the same film in each circle.
    await want(darius.cookie, INTERSTELLAR);
    await addToCircle(darius.cookie, INTERSTELLAR, withLeo);
    await addToCircle(darius.cookie, INTERSTELLAR, withInes);

    finish(seance(INTERSTELLAR, darius.id, leo.id));

    const watched = (await list(darius.cookie)).map((item) => [item.circleId ?? "aucun", item.watchedAt !== undefined]);
    expect(watched.sort()).toEqual(
      [
        ["aucun", true],
        [withLeo, true],
        [withInes, false],
      ].sort(),
    );
  });

  it("tells who watched it: the people of the séance that reached the end, not everyone the title is for", async () => {
    const { account, seance, list, want, finish } = setup();
    const darius = await account("Darius");
    const leo = await account("Léo");
    const ines = await account("Inès");
    seance(INTERSTELLAR, darius.id, leo.id, ines.id);
    await want(darius.cookie, INTERSTELLAR);

    finish(seance(INTERSTELLAR, darius.id, leo.id));

    const [item] = await list(ines.cookie);
    expect(item?.sharedWith.map((p) => p.name).sort()).toEqual(["Darius", "Inès", "Léo"]);
    expect(item?.watchedWith?.map((p) => p.name)).toEqual(["Darius", "Léo"]);
  });

  it("marks « vu », for a séance watched alone, only that person's titles outside any circle", async () => {
    const { account, seance, list, addToCircle, circles, finish, repositories } = setup();
    const darius = await account("Darius");
    const leo = await account("Léo");
    seance(INTERSTELLAR, darius.id, leo.id);
    const withLeo = (await circles(darius.cookie))[0]?.id ?? "";
    await addToCircle(darius.cookie, INTERSTELLAR, withLeo);
    repositories.watchlist.insert({
      id: "older",
      catalogKey: "movie:543",
      title: INTERSTELLAR,
      addedBy: darius.id,
      addedAt: 1000,
      memberIds: [darius.id],
      everyone: false,
      wantedBy: [darius.id],
    });

    finish(seance(INTERSTELLAR, darius.id));

    const watched = (await list(darius.cookie)).map((item) => [item.circleId ?? "aucun", item.watchedAt !== undefined]);
    expect(watched.sort()).toEqual(
      [
        ["aucun", true],
        [withLeo, false],
      ].sort(),
    );
  });
});
