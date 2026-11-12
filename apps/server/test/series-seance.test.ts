import { API, type CreateAccountResponse, type SessionList } from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import type { Connection } from "../src/rooms.ts";
import { jsonRequest, media, sessionCookieOf, testApp } from "./helpers.ts";
import { required } from "./required.ts";

const silent: Connection = { send: () => {}, close: () => {} };
const POSTER = "https://image.tmdb.org/t/p/w342/anne.jpg";
const episode = (number: number) => ({ id: 2279, type: "tv", title: "Anne", season: 1, episode: number }) as const;

async function setup() {
  const { app, services } = testApp({ now: () => 1000 });
  const response = await app.request(API.createAccount, jsonRequest("POST", { name: "Darius", color: "peach" }));
  const { account } = (await response.json()) as CreateAccountResponse;
  const cookie = sessionCookieOf(response);
  /** « Anne », its first episode chosen in the catalog with its poster, the next ones queued with « Épisode suivant ». */
  const series = (episodes: number) => {
    const room = services.store.create("Anne", media, 1000, {
      label: "S1 · É1",
      catalog: { ...episode(1), posterUrl: POSTER },
    });
    services.history.recordParticipation(room.code, account.id);
    for (let number = 2; number <= episodes; number++)
      services.store.addEpisode(room, `S1 · É${number}`, media, episode(number));
    return room;
  };
  const sessions = async () =>
    ((await (await app.request(API.sessions, { headers: { cookie } })).json()) as SessionList).sessions;
  return { services, series, sessions };
}

/** Darius watches to `position` (of 100 s), then leaves: the séance is empty. */
function watchThenLeave(room: ReturnType<Awaited<ReturnType<typeof setup>>["series"]>, position: number) {
  const member = required(room.join("client-aaaa", "Darius", "peach", silent, 1000), "Darius to join");
  room.handle(member, { type: "pause", position }, 2000);
  room.leave(member, silent, 3000);
}

describe("a séance of a series", () => {
  it("keeps the series' poster on its card once past the first episode", async () => {
    const { series, sessions } = await setup();
    const room = series(3);
    watchThenLeave(room, 100);
    expect((await sessions())[0]).toMatchObject({ episode: { index: 1 }, posterUrl: POSTER });
  });

  it("counts an episode left during its credits as watched, and reopens on the next one", async () => {
    const { series, sessions } = await setup();
    const room = series(3);
    watchThenLeave(room, 95);
    expect((await sessions())[0]).toMatchObject({ episode: { index: 1 }, position: 0 });
  });

  it("stays on an episode left before its credits", async () => {
    const { series, sessions } = await setup();
    const room = series(3);
    watchThenLeave(room, 30);
    expect((await sessions())[0]).toMatchObject({ episode: { index: 0 }, position: 30 });
  });
});
