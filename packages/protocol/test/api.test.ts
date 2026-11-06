import { describe, expect, it } from "vitest";
import { AccountKey, CreateAccountResponse, KeyWord, SessionSummary, UpdateAccountRequest } from "../src/index.ts";

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
    });
    expect(summary.participants).toHaveLength(1);
    expect(SessionSummary.safeParse({ ...summary, position: -1 }).success).toBe(false);
  });
});
