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
    await store.markWatched("w1", true, darius, 42);
    expect(store.useWatchlist.getState().items[0]).toMatchObject({ watchedAt: 42, watchedBy: darius });
    await store.markWatched("w1", false);
    expect(store.useWatchlist.getState().items[0]?.watchedAt).toBeUndefined();
    expect(store.useWatchlist.getState().items[0]?.watchedBy).toBeUndefined();
    await store.markWatched("w1", true, undefined, 43);
    expect(store.useWatchlist.getState().items[0]?.watchedAt).toBe(43);
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
    expect(rules.peopleOf([film, other], "darius", new Set(["lea", "ines"])).map((p) => p.name)).toEqual([
      "Inès",
      "Léa",
    ]);
  });

  it("forgets in its bubbles the people whose séances I removed from my history", () => {
    expect(rules.peopleOf([film], "darius", new Set(["ines"])).map((p) => p.name)).toEqual(["Inès"]);
    expect(rules.peopleOf([film], "darius", new Set())).toEqual([]);
  });

  it("keeps under a poster only the year and the length, which fit its width", () => {
    expect(rules.posterLine({ ...film.title, runtime: 169 })).toBe("2014 · 2 h 49");
    expect(rules.posterLine({ id: 2, type: "tv", title: "The Bear", year: 2022, seasons: 3 })).toBe("2022 · 3 saisons");
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

  it("beside my heart, names only the others who want it, never me", () => {
    expect(rules.othersWantingLine(film, "darius")).toBe("Léa en a envie");
    expect(rules.othersWantingLine({ ...film, wantedBy: ["darius", "lea", "ines"] }, "darius")).toBe(
      "Léa et Inès en ont envie",
    );
    expect(rules.othersWantingLine({ ...film, wantedBy: ["darius"] }, "darius")).toBe(
      "Personne d'autre pour l'instant",
    );
    expect(rules.othersWantingLine({ ...film, wantedBy: [] }, "darius")).toBe("Personne pour l'instant");
  });

  it("names the heart after the title, so a screen reader says what it does", () => {
    expect(rules.wantToggleLabel(film)).toBe("J'ai envie de voir Interstellar");
  });

  it("says when and with whom it was watched", () => {
    const now = Date.UTC(2026, 10, 7, 12);
    expect(rules.watchedLine({ ...film, watchedAt: now }, "darius", now)).toBe("Vu aujourd'hui avec Léa et Inès");
    expect(rules.watchedLine({ ...film, sharedWith: [darius] }, "darius", now)).toBe("Vu");
  });

  it("names the people of the séance that watched it, not everyone the title is for", () => {
    const now = Date.UTC(2026, 10, 7, 12);
    const watched = { ...film, watchedAt: now, watchedWith: [darius, lea] };
    expect(rules.watchedLine(watched, "darius", now)).toBe("Vu aujourd'hui avec Léa");
    expect(rules.watchedLine({ ...watched, watchedWith: [darius] }, "darius", now)).toBe("Vu aujourd'hui");
  });

  it("says how it became « vu »: in a séance, marked by someone, or just marked", () => {
    const now = Date.UTC(2026, 10, 7, 12);
    const day = 24 * 3600 * 1000;
    expect(rules.watchedHowLine({ ...film, watchedAt: now, watchedInSeance: true }, "darius", now)).toBe(
      "Vu en séance, aujourd'hui",
    );
    expect(rules.watchedHowLine({ ...film, watchedAt: now - day, watchedBy: lea }, "darius", now)).toBe(
      "Marqué vu par Léa, hier",
    );
    expect(rules.watchedHowLine({ ...film, watchedAt: now, watchedBy: darius }, "darius", now)).toBe(
      "Marqué vu par toi, aujourd'hui",
    );
    expect(rules.watchedHowLine({ ...film, watchedAt: now - 21 * day }, "darius", now)).toBe(
      "Marqué vu, il y a 3 semaines",
    );
    expect(rules.watchedHowLine(film, "darius", now)).toBe("");
  });

  it("says for whom « C'est vu » and « Retirer » count, never supposing a duo", () => {
    const crowd = [darius, lea, ines, { ...lea, accountId: "leo", name: "Léo" }, { ...ines, accountId: "zoe" }];
    expect(rules.actionAudience({ ...film, sharedWith: [darius] }, "darius")).toBe("Rien que pour toi");
    expect(rules.actionAudience({ ...film, sharedWith: [darius, lea] }, "darius")).toBe("Pour Léa et toi");
    expect(rules.actionAudience(film, "darius")).toBe("Pour Léa, Inès et toi");
    expect(rules.actionAudience({ ...film, sharedWith: crowd }, "darius")).toBe("Pour tout le monde");
    expect(rules.actionAudience({ ...film, sharedWith: crowd, circleId: "c1" }, "darius")).toBe("Pour tout le cercle");
  });

  it("asks before removing a title others see, and tells them who loses it", () => {
    expect(rules.removalNeedsConfirmation(film, "darius")).toBe(true);
    expect(rules.removalNeedsConfirmation({ ...film, sharedWith: [darius] }, "darius")).toBe(false);
    expect(rules.removalWarning(film, "darius")).toBe(
      "« Interstellar » disparaîtra aussi de la liste de Léa et Inès, avec les envies de chacun.",
    );
  });

  it("confirms for whom it was done, and stays short when it was only for me", () => {
    expect(rules.watchedToast(film, "darius", true)).toBe("Rangé dans « Déjà vus » pour Léa, Inès et toi");
    expect(rules.watchedToast({ ...film, sharedWith: [darius] }, "darius", false)).toBe("Remis dans « À voir »");
    expect(rules.removedToast(film, "darius")).toBe("« Interstellar » retiré de la liste pour Léa, Inès et toi");
    expect(rules.removedToast({ ...film, sharedWith: [darius] }, "darius")).toBe("« Interstellar » retiré de la liste");
  });
});
