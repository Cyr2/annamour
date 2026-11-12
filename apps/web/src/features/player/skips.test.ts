import type { RoomSnapshot } from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { nextUpOf, skipOfferOf, skipPhaseOf } from "./skip-rules.ts";

const skips = { introStart: 60, introEnd: 90, creditsStart: 2500 };
const bear = (n: number, extra = {}) => ({
  label: `S1 · É${n}`,
  catalog: {
    id: 1,
    type: "tv",
    title: "The Bear",
    season: 1,
    episode: n,
    posterUrl: "https://image.tmdb.org/b.jpg",
  } as const,
  ...extra,
});
const room = (overrides: Partial<RoomSnapshot> = {}): RoomSnapshot => ({
  code: "BEAR",
  media: { title: "The Bear · S1 · É1", src: "/x.m3u8", audio: [], subtitles: [], duration: 2600 },
  playback: { status: "playing", position: 0, at: 0 },
  members: [],
  episodes: [bear(1, { skips }), bear(2)],
  current: 0,
  finished: false,
  countdownUntil: null,
  ...overrides,
});

describe("where the film is, for the skip offers", () => {
  it("is in its intro, then in its end credits", () => {
    expect(skipPhaseOf(room(), 70)).toBe("intro");
    expect(skipPhaseOf(room(), 1000)).toBeNull();
    expect(skipPhaseOf(room(), 2550)).toBe("credits");
  });

  it("is near its end when its credits are unknown", () => {
    const unknown = room({ episodes: [bear(1), bear(2)] });
    expect(skipPhaseOf(unknown, 2540)).toBe("near-end");
    expect(skipPhaseOf(unknown, 70)).toBeNull();
  });
});

describe("what the player offers", () => {
  it("offers to skip the intro to its end", () => {
    expect(skipOfferOf(room(), "intro", false)).toEqual({ kind: "intro", introEnd: 90 });
  });

  it("counts down to the next episode while the credits roll, then simply offers it once stopped", () => {
    const poster = { id: 1, type: "tv", title: "The Bear", posterUrl: "https://image.tmdb.org/b.jpg" } as const;
    const next = { kind: "Épisode suivant", name: "S1 · É2", poster };
    expect(skipOfferOf(room({ countdownUntil: 9000 }), "credits", false)).toEqual({
      kind: "countdown",
      until: 9000,
      next,
    });
    expect(skipOfferOf(room(), "credits", false)).toEqual({ kind: "next", next });
  });

  it("offers the next one without a countdown near an end whose credits are unknown", () => {
    expect(skipOfferOf(room({ countdownUntil: 9000 }), "near-end", false)).toMatchObject({ kind: "next" });
  });

  it("names a film that follows by its title", () => {
    const alien = { catalog: { id: 7, type: "movie", title: "Alien" } as const };
    expect(nextUpOf(room({ episodes: [bear(1), alien] }))).toEqual({ kind: "Film suivant", name: "Alien" });
  });

  it("offers to add and start a series' next episode once, when nothing is queued", () => {
    const last = room({ episodes: [bear(1, { skips })] });
    expect(skipOfferOf(last, "credits", false)).toEqual({ kind: "add-next" });
    expect(skipOfferOf(last, "credits", true)).toBeNull();
    const film = room({ episodes: [{ catalog: { id: 7, type: "movie", title: "Alien" } as const, skips }] });
    expect(skipOfferOf(film, "credits", false)).toBeNull();
  });

  it("leaves the end to the end screen, and offers nothing mid-film", () => {
    expect(skipOfferOf(room({ finished: true }), "credits", false)).toBeNull();
    expect(skipOfferOf(room(), null, false)).toBeNull();
  });
});
