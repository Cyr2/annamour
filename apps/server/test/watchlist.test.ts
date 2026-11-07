import { DatabaseSync } from "node:sqlite";
import {
  API,
  type CatalogTitle,
  type CreateAccountResponse,
  WATCHLIST_API,
  type WatchlistItem,
  type WatchlistResponse,
} from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { migrate } from "../src/storage/database.ts";
import { jsonRequest, media, sessionCookieOf, testApp } from "./helpers.ts";

const film: CatalogTitle = { id: 157336, type: "movie", title: "Interstellar", year: 2014, runtime: 169 };
const series: CatalogTitle = { id: 1399, type: "tv", title: "The Bear", seasons: 3 };

function setup() {
  const clock = { now: 1000 };
  const { app, services } = testApp({ now: () => clock.now });
  async function account(name: string, color = "sky") {
    const response = await app.request(API.createAccount, jsonRequest("POST", { name, color }));
    const { account } = (await response.json()) as CreateAccountResponse;
    return { ...account, cookie: sessionCookieOf(response) };
  }
  /** Puts these people in one séance together: they may then share titles. */
  function watchTogether(...ids: string[]) {
    const room = services.store.create("Film", media, clock.now);
    for (const id of ids) services.history.recordParticipation(room.code, id);
  }
  const path = (template: string, id: string) => template.replace(":id", id);
  async function add(cookie: string, body: unknown) {
    return app.request(WATCHLIST_API.list, jsonRequest("POST", body, { cookie }));
  }
  async function list(cookie: string): Promise<WatchlistItem[]> {
    const response = await app.request(WATCHLIST_API.list, { headers: { cookie } });
    return ((await response.json()) as WatchlistResponse).items;
  }
  const put = (cookie: string, template: string, id: string, body: unknown) =>
    app.request(path(template, id), jsonRequest("PATCH", body, { cookie }));
  const remove = (cookie: string, id: string) =>
    app.request(path(WATCHLIST_API.item, id), { method: "DELETE", headers: { cookie } });
  return { app, services, clock, account, watchTogether, add, list, put, remove };
}

describe("the shared watchlist", () => {
  it("shows a title to everyone it is shared with, and to nobody else", async () => {
    const { account, watchTogether, add, list } = setup();
    const darius = await account("Darius", "peach");
    const lea = await account("Léa", "lilac");
    const ines = await account("Inès", "mint");
    watchTogether(darius.id, lea.id, ines.id);

    const added = await add(darius.cookie, { title: film, shareWith: [lea.id], want: true });
    expect(added.status).toBe(201);

    const forLea = await list(lea.cookie);
    expect(forLea).toHaveLength(1);
    expect(forLea[0]).toMatchObject({
      title: film,
      addedBy: { accountId: darius.id, name: "Darius" },
      wantedBy: [darius.id],
    });
    expect(forLea[0]?.sharedWith.map((p) => p.name)).toEqual(["Darius", "Léa"]);
    expect(await list(ines.cookie)).toEqual([]);
  });

  it("shares with everyone I watched with at once", async () => {
    const { account, watchTogether, add, list } = setup();
    const darius = await account("Darius");
    const lea = await account("Léa");
    const ines = await account("Inès");
    watchTogether(darius.id, lea.id);
    watchTogether(darius.id, ines.id);
    await add(darius.cookie, { title: series, shareWith: "everyone", want: false });
    expect(await list(ines.cookie)).toHaveLength(1);
    expect((await list(lea.cookie))[0]?.wantedBy).toEqual([]);
  });

  it("shows a « Tout le monde » title to people I watch with after adding it", async () => {
    const { account, watchTogether, add, list, put } = setup();
    const darius = await account("Darius");
    const annou = await account("Annou", "rose");
    await add(darius.cookie, { title: series, shareWith: "everyone", want: true });
    expect(await list(annou.cookie)).toEqual([]);

    watchTogether(darius.id, annou.id);
    const seen = await list(annou.cookie);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.sharedWith.map((p) => p.name)).toEqual(["Darius", "Annou"]);

    // Seeing it through « Tout le monde » is enough to say « J'ai envie ».
    expect((await put(annou.cookie, WATCHLIST_API.want, seen[0]?.id ?? "", { want: true })).status).toBe(204);
    expect((await list(darius.cookie))[0]?.wantedBy.sort()).toEqual([annou.id, darius.id].sort());
  });

  it("turns a title shared with its author alone into « Tout le monde » (saved before it existed)", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    migrate(db);
    // The database as it was before « Tout le monde » followed the history.
    db.exec("ALTER TABLE watchlist_items DROP COLUMN everyone; PRAGMA user_version = 5;");
    db.exec(
      "INSERT INTO accounts (id, key_hash, name, color, created_at) VALUES ('d', 'h1', 'Darius', 'peach', 0), ('l', 'h2', 'Léa', 'lilac', 0)",
    );
    db.exec(`INSERT INTO watchlist_items (id, catalog_key, title, added_by, added_at) VALUES
      ('alone', 'tv:1', '{"id":1,"type":"tv","title":"Campus Drivers"}', 'd', 0),
      ('shared', 'movie:2', '{"id":2,"type":"movie","title":"Interstellar"}', 'd', 0)`);
    db.exec(
      "INSERT INTO watchlist_members (item_id, account_id) VALUES ('alone', 'd'), ('shared', 'd'), ('shared', 'l')",
    );

    migrate(db);

    const everyone = (id: string) => db.prepare("SELECT everyone FROM watchlist_items WHERE id = ?").get(id);
    expect(everyone("alone")).toEqual({ everyone: 1 });
    expect(everyone("shared")).toEqual({ everyone: 0 });
  });

  it("never puts a title on a stranger's list", async () => {
    const { account, add, list } = setup();
    const darius = await account("Darius");
    const stranger = await account("Inconnu");
    const refused = await add(darius.cookie, { title: film, shareWith: [stranger.id], want: true });
    expect(refused.status).toBe(400);
    expect(await list(stranger.cookie)).toEqual([]);
  });

  it("forgets the people of séances I removed from my history: no sharing with them any more", async () => {
    const { account, add, list, services } = setup();
    const darius = await account("Darius");
    const lea = await account("Léa");
    const room = services.store.create("Film", media, 1000);
    services.history.recordParticipation(room.code, darius.id);
    services.history.recordParticipation(room.code, lea.id);
    services.history.hide(room.code, darius.id);

    expect((await add(darius.cookie, { title: film, shareWith: [lea.id], want: true })).status).toBe(400);
    await add(darius.cookie, { title: series, shareWith: "everyone", want: true });
    expect(await list(lea.cookie)).toEqual([]);
  });

  it("keeps a title once: adding it again shares the same one and counts the wish", async () => {
    const { account, watchTogether, add, list } = setup();
    const darius = await account("Darius");
    const lea = await account("Léa");
    watchTogether(darius.id, lea.id);
    await add(darius.cookie, { title: film, shareWith: [lea.id], want: true });
    await add(lea.cookie, { title: film, shareWith: [darius.id], want: true });
    const items = await list(darius.cookie);
    expect(items).toHaveLength(1);
    expect(items[0]?.wantedBy.sort()).toEqual([darius.id, lea.id].sort());
  });

  it("lets anyone it is shared with say « J'ai envie », mark it watched, or remove it for all", async () => {
    const { clock, account, watchTogether, add, list, put, remove } = setup();
    const darius = await account("Darius");
    const lea = await account("Léa");
    watchTogether(darius.id, lea.id);
    await add(darius.cookie, { title: film, shareWith: [lea.id], want: false });
    const id = (await list(lea.cookie))[0]?.id ?? "";

    expect((await put(lea.cookie, WATCHLIST_API.want, id, { want: true })).status).toBe(204);
    expect((await list(darius.cookie))[0]?.wantedBy).toEqual([lea.id]);

    clock.now = 5000;
    await put(lea.cookie, WATCHLIST_API.watched, id, { watched: true });
    expect((await list(darius.cookie))[0]?.watchedAt).toBe(5000);
    await put(lea.cookie, WATCHLIST_API.watched, id, { watched: false });
    expect((await list(darius.cookie))[0]?.watchedAt).toBeUndefined();

    expect((await remove(lea.cookie, id)).status).toBe(204);
    expect(await list(darius.cookie)).toEqual([]);
  });

  it("answers 404 to someone the title is not shared with", async () => {
    const { account, watchTogether, add, list, put, remove } = setup();
    const darius = await account("Darius");
    const lea = await account("Léa");
    const ines = await account("Inès");
    watchTogether(darius.id, lea.id, ines.id);
    await add(darius.cookie, { title: film, shareWith: [lea.id], want: false });
    const id = (await list(darius.cookie))[0]?.id ?? "";
    expect((await put(ines.cookie, WATCHLIST_API.want, id, { want: true })).status).toBe(404);
    expect((await remove(ines.cookie, id)).status).toBe(404);
    expect(await list(darius.cookie)).toHaveLength(1);
  });

  it("is only for signed-in people", async () => {
    const { app } = setup();
    expect((await app.request(WATCHLIST_API.list)).status).toBe(401);
  });
});
