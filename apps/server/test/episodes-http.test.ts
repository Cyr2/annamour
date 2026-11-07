import { MAX_EPISODES, type RoomSnapshot } from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { FetchError, type TextFetcher } from "../src/safe-fetch.ts";
import { jsonRequest, media, testApp } from "./helpers.ts";

const EPISODE = "https://cdn.example/bear/s2e5/master.m3u8";
const fakeFetch: TextFetcher = async (url) => {
  if (url.href === EPISODE) return "#EXTM3U\n#EXTINF:30,\ns0.ts\n#EXT-X-ENDLIST";
  throw new FetchError("not found", 404);
};

function setup() {
  const { app, services } = testApp({ fetchText: fakeFetch, now: () => 1000 });
  const room = services.store.create("The Bear", media, 1000);
  const addEpisode = (body: unknown, code = room.code) =>
    app.request(`/api/rooms/${code}/episodes`, jsonRequest("POST", body));
  return { app, services, room, addEpisode };
}

describe("queuing the next episode", () => {
  it("imports it, shows it in the séance and serves its files before it plays", async () => {
    const { app, room, addEpisode } = setup();
    const added = await addEpisode({ url: EPISODE, label: "S2 · É5" });
    expect(added.status).toBe(201);
    expect(await added.json()).toEqual({ episode: 1 });

    const snapshot = (await (await app.request(`/api/rooms/${room.code}`)).json()) as RoomSnapshot;
    expect(snapshot.episodes).toEqual([{ duration: 100 }, { label: "S2 · É5", duration: 30 }]);
    const playlist = await app.request(`/api/rooms/${room.code}/e/1/hls/master.m3u8`);
    expect(await playlist.text()).toContain("https://cdn.example/bear/s2e5/s0.ts");
  });

  it("guesses the label when none is given", async () => {
    const { room, addEpisode } = setup();
    await addEpisode({ url: EPISODE });
    await addEpisode({ url: EPISODE });
    expect(room.snapshot().episodes.map((e) => e.label)).toEqual([undefined, "Épisode 2", "Épisode 3"]);
  });

  it("says plainly when the link or the séance is wrong", async () => {
    const { addEpisode } = setup();
    expect((await addEpisode({ url: "https://cdn.example/nope.m3u8" })).status).toBe(422);
    expect((await addEpisode({ url: "pas un lien" })).status).toBe(400);
    expect((await addEpisode({ url: EPISODE }, "ZZZZ")).status).toBe(404);
    expect((await addEpisode({ url: EPISODE }, "nope")).status).toBe(404);
  });

  it("refuses a 51st episode before importing anything", async () => {
    const { services, room } = setup();
    for (let i = 1; i < MAX_EPISODES; i++) services.store.addEpisode(room, `É${i + 1}`, media);
    await expect(services.rooms.addEpisode(room.code, new URL(EPISODE), undefined)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("answers 404 for the files of an episode that does not exist", async () => {
    const { app, room } = setup();
    expect((await app.request(`/api/rooms/${room.code}/e/7/hls/master.m3u8`)).status).toBe(404);
    expect((await app.request(`/api/rooms/${room.code}/e/x/subs/subs_fre.vtt`)).status).toBe(404);
  });
});

describe("my sessions, for a séance with episodes", () => {
  it("say which episode the séance is on, out of how many", async () => {
    const { services, room, addEpisode } = setup();
    const { account } = services.accounts.create("Darius", "peach");
    services.history.recordParticipation(room.code, account.id);
    await addEpisode({ url: EPISODE, label: "S2 · É5" });
    expect(services.history.list(account.id)[0]?.episode).toEqual({ index: 0, count: 2 });

    const connection = { send: () => {}, close: () => {} };
    const member = room.join("client-aaaa", "Darius", "peach", connection, 2000) ?? "";
    room.handle(member, { type: "nextEpisode", episode: 0 }, 3000);
    expect(services.history.list(account.id)[0]).toMatchObject({
      duration: 30,
      position: 0,
      episode: { index: 1, count: 2, label: "S2 · É5" },
    });
  });
});
