import type { Circle, WatchlistItem } from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { shelvesFor } from "./shelves.ts";

const darius = { accountId: "darius", name: "Darius", color: "peach" } as const;
const annou = { accountId: "annou", name: "Annou", color: "rose" } as const;
const leo = { accountId: "leo", name: "Léo", color: "lilac" } as const;
const duo: Circle = { id: "duo", members: [darius, annou], evenings: 3, lastUsedAt: 5 };
const potes: Circle = { id: "potes", members: [darius, leo], evenings: 1, lastUsedAt: 9 };

function item(id: string, overrides: Partial<WatchlistItem> = {}): WatchlistItem {
  return {
    id,
    title: { id: 1, type: "movie", title: id },
    addedBy: darius,
    addedAt: 0,
    sharedWith: [darius],
    wantedBy: [],
    ...overrides,
  };
}

const ids = (shelves: ReturnType<typeof shelvesFor>) =>
  shelves.map((shelf) => [shelf.circle?.id ?? null, shelf.items.map((i) => i.id)]);

describe("the shelves of « Notre liste »", () => {
  it("give each circle its own shelf, the one used most recently first", () => {
    const items = [item("a", { circleId: "duo" }), item("b", { circleId: "potes" })];
    expect(ids(shelvesFor([duo, potes], items, "darius"))).toEqual([
      ["potes", ["b"]],
      ["duo", ["a"]],
    ]);
  });

  it("show a title shared before circles existed once, on the most recent circle it fits", () => {
    const everyone = item("old", { sharedWith: [darius, annou, leo] });
    expect(ids(shelvesFor([duo, potes], [everyone], "darius"))).toEqual([["potes", ["old"]]]);
  });

  it("keep the titles that fit no circle on a last shelf, and skip empty circles", () => {
    const stranger = item("x", { sharedWith: [darius, { accountId: "zoe", name: "Zoé", color: "sky" }] });
    expect(ids(shelvesFor([duo, potes], [stranger], "darius"))).toEqual([[null, ["x"]]]);
  });

  it("put everything on one shelf without any circle, and nothing without any title", () => {
    expect(ids(shelvesFor([], [item("a")], "darius"))).toEqual([[null, ["a"]]]);
    expect(shelvesFor([duo], [], "darius")).toEqual([]);
  });

  it("keep the order the titles came in on each shelf", () => {
    const items = [item("z", { circleId: "duo" }), item("y", { circleId: "duo" })];
    expect(ids(shelvesFor([duo], items, "darius"))).toEqual([["duo", ["z", "y"]]]);
  });
});
