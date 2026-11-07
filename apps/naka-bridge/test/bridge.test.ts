import { describe, expect, it } from "vitest";
import { nakaApiPath } from "../src/allowlist.ts";
import { type BridgeDeps, handleBridgeRequest, type NakaCaller } from "../src/bridge.ts";
import { CallBudget } from "../src/budget.ts";

function fakeNaka(answer = { status: 200, body: "{}" }) {
  const calls: string[] = [];
  const naka: NakaCaller = {
    call: async (path) => {
      calls.push(path);
      return answer;
    },
  };
  return { naka, calls };
}

function deps(naka: NakaCaller, max = 5): BridgeDeps {
  return { secret: "s3cret", naka, budget: new CallBudget({ max, windowMs: 60_000 }), now: () => 1000 };
}

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
    const naka: NakaCaller = { call: () => Promise.reject(new Error("browser closed")) };
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
