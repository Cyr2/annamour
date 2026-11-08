import {
  API,
  type CreateAccountResponse,
  KEY_LOGIN_LIMIT,
  LINK_TOKEN_TTL_MS,
  type LinkToken,
  WORDLIST_FR,
} from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { SESSION_TTL_MS } from "../src/services/account-service.ts";
import { hashAccountKey } from "../src/services/secrets.ts";
import { openDatabase } from "../src/storage/database.ts";
import { jsonRequest, sessionCookieOf, TEST_PEPPER, testApp, testServices } from "./helpers.ts";

function setup() {
  const clock = { now: 1_000_000 };
  const db = openDatabase(":memory:");
  const { app, services } = testApp({ db, now: () => clock.now });
  async function createAccount(headers: Record<string, string> = {}) {
    const response = await app.request(
      API.createAccount,
      jsonRequest("POST", { name: "Darius", color: "sky" }, headers),
    );
    const body = (await response.json()) as CreateAccountResponse;
    return { response, body, cookie: sessionCookieOf(response) };
  }
  const login = (key: unknown, ip = "203.0.113.7") =>
    app.request(API.loginWithKey, jsonRequest("POST", { key }, { "x-forwarded-for": `${ip}, 10.0.0.1` }));
  const me = (cookie: string) => app.request(API.me, { headers: { cookie } });
  return { app, services, db, clock, createAccount, login, me };
}

async function errorOf(response: Response): Promise<string> {
  return ((await response.json()) as { error: string }).error;
}

describe("creating an account", () => {
  it("hands out a 4-word key once and signs the device in", async () => {
    const { createAccount, me } = setup();
    const { response, body, cookie } = await createAccount();
    expect(response.status).toBe(201);
    expect(body.account).toMatchObject({ name: "Darius", color: "sky", hasPasskey: false });
    expect(body.key).toHaveLength(4);
    expect(body.key.every((word) => WORDLIST_FR.includes(word))).toBe(true);

    const signedIn = await me(cookie);
    expect(signedIn.status).toBe(200);
    expect(await signedIn.json()).toEqual({ account: body.account });
  });

  it("keeps only a keyed hash of the key, never the words", async () => {
    const { createAccount, db } = setup();
    const { body } = await createAccount();
    const dump = JSON.stringify(db.prepare("SELECT * FROM accounts").all());
    expect(dump).toContain(hashAccountKey(body.key, TEST_PEPPER));
    for (const word of body.key) expect(dump).not.toContain(`"${word}`);
  });

  it("sets a long-lived httpOnly session cookie, Secure over https", async () => {
    const { createAccount } = setup();
    const plain = (await createAccount()).response.headers.get("set-cookie") ?? "";
    expect(plain).toMatch(/^am_session=[\w-]{43};/);
    expect(plain).toContain("HttpOnly");
    expect(plain).toContain("SameSite=Lax");
    expect(plain).toContain("Path=/");
    expect(plain).toContain("Max-Age=34560000");
    expect(plain).not.toContain("Secure");

    const proxied = await createAccount({ "x-forwarded-proto": "https" });
    expect(proxied.response.headers.get("set-cookie")).toContain("Secure");
  });

  it("always uses Secure cookies in production", async () => {
    const app = createApp(testServices(), { production: true });
    const response = await app.request(API.createAccount, jsonRequest("POST", { name: "Lou", color: "mint" }));
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("never gives two accounts the same key", async () => {
    const draws = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1];
    const { app } = testApp({ randomInt: () => draws.shift() ?? 2 });
    const create = async () =>
      (
        (await (
          await app.request(API.createAccount, jsonRequest("POST", { name: "A", color: "sky" }))
        ).json()) as CreateAccountResponse
      ).key;
    const first = await create();
    const second = await create();
    expect(first).toEqual(Array(4).fill(WORDLIST_FR[0]));
    expect(second).toEqual(Array(4).fill(WORDLIST_FR[1]));
  });

  it("asks for a name and a colour", async () => {
    const { app } = setup();
    const response = await app.request(API.createAccount, jsonRequest("POST", { name: "", color: "sky" }));
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toMatch(/prénom/);
  });
});

describe("checking the key a device kept", () => {
  it("says whether the words are this account's key, so a device never shows another account's", async () => {
    const { app, createAccount } = setup();
    const first = await createAccount();
    const second = await createAccount();
    const check = (cookie: string, key: string[]) =>
      app.request(API.checkKey, jsonRequest("POST", { key }, { cookie }));

    const own = await check(second.cookie, second.body.key);
    expect(own.status).toBe(200);
    expect(await own.json()).toEqual({ matches: true });
    // Same prénom, same colour, but the other account's words.
    expect(await (await check(second.cookie, first.body.key)).json()).toEqual({ matches: false });
  });

  it("is only for a signed-in device, and counts as a try against guessing", async () => {
    const { app, createAccount, clock } = setup();
    const { cookie } = await createAccount();
    const wrong = ["lune", "panda", "velours", "cerise"];
    expect((await app.request(API.checkKey, jsonRequest("POST", { key: wrong }))).status).toBe(401);
    const check = () => app.request(API.checkKey, jsonRequest("POST", { key: wrong }, { cookie }));
    for (let i = 0; i < KEY_LOGIN_LIMIT.max; i++) expect((await check()).status).toBe(200);
    expect((await check()).status).toBe(429);
    clock.now += KEY_LOGIN_LIMIT.windowMs;
    expect((await check()).status).toBe(200);
  });
});

describe("signing in with the key", () => {
  it("accepts the 4 words however they are typed", async () => {
    const { createAccount, login } = setup();
    const { body } = await createAccount();
    const response = await login(body.key.map((word) => ` ${word.toUpperCase()} `));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ account: body.account });
    expect(sessionCookieOf(response)).toMatch(/^am_session=/);
  });

  it("answers a wrong key with what to do, without saying which word is wrong", async () => {
    const { createAccount, login } = setup();
    await createAccount();
    const response = await login(["lune", "panda", "velours", "cerise"]);
    expect(response.status).toBe(401);
    expect(await errorOf(response)).toBe("Ces 4 mots ne correspondent à aucun compte. Vérifie chaque mot et réessaie.");
    expect((await login(["lune"])).status).toBe(400);
  });

  it(`allows ${KEY_LOGIN_LIMIT.max} tries per hour and per address`, async () => {
    const { login, clock } = setup();
    const wrong = ["lune", "panda", "velours", "cerise"];
    for (let i = 0; i < KEY_LOGIN_LIMIT.max; i++) expect((await login(wrong)).status).toBe(401);
    const blocked = await login(wrong);
    expect(blocked.status).toBe(429);
    expect(await errorOf(blocked)).toMatch(/Réessaie dans une heure/);
    expect((await login(wrong, "198.51.100.2")).status).toBe(401);
    clock.now += KEY_LOGIN_LIMIT.windowMs;
    expect((await login(wrong)).status).toBe(401);
  });
});

describe("the signed-in account", () => {
  it("can change its name and colour", async () => {
    const { app, createAccount } = setup();
    const { cookie } = await createAccount();
    const patch = (body: unknown) => app.request(API.me, jsonRequest("PATCH", body, { cookie }));
    expect(await (await patch({ name: "Dada" })).json()).toMatchObject({ account: { name: "Dada", color: "sky" } });
    expect(await (await patch({ color: "rose" })).json()).toMatchObject({ account: { name: "Dada", color: "rose" } });
    expect((await patch({})).status).toBe(400);
  });

  it("is refused without a valid session", async () => {
    const { app, me } = setup();
    const response = await me("am_session=forged");
    expect(response.status).toBe(401);
    expect(await errorOf(response)).toMatch(/4 mots/);
    expect((await app.request(API.me)).status).toBe(401);
    expect((await app.request(API.linkToken, { method: "POST" })).status).toBe(401);
  });

  it("signs out this device only", async () => {
    const { app, createAccount, login, me } = setup();
    const { body, cookie } = await createAccount();
    const other = sessionCookieOf(await login(body.key));
    const out = await app.request(API.logout, { method: "POST", headers: { cookie } });
    expect(out.status).toBe(204);
    expect(out.headers.get("set-cookie")).toMatch(/am_session=;.*Max-Age=0/);
    expect((await me(cookie)).status).toBe(401);
    expect((await me(other)).status).toBe(200);
    expect((await app.request(API.logout, { method: "POST" })).status).toBe(204);
  });

  it("stays signed in for 400 days", async () => {
    const { createAccount, me, clock, services } = setup();
    const { cookie } = await createAccount();
    clock.now += SESSION_TTL_MS - 1;
    expect((await me(cookie)).status).toBe(200);
    clock.now += 1;
    services.accounts.sweep();
    expect((await me(cookie)).status).toBe(401);
  });
});

describe("adding a device with a QR code", () => {
  async function linkSetup() {
    const context = setup();
    const { cookie, body } = await context.createAccount();
    const created = await context.app.request(API.linkToken, { method: "POST", headers: { cookie } });
    const token = (await created.json()) as LinkToken;
    const link = (value: string) => context.app.request(API.linkWithToken, jsonRequest("POST", { token: value }));
    return { ...context, created, token, link, account: body.account };
  }

  it("signs the new device in with a token valid 5 minutes", async () => {
    const { created, token, link, me, account, clock } = await linkSetup();
    expect(created.status).toBe(201);
    expect(token.expiresAt).toBe(clock.now + LINK_TOKEN_TTL_MS);
    const linked = await link(token.token);
    expect(linked.status).toBe(200);
    expect(await linked.json()).toEqual({ account });
    expect((await me(sessionCookieOf(linked))).status).toBe(200);
  });

  it("works only once", async () => {
    const { token, link } = await linkSetup();
    expect((await link(token.token)).status).toBe(200);
    const again = await link(token.token);
    expect(again.status).toBe(401);
    expect(await errorOf(again)).toMatch(/QR code/);
  });

  it("stops working after 5 minutes", async () => {
    const { token, link, clock, services } = await linkSetup();
    clock.now += LINK_TOKEN_TTL_MS;
    expect((await link(token.token)).status).toBe(401);
    services.accounts.sweep();
    expect((await link("x".repeat(43))).status).toBe(401);
    expect((await link("short")).status).toBe(400);
  });
});
