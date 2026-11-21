import {
  API,
  apiPath,
  type CreateAccountResponse,
  PUSH_API,
  type PushPayload,
  type PushSubscriptionRequest,
  type SessionList,
} from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { type BridgeAnswer, NakaCatalog } from "../src/catalog/naka-catalog.ts";
import type { TextFetcher } from "../src/safe-fetch.ts";
import { HealthService } from "../src/services/health-service.ts";
import type { PushSender } from "../src/services/push-service.ts";
import type { ServiceOptions } from "../src/services/services.ts";
import { openDatabase } from "../src/storage/database.ts";
import { createRepositories } from "../src/storage/repositories.ts";
import { jsonRequest, sessionCookieOf, testApp } from "./helpers.ts";

const MINUTE = 60_000;
/** Saturday 21 November 2026, 21:00 in Paris. */
const NINE_PM = Date.UTC(2026, 10, 21, 20, 0);
const fetchText: TextFetcher = async () => "#EXTM3U\n#EXTINF:120,\ns0.ts\n#EXT-X-ENDLIST";
const message: PushPayload = { title: "t", body: "b", url: "/", tag: "x" };

/** A push service that records what it delivers, and refuses the endpoints listed with their status. */
function fakePush(refuse: Record<string, number>) {
  const sent: { endpoint: string; payload: PushPayload }[] = [];
  const sender: PushSender = async (subscription, payload) => {
    const status = refuse[subscription.endpoint];
    if (status !== undefined) throw Object.assign(new Error("refused"), { statusCode: status });
    sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) as PushPayload });
  };
  return { sent, sender };
}

const device = (name: string): PushSubscriptionRequest => ({
  endpoint: `https://push.example/${name}`,
  keys: { p256dh: "p256dh", auth: "auth" },
});

function setup(overrides: Partial<ServiceOptions> = {}, refuse: Record<string, number> = {}) {
  const clock = { now: NINE_PM - 9 * 60 * MINUTE };
  const push = fakePush(refuse);
  const db = openDatabase(":memory:");
  const { app, services } = testApp({
    db,
    now: () => clock.now,
    fetchText,
    pushSender: push.sender,
    vapidPublicKey: "public-key",
    ...overrides,
  });
  async function account(name: string) {
    const response = await app.request(API.createAccount, jsonRequest("POST", { name, color: "peach" }));
    const { account } = (await response.json()) as CreateAccountResponse;
    const cookie = sessionCookieOf(response);
    await app.request(PUSH_API.subscription, jsonRequest("POST", device(name), { cookie }));
    return { id: account.id, cookie };
  }
  async function createRoom(cookie: string, title = "Dune") {
    const body = { url: "https://cdn.example/m.m3u8", title };
    const response = await app.request("/api/rooms", jsonRequest("POST", body, { cookie }));
    return ((await response.json()) as { code: string }).code;
  }
  const plan = (code: string, cookie: string, at: number) =>
    app.request(apiPath(PUSH_API.plan, { code }), jsonRequest("PUT", { at }, { cookie }));
  const plannedAt = async (cookie: string) =>
    ((await (await app.request(API.sessions, { headers: { cookie } })).json()) as SessionList).sessions[0]?.plannedAt;
  return { app, db, services, clock, push, account, createRoom, plan, plannedAt };
}

describe("subscribing a device", () => {
  it("gives the public key, and sends to the device subscribed", async () => {
    const { app, push, services, account } = setup();
    expect(await (await app.request(PUSH_API.key)).json()).toEqual({ publicKey: "public-key" });
    const leo = await account("Léo");
    await services.push.send([leo.id], message);
    expect(push.sent).toEqual([{ endpoint: "https://push.example/Léo", payload: message }]);
  });

  it("stops sending to a device once it unsubscribes", async () => {
    const { app, push, services, account } = setup();
    const leo = await account("Léo");
    const body = { endpoint: device("Léo").endpoint };
    const gone = await app.request(PUSH_API.subscription, jsonRequest("DELETE", body, { cookie: leo.cookie }));
    expect(gone.status).toBe(204);
    await services.push.send([leo.id], message);
    expect(push.sent).toEqual([]);
  });

  it("forgets a device the push service says is gone, and keeps one that only failed", async () => {
    const refuse = { "https://push.example/Léo": 410, "https://push.example/Inès": 500 };
    const { db, services, account } = setup({}, refuse);
    const leo = await account("Léo");
    const ines = await account("Inès");
    await services.push.send([leo.id, ines.id], message);
    const left = createRepositories(db).push.ofAccounts([leo.id, ines.id]);
    expect(left.map((subscription) => subscription.endpoint)).toEqual(["https://push.example/Inès"]);
  });

  it("is refused when the server has no VAPID keys, and says so", async () => {
    const { app, services } = testApp();
    expect(await (await app.request(PUSH_API.key)).json()).toEqual({});
    const response = await app.request(API.createAccount, jsonRequest("POST", { name: "Léo", color: "peach" }));
    const cookie = sessionCookieOf(response);
    const subscribed = await app.request(PUSH_API.subscription, jsonRequest("POST", device("Léo"), { cookie }));
    expect(subscribed.status).toBe(503);
    expect(((await subscribed.json()) as { error: string }).error).toMatch(/notifications/);
    await expect(services.push.send(["anyone"], message)).resolves.toBeUndefined();
  });

  it("asks for a sign-in and an https push service", async () => {
    const { app, account } = setup();
    expect((await app.request(PUSH_API.subscription, jsonRequest("POST", device("x")))).status).toBe(401);
    const leo = await account("Léo");
    const plain = { ...device("x"), endpoint: "http://push.example/x" };
    const response = await app.request(PUSH_API.subscription, jsonRequest("POST", plain, { cookie: leo.cookie }));
    expect(response.status).toBe(400);
  });
});

describe("planning the evening of a séance", () => {
  it("shows the time on the séance to all its people, and takes it back when cancelled", async () => {
    const { app, services, account, createRoom, plan, plannedAt } = setup();
    const leo = await account("Léo");
    const ines = await account("Inès");
    const code = await createRoom(leo.cookie);
    services.history.recordParticipation(code, ines.id);
    expect((await plan(code.toLowerCase(), ines.cookie, NINE_PM)).status).toBe(204);
    expect(await plannedAt(leo.cookie)).toBe(NINE_PM);
    const cancel = { method: "DELETE", headers: { cookie: leo.cookie } };
    expect((await app.request(apiPath(PUSH_API.plan, { code }), cancel)).status).toBe(204);
    expect(await plannedAt(leo.cookie)).toBeUndefined();
  });

  it("takes only a time to come, within 60 days, on one of my séances", async () => {
    const { clock, account, createRoom, plan } = setup();
    const leo = await account("Léo");
    const max = await account("Max");
    const code = await createRoom(leo.cookie);
    expect((await plan(code, leo.cookie, clock.now - MINUTE)).status).toBe(400);
    expect((await plan(code, leo.cookie, clock.now + 61 * 24 * 60 * MINUTE)).status).toBe(400);
    expect((await plan(code, max.cookie, NINE_PM)).status).toBe(404);
  });

  it("reminds everyone 15 minutes before and at the time, naming the others", async () => {
    const { services, clock, push, account, createRoom, plan } = setup();
    const leo = await account("Léo");
    const ines = await account("Inès");
    const max = await account("Max");
    const code = await createRoom(leo.cookie, "Dune");
    services.history.recordParticipation(code, ines.id);
    services.history.recordParticipation(code, max.id);
    await plan(code, leo.cookie, NINE_PM);

    clock.now = NINE_PM - 20 * MINUTE;
    await services.plans.remind();
    expect(push.sent).toEqual([]);

    clock.now = NINE_PM - 15 * MINUTE;
    await services.plans.remind();
    await services.plans.remind();
    expect(push.sent).toHaveLength(3);
    expect(push.sent.find((s) => s.endpoint.endsWith("Léo"))?.payload).toEqual({
      title: "Ce soir à 21 h : Dune",
      body: "Avec Inès et Max",
      url: `/s/${code}`,
      tag: `plan-${code}`,
    });

    clock.now = NINE_PM;
    await services.plans.remind();
    expect(push.sent.slice(3).map((s) => s.payload.title)).toEqual(Array(3).fill("C'est l'heure : Dune"));
  });

  it("forgets the evening hours after its time", async () => {
    const { services, clock, account, createRoom, plan, plannedAt } = setup();
    const leo = await account("Léo");
    const code = await createRoom(leo.cookie);
    await plan(code, leo.cookie, NINE_PM);
    clock.now = NINE_PM + 4 * 60 * MINUTE;
    await services.plans.remind();
    expect(await plannedAt(leo.cookie)).toBeUndefined();
  });
});

const SEARCH = "browse/search?q=Inception";
const INCEPTION = { id: 27, mediaType: "movie", title: "Inception", releaseDate: "2010-07-16" };

/** The evening check with one keeper listed in ALERT_ACCOUNTS; Naka answers `answer()`. */
async function healthSetup(answer: () => BridgeAnswer, bridgeUp = true) {
  const context = setup();
  const keeper = await context.account("Darius");
  const calls: string[] = [];
  const catalog = new NakaCatalog(async (path) => {
    calls.push(path);
    return answer();
  });
  const health = (alertAccounts: string[]) =>
    new HealthService({
      repositories: createRepositories(context.db),
      push: context.services.push,
      search: (query) => catalog.search(query),
      bridgeHealthy: async () => bridgeUp,
      alertAccounts,
      checkHour: 19,
      now: () => context.clock.now,
    });
  return { ...context, calls, check: health([keeper.id]), unwatched: health([]) };
}

describe("the evening check of the catalog", () => {
  it("searches Naka once a day from 19 h, and alerts once per failure, then when it is back", async () => {
    let answer: BridgeAnswer = { status: 401, body: "" };
    const { check, clock, push, calls } = await healthSetup(() => answer);

    clock.now = NINE_PM - 3 * 60 * MINUTE;
    await check.checkIfDue();
    expect(calls).toEqual([]);

    clock.now = NINE_PM - 2 * 60 * MINUTE;
    await Promise.all([check.checkIfDue(), check.checkIfDue()]);
    await check.checkIfDue();
    expect(calls).toEqual([SEARCH]);
    expect(push.sent.map((s) => s.payload.body)).toEqual([expect.stringContaining("NAKA_TOKEN")]);

    clock.now += 24 * 60 * MINUTE;
    await check.checkIfDue();
    expect(calls).toHaveLength(2);
    expect(push.sent).toHaveLength(1);

    answer = { status: 200, body: JSON.stringify({ data: [INCEPTION] }) };
    clock.now += 24 * 60 * MINUTE;
    await check.checkIfDue();
    expect(push.sent.map((s) => s.payload.body).at(-1)).toMatch(/^C'est revenu/);
  });

  it("tells a stopped naka-bridge apart, without spending a Naka call", async () => {
    const { check, clock, push, calls } = await healthSetup(() => ({ status: 200, body: "{}" }), false);
    clock.now = NINE_PM;
    await check.checkIfDue();
    expect(calls).toEqual([]);
    expect(push.sent[0]?.payload.body).toMatch(/redémarre naka-bridge/);
  });

  it("says when Naka asks for a robot check, finds nothing, or fails", async () => {
    const cases: [BridgeAnswer, RegExp][] = [
      [{ status: 403, body: "CAPTCHA_REQUIRED" }, /anti-robot/],
      [{ status: 200, body: JSON.stringify({ data: [] }) }, /journaux de naka-bridge/],
      [{ status: 502, body: "" }, /journaux de naka-bridge/],
    ];
    for (const [answer, expected] of cases) {
      const { check, clock, push } = await healthSetup(() => answer);
      clock.now = NINE_PM;
      await check.checkIfDue();
      expect(push.sent[0]?.payload.body).toMatch(expected);
    }
  });

  it("checks nothing when nobody is to be alerted, or without the catalog", async () => {
    const { unwatched, services, clock, calls } = await healthSetup(() => ({ status: 401, body: "" }));
    clock.now = NINE_PM;
    await unwatched.checkIfDue();
    await services.health.checkIfDue();
    expect(calls).toEqual([]);
  });
});
