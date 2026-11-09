import type { SessionSummary } from "@annamour/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../../api/http.ts";
import {
  byMostRecent,
  companionsLabel,
  favoriteOf,
  isFinished,
  latestUnfinished,
  onePerTitle,
  progressOf,
  rankPeople,
  relativeDay,
  remainingLabel,
  resumeLine,
  seanceOfTitle,
  splitByStatus,
  stopLabel,
  withPerson,
} from "./session-rules.ts";

vi.mock("../../api/accounts.ts", () => ({
  fetchSessions: vi.fn(),
  leaveSession: vi.fn(),
  deleteSessionForEveryone: vi.fn(),
}));
const api = await import("../../api/accounts.ts");
const { deleteSession, leaveSession, loadSessions, resetSessions, useSessions } = await import("./sessions.ts");

const anna = { accountId: "anna", name: "Anna", color: "lilac" } as const;
const leo = { accountId: "leo", name: "Léo", color: "butter" } as const;
const ines = { accountId: "ines", name: "Inès", color: "mint" } as const;

function session(code: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    code,
    title: code,
    duration: 7826,
    position: 4360,
    lastUsedAt: 1000,
    participants: [],
    episode: { index: 0, count: 1 },
    ...overrides,
  };
}

const friday = session("YWEK", { lastUsedAt: 500, participants: [anna] });
const thriller = session("RTNB", { lastUsedAt: 400, participants: [leo, ines] });
const episode = session("QHMP", { lastUsedAt: 300, participants: [anna] });
const comedy = session("BXFW", { lastUsedAt: 200, position: 6100, duration: 6100, participants: [anna, leo] });

describe("session progress", () => {
  it("counts a session stopped in its last minute as watched", () => {
    expect(isFinished(session("A", { position: 7770 }))).toBe(true);
    expect(isFinished(session("A", { position: 7700 }))).toBe(false);
    expect(isFinished(session("A", { duration: undefined, position: 99999 }))).toBe(false);
  });

  it("tells where we stopped and what is left", () => {
    expect(stopLabel(friday)).toBe("Arrêtés à 1:12:40 · reste 58 min");
    expect(stopLabel(comedy)).toBe("Terminé");
    expect(stopLabel(session("A", { duration: undefined }))).toBe("Arrêtés à 1:12:40");
    expect(remainingLabel(session("A", { duration: undefined }))).toBe("");
    expect(remainingLabel(session("A", { position: 0 }))).toBe("reste 2 h 10");
  });

  it("measures progress between 0 and 1, or not at all without a length", () => {
    expect(progressOf(session("A", { position: 3913 }))).toBeCloseTo(0.5);
    expect(progressOf(session("A", { position: 99999 }))).toBe(1);
    expect(progressOf(session("A", { duration: undefined }))).toBeNull();
  });
});

describe("sessions lists", () => {
  const all = [comedy, episode, friday, thriller];

  it("offers to resume the latest unfinished session", () => {
    expect(latestUnfinished(all)?.code).toBe("YWEK");
    expect(latestUnfinished([comedy])).toBeNull();
  });

  it("sorts by most recent and splits ongoing from finished", () => {
    expect(byMostRecent(all).map((s) => s.code)).toEqual(["YWEK", "RTNB", "QHMP", "BXFW"]);
    const { ongoing, finished } = splitByStatus(all);
    expect(ongoing).toHaveLength(3);
    expect(finished.map((s) => s.code)).toEqual(["BXFW"]);
  });

  it("filters the sessions shared with one person", () => {
    expect(withPerson(all, "leo").map((s) => s.code)).toEqual(["BXFW", "RTNB"]);
    expect(withPerson(all, null)).toBe(all);
  });

  it("lists each person once, most shared sessions first, with their latest name", () => {
    const renamed = session("NEW", { lastUsedAt: 900, participants: [{ ...anna, name: "Annie" }] });
    const people = rankPeople([...all, renamed]);
    expect(people.map((p) => [p.name, p.sessionCount])).toEqual([
      ["Annie", 4],
      ["Léo", 2],
      ["Inès", 1],
    ]);
    expect(favoriteOf(people)).toBe("anna");
  });

  it("gives the heart only from two shared sessions", () => {
    expect(favoriteOf(rankPeople([friday]))).toBeNull();
    expect(favoriteOf([])).toBeNull();
  });
});

describe("relativeDay", () => {
  // Friday 6 November 2026, evening.
  const now = new Date(2026, 10, 6, 21, 0).getTime();
  const daysAgo = (days: number) => new Date(2026, 10, 6 - days, 20, 0).getTime();

  it("speaks like a person", () => {
    expect(relativeDay(daysAgo(0), now)).toBe("Aujourd'hui");
    expect(relativeDay(daysAgo(1), now)).toBe("Hier");
    expect(relativeDay(daysAgo(3), now)).toBe("Mardi");
    expect(relativeDay(daysAgo(6), now)).toBe("Il y a 6 jours");
    expect(relativeDay(daysAgo(14), now)).toBe("Il y a 2 semaines");
    expect(relativeDay(daysAgo(7), now)).toBe("Il y a 1 semaine");
    expect(relativeDay(daysAgo(65), now)).toBe("Il y a 2 mois");
    expect(relativeDay(daysAgo(800), now)).toBe("Il y a 2 ans");
  });

  it("counts days on a Monday without naming last week's days", () => {
    const monday = new Date(2026, 10, 9, 9, 0).getTime();
    expect(relativeDay(daysAgo(0), monday)).toBe("Il y a 3 jours");
  });

  it("says when and with whom on the resume card, never assuming a duo", () => {
    const monday = new Date(2026, 10, 9, 9, 0).getTime();
    expect(resumeLine({ ...friday, lastUsedAt: daysAgo(0) }, monday)).toBe("Il y a 3 jours avec Anna · reste 58 min");
    expect(resumeLine({ ...thriller, lastUsedAt: daysAgo(1), duration: undefined }, now)).toBe("Hier avec Léo et Inès");
    expect(resumeLine(session("A", { lastUsedAt: now }), now)).toBe("Aujourd'hui · reste 58 min");
    expect(companionsLabel(thriller)).toBe("avec Léo et Inès");
    expect(companionsLabel(session("A"))).toBe("Rien que toi pour l'instant");
  });
});

describe("sessions store", () => {
  beforeEach(() => {
    resetSessions();
    vi.mocked(api.fetchSessions).mockReset();
    vi.mocked(api.leaveSession).mockReset();
  });

  it("loads the history most recent first, sharing one request", async () => {
    vi.mocked(api.fetchSessions).mockResolvedValue([comedy, friday]);
    await Promise.all([loadSessions(), loadSessions()]);
    expect(api.fetchSessions).toHaveBeenCalledTimes(1);
    expect(useSessions.getState()).toMatchObject({ status: "ready", error: null });
    expect(useSessions.getState().sessions.map((s) => s.code)).toEqual(["YWEK", "BXFW"]);
  });

  it("explains a failed first load, and keeps the list when a refresh fails", async () => {
    vi.mocked(api.fetchSessions).mockRejectedValueOnce(new ApiRequestError(0, "Pas de connexion."));
    await loadSessions();
    expect(useSessions.getState()).toMatchObject({ status: "error", error: "Pas de connexion." });

    vi.mocked(api.fetchSessions).mockResolvedValueOnce([friday]);
    await loadSessions();
    vi.mocked(api.fetchSessions).mockRejectedValueOnce(new ApiRequestError(0, "Pas de connexion."));
    await loadSessions();
    expect(useSessions.getState()).toMatchObject({ status: "ready", sessions: [friday] });
  });

  it("removes a session at once, and puts it back if the server refuses", async () => {
    vi.mocked(api.fetchSessions).mockResolvedValue([friday, thriller]);
    await loadSessions();

    vi.mocked(api.leaveSession).mockResolvedValueOnce();
    await leaveSession("YWEK");
    expect(useSessions.getState().sessions.map((s) => s.code)).toEqual(["RTNB"]);

    await loadSessions();
    vi.mocked(api.leaveSession).mockRejectedValueOnce(new ApiRequestError(500, "Le serveur ne répond pas."));
    const removal = leaveSession("RTNB");
    expect(useSessions.getState().sessions.map((s) => s.code)).toEqual(["YWEK"]);
    await expect(removal).rejects.toThrow("Le serveur ne répond pas.");
    expect(useSessions.getState().sessions.map((s) => s.code)).toEqual(["YWEK", "RTNB"]);

    await leaveSession("NOPE");
    expect(api.leaveSession).toHaveBeenCalledTimes(2);
  });

  it("deletes a séance I created at once, for everyone, and puts it back if the server refuses", async () => {
    vi.mocked(api.fetchSessions).mockResolvedValue([friday, thriller]);
    await loadSessions();
    vi.mocked(api.deleteSessionForEveryone).mockRejectedValueOnce(new ApiRequestError(403, "Tu peux la quitter."));
    await expect(deleteSession("YWEK")).rejects.toThrow("Tu peux la quitter.");
    expect(useSessions.getState().sessions.map((s) => s.code)).toEqual(["YWEK", "RTNB"]);

    vi.mocked(api.deleteSessionForEveryone).mockResolvedValueOnce();
    await deleteSession("YWEK");
    expect(useSessions.getState().sessions.map((s) => s.code)).toEqual(["RTNB"]);
  });
});

describe("a title and its séances", () => {
  const dune = { id: 11, type: "movie" } as const;

  it("finds the séance still under way for a title, the latest one", () => {
    const sessions = [
      session("OLD", { catalog: dune, lastUsedAt: 5 }),
      session("NEW", { catalog: dune, lastUsedAt: 9 }),
      session("DONE", { catalog: dune, lastUsedAt: 12, position: 7826 }),
      session("OTHER", { catalog: { id: 12, type: "movie" }, lastUsedAt: 20 }),
    ];
    expect(seanceOfTitle(sessions, dune)?.code).toBe("NEW");
    expect(seanceOfTitle(sessions, { id: 11, type: "tv" })).toBeNull();
  });

  it("shows each title once, by its most recent séance, and keeps séances of a pasted link", () => {
    const sessions = [
      session("B2", { catalog: dune, lastUsedAt: 9 }),
      session("LINK1", { lastUsedAt: 8 }),
      session("B1", { catalog: dune, lastUsedAt: 5 }),
      session("LINK2", { lastUsedAt: 4 }),
    ];
    expect(onePerTitle(sessions).map((s) => s.code)).toEqual(["B2", "LINK1", "LINK2"]);
  });
});
