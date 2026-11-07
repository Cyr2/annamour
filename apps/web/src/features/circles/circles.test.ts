import type { Circle, SessionSummary, WatchlistItem } from "@annamour/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/circles.ts", () => ({
  fetchCircles: vi.fn(),
  createCircle: vi.fn(),
  renameCircle: vi.fn(),
  leaveCircle: vi.fn(),
}));
const api = await import("../../api/circles.ts");
const store = await import("./circles.ts");
const { ofCircle, tonightPick } = await import("./circle-rules.ts");

const darius = { accountId: "darius", name: "Darius", color: "peach" } as const;
const annou = { accountId: "annou", name: "Annou", color: "rose" } as const;
const duo: Circle = { id: "duo", members: [darius, annou], evenings: 3, lastUsedAt: 5 };
const potes: Circle = { id: "potes", name: "Les potes", members: [darius], evenings: 1, lastUsedAt: 2 };

function session(code: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    code,
    title: code,
    duration: 6000,
    position: 100,
    lastUsedAt: 10,
    participants: [],
    episode: { index: 0, count: 1 },
    ...overrides,
  };
}

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

beforeEach(() => {
  vi.resetAllMocks();
  store.resetCircles();
  store.selectCircle(null);
});

describe("the circle shown", () => {
  it("is the only one when there is just one: a couple never has to pick", () => {
    expect(store.shownCircle({ circles: [duo], selected: null })).toBe("duo");
  });

  it("is the one picked while it exists, else all of them", () => {
    expect(store.shownCircle({ circles: [duo, potes], selected: "potes" })).toBe("potes");
    expect(store.shownCircle({ circles: [duo, potes], selected: "gone" })).toBeNull();
    expect(store.shownCircle({ circles: [duo, potes], selected: null })).toBeNull();
  });

  it("goes back to « Tout » when I leave the circle on screen", async () => {
    vi.mocked(api.fetchCircles).mockResolvedValue([duo]);
    vi.mocked(api.leaveCircle).mockResolvedValue();
    store.selectCircle("potes");
    await store.leaveCircle("potes");
    expect(store.useCircles.getState()).toMatchObject({ selected: null, circles: [duo] });
  });

  it("becomes a circle I just created", async () => {
    vi.mocked(api.createCircle).mockResolvedValue("new");
    vi.mocked(api.fetchCircles).mockResolvedValue([duo, { ...potes, id: "new" }]);
    expect(await store.createCircle("Les potes")).toBe("new");
    expect(store.useCircles.getState().selected).toBe("new");
  });

  it("says plainly when a change fails", async () => {
    vi.mocked(api.renameCircle).mockRejectedValue(new Error("Pas de réseau"));
    await expect(store.renameCircle("duo", "Nous deux")).rejects.toThrow();
  });
});

describe("« Ce soir » for a circle", () => {
  it("offers the séance left unfinished most recently in that circle first", () => {
    const pick = tonightPick(
      [session("A", { circleId: "duo", lastUsedAt: 1 }), session("B", { circleId: "potes", lastUsedAt: 9 })],
      [item("Film", { circleId: "duo", wantedBy: ["annou"] })],
      duo,
      "darius",
    );
    expect(pick).toEqual({ kind: "resume", session: expect.objectContaining({ code: "A" }) });
  });

  it("offers the most wanted title of its list when nothing is under way", () => {
    const pick = tonightPick(
      [session("Fini", { circleId: "duo", position: 6000 })],
      [
        item("Un peu", { circleId: "duo", wantedBy: ["darius"] }),
        item("Beaucoup", { circleId: "duo", wantedBy: ["darius", "annou"] }),
      ],
      duo,
      "darius",
    );
    expect(pick).toEqual({ kind: "title", item: expect.objectContaining({ id: "Beaucoup" }) });
  });

  it("has nothing to offer for an empty circle", () => {
    expect(tonightPick([], [item("Ailleurs", { circleId: "potes" })], duo, "darius")).toEqual({ kind: "nothing" });
  });

  it("keeps everything for « Tout »", () => {
    expect(ofCircle([item("a", { circleId: "duo" }), item("b", { circleId: "potes" })], null, "darius")).toHaveLength(
      2,
    );
  });

  it("keeps a title shared before circles existed with someone of the circle, not one shared with others", () => {
    const withAnnou = item("Avant", { sharedWith: [darius, annou] });
    const withLeo = item("Ailleurs", { sharedWith: [darius, { accountId: "leo", name: "Léo", color: "mint" }] });
    const elsewhere = item("Autre cercle", { circleId: "potes", sharedWith: [darius, annou] });
    expect(ofCircle([withAnnou, withLeo, elsewhere], duo, "darius").map((i) => i.id)).toEqual(["Avant"]);
  });

  it("keeps an older séance watched with someone of the circle, and one I watched alone", () => {
    const together = session("Ensemble", { participants: [darius, annou] });
    const alone = session("Seul", { participants: [darius] });
    const others = session("Autres", { participants: [darius, { accountId: "leo", name: "Léo", color: "mint" }] });
    expect(ofCircle([together, alone, others], duo, "darius").map((s) => s.code)).toEqual(["Ensemble", "Seul"]);
  });
});
