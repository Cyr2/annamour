import { API } from "@annamour/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loginWithPasskey, registerPasskey, type WebAuthnCeremonies } from "./passkeys.ts";
import { createRoom, fetchRoom } from "./rooms.ts";

type Reply = [status: number, body: unknown];

/** Answers each call with the next reply, and records what was sent. */
function server(...replies: Reply[]) {
  const queue = [...replies];
  const fetch = vi.fn(async (_path: string, _init?: RequestInit) => {
    const [status, body] = queue.shift() ?? [500, {}];
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const snapshot = {
  code: "YWEK",
  media: {
    title: "Film du vendredi",
    src: "/api/rooms/YWEK/hls/master.m3u8",
    audio: [],
    subtitles: [],
    duration: 7826,
  },
  playback: { status: "paused", position: 0, at: 1 },
  members: [],
  episodes: [{}],
  current: 0,
  finished: false,
  countdownUntil: null,
};

afterEach(() => vi.unstubAllGlobals());

describe("rooms API", () => {
  it("creates a room from an https playlist and trims the title", async () => {
    const fetch = server([201, { code: "YWEK" }]);
    await expect(createRoom(" https://cdn.example/master.m3u8 ", "  Film  ")).resolves.toBe("YWEK");
    const init = fetch.mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body))).toEqual({ url: "https://cdn.example/master.m3u8", title: "Film" });
  });

  it("refuses a link that is not https before calling the server", async () => {
    const fetch = server();
    await expect(createRoom("http://cdn.example/master.m3u8")).rejects.toThrow(/lien https/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the import fails", async () => {
    server([422, { error: "Ce lien a expiré : récupère-en un nouveau." }]);
    await expect(createRoom("https://cdn.example/master.m3u8")).rejects.toThrow(
      "Ce lien a expiré : récupère-en un nouveau.",
    );
  });

  it("looks a room up by code, and explains an unknown one", async () => {
    server([200, snapshot], [404, { error: "Not found" }]);
    await expect(fetchRoom("YWEK")).resolves.toMatchObject({ code: "YWEK", media: { duration: 7826 } });
    await expect(fetchRoom("QXZB")).rejects.toThrow(/Aucune séance avec ce code/);
  });
});

const account = { id: "a1", name: "Darius", color: "sky", hasPasskey: true };

function ceremonies(outcome: "ok" | Error): WebAuthnCeremonies {
  const run = async () => {
    if (outcome instanceof Error) throw outcome;
    return { id: "cred", type: "public-key" };
  };
  return { register: vi.fn(run), authenticate: vi.fn(run) };
}

describe("passkeys API", () => {
  it("registers: options, the device prompt, then verification", async () => {
    const fetch = server([200, { challenge: "abc" }], [200, { verified: true }]);
    const device = ceremonies("ok");
    await registerPasskey(device);
    expect(device.register).toHaveBeenCalledWith({ challenge: "abc" });
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([API.passkeyRegisterOptions, API.passkeyRegisterVerify]);
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
      response: { id: "cred", type: "public-key" },
    });
  });

  it("says it is cancelled when the person closes the prompt", async () => {
    server([200, { challenge: "abc" }]);
    const closed = Object.assign(new Error("closed"), { name: "NotAllowedError" });
    await expect(registerPasskey(ceremonies(closed))).rejects.toThrow(/C'est annulé/);
  });

  it("explains an already registered device and an unsupported one", async () => {
    server([200, { challenge: "abc" }]);
    const exists = Object.assign(new Error("exists"), { name: "InvalidStateError" });
    await expect(registerPasskey(ceremonies(exists))).rejects.toThrow(/existe déjà/);
    server([200, { challenge: "abc" }]);
    await expect(loginWithPasskey(ceremonies(new Error("weird")))).rejects.toThrow(/ne sait pas/);
  });

  it("signs in, then asks the server who we are", async () => {
    const fetch = server([200, { challenge: "abc" }], [200, { verified: true }], [200, { account }]);
    await expect(loginWithPasskey(ceremonies("ok"))).resolves.toEqual(account);
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([API.passkeyLoginOptions, API.passkeyLoginVerify, API.me]);
  });

  it("falls back to the key when the passkey is unknown or the session did not stick", async () => {
    server([200, { challenge: "abc" }], [401, { error: "unknown" }]);
    await expect(loginWithPasskey(ceremonies("ok"))).rejects.toThrow(/Utilise tes 4 mots/);
    server([200, { challenge: "abc" }], [200, {}], [401, {}]);
    await expect(loginWithPasskey(ceremonies("ok"))).rejects.toThrow(/Utilise tes 4 mots/);
  });
});
