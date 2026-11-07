import { describe, expect, it } from "vitest";
import {
  canRemoveEpisode,
  canStartNextEpisode,
  declineNextEpisode,
  episodeAdded,
  episodeEnded,
  episodeRemoved,
  episodeResumed,
  episodeTitle,
  everyoneLeft,
  hasNextEpisode,
  NEXT_EPISODE_COUNTDOWN_MS,
  nextEpisodeLabel,
  startNextEpisode,
  startProgress,
} from "../src/index.ts";

describe("the end of an episode", () => {
  it("starts the countdown for everyone when another episode follows", () => {
    const ended = episodeEnded(startProgress(0, 2), 0, 1000);
    expect(ended).toMatchObject({ finished: true, countdownUntil: 1000 + NEXT_EPISODE_COUNTDOWN_MS });
  });

  it("just ends when nothing follows: the séance offers to add the next one", () => {
    expect(episodeEnded(startProgress(0, 1), 0, 1000)).toMatchObject({ finished: true, countdownUntil: null });
  });

  it("starts the countdown once, however many devices reach the end", () => {
    const first = episodeEnded(startProgress(0, 2), 0, 1000);
    expect(episodeEnded(first, 0, 1500)).toBe(first);
  });

  it("ignores the end of an episode nobody is on any more", () => {
    const progress = startProgress(1, 3);
    expect(episodeEnded(progress, 0, 1000)).toBe(progress);
  });
});

describe("moving on to the next episode", () => {
  it("moves everyone on once, even when two devices ask together", () => {
    const ended = episodeEnded(startProgress(0, 2), 0, 1000);
    expect(canStartNextEpisode(ended, 0)).toBe(true);
    const next = startNextEpisode(ended);
    expect(next).toEqual({ current: 1, count: 2, finished: false, countdownUntil: null, declined: false });
    expect(canStartNextEpisode(next, 0)).toBe(false);
  });

  it("has nowhere to go after the last episode", () => {
    expect(hasNextEpisode(startProgress(1, 2))).toBe(false);
    expect(canStartNextEpisode(startProgress(1, 2), 1)).toBe(false);
  });
});

describe("« Pas ce soir »", () => {
  it("stops the countdown, and a later end does not start it again", () => {
    const declined = declineNextEpisode(episodeEnded(startProgress(0, 2), 0, 1000));
    expect(declined).toMatchObject({ countdownUntil: null, declined: true, finished: true });
    expect(canStartNextEpisode(declined, 0)).toBe(true);
  });

  it("keeps the next episode for next time once everyone has left", () => {
    const declined = declineNextEpisode(episodeEnded(startProgress(0, 2), 0, 1000));
    expect(everyoneLeft(declined)).toMatchObject({ current: 1, finished: false, declined: false });
  });

  it("stays on an unfinished episode when everyone leaves, its countdown gone", () => {
    expect(everyoneLeft(startProgress(0, 2))).toMatchObject({ current: 0, countdownUntil: null });
    expect(everyoneLeft(episodeEnded(startProgress(0, 1), 0, 0))).toMatchObject({ current: 0, finished: true });
  });

  it("is forgotten when the episode is watched again", () => {
    const declined = declineNextEpisode(episodeEnded(startProgress(0, 2), 0, 1000));
    const again = episodeResumed(declined);
    expect(again).toMatchObject({ finished: false, declined: false, countdownUntil: null });
    expect(episodeEnded(again, 0, 9000).countdownUntil).toBe(9000 + NEXT_EPISODE_COUNTDOWN_MS);
  });

  it("leaves an episode still playing untouched by a seek", () => {
    const playing = startProgress(0, 2);
    expect(episodeResumed(playing)).toBe(playing);
  });
});

describe("the queue of episodes", () => {
  it("grows when someone adds the next one", () => {
    expect(episodeAdded(startProgress(0, 1)).count).toBe(2);
  });

  it("lets only an episode still to come leave the queue", () => {
    const progress = startProgress(1, 3);
    expect(canRemoveEpisode(progress, 2)).toBe(true);
    expect(canRemoveEpisode(progress, 1)).toBe(false);
    expect(canRemoveEpisode(progress, 0)).toBe(false);
    expect(canRemoveEpisode(progress, 3)).toBe(false);
    expect(canRemoveEpisode(progress, 1.5)).toBe(false);
  });

  it("stops the countdown when the episode it led to is removed", () => {
    const counting = episodeEnded(startProgress(0, 2), 0, 1000);
    expect(episodeRemoved(counting)).toMatchObject({ count: 1, countdownUntil: null });
    const longer = episodeEnded(startProgress(0, 3), 0, 1000);
    expect(episodeRemoved(longer).countdownUntil).toBe(longer.countdownUntil);
  });
});

describe("episode labels", () => {
  it("guesses the next label from the last number", () => {
    expect(nextEpisodeLabel("S2 · É5", 2)).toBe("S2 · É6");
    expect(nextEpisodeLabel("Épisode 9", 9)).toBe("Épisode 10");
    expect(nextEpisodeLabel("S01E09", 9)).toBe("S01E10");
  });

  it("counts from the séance itself when there is no number to follow", () => {
    expect(nextEpisodeLabel(undefined, 1)).toBe("Épisode 2");
    expect(nextEpisodeLabel("Le pilote", 1)).toBe("Épisode 2");
  });

  it("names an episode after its séance", () => {
    expect(episodeTitle("The Bear", "S2 · É5")).toBe("The Bear · S2 · É5");
    expect(episodeTitle("Interstellar", undefined)).toBe("Interstellar");
  });
});
