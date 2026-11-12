import type { Circle, SessionSummary, WatchlistItem } from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { circleTaste, reasonLine } from "./suggestion-rules.ts";

const darius = { accountId: "darius", name: "Darius", color: "peach" } as const;
const annou = { accountId: "annou", name: "Annou", color: "rose" } as const;
const leo = { accountId: "leo", name: "Léo", color: "mint" } as const;

describe("why a title is suggested", () => {
  it("names who wants it, me as « toi »", () => {
    expect(reasonLine({ kind: "wants", people: [darius] }, "darius")).toBe("Tu en as envie");
    expect(reasonLine({ kind: "wants", people: [darius, annou] }, "darius")).toBe("Toi et Annou en avez envie");
    expect(reasonLine({ kind: "wants", people: [annou] }, "darius")).toBe("Annou en a envie");
  });

  it("names who loved or liked it", () => {
    expect(reasonLine({ kind: "loved", people: [annou] }, "darius")).toBe("Annou a adoré");
    expect(reasonLine({ kind: "liked", people: [annou, leo] }, "darius")).toBe("Annou et Léo ont aimé");
    expect(reasonLine({ kind: "loved", people: [darius] }, "darius")).toBe("Tu as adoré");
  });
});

describe("what a circle's suggestions are read from", () => {
  const nous: Circle = { id: "nous", members: [darius, annou], evenings: 2 };
  const item = (id: string, circleId?: string): WatchlistItem => ({
    id,
    title: { id: 1, type: "movie", title: id },
    addedBy: darius,
    addedAt: 0,
    sharedWith: [darius, annou],
    wantedBy: [],
    ...(circleId ? { circleId } : {}),
  });
  const seance = (overrides: Partial<SessionSummary>): SessionSummary => ({
    code: "ABCD",
    title: "Verity",
    duration: 6000,
    position: 5990,
    lastUsedAt: 0,
    participants: [annou],
    episode: { index: 0, count: 1 },
    circleId: "nous",
    catalog: { id: 8809, type: "movie" },
    ...overrides,
  });

  it("takes its own list, and counts as watched only the séances it finished", () => {
    const taste = circleTaste(
      nous,
      [item("ours", "nous"), item("theirs", "potes"), item("old")],
      [],
      [seance({}), seance({ catalog: { id: 2, type: "tv" }, position: 10 }), seance({ circleId: "potes" })],
    );
    expect(taste.members).toEqual([darius, annou]);
    expect(taste.items.map((i) => i.id)).toEqual(["ours"]);
    expect([...taste.watched]).toEqual(["movie:8809"]);
  });
});
