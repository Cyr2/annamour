import { describe, expect, it } from "vitest";
import {
  AddToWatchlistRequest,
  catalogKey,
  sortWatchlist,
  splitWatchlist,
  type WatchlistItem,
  watchlistWith,
} from "../src/index.ts";

const darius = { accountId: "darius", name: "Darius", color: "peach" } as const;
const lea = { accountId: "lea", name: "Léa", color: "lilac" } as const;
const ines = { accountId: "ines", name: "Inès", color: "mint" } as const;

function item(id: string, overrides: Partial<WatchlistItem> = {}): WatchlistItem {
  return {
    id,
    title: { id: 1, type: "movie", title: id },
    addedBy: darius,
    addedAt: 0,
    sharedWith: [darius, lea],
    wantedBy: [],
    ...overrides,
  };
}

describe("the shared watchlist", () => {
  it("sorts by how many want a title, the newest first on a tie", () => {
    const list = [
      item("a", { wantedBy: ["darius"], addedAt: 1 }),
      item("b", { wantedBy: ["darius", "lea"], addedAt: 0 }),
      item("c", { wantedBy: ["lea"], addedAt: 5 }),
    ];
    expect(sortWatchlist(list, "wants").map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(sortWatchlist(list, "recent").map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("shows only what is shared with the person picked, everything for « Tout le monde »", () => {
    const list = [item("a"), item("b", { sharedWith: [darius, ines] })];
    expect(watchlistWith(list, "ines").map((i) => i.id)).toEqual(["b"]);
    expect(watchlistWith(list, null)).toHaveLength(2);
  });

  it("puts watched titles apart, the latest watched first", () => {
    const { toWatch, watched } = splitWatchlist([
      item("a"),
      item("b", { watchedAt: 10 }),
      item("c", { watchedAt: 20 }),
    ]);
    expect(toWatch.map((i) => i.id)).toEqual(["a"]);
    expect(watched.map((i) => i.id)).toEqual(["c", "b"]);
  });

  it("knows a film and a series with the same number apart", () => {
    expect(catalogKey({ type: "movie", id: 7 })).not.toBe(catalogKey({ type: "tv", id: 7 }));
  });

  it("is shared with everyone or with up to 7 chosen people", () => {
    const title = { id: 1, type: "movie", title: "Film" } as const;
    expect(AddToWatchlistRequest.safeParse({ title, shareWith: "everyone", want: true }).success).toBe(true);
    expect(AddToWatchlistRequest.safeParse({ title, shareWith: ["lea"], want: false }).success).toBe(true);
    expect(AddToWatchlistRequest.safeParse({ title, shareWith: [], want: false }).success).toBe(false);
  });
});
