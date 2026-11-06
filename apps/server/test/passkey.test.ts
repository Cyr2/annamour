import { type AccountResponse, API, type CreateAccountResponse } from "@annamour/protocol";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import { describe, expect, it } from "vitest";
import { CHALLENGE_TTL_MS, simpleWebAuthn, type WebAuthn } from "../src/services/passkey-service.ts";
import { jsonRequest, sessionCookieOf, testApp } from "./helpers.ts";

type ExpectedChallenge = string | ((challenge: string) => boolean | Promise<boolean>);

async function challengeAccepted(expected: ExpectedChallenge, challenge: string): Promise<boolean> {
  return typeof expected === "string" ? expected === challenge : expected(challenge);
}

/**
 * Stands in for the authenticator's signature check (covered by SimpleWebAuthn's own
 * tests): the test puts the challenge it answers in clientDataJSON, and the fake
 * accepts the response when the service accepts that challenge.
 */
const fakeWebAuthn: WebAuthn = {
  ...simpleWebAuthn,
  async verifyRegistrationResponse({ response, expectedChallenge }) {
    if (!(await challengeAccepted(expectedChallenge, response.response.clientDataJSON))) return { verified: false };
    return {
      verified: true,
      registrationInfo: {
        credential: { id: response.id, publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ["internal"] },
      },
    } as Awaited<ReturnType<WebAuthn["verifyRegistrationResponse"]>>;
  },
  async verifyAuthenticationResponse({ response, expectedChallenge, credential }) {
    const verified = await challengeAccepted(expectedChallenge, response.response.clientDataJSON);
    expect(credential.publicKey).toEqual(new Uint8Array([1, 2, 3]));
    return { verified, authenticationInfo: { newCounter: credential.counter + 1 } } as Awaited<
      ReturnType<WebAuthn["verifyAuthenticationResponse"]>
    >;
  },
};

const registration = (id: string, challenge: string) => ({
  response: {
    id,
    rawId: id,
    type: "public-key",
    clientExtensionResults: {},
    response: { clientDataJSON: challenge, attestationObject: "AA" },
  },
});

const assertion = (id: string, challenge: string) => ({
  response: {
    id,
    rawId: id,
    type: "public-key",
    clientExtensionResults: {},
    response: { clientDataJSON: challenge, authenticatorData: "AA", signature: "AA", userHandle: "AA" },
  },
});

function setup(webAuthn: WebAuthn = fakeWebAuthn) {
  const clock = { now: 1_000_000 };
  const { app, services } = testApp({ now: () => clock.now, webAuthn });
  const post = (path: string, body: unknown = {}, cookie = "") =>
    app.request(path, jsonRequest("POST", body, { cookie }));
  async function account(name = "Darius") {
    const response = await post(API.createAccount, { name, color: "sky" });
    const { account } = (await response.json()) as CreateAccountResponse;
    return { ...account, cookie: sessionCookieOf(response) };
  }
  async function registerOptions(cookie: string) {
    return (await (
      await post(API.passkeyRegisterOptions, {}, cookie)
    ).json()) as PublicKeyCredentialCreationOptionsJSON;
  }
  async function loginOptions() {
    return (await (await post(API.passkeyLoginOptions)).json()) as PublicKeyCredentialRequestOptionsJSON;
  }
  async function register(cookie: string, id = "cred-1") {
    const { challenge } = await registerOptions(cookie);
    return post(API.passkeyRegisterVerify, registration(id, challenge), cookie);
  }
  return { app, services, clock, post, account, registerOptions, loginOptions, register };
}

describe("adding a passkey", () => {
  it("needs to be signed in", async () => {
    const { post } = setup();
    expect((await post(API.passkeyRegisterOptions)).status).toBe(401);
    expect((await post(API.passkeyRegisterVerify, registration("c", "x"))).status).toBe(401);
  });

  it("asks for a discoverable credential bound to the app's domain", async () => {
    const { account, registerOptions } = setup();
    const darius = await account();
    const options = await registerOptions(darius.cookie);
    expect(options.rp).toEqual({ id: "localhost", name: "Annamour" });
    expect(options.user.name).toBe("Darius");
    expect(options.authenticatorSelection?.residentKey).toBe("required");
    expect(options.challenge.length).toBeGreaterThan(16);
  });

  it("marks the account as having a passkey and excludes it from the next registration", async () => {
    const { account, register, registerOptions, app } = setup();
    const darius = await account();
    const registered = await register(darius.cookie);
    expect(registered.status).toBe(200);
    expect(((await registered.json()) as AccountResponse).account.hasPasskey).toBe(true);
    const me = (await (await app.request(API.me, { headers: { cookie: darius.cookie } })).json()) as AccountResponse;
    expect(me.account.hasPasskey).toBe(true);
    expect((await registerOptions(darius.cookie)).excludeCredentials?.map((c) => c.id)).toEqual(["cred-1"]);
  });

  it("refuses an expired, reused, foreign or unknown challenge", async () => {
    const { account, registerOptions, post, clock } = setup();
    const darius = await account();
    const anna = await account("Anna");

    const expired = await registerOptions(darius.cookie);
    clock.now += CHALLENGE_TTL_MS;
    const late = await post(API.passkeyRegisterVerify, registration("c1", expired.challenge), darius.cookie);
    expect(late.status).toBe(401);
    expect(((await late.json()) as { error: string }).error).toMatch(/4 mots/);

    const foreign = await registerOptions(anna.cookie);
    expect((await post(API.passkeyRegisterVerify, registration("c2", foreign.challenge), darius.cookie)).status).toBe(
      401,
    );

    const login = await (await post(API.passkeyLoginOptions)).json();
    const wrongKind = registration("c3", (login as { challenge: string }).challenge);
    expect((await post(API.passkeyRegisterVerify, wrongKind, darius.cookie)).status).toBe(401);

    const once = await registerOptions(darius.cookie);
    expect((await post(API.passkeyRegisterVerify, registration("c4", once.challenge), darius.cookie)).status).toBe(200);
    expect((await post(API.passkeyRegisterVerify, registration("c5", once.challenge), darius.cookie)).status).toBe(401);
  });

  it("rejects malformed responses before checking them", async () => {
    const { account, post } = setup();
    const darius = await account();
    expect((await post(API.passkeyRegisterVerify, { response: { id: "x" } }, darius.cookie)).status).toBe(401);
    expect((await post(API.passkeyRegisterVerify, { nope: true }, darius.cookie)).status).toBe(400);
  });

  it("turns a failed signature check into a plain refusal", async () => {
    const { account, registerOptions, post } = setup(simpleWebAuthn);
    const darius = await account();
    const { challenge } = await registerOptions(darius.cookie);
    expect((await post(API.passkeyRegisterVerify, registration("c1", challenge), darius.cookie)).status).toBe(401);
  });
});

describe("signing in with a passkey", () => {
  it("offers a challenge without asking who you are", async () => {
    const { loginOptions } = setup();
    const options = await loginOptions();
    expect(options.rpId).toBe("localhost");
    expect(options.allowCredentials ?? []).toEqual([]);
  });

  it("signs the device in to the passkey's account", async () => {
    const { account, register, loginOptions, post, app } = setup();
    const darius = await account();
    await register(darius.cookie);
    const { challenge } = await loginOptions();
    const response = await post(API.passkeyLoginVerify, assertion("cred-1", challenge));
    expect(response.status).toBe(200);
    expect(((await response.json()) as AccountResponse).account.id).toBe(darius.id);
    const me = await app.request(API.me, { headers: { cookie: sessionCookieOf(response) } });
    expect(me.status).toBe(200);

    const next = await loginOptions();
    expect((await post(API.passkeyLoginVerify, assertion("cred-1", next.challenge))).status).toBe(200);
  });

  it("rejects an unknown credential, a stale challenge and a bad payload", async () => {
    const { account, register, loginOptions, post, clock } = setup();
    const darius = await account();
    await register(darius.cookie);

    const unknown = await loginOptions();
    expect((await post(API.passkeyLoginVerify, assertion("cred-unknown", unknown.challenge))).status).toBe(401);

    const stale = await loginOptions();
    clock.now += CHALLENGE_TTL_MS + 1;
    expect((await post(API.passkeyLoginVerify, assertion("cred-1", stale.challenge))).status).toBe(401);
    expect((await post(API.passkeyLoginVerify, { response: { id: "cred-1" } })).status).toBe(401);
  });

  it("turns a failed signature check into a plain refusal", async () => {
    const { account, register, loginOptions, post } = setup({
      ...simpleWebAuthn,
      verifyRegistrationResponse: fakeWebAuthn.verifyRegistrationResponse,
    });
    await register((await account()).cookie);
    const { challenge } = await loginOptions();
    expect((await post(API.passkeyLoginVerify, assertion("cred-1", challenge))).status).toBe(401);
  });
});
