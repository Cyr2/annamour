import type { PlaybackState } from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { isFinished } from "../sessions/session-rules.ts";
import { lobbyStart } from "./lobby-rules.ts";

const paused = (position: number): PlaybackState => ({ status: "paused", position, at: 0 });
const film = { media: { duration: 7826 }, current: 0, episodes: [{}] };
const twoFilms = { media: { duration: 7826 }, current: 0, episodes: [{}, {}] };

describe("the salon's button", () => {
  it("launches a séance never started", () => {
    expect(lobbyStart(film, paused(0))).toEqual({ kind: "start" });
  });

  it("resumes where the séance stopped", () => {
    expect(lobbyStart(film, paused(4360))).toEqual({ kind: "resume", at: 4360 });
  });

  it("offers to watch again a séance stopped in the credits, which the séances' list calls « Terminée »", () => {
    expect(lobbyStart(film, paused(7790))).toEqual({ kind: "rewatch" });
    const summary = { position: 7790, duration: 7826, episode: { index: 0, count: 1 } };
    expect(isFinished({ code: "YWEK", title: "Dune", lastUsedAt: 0, participants: [], ...summary })).toBe(true);
  });

  it("goes on to the next film rather than starting over, between two films", () => {
    expect(lobbyStart(twoFilms, paused(7790))).toEqual({ kind: "resume", at: 7790 });
    expect(lobbyStart({ ...twoFilms, current: 1 }, paused(7790))).toEqual({ kind: "rewatch" });
  });

  it("launches while the room is not there yet", () => {
    expect(lobbyStart(null, null)).toEqual({ kind: "start" });
  });
});
