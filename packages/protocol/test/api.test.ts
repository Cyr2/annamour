import { describe, expect, it } from "vitest";
import {
  AccountKey,
  asksHevcLadder,
  CreateAccountResponse,
  KeyWord,
  SessionSummary,
  UpdateAccountRequest,
  withHevcLadder,
} from "../src/index.ts";

describe("asking for the complete HEVC ladder", () => {
  it("adds the flag to an address, with or without a query", () => {
    expect(withHevcLadder("/api/rooms/YWEK/e/0/hls/master.m3u8")).toBe("/api/rooms/YWEK/e/0/hls/master.m3u8?hevc=1");
    expect(withHevcLadder("/api/rooms/YWEK/prep?x=2")).toBe("/api/rooms/YWEK/prep?x=2&hevc=1");
  });

  it("is only ever asked by the exact flag, never by default", () => {
    expect(asksHevcLadder("1")).toBe(true);
    for (const value of [undefined, null, "", "0", "true", "on", " 1"]) expect(asksHevcLadder(value)).toBe(false);
  });
});

describe("account key", () => {
  it("normalises words and requires exactly four", () => {
    expect(AccountKey.parse([" Lune", "PANDA", "velours", "cerise"])).toEqual(["lune", "panda", "velours", "cerise"]);
    expect(AccountKey.safeParse(["lune", "panda", "velours"]).success).toBe(false);
    expect(KeyWord.safeParse("élan").success).toBe(true);
    expect(KeyWord.safeParse("l1ne").success).toBe(false);
  });

  it("is returned with the account at creation", () => {
    const parsed = CreateAccountResponse.safeParse({
      account: { id: "a1", name: "Darius", color: "sky", hasPasskey: false },
      key: ["lune", "panda", "velours", "cerise"],
    });
    expect(parsed.success).toBe(true);
  });
});

describe("account update", () => {
  it("needs at least one field", () => {
    expect(UpdateAccountRequest.safeParse({}).success).toBe(false);
    expect(UpdateAccountRequest.safeParse({ color: "mint" }).success).toBe(true);
  });
});

describe("session summary", () => {
  it("lists the other participants of a session", () => {
    const summary = SessionSummary.parse({
      code: "YWEK",
      title: "Film du vendredi",
      position: 4360,
      lastUsedAt: 1,
      participants: [{ accountId: "a2", name: "Anna", color: "lilac" }],
      episode: { index: 0, count: 1 },
    });
    expect(summary.participants).toHaveLength(1);
    expect(SessionSummary.safeParse({ ...summary, position: -1 }).success).toBe(false);
  });
});
