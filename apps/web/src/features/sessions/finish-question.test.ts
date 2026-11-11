import type { RoomSnapshot } from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { finishQuestion } from "./finish-question.ts";

const dune: RoomSnapshot = {
  code: "YWEK",
  media: { title: "Dune", src: "/api/rooms/YWEK/hls/master.m3u8", audio: [], subtitles: [], duration: 9000 },
  playback: { status: "paused", position: 0, at: 0 },
  members: [],
  episodes: [{ duration: 9000 }],
  current: 0,
  finished: false,
  countdownUntil: null,
};

describe("« C'est fini ? » on leaving a salon", () => {
  it("is asked of whoever leaves alone with three minutes of credits left", () => {
    expect(finishQuestion(dune, 8820, false)).toEqual({ code: "YWEK", title: "Dune", minutesLeft: 3, next: undefined });
  });

  it("names what the séance reopens on when another film follows", () => {
    const withAlien = { ...dune, episodes: [{}, { catalog: { id: 1, type: "movie", title: "Alien" } as const }] };
    expect(finishQuestion(withAlien, 8820, false)?.next).toBe("Alien");
  });

  it("waits for the last one out, and stays quiet mid-film or once the end counted", () => {
    expect(finishQuestion(dune, 8820, true)).toBeNull();
    expect(finishQuestion(dune, 4000, false)).toBeNull();
    expect(finishQuestion({ ...dune, finished: true }, 8820, false)).toBeNull();
  });
});
