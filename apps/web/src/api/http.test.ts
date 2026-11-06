import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiRequestError, errorMessage, INVALID_RESPONSE_STATUS, NETWORK_ERROR_STATUS, request } from "./http.ts";

function respond(status: number, body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return vi.fn(async () => new Response(text, { status }));
}

const Thing = z.object({ ok: z.boolean() });

afterEach(() => vi.unstubAllGlobals());

describe("request", () => {
  it("returns the body once it matches the schema", async () => {
    vi.stubGlobal("fetch", respond(200, { ok: true }));
    await expect(request(Thing, "/api/thing")).resolves.toEqual({ ok: true });
  });

  it("sends JSON bodies as POST with the session cookie", async () => {
    const fetch = respond(200, { ok: true });
    vi.stubGlobal("fetch", fetch);
    await request(Thing, "/api/thing", { body: { a: 1 } });
    const [path, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/thing");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(init.body).toBe('{"a":1}');
  });

  it("refuses a body that breaks the contract", async () => {
    vi.stubGlobal("fetch", respond(200, { ok: "yes" }));
    const error = await request(Thing, "/api/thing").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).status).toBe(INVALID_RESPONSE_STATUS);
  });

  it("refuses a body that is not JSON", async () => {
    vi.stubGlobal("fetch", respond(200, "<html>"));
    await expect(request(Thing, "/api/thing")).rejects.toMatchObject({ status: INVALID_RESPONSE_STATUS });
  });

  it("prefers the call's own message, then the server's, then a generic one", async () => {
    vi.stubGlobal("fetch", respond(404, { error: "Cette séance n'existe plus." }));
    await expect(request(Thing, "/x", { messages: { 404: "Code inconnu." } })).rejects.toThrow("Code inconnu.");
    await expect(request(Thing, "/x")).rejects.toThrow("Cette séance n'existe plus.");
    vi.stubGlobal("fetch", respond(429, ""));
    await expect(request(Thing, "/x")).rejects.toThrow(/Trop d'essais/);
    vi.stubGlobal("fetch", respond(503, null));
    await expect(request(Thing, "/x")).rejects.toThrow(/serveur ne répond pas/);
    vi.stubGlobal("fetch", respond(418, {}));
    await expect(request(Thing, "/x")).rejects.toThrow(/n'a pas marché/);
  });

  it("turns a network failure into a French message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(request(Thing, "/x")).rejects.toMatchObject({
      status: NETWORK_ERROR_STATUS,
      message: /Pas de connexion/,
    });
  });

  it("lets an abort through untouched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("stop", "AbortError")));
    await expect(request(Thing, "/x")).rejects.toBeInstanceOf(DOMException);
  });
});

describe("errorMessage", () => {
  it("shows API messages and hides anything else", () => {
    expect(errorMessage(new ApiRequestError(400, "Mauvais lien."))).toBe("Mauvais lien.");
    expect(errorMessage(new Error("boom"))).toMatch(/n'a pas marché/);
  });
});
