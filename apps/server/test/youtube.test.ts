import { describe, expect, it } from "vitest";
import type { Connection } from "../src/rooms.ts";
import { FetchError, type TextFetcher } from "../src/safe-fetch.ts";
import { jsonRequest, testApp } from "./helpers.ts";
import { required } from "./required.ts";

const LINK = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const silent: Connection = { send: () => {}, close: () => {} };

/** YouTube's oEmbed: the title of a known video, 404 for anything else. */
const fetchText: TextFetcher = async (url) => {
  if (url.hostname === "www.youtube.com" && url.pathname === "/oembed" && url.search.includes("dQw4w9WgXcQ"))
    return JSON.stringify({ title: "Never Gonna Give You Up", author_name: "Rick Astley" });
  throw new FetchError("not found", 404);
};

function setup() {
  return testApp({ fetchText, now: () => 1000 });
}

async function create(app: ReturnType<typeof setup>["app"], url = LINK) {
  return app.request("/api/rooms", jsonRequest("POST", { url }));
}

describe("a séance from a YouTube link", () => {
  it("plays in YouTube's player, named after the video, with nothing imported", async () => {
    const { app, services } = setup();
    const response = await create(app);
    expect(response.status).toBe(201);
    const { code } = (await response.json()) as { code: string };
    const media = required(services.store.get(code), "the séance").media;
    expect(media).toMatchObject({
      title: "Never Gonna Give You Up",
      src: "",
      youtube: { videoId: "dQw4w9WgXcQ", live: false },
    });
    expect(media.duration).toBeUndefined();
  });

  it("says plainly when the video is private, removed or not embeddable", async () => {
    const { app } = setup();
    const response = await create(app, "https://youtu.be/AAAAAAAAAAA");
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "Cette vidéo YouTube est introuvable, privée ou ne se laisse pas intégrer.",
    });
  });

  it("learns the video's length from the first player that loaded it", async () => {
    const { app, services } = setup();
    const { code } = (await (await create(app)).json()) as { code: string };
    const room = required(services.store.get(code), "the séance");
    const member = required(room.join("client-aaaa", "Darius", "peach", silent, 1000), "Darius to join");
    room.handle(member, { type: "youtubeInfo", episode: 0, duration: 213, live: false }, 1000);
    room.handle(member, { type: "youtubeInfo", episode: 0, duration: 999, live: false }, 1100);
    expect(room.media.duration).toBe(213);
  });

  it("becomes a live séance that takes nothing more, once the player says the video is live", async () => {
    const { app, services } = setup();
    const { code } = (await (await create(app)).json()) as { code: string };
    const room = required(services.store.get(code), "the séance");
    const member = required(room.join("client-aaaa", "Darius", "peach", silent, 1000), "Darius to join");
    room.handle(member, { type: "youtubeInfo", episode: 0, duration: 0, live: true }, 1000);
    expect(room.media.youtube).toEqual({ videoId: "dQw4w9WgXcQ", live: true });
    expect(room.media.duration).toBeUndefined();

    const added = await app.request(`/api/rooms/${code}/episodes`, jsonRequest("POST", { url: LINK }));
    expect(added.status).toBe(409);
  });

  it("puts everyone at the live edge, not at the start of YouTube's rewind window, and follows it", async () => {
    const { app, services } = setup();
    const { code } = (await (await create(app)).json()) as { code: string };
    const room = required(services.store.get(code), "the séance");
    const member = required(room.join("client-aaaa", "Darius", "peach", silent, 1000), "Darius to join");
    // A stream on air for 155 days: its edge is far past a day of seconds.
    const edge = 13_400_000;
    room.handle(member, { type: "youtubeInfo", episode: 0, duration: edge, live: true }, 1000);
    expect(room.playback.position).toBe(edge);
    room.handle(member, { type: "pause", position: edge + 30 }, 2000);
    expect(room.playback).toMatchObject({ status: "paused", position: edge + 30 });
  });

  it("refuses a video whose oEmbed gives no title: YouTube says so of one that does not play (an ended live)", async () => {
    const { app } = testApp({ fetchText: async () => JSON.stringify({ author_name: "Lofi Girl" }) });
    expect((await create(app)).status).toBe(422);
  });

  it("can queue a YouTube video after another, named after it", async () => {
    const { app, services } = setup();
    const { code } = (await (await create(app)).json()) as { code: string };
    const added = await app.request(`/api/rooms/${code}/episodes`, jsonRequest("POST", { url: LINK }));
    expect(added.status).toBe(201);
    const room = required(services.store.get(code), "the séance");
    expect(room.snapshot().episodes[1]?.label).toBe("Never Gonna Give You Up");
  });
});
