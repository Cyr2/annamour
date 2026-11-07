import {
  API,
  apiPath,
  type CreateAccountResponse,
  type CreateTvPairingResponse,
  TV_PAIRING_APPROVE_LIMIT,
  TV_PAIRING_CREATE_LIMIT,
  TV_PAIRING_TTL_MS,
} from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../src/storage/database.ts";
import { jsonRequest, sessionCookieOf, testApp } from "./helpers.ts";

const PHONE_IP = "203.0.113.7";
const TV_IP = "198.51.100.20";

function setup(tvCodeRandomInt?: (max: number) => number) {
  const clock = { now: 1_000_000 };
  const db = openDatabase(":memory:");
  const { app, services } = testApp({ db, now: () => clock.now, tvCodeRandomInt });
  const fromIp = (ip: string) => ({ "x-forwarded-for": ip });

  async function signUp() {
    const response = await app.request(API.createAccount, jsonRequest("POST", { name: "Darius", color: "sky" }));
    const { account } = (await response.json()) as CreateAccountResponse;
    return { account, cookie: sessionCookieOf(response) };
  }
  const createPairing = (ip = TV_IP) => app.request(API.tvPairing, { method: "POST", headers: fromIp(ip) });
  async function pairing(): Promise<CreateTvPairingResponse> {
    return (await (await createPairing()).json()) as CreateTvPairingResponse;
  }
  const poll = (pollToken: string) => app.request(apiPath(API.tvPairingPoll, { pollToken }));
  const approve = (code: unknown, cookie: string, ip = PHONE_IP) =>
    app.request(API.tvPairingApprove, jsonRequest("POST", { code }, { cookie, ...fromIp(ip) }));
  const lookUp = (code: string, cookie: string, ip = PHONE_IP) =>
    app.request(apiPath(API.tvPairingCode, { code }), { headers: { cookie, ...fromIp(ip) } });
  const me = (cookie: string) => app.request(API.me, { headers: { cookie } });
  return { app, services, db, clock, signUp, createPairing, pairing, poll, approve, lookUp, me };
}

async function statusOf(response: Response): Promise<string> {
  return ((await response.json()) as { status: string }).status;
}

async function errorOf(response: Response): Promise<string> {
  return ((await response.json()) as { error: string }).error;
}

describe("linking a TV from a signed-in phone", () => {
  it("signs the TV in on the account once the phone approves its code", async () => {
    const { signUp, createPairing, poll, approve, me, clock } = setup();
    const phone = await signUp();

    const created = await createPairing();
    expect(created.status).toBe(201);
    const tv = (await created.json()) as CreateTvPairingResponse;
    expect(tv.code).toMatch(/^[A-HJKMNP-Z2-9]{3}-[A-HJKMNP-Z2-9]{3}$/);
    expect(tv.pollToken).toMatch(/^[\w-]{43}$/);
    expect(tv.expiresAt).toBe(clock.now + TV_PAIRING_TTL_MS);

    const waiting = await poll(tv.pollToken);
    expect(await statusOf(waiting)).toBe("pending");
    expect(waiting.headers.get("set-cookie")).toBeNull();
    expect(waiting.headers.get("cache-control")).toBe("no-store");

    const approved = await approve(tv.code, phone.cookie);
    expect(approved.status).toBe(200);
    expect(await statusOf(approved)).toBe("approved");

    const signedIn = await poll(tv.pollToken);
    expect(await statusOf(signedIn)).toBe("approved");
    const tvCookie = sessionCookieOf(signedIn);
    expect(tvCookie).toMatch(/^am_session=[\w-]{43}$/);
    expect(signedIn.headers.get("set-cookie")).toContain("HttpOnly");
    expect(tvCookie).not.toBe(phone.cookie);
    expect(await (await me(tvCookie)).json()).toEqual({ account: phone.account });

    const again = await poll(tv.pollToken);
    expect(await statusOf(again)).toBe("expired");
    expect(again.headers.get("set-cookie")).toBeNull();
  });

  it("keeps only hashes of the code and the poll token", async () => {
    const { pairing, db } = setup();
    const tv = await pairing();
    const dump = JSON.stringify(db.prepare("SELECT * FROM tv_pairings").all());
    expect(dump).not.toContain(tv.pollToken);
    expect(dump).not.toContain(tv.code.replace("-", ""));
  });

  it("reads the code however the phone types it", async () => {
    const { signUp, pairing, approve } = setup();
    const { cookie } = await signUp();
    const tv = await pairing();
    expect((await approve(` ${tv.code.toLowerCase().replace("-", " ")} `, cookie)).status).toBe(200);
    const other = await pairing();
    expect((await approve(other.code.replace("-", ""), cookie)).status).toBe(200);
  });

  it("asks for the 6 characters when the code is malformed", async () => {
    const { signUp, approve, lookUp } = setup();
    const { cookie } = await signUp();
    const response = await approve("K7P-2Q", cookie);
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toMatch(/6 caractères/);
    expect((await approve(42, cookie)).status).toBe(400);
    expect((await lookUp("K7P", cookie)).status).toBe(400);
  });

  it("tells the phone when no TV shows this code", async () => {
    const { signUp, approve } = setup();
    const { cookie } = await signUp();
    const response = await approve("K7P-2QX", cookie);
    expect(response.status).toBe(404);
    expect(await errorOf(response)).toBe(
      "Ce code ne correspond à aucune TV. Vérifie les 6 caractères affichés sur l'écran.",
    );
  });

  it("can be approved only once", async () => {
    const { signUp, pairing, approve, poll } = setup();
    const { cookie } = await signUp();
    const tv = await pairing();
    expect((await approve(tv.code, cookie)).status).toBe(200);
    const twice = await approve(tv.code, cookie);
    expect(twice.status).toBe(409);
    expect(await errorOf(twice)).toMatch(/déjà servi/);
    await poll(tv.pollToken);
    expect((await approve(tv.code, cookie)).status).toBe(409);
  });

  it("needs a signed-in phone", async () => {
    const { pairing, approve, lookUp, poll } = setup();
    const tv = await pairing();
    const response = await approve(tv.code, "am_session=forged");
    expect(response.status).toBe(401);
    expect(await errorOf(response)).toMatch(/4 mots/);
    expect((await lookUp(tv.code, "")).status).toBe(401);
    expect(await statusOf(await poll(tv.pollToken))).toBe("pending");
  });
});

describe("a TV pairing over time", () => {
  it("expires after 10 minutes, for the TV and for the phone", async () => {
    const { signUp, pairing, poll, approve, lookUp, clock, services, db } = setup();
    const { cookie } = await signUp();
    const tv = await pairing();
    clock.now += TV_PAIRING_TTL_MS - 1;
    expect(await statusOf(await poll(tv.pollToken))).toBe("pending");
    clock.now += 1;
    expect(await statusOf(await poll(tv.pollToken))).toBe("expired");
    expect(await statusOf(await lookUp(tv.code, cookie))).toBe("expired");
    const late = await approve(tv.code, cookie);
    expect(late.status).toBe(410);
    expect(await errorOf(late)).toMatch(/expiré/);

    services.tvPairings.sweep();
    expect(db.prepare("SELECT * FROM tv_pairings").all()).toHaveLength(0);
    expect((await approve(tv.code, cookie)).status).toBe(404);
  });

  it("cannot sign the TV in once expired, even if approved in time", async () => {
    const { signUp, pairing, poll, approve, clock } = setup();
    const { cookie } = await signUp();
    const tv = await pairing();
    expect((await approve(tv.code, cookie)).status).toBe(200);
    clock.now += TV_PAIRING_TTL_MS;
    const response = await poll(tv.pollToken);
    expect(await statusOf(response)).toBe("expired");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("answers an unknown or malformed poll token without signing anyone in", async () => {
    const { poll } = setup();
    expect(await statusOf(await poll("x".repeat(43)))).toBe("expired");
    const malformed = await poll("short");
    expect(malformed.status).toBe(400);
    expect(malformed.headers.get("set-cookie")).toBeNull();
  });
});

describe("the phone's confirmation screen", () => {
  it("shows whether the code still waits for approval", async () => {
    const { signUp, pairing, approve, lookUp } = setup();
    const { cookie } = await signUp();
    const tv = await pairing();
    const pending = await lookUp(tv.code.toLowerCase(), cookie);
    expect(pending.status).toBe(200);
    expect(await pending.json()).toEqual({ status: "pending" });
    await approve(tv.code, cookie);
    expect(await statusOf(await lookUp(tv.code, cookie))).toBe("approved");
    expect((await lookUp("K7P-2QX", cookie)).status).toBe(404);
  });
});

describe("TV pairing limits", () => {
  it(`allows ${TV_PAIRING_APPROVE_LIMIT.max} code checks per hour and per address`, async () => {
    const { signUp, approve, lookUp, clock } = setup();
    const { cookie } = await signUp();
    for (let i = 0; i < TV_PAIRING_APPROVE_LIMIT.max - 1; i++)
      expect((await approve("K7P-2QX", cookie)).status).toBe(404);
    expect((await lookUp("K7P-2QX", cookie)).status).toBe(404);
    const blocked = await approve("K7P-2QX", cookie);
    expect(blocked.status).toBe(429);
    expect(await errorOf(blocked)).toMatch(/Réessaie dans une heure/);
    expect((await lookUp("K7P-2QX", cookie)).status).toBe(429);
    expect((await approve("K7P-2QX", cookie, "192.0.2.9")).status).toBe(404);
    clock.now += TV_PAIRING_APPROVE_LIMIT.windowMs;
    expect((await approve("K7P-2QX", cookie)).status).toBe(404);
  });

  it(`hands out ${TV_PAIRING_CREATE_LIMIT.max} codes per hour and per address`, async () => {
    const { createPairing } = setup();
    for (let i = 0; i < TV_PAIRING_CREATE_LIMIT.max; i++) expect((await createPairing()).status).toBe(201);
    expect((await createPairing()).status).toBe(429);
    expect((await createPairing("192.0.2.9")).status).toBe(201);
  });

  it("never shows the same code on two TVs at once", async () => {
    const draws = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
    const { pairing, clock } = setup(() => draws.shift() ?? 2);
    expect((await pairing()).code).toBe("AAA-AAA");
    expect((await pairing()).code).toBe("BBB-BBB");
    clock.now += TV_PAIRING_TTL_MS;
    draws.push(0, 0, 0, 0, 0, 0);
    expect((await pairing()).code).toBe("AAA-AAA");
  });
});
