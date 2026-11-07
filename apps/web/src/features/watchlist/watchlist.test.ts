import type { WatchlistItem } from "@annamour/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/watchlist.ts", () => ({
  fetchWatchlist: vi.fn(),
  addToWatchlist: vi.fn(),
  setWant: vi.fn(),
  setWatched: vi.fn(),
  removeFromWatchlist: vi.fn(),
}));
const api = await import("../../api/watchlist.ts");
const store = await import("./watchlist.ts");
const rules = await import("./watchlist-rules.ts");

const darius = { accountId: "darius", name: "Darius", color: "peach" } as const;
const lea = { accountId: "lea", name: "Léa", color: "lilac" } as const;
const ines = { accountId: "ines", name: "Inès", color: "mint" } as const;

const film: WatchlistItem = {
  id: "w1",
  title: { id: 1, type: "movie", title: "Interstellar", year: 2014 },
  addedBy: lea,
  addedAt: 0,
  sharedWith: [darius, lea, ines],
  wantedBy: ["lea"],
};

beforeEach(async () => {
  vi.resetAllMocks();
  store.resetWatchlist();
  vi.mocked(api.fetchWatchlist).mockResolvedValue([film]);
  await store.loadWatchlist();
});

describe("the watchlist store", () => {
  it("shows « J'ai envie » at once, and takes it back if the server refuses", async () => {
    vi.mocked(api.setWant).mockRejectedValue(new Error("Pas de réseau"));
    const pending = store.toggleWant("w1", "darius", true);
    expect(store.useWatchlist.getState().items[0]?.wantedBy).toEqual(["lea", "darius"]);
    await expect(pending).rejects.toThrow();
    expect(store.useWatchlist.getState().items[0]?.wantedBy).toEqual(["lea"]);
  });

  it("moves a title to « Vus » and back", async () => {
    vi.mocked(api.setWatched).mockResolvedValue();
    await store.markWatched("w1", true, 42);
    expect(store.useWatchlist.getState().items[0]?.watchedAt).toBe(42);
    await store.markWatched("w1", false);
    expect(store.useWatchlist.getState().items[0]?.watchedAt).toBeUndefined();
  });

  it("removes a title for everyone, and refreshes after adding one", async () => {
    vi.mocked(api.removeFromWatchlist).mockResolvedValue();
    await store.removeItem("w1");
    expect(store.useWatchlist.getState().items).toEqual([]);

    vi.mocked(api.addToWatchlist).mockResolvedValue("w1");
    await store.addTitle({ title: film.title, shareWith: "everyone", want: true });
    expect(store.useWatchlist.getState().items).toHaveLength(1);
  });

  it("says what went wrong when adding fails", async () => {
    vi.mocked(api.addToWatchlist).mockRejectedValue(new Error("Naka ne répond pas"));
    await expect(store.addTitle({ title: film.title, shareWith: "everyone", want: false })).rejects.toThrow();
  });
});

describe("what the watchlist says", () => {
  it("lists the people of my list once, the most shared with first, never me", () => {
    const other = { ...film, id: "w2", sharedWith: [darius, ines] };
    expect(rules.peopleOf([film, other], "darius").map((p) => p.name)).toEqual(["Inès", "Léa"]);
  });

  it("says who added it, who sees it and who wants it", () => {
    expect(rules.itemLine(film, "darius")).toBe("Film · 2014 · ajouté par Léa");
    expect(rules.itemLine(film, "lea")).toBe("Film · 2014 · ajouté par toi");
    expect(rules.audienceLine(film, "darius")).toBe("Pour toi, Léa et Inès");
    expect(rules.wantersLine(film, "darius")).toBe("Léa en a envie");
    expect(rules.wantersLine({ ...film, wantedBy: ["darius"] }, "darius")).toBe("Tu en as envie");
    expect(rules.wantersLine({ ...film, wantedBy: ["darius", "lea"] }, "darius")).toBe("Léa et toi en avez envie");
    expect(rules.wantersLine({ ...film, wantedBy: [] }, "darius")).toBe("Personne n'a encore dit en avoir envie");
    expect(rules.wantsLabel(3)).toBe("3 envies");
  });

  it("says when and with whom it was watched", () => {
    const now = Date.UTC(2026, 10, 7, 12);
    expect(rules.watchedLine({ ...film, watchedAt: now }, "darius", now)).toBe("Vu aujourd'hui avec Léa et Inès");
    expect(rules.watchedLine({ ...film, sharedWith: [darius] }, "darius", now)).toBe("Vu");
  });
});
