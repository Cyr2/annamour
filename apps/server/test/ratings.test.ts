import {
  API,
  apiPath,
  CIRCLES_API,
  type CreateAccountResponse,
  RATINGS_API,
  type RatingsResponse,
} from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { jsonRequest, media, sessionCookieOf, testApp } from "./helpers.ts";

const VERITY = { id: 8809, type: "movie", title: "Verity", posterUrl: "https://image.tmdb.org/t/p/w342/verity.jpg" };

async function setup() {
  const clock = { now: 1000 };
  const { app, services } = testApp({ now: () => clock.now });
  async function account(name: string) {
    const response = await app.request(API.createAccount, jsonRequest("POST", { name, color: "peach" }));
    const { account } = (await response.json()) as CreateAccountResponse;
    return { id: account.id, cookie: sessionCookieOf(response) };
  }
  const rate = (cookie: string, body: unknown) => app.request(RATINGS_API.list, jsonRequest("PUT", body, { cookie }));
  const ratings = async (cookie: string) =>
    ((await (await app.request(RATINGS_API.list, { headers: { cookie } })).json()) as RatingsResponse).ratings;
  const watchTogether = (...ids: string[]) => {
    const room = services.store.create("Verity", media, clock.now);
    for (const id of ids) services.history.recordParticipation(room.code, id);
  };
  return { app, clock, account, rate, ratings, watchTogether };
}

describe("« Ton avis »", () => {
  it("is kept, changed, and seen by the people I watch with, not by others", async () => {
    const { clock, account, rate, ratings, watchTogether } = await setup();
    const darius = await account("Darius");
    const annou = await account("Annou");
    const leo = await account("Léo");
    watchTogether(darius.id, annou.id);

    expect((await rate(annou.cookie, { title: VERITY, rating: "liked" })).status).toBe(204);
    clock.now = 2000;
    await rate(annou.cookie, { title: VERITY, rating: "loved" });

    const seen = await ratings(darius.cookie);
    expect(seen).toEqual([
      { by: { accountId: annou.id, name: "Annou", color: "peach" }, title: VERITY, rating: "loved", ratedAt: 2000 },
    ]);
    expect(await ratings(leo.cookie)).toEqual([]);
  });

  it("is seen by the people of my circles, even before a séance with them", async () => {
    const { app, account, rate, ratings, watchTogether } = await setup();
    const darius = await account("Darius");
    const annou = await account("Annou");
    const leo = await account("Léo");
    watchTogether(darius.id, annou.id);
    // Léo joins the circle by its invitation, without having watched anything with Darius yet.
    const circles = (await (await app.request(CIRCLES_API.list, { headers: { cookie: darius.cookie } })).json()) as {
      circles: { id: string }[];
    };
    const id = circles.circles[0]?.id ?? "";
    const invite = (await (
      await app.request(apiPath(CIRCLES_API.invite, { id }), { method: "POST", headers: { cookie: darius.cookie } })
    ).json()) as { token: string };
    await app.request(CIRCLES_API.join, jsonRequest("POST", { token: invite.token }, { cookie: leo.cookie }));

    await rate(leo.cookie, { title: VERITY, rating: "meh" });
    expect((await ratings(darius.cookie)).map((r) => r.by.name)).toEqual(["Léo"]);
  });

  it("is taken back", async () => {
    const { app, account, rate, ratings } = await setup();
    const darius = await account("Darius");
    await rate(darius.cookie, { title: VERITY, rating: "disliked" });
    const removed = await app.request("/api/me/ratings/movie/8809", {
      method: "DELETE",
      headers: { cookie: darius.cookie },
    });
    expect(removed.status).toBe(204);
    expect(await ratings(darius.cookie)).toEqual([]);
    const nonsense = await app.request("/api/me/ratings/movie/abc", {
      method: "DELETE",
      headers: { cookie: darius.cookie },
    });
    expect(nonsense.status).toBe(404);
  });

  it("keeps only a poster the catalog serves, and refuses an avis that is not one of the four", async () => {
    const { account, rate, ratings } = await setup();
    const darius = await account("Darius");
    await rate(darius.cookie, { title: { ...VERITY, posterUrl: "https://example.com/pixel.gif" }, rating: "liked" });
    expect((await ratings(darius.cookie))[0]?.title.posterUrl).toBeUndefined();
    expect((await rate(darius.cookie, { title: VERITY, rating: "chef-d'oeuvre" })).status).toBe(400);
  });

  it("asks to sign in", async () => {
    const { app } = await setup();
    expect((await app.request(RATINGS_API.list)).status).toBe(401);
  });
});
