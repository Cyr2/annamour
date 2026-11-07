import { API, apiPath, type TvPairingStatus } from "@annamour/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../../api/http.ts";
import { approveTvPairing, checkTvPairingCode, createTvPairing, pollTvPairing } from "../../api/tv.ts";
import { codeFromHash, formatTyping, readTypedCode } from "../tv-link/tv-link.ts";
import { type PairingDeps, type PairingState, startTvPairing } from "./pairing.ts";
import { pairingUrl } from "./TvPairingScreen.tsx";

const NOW = 1_000_000;
const pairing = (code: string, pollToken: string) => ({ code, pollToken, expiresAt: NOW + 10 * 60_000 });

/** A TV on its pairing screen, with a scripted server and a clock under the test's control. */
function tv(statuses: TvPairingStatus[], overrides: Partial<PairingDeps> = {}) {
  const states: PairingState[] = [];
  let clock = NOW;
  let codes = 0;
  const create = vi.fn(async () => {
    codes++;
    return pairing(codes === 1 ? "K7P-2QX" : "ABC-234", `poll-token-number-${codes}`);
  });
  const poll = vi.fn(async () => statuses.shift() ?? "pending");
  const onApproved = vi.fn();
  const handle = startTvPairing({
    create,
    poll,
    onApproved,
    onState: (state) => states.push(state),
    now: () => clock,
    ...overrides,
  });
  return {
    handle,
    create,
    poll,
    onApproved,
    states,
    last: () => states.at(-1),
    advanceClock: (ms: number) => {
      clock += ms;
    },
  };
}

describe("TV pairing", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows a code, polls every 2 s, and signs in once a phone approves", async () => {
    const run = tv(["pending", "pending", "approved"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(run.last()).toEqual({ phase: "waiting", code: "K7P-2QX", expiresAt: NOW + 600_000 });
    expect(run.poll).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(run.poll).toHaveBeenCalledTimes(1);
    expect(run.poll).toHaveBeenCalledWith("poll-token-number-1", expect.any(AbortSignal));
    await vi.advanceTimersByTimeAsync(4000);
    expect(run.poll).toHaveBeenCalledTimes(3);
    expect(run.onApproved).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run.poll).toHaveBeenCalledTimes(3);
  });

  it("shows a new code on its own when the old one expires", async () => {
    const run = tv(["pending", "expired"]);
    await vi.advanceTimersByTimeAsync(4000);
    expect(run.create).toHaveBeenCalledTimes(2);
    expect(run.last()).toMatchObject({ phase: "waiting", code: "ABC-234" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(run.poll).toHaveBeenLastCalledWith("poll-token-number-2", expect.any(AbortSignal));
  });

  it("renews a code past its time without asking the server", async () => {
    const run = tv([]);
    await vi.advanceTimersByTimeAsync(0);
    run.advanceClock(11 * 60_000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(run.poll).not.toHaveBeenCalled();
    expect(run.create).toHaveBeenCalledTimes(2);
  });

  it("keeps its code through a dropped poll", async () => {
    const poll = vi
      .fn<PairingDeps["poll"]>()
      .mockRejectedValueOnce(new ApiRequestError(0, "Pas de connexion."))
      .mockResolvedValue("approved");
    const run = tv([], { poll });
    await vi.advanceTimersByTimeAsync(4000);
    expect(run.create).toHaveBeenCalledOnce();
    expect(run.onApproved).toHaveBeenCalledOnce();
  });

  it("says why it has no code, and tries again on its own or on demand", async () => {
    const create = vi
      .fn<PairingDeps["create"]>()
      .mockRejectedValueOnce(new ApiRequestError(429, "Trop de codes demandés."))
      .mockRejectedValueOnce(new ApiRequestError(0, "Pas de connexion."))
      .mockResolvedValue(pairing("K7P-2QX", "poll-token-number-1"));
    const run = tv([], { create, retryAfterMs: 15_000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(run.last()).toEqual({ phase: "error", message: "Trop de codes demandés." });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(run.last()).toEqual({ phase: "error", message: "Pas de connexion." });
    run.handle.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(run.last()).toMatchObject({ phase: "waiting", code: "K7P-2QX" });
  });

  it("stops polling when the screen closes", async () => {
    const run = tv([]);
    await vi.advanceTimersByTimeAsync(2000);
    run.handle.stop();
    run.handle.retry();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run.poll).toHaveBeenCalledOnce();
    expect(run.create).toHaveBeenCalledOnce();
  });

  it("ignores a code that arrives after the screen closed", async () => {
    let resolve: (value: ReturnType<typeof pairing>) => void = () => {};
    const create = vi.fn(() => new Promise<ReturnType<typeof pairing>>((r) => (resolve = r)));
    const run = tv([], { create });
    run.handle.stop();
    resolve(pairing("K7P-2QX", "poll-token-number-1"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(run.states).toEqual([{ phase: "starting" }]);
    expect(run.poll).not.toHaveBeenCalled();
  });

  it("puts the code in the QR link's fragment", () => {
    expect(pairingUrl("https://annamour.dpessin.fr", "K7P-2QX")).toBe("https://annamour.dpessin.fr/tv#K7P2QX");
  });
});

function server(status: number, body: unknown) {
  const fetch = vi.fn(async (_path: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("TV pairing API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("creates a pairing and polls it by its token", async () => {
    const fetch = server(201, pairing("K7P-2QX", "poll-token-number-1"));
    await expect(createTvPairing()).resolves.toMatchObject({ code: "K7P-2QX" });
    expect(fetch.mock.calls[0]?.[0]).toBe(API.tvPairing);
    expect(fetch.mock.calls[0]?.[1]?.method).toBe("POST");
    const polled = server(200, { status: "pending" });
    await expect(pollTvPairing("poll-token-number-1")).resolves.toBe("pending");
    expect(polled.mock.calls[0]?.[0]).toBe(apiPath(API.tvPairingPoll, { pollToken: "poll-token-number-1" }));
  });

  it("checks and approves a code typed with its dash or spaces", async () => {
    const check = server(200, { status: "pending" });
    await expect(checkTvPairingCode("k7p 2qx")).resolves.toBe("pending");
    expect(check.mock.calls[0]?.[0]).toBe("/api/tv/pairing/code/K7P2QX");
    const approve = server(200, { status: "approved" });
    await approveTvPairing("K7P-2QX");
    expect(approve.mock.calls[0]?.[0]).toBe(API.tvPairingApprove);
    expect(JSON.parse(String(approve.mock.calls[0]?.[1]?.body))).toEqual({ code: "K7P2QX" });
  });

  it("explains each refusal in French", async () => {
    const cases: [number, string][] = [
      [404, "Ce code ne correspond à aucune TV"],
      [410, "Ce code a expiré"],
      [409, "Ce code a déjà servi"],
      [429, "Trop d'essais"],
      [400, "Ce code n'est pas valide"],
    ];
    for (const [status, message] of cases) {
      server(status, { error: "server text" });
      await expect(approveTvPairing("K7P2QX")).rejects.toThrow(message);
    }
  });
});

describe("TV code on the phone", () => {
  it("reads the code from the QR link", () => {
    expect(codeFromHash("#K7P2QX")).toBe("K7P2QX");
    expect(codeFromHash("#k7p-2qx")).toBe("K7P2QX");
    expect(codeFromHash("#K7P%202QX")).toBe("K7P2QX");
    expect(codeFromHash("")).toBeNull();
    expect(codeFromHash("#K7P")).toBeNull();
    expect(codeFromHash("#IIIOOO")).toBeNull();
  });

  it("formats the code while it is typed", () => {
    expect(formatTyping("k7")).toBe("K7");
    expect(formatTyping("k7p")).toBe("K7P");
    expect(formatTyping("k7p2")).toBe("K7P-2");
    expect(formatTyping("K7P - 2qx!")).toBe("K7P-2QX");
    expect(formatTyping("K7P2QXZZ")).toBe("K7P-2QX");
  });

  it("accepts dashes and spaces, and says what is wrong otherwise", () => {
    expect(readTypedCode("k7p 2qx")).toEqual({ code: "K7P2QX" });
    expect(readTypedCode("K7P-2QX")).toEqual({ code: "K7P2QX" });
    expect(readTypedCode("K7P")).toEqual({ error: "Il manque des caractères : le code de la TV en a 6." });
    expect(readTypedCode("K7P2Q0")).toMatchObject({ error: expect.stringContaining("n'est pas valide") });
  });
});
