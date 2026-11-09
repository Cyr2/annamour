import type { SessionSummary, WatchlistItem } from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { resumeKicker, sessionTitle } from "../sessions/session-rules.ts";
import {
  endTitle,
  episodeEndOf,
  episodeName,
  episodeState,
  onSeries,
  secondsLeft,
  seriesToMarkWatched,
  suggestedLabel,
} from "./episode-rules.ts";
import { timelineKeyTarget } from "./seek.ts";

const room = { finished: false, countdownUntil: null, current: 0, episodes: [{}, { label: "É2" }] };

describe("the end screen of an episode", () => {
  it("stays away while the episode plays", () => {
    expect(episodeEndOf(room)).toBeNull();
  });

  it("counts down when the next episode is about to start", () => {
    expect(episodeEndOf({ ...room, finished: true, countdownUntil: 9000 })).toBe("countdown");
  });

  it("offers the next episode after « Pas ce soir »", () => {
    expect(episodeEndOf({ ...room, finished: true })).toBe("next-ready");
  });

  it("offers to add the next one when nothing is queued", () => {
    expect(episodeEndOf({ ...room, finished: true, current: 1 })).toBe("nothing-next");
  });

  it("speaks of a film when the séance has a single video", () => {
    expect(endTitle(1)).toBe("C'est fini");
    expect(endTitle(3)).toBe("Épisode terminé");
  });
});

describe("what the end screen knows of a series", () => {
  const bear = { id: 136315, type: "tv", title: "The Bear" } as const;
  const episode = (n: number) => ({ label: `S1 · É${n}`, catalog: { ...bear, season: 1, episode: n } });
  const listed: WatchlistItem = {
    id: "w1",
    title: { id: 136315, type: "tv", title: "The Bear" },
    addedBy: { accountId: "lea", name: "Léa", color: "lilac" },
    addedAt: 0,
    sharedWith: [],
    wantedBy: [],
  };

  it("tells a series episode from a film", () => {
    expect(onSeries({ episodes: [episode(1)], current: 0 })).toBe(true);
    expect(onSeries({ episodes: [{ catalog: { id: 7, type: "movie", title: "Alien" } }], current: 0 })).toBe(false);
    expect(onSeries({ episodes: [{}], current: 0 })).toBe(false);
    expect(onSeries({ episodes: [{}, { label: "É2" }], current: 1 })).toBe(true);
  });

  it("offers to mark the series watched at the end of the last episode queued, when it is in the list", () => {
    const room = { episodes: [episode(1), episode(2)], current: 1 };
    expect(seriesToMarkWatched([listed], room)).toBe(listed);
  });

  it("does not offer it before the last episode, for a series not in the list, or already watched", () => {
    expect(seriesToMarkWatched([listed], { episodes: [episode(1), episode(2)], current: 0 })).toBeUndefined();
    expect(seriesToMarkWatched([], { episodes: [episode(1)], current: 0 })).toBeUndefined();
    expect(seriesToMarkWatched([{ ...listed, watchedAt: 1 }], { episodes: [episode(1)], current: 0 })).toBeUndefined();
    const film = { episodes: [{ catalog: { id: 136315, type: "movie", title: "Homonyme" } as const }], current: 0 };
    expect(seriesToMarkWatched([listed], film)).toBeUndefined();
  });
});

describe("the countdown", () => {
  it("shows whole seconds, never below zero", () => {
    expect(secondsLeft(9000, 1000)).toBe(8);
    expect(secondsLeft(9000, 8200)).toBe(1);
    expect(secondsLeft(9000, 9500)).toBe(0);
  });
});

describe("the timeline's keys", () => {
  it("moves by 10 s with the arrows, to either end with Début and Fin", () => {
    expect(timelineKeyTarget("ArrowRight", 30, 600)).toBe(40);
    expect(timelineKeyTarget("ArrowLeft", 5, 600)).toBe(0);
    expect(timelineKeyTarget("ArrowRight", 595, 600)).toBe(600);
    expect(timelineKeyTarget("Home", 300, 600)).toBe(0);
    expect(timelineKeyTarget("End", 300, 600)).toBe(600);
    expect(timelineKeyTarget("Enter", 300, 600)).toBeNull();
  });
});

describe("the « Épisodes » list", () => {
  it("ticks the episodes before the one on screen and keeps them, the rest still to come", () => {
    expect([0, 1, 2, 3].map((index) => episodeState(index, 2))).toEqual(["watched", "watched", "current", "upcoming"]);
  });
});

describe("episode names", () => {
  it("uses the label, or the episode's number without one", () => {
    expect(episodeName(room.episodes, 1)).toBe("É2");
    expect(episodeName(room.episodes, 0)).toBe("Épisode 1");
  });

  it("suggests the label after the last one queued", () => {
    expect(suggestedLabel(room.episodes)).toBe("É3");
    expect(suggestedLabel([{}])).toBe("Épisode 2");
  });
});

describe("a séance of episodes in my sessions", () => {
  const base: SessionSummary = {
    code: "KFRT",
    title: "The Bear",
    position: 0,
    lastUsedAt: 0,
    participants: [],
    episode: { index: 0, count: 1 },
  };

  it("names the episode it is on", () => {
    expect(sessionTitle({ ...base, episode: { index: 4, count: 5, label: "S2 · É5" } })).toBe("The Bear · S2 · É5");
    expect(sessionTitle(base)).toBe("The Bear");
  });

  it("says which episode « Reprendre » goes back to", () => {
    expect(resumeKicker({ ...base, episode: { index: 4, count: 5 } })).toBe("Reprendre · épisode 5");
    expect(resumeKicker(base)).toBe("Reprendre");
  });
});
