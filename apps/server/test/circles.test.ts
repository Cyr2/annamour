import {
  API,
  apiPath,
  CIRCLES_API,
  type CircleInvite,
  type CircleList,
  type CreateAccountResponse,
  type SessionList,
  WATCHLIST_API,
  type WatchlistResponse,
} from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { CircleService } from "../src/services/circle-service.ts";
import { openDatabase } from "../src/storage/database.ts";
import { createRepositories } from "../src/storage/repositories.ts";
import { jsonRequest, media, sessionCookieOf, testApp } from "./helpers.ts";

function setup() {
  const clock = { now: 1000 };
  const { app, services } = testApp({ now: () => clock.now });
  async function account(name: string, color = "sky") {
    const response = await app.request(API.createAccount, jsonRequest("POST", { name, color }));
    const { account } = (await response.json()) as CreateAccountResponse;
    return { ...account, cookie: sessionCookieOf(response) };
  }
  /** A séance these people join, in this order; returns its code. */
  function seance(...ids: string[]) {
    const room = services.store.create("Film", media, clock.now);
    for (const id of ids) services.history.recordParticipation(room.code, id);
    return room.code;
  }
  async function circlesOf(cookie: string) {
    const response = await app.request(CIRCLES_API.list, { headers: { cookie } });
    return ((await response.json()) as CircleList).circles;
  }
  const send = (cookie: string, method: string, path: string, body?: unknown) =>
    app.request(path, body === undefined ? { method, headers: { cookie } } : jsonRequest(method, body, { cookie }));
  return { app, services, clock, account, seance, circlesOf, send };
}

describe("circles", () => {
  it("form by themselves from a séance of several people, and the next séance of the same people joins it", async () => {
    const { account, seance, circlesOf } = setup();
    const darius = await account("Darius", "peach");
    const annou = await account("Annou", "rose");
    seance(darius.id, annou.id);
    seance(darius.id, annou.id);

    const circles = await circlesOf(darius.cookie);
    expect(circles).toHaveLength(1);
    expect(circles[0]).toMatchObject({ evenings: 2 });
    expect(circles[0]?.members.map((m) => m.name)).toEqual(["Darius", "Annou"]);
    expect(await circlesOf(annou.cookie)).toEqual(circles);
  });

  it("are not made for a séance watched alone", async () => {
    const { account, seance, circlesOf } = setup();
    const darius = await account("Darius");
    seance(darius.id);
    expect(await circlesOf(darius.cookie)).toEqual([]);
  });

  it("grow with a séance whose people arrive one after the other, leaving no circle behind", async () => {
    const { account, seance, circlesOf } = setup();
    const darius = await account("Darius");
    const leo = await account("Léo");
    const ines = await account("Inès");
    seance(darius.id, leo.id, ines.id);

    const circles = await circlesOf(darius.cookie);
    expect(circles).toHaveLength(1);
    expect(circles[0]?.members.map((m) => m.name)).toEqual(["Darius", "Léo", "Inès"]);
    expect(circles[0]?.evenings).toBe(1);
  });

  it("keep a circle that already has its own séances, and move a séance someone from outside joins", async () => {
    const { account, seance, circlesOf, services } = setup();
    const darius = await account("Darius");
    const annou = await account("Annou");
    const leo = await account("Léo");
    seance(darius.id, annou.id);
    const code = seance(darius.id, annou.id);
    services.history.recordParticipation(code, leo.id);

    const circles = await circlesOf(darius.cookie);
    expect(circles.map((c) => c.members.length).sort()).toEqual([2, 3]);
    expect(circles.find((c) => c.members.length === 3)?.evenings).toBe(1);
    expect(circles.find((c) => c.members.length === 2)?.evenings).toBe(1);
  });

  it("send a séance to the circle of exactly its people when there is one, dropping the one it was forming", async () => {
    const { account, seance, circlesOf, services } = setup();
    const darius = await account("Darius");
    const leo = await account("Léo");
    const ines = await account("Inès");
    seance(darius.id, leo.id, ines.id);
    const code = seance(darius.id, leo.id);
    services.history.recordParticipation(code, ines.id);

    const circles = await circlesOf(darius.cookie);
    expect(circles).toHaveLength(1);
    expect(circles[0]?.evenings).toBe(2);
  });

  it("keep a circle someone named, even when it was forming", async () => {
    const { account, seance, circlesOf, services, send } = setup();
    const darius = await account("Darius");
    const annou = await account("Annou");
    const leo = await account("Léo");
    const code = seance(darius.id, annou.id);
    const duo = (await circlesOf(darius.cookie))[0]?.id ?? "";
    await send(darius.cookie, "PATCH", apiPath(CIRCLES_API.item, { id: duo }), { name: "Nous deux" });
    services.history.recordParticipation(code, leo.id);

    expect((await circlesOf(darius.cookie)).map((c) => c.members.length).sort()).toEqual([2, 3]);
  });

  it("keep a séance started from a circle in it while only its people come", async () => {
    const { account, seance, circlesOf, services } = setup();
    const darius = await account("Darius");
    const annou = await account("Annou");
    const leo = await account("Léo");
    seance(darius.id, annou.id, leo.id);
    const potes = (await circlesOf(darius.cookie))[0]?.id ?? "";

    const room = services.store.create("Soirée", media, 2000);
    services.circles.assignRoom(darius.id, room.code, potes);
    services.history.recordParticipation(room.code, darius.id);
    services.history.recordParticipation(room.code, annou.id);
    expect((await circlesOf(darius.cookie)).find((c) => c.id === potes)?.evenings).toBe(2);
  });

  it("come in the order each person sets, new ones after, without changing anyone else's", async () => {
    const { account, seance, circlesOf, send, clock } = setup();
    const darius = await account("Darius");
    const annou = await account("Annou");
    const leo = await account("Léo");
    const ines = await account("Inès");
    seance(darius.id, annou.id);
    clock.now = 2000;
    seance(darius.id, leo.id);
    const names = async (cookie: string) =>
      (await circlesOf(cookie)).map((c) => c.members.map((m) => m.name).join("+"));
    expect(await names(darius.cookie)).toEqual(["Darius+Léo", "Darius+Annou"]);

    const [potes, duo] = (await circlesOf(darius.cookie)).map((c) => c.id);
    const order = await send(darius.cookie, "PUT", CIRCLES_API.order, { ids: [duo, potes, "pas-a-moi"] });
    expect(order.status).toBe(204);
    clock.now = 3000;
    seance(darius.id, ines.id);
    expect(await names(darius.cookie)).toEqual(["Darius+Annou", "Darius+Léo", "Darius+Inès"]);
    expect(await names(annou.cookie)).toEqual(["Darius+Annou"]);
  });

  it("are named, left, and disappear when nobody is left", async () => {
    const { account, seance, circlesOf, send } = setup();
    const darius = await account("Darius");
    const annou = await account("Annou");
    seance(darius.id, annou.id);
    const id = (await circlesOf(darius.cookie))[0]?.id ?? "";

    expect((await send(annou.cookie, "PATCH", apiPath(CIRCLES_API.item, { id }), { name: "Nous deux" })).status).toBe(
      204,
    );
    expect((await circlesOf(darius.cookie))[0]?.name).toBe("Nous deux");

    await send(darius.cookie, "DELETE", apiPath(CIRCLES_API.item, { id }));
    expect(await circlesOf(darius.cookie)).toEqual([]);
    expect((await circlesOf(annou.cookie))[0]?.members.map((m) => m.name)).toEqual(["Annou"]);
    await send(annou.cookie, "DELETE", apiPath(CIRCLES_API.item, { id }));
    expect(await circlesOf(annou.cookie)).toEqual([]);
  });

  it("let someone in with an invitation link, shown before saying yes", async () => {
    const { account, circlesOf, send, clock } = setup();
    const darius = await account("Darius");
    const ines = await account("Inès");
    const created = await send(darius.cookie, "POST", CIRCLES_API.list, { name: "Les potes" });
    const { id } = (await created.json()) as { id: string };
    const invite = (await (
      await send(darius.cookie, "POST", apiPath(CIRCLES_API.invite, { id }))
    ).json()) as CircleInvite;

    const preview = await send(ines.cookie, "GET", apiPath(CIRCLES_API.preview, { token: invite.token }));
    expect(await preview.json()).toMatchObject({ id, name: "Les potes", members: [{ name: "Darius" }] });
    expect((await send(ines.cookie, "POST", CIRCLES_API.join, { token: invite.token })).status).toBe(200);
    expect((await circlesOf(ines.cookie))[0]?.members.map((m) => m.name).sort()).toEqual(["Darius", "Inès"]);

    clock.now += 8 * 24 * 60 * 60 * 1000;
    const late = await account("Léo");
    expect((await send(late.cookie, "POST", CIRCLES_API.join, { token: invite.token })).status).toBe(410);
  });

  it("answer 404 to someone who is not in it", async () => {
    const { account, seance, circlesOf, send } = setup();
    const darius = await account("Darius");
    const annou = await account("Annou");
    const stranger = await account("Inconnu");
    seance(darius.id, annou.id);
    const id = (await circlesOf(darius.cookie))[0]?.id ?? "";
    expect((await send(stranger.cookie, "PATCH", apiPath(CIRCLES_API.item, { id }), { name: "À moi" })).status).toBe(
      404,
    );
    expect((await send(stranger.cookie, "POST", apiPath(CIRCLES_API.invite, { id }))).status).toBe(404);
  });

  it("keep their people when a séance leaves someone's history", async () => {
    const { account, seance, circlesOf, services } = setup();
    const darius = await account("Darius");
    const annou = await account("Annou");
    const code = seance(darius.id, annou.id);
    services.history.hide(code, darius.id);
    expect((await circlesOf(darius.cookie))[0]?.members.map((m) => m.name)).toEqual(["Darius", "Annou"]);
  });

  it("show which circle each séance is in", async () => {
    const { app, account, seance, circlesOf } = setup();
    const darius = await account("Darius");
    const annou = await account("Annou");
    seance(darius.id, annou.id);
    const id = (await circlesOf(darius.cookie))[0]?.id;
    const response = await app.request(API.sessions, { headers: { cookie: darius.cookie } });
    expect(((await response.json()) as SessionList).sessions[0]?.circleId).toBe(id);
  });

  it("find theirs for séances made before circles existed", () => {
    const db = openDatabase(":memory:");
    const repositories = createRepositories(db);
    const { services } = testApp({ db });
    const darius = services.accounts.create("Darius", "peach").account;
    const annou = services.accounts.create("Annou", "rose").account;
    const room = services.store.create("Ancien film", media, 1000);
    // Recorded straight in the database, as before circles: no circle yet.
    repositories.participations.record(room.code, darius.id, 1000);
    repositories.participations.record(room.code, annou.id, 1000);
    expect(services.circles.list(darius.id)).toEqual([]);

    new CircleService({ repositories, now: () => 2000 }).backfill();
    expect(services.circles.list(darius.id)[0]?.evenings).toBe(1);
  });
});

describe("a title in a circle", () => {
  it("is seen by everyone in the circle, people invited later included, and nobody else", async () => {
    const { account, seance, circlesOf, send } = setup();
    const darius = await account("Darius");
    const annou = await account("Annou");
    const stranger = await account("Inconnu");
    seance(darius.id, annou.id);
    const id = (await circlesOf(darius.cookie))[0]?.id ?? "";
    const title = { id: 1399, type: "tv", title: "The Bear", seasons: 3 };
    expect(
      (
        await send(darius.cookie, "POST", WATCHLIST_API.list, {
          title,
          shareWith: "everyone",
          want: true,
          circleId: id,
        })
      ).status,
    ).toBe(201);

    const listOf = async (cookie: string) =>
      ((await (await send(cookie, "GET", WATCHLIST_API.list)).json()) as WatchlistResponse).items;
    expect((await listOf(annou.cookie))[0]).toMatchObject({ circleId: id, title: { title: "The Bear" } });
    expect(await listOf(stranger.cookie)).toEqual([]);

    const invite = (await (
      await send(darius.cookie, "POST", apiPath(CIRCLES_API.invite, { id }))
    ).json()) as CircleInvite;
    await send(stranger.cookie, "POST", CIRCLES_API.join, { token: invite.token });
    expect(await listOf(stranger.cookie)).toHaveLength(1);
  });

  it("cannot be added to a circle one is not in", async () => {
    const { account, seance, circlesOf, send } = setup();
    const darius = await account("Darius");
    const annou = await account("Annou");
    const stranger = await account("Inconnu");
    seance(darius.id, annou.id);
    const id = (await circlesOf(darius.cookie))[0]?.id ?? "";
    const title = { id: 1, type: "movie", title: "Film" };
    expect(
      (
        await send(stranger.cookie, "POST", WATCHLIST_API.list, {
          title,
          shareWith: "everyone",
          want: true,
          circleId: id,
        })
      ).status,
    ).toBe(404);
  });
});
