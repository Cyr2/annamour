import { SeanceReport } from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import type { TextFetcher } from "../src/safe-fetch.ts";
import { FetchError } from "../src/safe-fetch.ts";
import { REPORT_RETENTION_MS } from "../src/services/playback-stats-service.ts";
import { testApp } from "./helpers.ts";

const MASTER = "https://cdn.example/film/master.m3u8";
const fetchText: TextFetcher = async (url) => {
  if (url.href === MASTER) return "#EXTM3U\n#EXTINF:10,\ns0.ts\n#EXT-X-ENDLIST";
  throw new FetchError("not found", 404);
};

const report = (overrides: Record<string, unknown> = {}) => ({
  viewingId: "viewing-0001",
  name: "Anna",
  device: "iPhone",
  engine: "native",
  watchedSeconds: 90,
  stallCount: 1,
  stallSeconds: 10,
  startupMs: 1500,
  heights: [{ height: 480, seconds: 90 }],
  ...overrides,
});

function setup() {
  let clock = 1_000_000;
  const { app, services } = testApp({ fetchText, now: () => clock });
  const create = async () => {
    const created = await app.request("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: MASTER, title: "Film" }),
    });
    return ((await created.json()) as { code: string }).code;
  };
  const send = (code: string, body: unknown, ip = "1.2.3.4") =>
    app.request(`/api/rooms/${code}/stats`, {
      method: "POST",
      // What navigator.sendBeacon sends: no JSON content type is needed.
      headers: { "content-type": "text/plain", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    });
  const list = async (code: string) =>
    ((await (await app.request(`/api/rooms/${code}/stats`)).json()) as { reports: Array<Record<string, unknown>> })
      .reports;
  return { app, services, create, send, list, advance: (ms: number) => (clock += ms) };
}

describe("a séance's evening report", () => {
  it("sums up each person's devices against the targets", async () => {
    const { app, create, send } = setup();
    const code = await create();
    await send(code, report());
    await send(code, report({ viewingId: "viewing-0002", watchedSeconds: 30, stallCount: 0, stallSeconds: 0 }));
    const response = await app.request(`/api/rooms/${code}/report`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = SeanceReport.parse(await response.json());
    expect(body.devices).toHaveLength(1);
    expect(body.devices[0]).toMatchObject({ name: "Anna", watchedSeconds: 120, stallCount: 1 });
    expect(body.devices[0]?.targets.rebuffer.met).toBe(false);
  });

  it("is empty for a séance nobody watched yet, and missing for one that does not exist", async () => {
    const { app, create } = setup();
    const code = await create();
    expect(await (await app.request(`/api/rooms/${code}/report`)).json()).toEqual({ devices: [] });
    expect((await app.request("/api/rooms/ZZZZ/report")).status).toBe(404);
    expect((await app.request("/api/rooms/nope/report")).status).toBe(404);
  });
});

describe("playback reports", () => {
  it("are kept per séance, with the share of time spent frozen", async () => {
    const { create, send, list } = setup();
    const code = await create();
    expect((await send(code, report())).status).toBe(204);
    const [saved] = await list(code);
    expect(saved).toMatchObject({ name: "Anna", device: "iPhone", stallCount: 1, updatedAt: 1_000_000 });
    expect(saved?.rebufferRatio).toBeCloseTo(0.1);
  });

  it("are updated as the evening goes on, one per viewing, newest first", async () => {
    const { create, send, list, advance } = setup();
    const code = await create();
    await send(code, report());
    advance(60_000);
    await send(code, report({ viewingId: "viewing-0002", name: "Léo", device: "Mac" }));
    advance(60_000);
    await send(code, report({ watchedSeconds: 150 }));
    const reports = await list(code);
    expect(reports.map((r) => r.viewingId)).toEqual(["viewing-0001", "viewing-0002"]);
    expect(reports[0]?.watchedSeconds).toBe(150);
  });

  it("never move a viewing to another séance", async () => {
    const { create, send, list } = setup();
    const first = await create();
    const second = await create();
    await send(first, report());
    await send(second, report({ watchedSeconds: 999 }));
    expect((await list(first))[0]?.watchedSeconds).toBe(90);
    expect(await list(second)).toEqual([]);
  });

  it("are refused when malformed, for an unknown séance, or too many from one address", async () => {
    const { create, send } = setup();
    const code = await create();
    expect((await send(code, report({ stallCount: -3 }))).status).toBe(400);
    expect((await send(code, "not json")).status).toBe(400);
    expect((await send("ZZZZ", report())).status).toBe(404);
    expect((await send("bad!", report())).status).toBe(404);
    let last = 204;
    for (let i = 0; i < 40; i++) last = (await send(code, report(), "9.9.9.9")).status;
    expect(last).toBe(429);
  });

  it("are forgotten after 30 days", async () => {
    const { services, create, send, list, advance } = setup();
    const code = await create();
    await send(code, report());
    advance(REPORT_RETENTION_MS + 1);
    expect(services.playbackStats.sweep()).toBe(1);
    expect(await list(code)).toEqual([]);
  });

  it("cannot be listed for a code that is not one", async () => {
    const { services } = setup();
    expect(services.playbackStats.list("ABCD")).toEqual([]);
    const { app } = testApp();
    expect((await app.request("/api/rooms/bad!/stats")).status).toBe(404);
  });
});
