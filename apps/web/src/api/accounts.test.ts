import { API } from "@annamour/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAccount,
  createLinkToken,
  deleteSessionForEveryone,
  fetchMe,
  fetchSessions,
  leaveSession,
  linkWithToken,
  loginWithKey,
  logout,
  updateAccount,
} from "./accounts.ts";
import { ApiRequestError } from "./http.ts";

const account = { id: "a1", name: "Darius", color: "sky", hasPasskey: false };
const key = ["lune", "panda", "velours", "cerise"];

function server(status: number, body: unknown) {
  const fetch = vi.fn(async (_path: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function sent(fetch: ReturnType<typeof server>) {
  const [path, init] = fetch.mock.calls[0] ?? [];
  return { path, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined };
}

afterEach(() => vi.unstubAllGlobals());

describe("accounts API", () => {
  it("creates an account and returns its key once", async () => {
    const fetch = server(201, { account, key });
    await expect(createAccount("Darius", "sky")).resolves.toEqual({ account, key });
    expect(sent(fetch)).toEqual({ path: API.createAccount, method: "POST", body: { name: "Darius", color: "sky" } });
  });

  it("signs in with the four words", async () => {
    const fetch = server(200, { account });
    await expect(loginWithKey(key)).resolves.toEqual(account);
    expect(sent(fetch)).toMatchObject({ path: API.loginWithKey, body: { key } });
  });

  it("explains a wrong key and the rate limit", async () => {
    server(401, { error: "unknown key" });
    await expect(loginWithKey(key)).rejects.toThrow(
      "Cette clé ne correspond à aucun compte. Vérifie l'ordre des mots.",
    );
    server(429, { error: "too many" });
    await expect(loginWithKey(key)).rejects.toThrow(/Réessaie dans une heure/);
  });

  it("links a device with a QR token, and explains an expired one", async () => {
    const fetch = server(200, { account });
    await expect(linkWithToken("t".repeat(20))).resolves.toEqual(account);
    expect(sent(fetch)).toMatchObject({ path: API.linkWithToken, body: { token: "t".repeat(20) } });
    server(410, { error: "gone" });
    await expect(linkWithToken("t".repeat(20))).rejects.toThrow(/expiré ou a déjà servi/);
  });

  it("knows when this device has no session", async () => {
    server(200, { account });
    await expect(fetchMe()).resolves.toEqual(account);
    server(401, { error: "no session" });
    await expect(fetchMe()).resolves.toBeNull();
    server(500, {});
    await expect(fetchMe()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it("refuses an account that breaks the contract", async () => {
    server(200, { account: { ...account, color: "green" } });
    await expect(fetchMe()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it("logs out, makes link tokens and lists sessions", async () => {
    const out = server(200, null);
    await logout();
    expect(sent(out)).toMatchObject({ path: API.logout, method: "POST" });

    server(200, { token: "x".repeat(32), expiresAt: 5 });
    await expect(createLinkToken()).resolves.toEqual({ token: "x".repeat(32), expiresAt: 5 });

    const session = {
      code: "YWEK",
      title: "Film",
      position: 10,
      lastUsedAt: 1,
      participants: [],
      episode: { index: 0, count: 1 },
    };
    server(200, { sessions: [session] });
    await expect(fetchSessions()).resolves.toEqual([session]);
  });

  it("renames the account and changes its colour", async () => {
    const fetch = server(200, { account: { ...account, name: "Dari" } });
    await expect(updateAccount({ name: "Dari" })).resolves.toMatchObject({ name: "Dari" });
    expect(sent(fetch)).toEqual({ path: API.me, method: "PATCH", body: { name: "Dari" } });
    server(400, { error: "bad" });
    await expect(updateAccount({ color: "mint" })).rejects.toThrow("Choisis un prénom de 1 à 24 lettres.");
  });

  it("removes a session from my list", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    await leaveSession("YWEK");
    expect(fetch).toHaveBeenCalledWith(`${API.sessions}/YWEK`, expect.objectContaining({ method: "DELETE" }));
    await deleteSessionForEveryone("YWEK");
    expect(fetch).toHaveBeenCalledWith(`${API.sessions}/YWEK/everyone`, expect.objectContaining({ method: "DELETE" }));
  });
});
