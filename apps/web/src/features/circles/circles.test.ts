import type { Circle, SessionSummary, WatchlistItem } from "@annamour/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/circles.ts", () => ({
  fetchCircles: vi.fn(),
  createCircle: vi.fn(),
  renameCircle: vi.fn(),
  leaveCircle: vi.fn(),
  reorderCircles: vi.fn(),
}));
const api = await import("../../api/circles.ts");
const store = await import("./circles.ts");
const { circleShortName, isCloseCircle, moveId, ofCircle, seanceCount, seancesFor, seanceToResume, tonightPick } =
  await import("./circle-rules.ts");

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

describe("the circle a séance of a title goes to", () => {
  it("is the title's own, else the one on screen", () => {
    store.useCircles.setState({ circles: [duo, potes] });
    store.selectCircle("potes");
    expect(store.circleForTitle({ circleId: "duo" })).toBe("duo");
    expect(store.circleForTitle({})).toBe("potes");
  });
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

  it("keeps an older séance watched with someone of the circle, but one watched alone shows on « Tout » only", () => {
    const together = session("Ensemble", { participants: [darius, annou] });
    const alone = session("Seul", { participants: [darius] });
    const others = session("Autres", { participants: [darius, { accountId: "leo", name: "Léo", color: "mint" }] });
    expect(ofCircle([together, alone, others], duo, "darius").map((s) => s.code)).toEqual(["Ensemble"]);
    expect(ofCircle([together, alone, others], potes, "darius")).toEqual([]);
    expect(ofCircle([together, alone, others], null, "darius")).toHaveLength(3);
  });

  it("still shows a title of mine alone, from before circles, in every circle", () => {
    const mine = item("Pour moi", { sharedWith: [darius] });
    expect(ofCircle([mine], duo, "darius")).toHaveLength(1);
    expect(ofCircle([mine], potes, "darius")).toHaveLength(1);
  });

  it("counts on « Nous » the very séances « Séances » lists for the circle", () => {
    const sessions = [
      session("Duo", { circleId: "duo", participants: [annou] }),
      session("Ancienne", { participants: [annou] }),
      session("Seul"),
      session("Potes", { circleId: "potes" }),
    ];
    expect(seanceCount(duo, sessions, "darius")).toBe(ofCircle(sessions, duo, "darius").length);
    expect(seanceCount(duo, sessions, "darius")).toBe(2);
    expect(seanceCount(potes, sessions, "darius")).toBe(1);
  });

  it("counts what the server said until my séances are loaded", () => {
    expect(seanceCount(duo, null, "darius")).toBe(3);
  });
});

describe("resuming rather than creating, in the circle aimed at", () => {
  const dune = { id: 11, type: "movie" } as const;
  const sessions = [
    session("DUO", { catalog: dune, circleId: "duo", participants: [annou], lastUsedAt: 5 }),
    session("POTES", { catalog: dune, circleId: "potes", lastUsedAt: 9 }),
    session("SEUL", { catalog: dune, lastUsedAt: 7 }),
  ];
  const circles = [duo, potes];

  it("offers the séance of the circle picked, not a later one of another circle", () => {
    expect(seanceToResume(dune, { sessions, circleId: "duo", circles, me: "darius" })?.code).toBe("DUO");
    expect(seanceToResume(dune, { sessions, circleId: "potes", circles, me: "darius" })?.code).toBe("POTES");
  });

  it("offers for nobody in particular only a séance of no circle", () => {
    expect(seanceToResume(dune, { sessions, circleId: null, circles, me: "darius" })?.code).toBe("SEUL");
    expect(seancesFor(sessions, null, circles, "darius").map((s) => s.code)).toEqual(["SEUL"]);
  });

  it("matches a circle not loaded yet by its id", () => {
    expect(seanceToResume(dune, { sessions, circleId: "potes", circles: [], me: "darius" })?.code).toBe("POTES");
  });

  it("offers nothing when the circle has no séance of this title", () => {
    expect(seanceToResume(dune, { sessions, circleId: "autre", circles, me: "darius" })).toBeNull();
  });
});

describe("a circle at a glance", () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("is close while its last séance is under a week old: its thread is taut, slack after", () => {
    expect(isCloseCircle({ lastUsedAt: 0 }, 6 * DAY)).toBe(true);
    expect(isCloseCircle({ lastUsedAt: 0 }, 8 * DAY)).toBe(false);
    expect(isCloseCircle({ lastUsedAt: undefined }, 0)).toBe(false);
  });

  it("goes by its name, else by the first names of the others", () => {
    expect(circleShortName(potes, "darius")).toBe("Les potes");
    expect(circleShortName(duo, "darius")).toBe("Annou");
  });
});

describe("the order of my circles", () => {
  it("moves one up or down by a step, never past the ends", () => {
    expect(moveId(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
    expect(moveId(["a", "b", "c"], "a", 1)).toEqual(["b", "a", "c"]);
    expect(moveId(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(moveId(["a", "b", "c"], "z", 1)).toEqual(["a", "b", "c"]);
  });

  it("shows the new order at once, everywhere, and keeps it once saved", async () => {
    store.useCircles.setState({ status: "ready", circles: [duo, potes] });
    vi.mocked(api.reorderCircles).mockResolvedValue();
    await store.reorderCircles(["potes", "duo"]);
    expect(store.useCircles.getState().circles.map((c) => c.id)).toEqual(["potes", "duo"]);
    expect(api.reorderCircles).toHaveBeenCalledWith(["potes", "duo"]);
  });

  it("puts the saved order back when saving fails", async () => {
    store.useCircles.setState({ status: "ready", circles: [duo, potes] });
    vi.mocked(api.reorderCircles).mockRejectedValue(new Error("Pas de réseau"));
    vi.mocked(api.fetchCircles).mockResolvedValue([duo, potes]);
    await expect(store.reorderCircles(["potes", "duo"])).rejects.toThrow();
    expect(store.useCircles.getState().circles.map((c) => c.id)).toEqual(["duo", "potes"]);
  });
});
