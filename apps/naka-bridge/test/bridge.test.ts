import { describe, expect, it } from "vitest";
import { mediaUrl, nakaApiPath } from "../src/allowlist.ts";
import { type BridgeDeps, handleBridgeRequest, type NakaCaller } from "../src/bridge.ts";
import { CallBudget } from "../src/budget.ts";
import { MediaGate } from "../src/media-gate.ts";

function fakeNaka(answer = { status: 200, body: "{}" }) {
  const calls: string[] = [];
  const naka: NakaCaller = {
    call: async (path) => {
      calls.push(path);
      return answer;
    },
    fetchMedia: async (url) => {
      calls.push(url.href);
      return { status: 200, body: new Uint8Array([1, 2, 3]), contentType: "video/mp2t" };
    },
  };
  return { naka, calls };
}

function deps(naka: NakaCaller, max = 5, media = new MediaGate()): BridgeDeps {
  return { secret: "s3cret", naka, budget: new CallBudget({ max, windowMs: 60_000 }), media, now: () => 1000 };
}

const SEGMENT = "https://media.dooms.fit/movies/157336-unr8i/720p/segment-050.ts";
const media = (url: string) => `/media?url=${encodeURIComponent(url)}`;

describe("which video files the bridge downloads", () => {
  it("allows a segment from Naka's video host", () => {
    expect(mediaUrl(media(SEGMENT))?.href).toBe(SEGMENT);
    expect(mediaUrl(media("https://media.dooms.fit/movies/1/audio_fr/segment-000.aac"))).not.toBeNull();
  });

  it("refuses any other host, page or scheme", () => {
    expect(mediaUrl(media("https://naka.cx/api/v1/profiles"))).toBeNull();
    expect(mediaUrl(media("https://media.dooms.fit/index.html"))).toBeNull();
    expect(mediaUrl(media("http://media.dooms.fit/a.ts"))).toBeNull();
    expect(mediaUrl(media("https://evil.test/a.ts"))).toBeNull();
    expect(mediaUrl("/media")).toBeNull();
    expect(mediaUrl("/other?url=x")).toBeNull();
  });

  it("downloads an allowed segment and passes its bytes on", async () => {
    const { naka, calls } = fakeNaka();
    const answer = await handleBridgeRequest(get(media(SEGMENT)), deps(naka));
    expect(answer).toEqual({ status: 200, body: new Uint8Array([1, 2, 3]), contentType: "video/mp2t" });
    expect(calls).toEqual([SEGMENT]);
  });

  it("keeps to its per-minute budget so Naka's servers never suffer", async () => {
    const { naka } = fakeNaka();
    const gate = new MediaGate({ perMinute: 1 });
    expect((await handleBridgeRequest(get(media(SEGMENT)), deps(naka, 5, gate))).status).toBe(200);
    expect((await handleBridgeRequest(get(media(SEGMENT)), deps(naka, 5, gate))).status).toBe(429);
  });

  it("also caps the volume downloaded per minute, so small audio files do not count like video", async () => {
    const { naka } = fakeNaka();
    const gate = new MediaGate({ perMinute: 100, bytesPerMinute: 3 });
    expect((await handleBridgeRequest(get(media(SEGMENT)), deps(naka, 5, gate))).status).toBe(200);
    expect((await handleBridgeRequest(get(media(SEGMENT)), deps(naka, 5, gate))).status).toBe(429);
  });

  it("downloads only a few segments at a time", async () => {
    let release = () => {};
    const slow: NakaCaller = {
      call: async () => ({ status: 200, body: "" }),
      fetchMedia: () => new Promise((resolve) => (release = () => resolve({ status: 200, body: "" }))),
    };
    const gate = new MediaGate({ parallel: 1 });
    const first = handleBridgeRequest(get(media(SEGMENT)), deps(slow, 5, gate));
    expect((await handleBridgeRequest(get(media(SEGMENT)), deps(slow, 5, gate))).status).toBe(429);
    release();
    expect((await first).status).toBe(200);
  });

  it("refuses a file that is not Naka's video", async () => {
    const { naka, calls } = fakeNaka();
    expect((await handleBridgeRequest(get(media("https://evil.test/a.ts")), deps(naka))).status).toBe(404);
    expect(calls).toEqual([]);
  });

  it("reports Naka's video host as unreachable when the page fails", async () => {
    const broken: NakaCaller = {
      call: async () => ({ status: 200, body: "" }),
      fetchMedia: async () => {
        throw new Error("page crashed");
      },
    };
    expect((await handleBridgeRequest(get(media(SEGMENT)), deps(broken))).status).toBe(502);
  });
});

const get = (target: string, secret: string | null = "s3cret") => ({
  method: "GET",
  target,
  secret: secret ?? undefined,
});

describe("which Naka calls the bridge makes", () => {
  it("allows a search, a season and a title's sources", () => {
    expect(nakaApiPath("/naka/browse/search?q=Interstellar")).toBe("browse/search?q=Interstellar");
    expect(nakaApiPath("/naka/browse/91/season/2")).toBe("browse/91/season/2");
    expect(nakaApiPath("/naka/streaming/sources/543?type=tv&season=1&episode=3")).toBe(
      "streaming/sources/543?type=tv&season=1&episode=3",
    );
  });

  it("refuses anything that could act on the account", () => {
    expect(nakaApiPath("/naka/profiles")).toBeNull();
    expect(nakaApiPath("/naka/admin/users/1/profile")).toBeNull();
    expect(nakaApiPath("/naka/browse/search/../../profiles")).toBeNull();
    expect(nakaApiPath("/browse/search?q=x")).toBeNull();
  });

  it("refuses unknown or malformed parameters", () => {
    expect(nakaApiPath("/naka/browse/search?q=x&page=2")).toBeNull();
    expect(nakaApiPath("/naka/streaming/sources/1?type=anime")).toBeNull();
  });
});

describe("a request to the bridge", () => {
  it("is forwarded to Naka when it carries the secret", async () => {
    const { naka, calls } = fakeNaka({ status: 200, body: '{"data":[]}' });
    const answer = await handleBridgeRequest(get("/naka/browse/search?q=Dune"), deps(naka));
    expect(answer).toEqual({ status: 200, body: '{"data":[]}' });
    expect(calls).toEqual(["browse/search?q=Dune"]);
  });

  it("is refused without the right secret, before reaching Naka", async () => {
    const { naka, calls } = fakeNaka();
    expect((await handleBridgeRequest(get("/naka/browse/search?q=Dune", "nope"), deps(naka))).status).toBe(401);
    expect((await handleBridgeRequest(get("/naka/browse/search?q=Dune", null), deps(naka))).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("only reads", async () => {
    const { naka } = fakeNaka();
    const answer = await handleBridgeRequest({ ...get("/naka/browse/search?q=Dune"), method: "POST" }, deps(naka));
    expect(answer.status).toBe(405);
  });

  it("refuses a call outside the allowed ones", async () => {
    const { naka } = fakeNaka();
    expect((await handleBridgeRequest(get("/naka/profiles"), deps(naka))).status).toBe(404);
  });

  it("stops once the minute's budget is spent, to never weigh on Naka", async () => {
    const { naka, calls } = fakeNaka();
    const shared = deps(naka, 2);
    for (let i = 0; i < 3; i++) await handleBridgeRequest(get("/naka/browse/search?q=Dune"), shared);
    expect(calls).toHaveLength(2);
    expect((await handleBridgeRequest(get("/naka/browse/search?q=Dune"), shared)).status).toBe(429);
  });

  it("answers 502 when the browser cannot reach Naka", async () => {
    const naka: NakaCaller = {
      call: () => Promise.reject(new Error("browser closed")),
      fetchMedia: () => Promise.reject(new Error("browser closed")),
    };
    const answer = await handleBridgeRequest(get("/naka/browse/search?q=Dune"), deps(naka));
    expect(answer.status).toBe(502);
  });

  it("reports its health without a secret", async () => {
    const { naka } = fakeNaka();
    expect((await handleBridgeRequest(get("/health", null), deps(naka))).status).toBe(200);
  });
});

describe("the call budget", () => {
  it("frees calls as the window slides", () => {
    const budget = new CallBudget({ max: 1, windowMs: 1000 });
    expect(budget.trySpend(0)).toBe(true);
    expect(budget.trySpend(500)).toBe(false);
    expect(budget.trySpend(1000)).toBe(true);
  });
});
