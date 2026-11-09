import type { SessionSummary } from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { resumeKicker, sessionTitle } from "../sessions/session-rules.ts";
import {
  endTitle,
  episodeEndOf,
  episodeName,
  episodeState,
  queueTitle,
  secondsLeft,
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
    expect(episodeName(room.episodes, 1, "The Bear")).toBe("É2");
    expect(episodeName(room.episodes, 0, "The Bear")).toBe("Épisode 1");
  });

  it("names a séance of a single film by its title, not « Épisode 1 »", () => {
    expect(episodeName([{}], 0, "Interstellar")).toBe("Interstellar");
  });

  it("calls the queue « Épisodes » for a series only", () => {
    expect(queueTitle(1)).toBe("File");
    expect(queueTitle(2)).toBe("Épisodes");
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
